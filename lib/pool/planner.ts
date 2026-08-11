import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { isKnownIndustry } from "@/lib/industry/taxonomy";

/*
  플래너 — "이번에 무엇을 수집할까"를 정해 crawl_jobs 에 넣는다. 공급사 호출은 하지 않는다.
  (계획과 실행을 분리한 이유: 플래너가 실패해도 돈이 안 나가고, 큐를 눈으로 보고
   실행 전에 잘라낼 수 있다.)

  우선순위 — 낮은 숫자가 먼저.
   10  팔로우된 브랜드          : 돈 낸 사람이 지켜보는 대상. 제일 먼저 신선해야 한다.
   20  유명 브랜드 시드          : 아는 이름이 깔려야 "진짜 데이터"로 읽힌다. 첫인상을 만드는 줄.
   30  결과 0건이었던 사용자 검색어 : 실제 수요인데 풀에 구멍이 난 자리. 메꾸면 바로 체감된다.
   60  자격 미달 업종의 시드어    : 빈 업종을 채워 화면에 띄우는 게 전체 품질을 가장 크게 올린다.
  100  나머지 시드어 순환        : 오래된 것부터.

  이 순서가 곧 서비스의 성격이다. 반대로 하면(전 업종 균등 순환) 아무도 안 찾는 업종에
  예산을 흘리면서 정작 유료 사용자가 보는 화면은 안 바뀐다.
*/

const PRIORITY = {
  followedBrand: 10,
  brandSeed: 20,
  searchMiss: 30,
  thinIndustry: 60,
  rotation: 100,
} as const;

export interface PlanResult {
  queued: number;
  byReason: Record<string, number>;
  skippedDuplicate: number;
}

interface JobRow {
  job_type: string;
  platform: string;
  target: string;
  industry_id: string | null;
  brand_id: string | null;
  priority: number;
}

/**
 * 큐에 job 을 넣는다.
 *
 * upsert(onConflict) 를 쓰지 않는다: idx_jobs_dedupe 는 `where state in ('queued','running')`
 * 부분 유니크 인덱스인데, 부분 인덱스는 같은 WHERE 절을 명시하지 않으면 ON CONFLICT 의
 * 중재자로 못 쓴다. PostgREST 는 그 절을 붙여주지 않으므로 upsert 는 통째로 실패한다.
 * 그래서 대기 중인 대상을 먼저 읽어 걸러내고 평범한 insert 를 한다.
 * 인덱스는 그대로 두어 경쟁 상황의 최종 방어선 역할만 시킨다.
 *
 * 20건씩 끊어 넣는 이유: 경쟁으로 한 건이 충돌해도 그 20건만 잃고 나머지는 들어간다.
 */
async function enqueue(rows: JobRow[]): Promise<number> {
  if (rows.length === 0) return 0;
  const db = createAdminClient();
  if (!db) return 0;

  const { data: pending } = await db
    .from("crawl_jobs")
    .select("job_type, platform, target")
    .in("state", ["queued", "running"])
    .limit(2000);
  const taken = new Set(
    (pending ?? []).map((j) => `${j.job_type}|${j.platform}|${j.target}`),
  );

  const fresh = rows.filter((r) => !taken.has(`${r.job_type}|${r.platform}|${r.target}`));
  let inserted = 0;
  for (let i = 0; i < fresh.length; i += 20) {
    const chunk = fresh.slice(i, i + 20);
    const { data, error } = await db.from("crawl_jobs").insert(chunk).select("id");
    if (error) {
      console.error("[pool] 큐 적재 실패", error.message);
      continue;
    }
    inserted += data?.length ?? 0;
  }
  return inserted;
}

/**
 * 한 회차의 계획을 세운다.
 * @param capacity 이번 회차에 큐에 넣을 최대 job 수. 예산이 아니라 큐 길이의 상한이다 —
 *                 실제 지출은 워커가 claimCalls() 로 다시 통제한다(이중 잠금).
 */
export async function planCrawl(capacity = 120): Promise<PlanResult> {
  const db = createAdminClient();
  const byReason: Record<string, number> = {};
  if (!db) return { queued: 0, byReason, skippedDuplicate: 0 };

  const rows: JobRow[] = [];
  const seen = new Set<string>();
  const take = (r: JobRow, reason: string) => {
    const key = `${r.job_type}|${r.platform}|${r.target}`;
    if (seen.has(key) || rows.length >= capacity) return;
    seen.add(key);
    rows.push(r);
    byReason[reason] = (byReason[reason] ?? 0) + 1;
  };

  /* 1. 팔로우된 브랜드 — 최근 갱신이 오래된 순 */
  const { data: followed } = await db
    .from("saved_brands")
    .select("brand_id, brands!inner(id, platform, external_id, last_seen_at, status)")
    .eq("brands.status", "ok")
    .order("created_at", { ascending: true })
    .limit(200);

  type BrandJoin = { id: string; platform: string; external_id: string; last_seen_at: string };
  const staleCutoff = Date.now() - 3 * 86_400_000;
  const brandSeen = new Set<string>();
  for (const row of (followed ?? []) as unknown as Array<{ brands: BrandJoin | BrandJoin[] }>) {
    const b = Array.isArray(row.brands) ? row.brands[0] : row.brands;
    if (!b || brandSeen.has(b.id)) continue; // 여러 사용자가 같은 브랜드를 팔로우해도 1회만
    brandSeen.add(b.id);
    if (b.platform !== "meta") continue; // 오가닉 브랜드 갱신은 2단계
    if (new Date(b.last_seen_at).getTime() > staleCutoff) continue; // 3일 내 수집분은 건너뛴다
    take(
      {
        job_type: "brand_ads",
        platform: "meta_ads",
        target: b.external_id,
        industry_id: null,
        brand_id: b.id,
        priority: PRIORITY.followedBrand,
      },
      "followedBrand",
    );
  }

  /* 2. 결과 0건이었던 사용자 검색어 — 같은 말을 여러 명이 찾았을수록 위로 */
  const { data: misses } = await db
    .from("search_history")
    .select("query, industry_id, platform")
    .eq("hit_count", 0)
    .gte("created_at", new Date(Date.now() - 14 * 86_400_000).toISOString())
    .limit(500);

  const missCount = new Map<string, { n: number; industry: string | null; platform: string }>();
  for (const m of misses ?? []) {
    const q = String(m.query ?? "").trim();
    if (q.length < 2 || q.length > 60) continue;
    const platform = typeof m.platform === "string" && m.platform ? m.platform : "meta_ads";
    const key = `${platform}|${q}`;
    const cur = missCount.get(key);
    if (cur) cur.n += 1;
    else
      missCount.set(key, {
        n: 1,
        industry: typeof m.industry_id === "string" && isKnownIndustry(m.industry_id) ? m.industry_id : null,
        platform,
      });
  }
  const rankedMisses = [...missCount.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 40);
  for (const [key, v] of rankedMisses) {
    const query = key.slice(key.indexOf("|") + 1);
    take(
      {
        job_type: v.platform === "meta_ads" ? "kw_ads" : "kw_posts",
        platform: v.platform,
        target: query,
        industry_id: v.industry,
        brand_id: null,
        priority: PRIORITY.searchMiss,
      },
      "searchMiss",
    );
  }

  /* 3·4. 시드 키워드 순환 — 자격 미달 업종을 먼저 채운다 */
  const { data: thinIndustries } = await db
    .from("industries")
    .select("id")
    .eq("is_visible", false)
    .neq("id", "etc");
  const thin = new Set((thinIndustries ?? []).map((i) => String(i.id)));

  const { data: keywords } = await db
    .from("industry_keywords")
    .select("industry_id, platform, keyword, last_crawled_at, weight, origin")
    .eq("is_active", true)
    .order("last_crawled_at", { ascending: true, nullsFirst: true })
    .order("weight", { ascending: false })
    .limit(capacity * 3);

  /* 이미 "오래된 것 먼저"로 정렬돼 있다. 그 순서를 유지한 채 세 번 훑는다:
     ① 유명 브랜드 → ② 자격 미달 업종의 시드어 → ③ 나머지.
     한 번에 훑으면서 정렬을 다시 하면 각 그룹 안의 "오래된 것 먼저"가 깨진다. */
  const kws = keywords ?? [];
  const PASSES = [
    { key: "brandSeed", pick: (o: string) => o === "brand", priority: PRIORITY.brandSeed },
    {
      key: "thinIndustry",
      pick: (_o: string, ind: string) => thin.has(ind),
      priority: PRIORITY.thinIndustry,
    },
    { key: "rotation", pick: () => true, priority: PRIORITY.rotation },
  ] as const;

  for (const pass of PASSES) {
    for (const k of kws) {
      const industryId = String(k.industry_id);
      const origin = String(k.origin ?? "seed");
      if (!pass.pick(origin, industryId)) continue;
      const platform = String(k.platform);
      take(
        {
          job_type: platform === "meta_ads" ? "kw_ads" : "kw_posts",
          platform,
          target: String(k.keyword),
          industry_id: industryId,
          brand_id: null,
          priority: pass.priority,
        },
        pass.key,
      );
    }
  }

  const queued = await enqueue(rows);
  return { queued, byReason, skippedDuplicate: rows.length - queued };
}
