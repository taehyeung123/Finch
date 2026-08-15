import "server-only";

import { createClient } from "@/lib/supabase/server";
import { thumbPublicUrl } from "@/lib/pool/thumbs";
import { hasEmbeddingColumn, hasTagColumns } from "@/lib/pool/schema";
import { embedQuery, isEmbeddingConfigured } from "@/lib/pool/embedding";

/*
  풀 검색 — 사용자가 실제로 두드리는 읽기 경로.

  **여기서는 공급사를 호출하지 않는다.** 그게 이번 구조 변경의 전부다.
  예전에는 "검색 = 수집"이라 사람이 검색할 때마다 크레딧이 나갔고, 100명이 같은 말을
  찾으면 같은 데이터를 100번 샀다. 지금은 검색이 DB 조회이므로 원가가 0이고,
  수집은 크론이 전원 몫으로 한 번만 한다.

  풀에 없는 검색어는 결과 0건으로 정직하게 돌려주고 search_history 에 기록한다.
  그 기록이 플래너의 최우선 수집 대상이 된다 — 없다고 그 자리에서 사오지 않는다
  (그러면 예전 구조로 되돌아간다).

  RLS: 여기서는 사용자 세션 클라이언트를 쓴다. admin 클라이언트를 쓰면
  takedown_at 이 찬 소재나 blocked 브랜드가 새어 나간다 — 그 필터는 정책에 있다.
*/

export type PoolSort = "heat" | "recent" | "longest" | "saved";
export type PoolPlatformFilter = "all" | "meta_ads" | "instagram" | "tiktok" | "threads";

export interface PoolQuery {
  q?: string;
  /** ad(광고) / post(오가닉) — 안 주면 둘 다 */
  kind?: "ad" | "post";
  industryId?: string | null;
  platform?: PoolPlatformFilter;
  mediaFormat?: "all" | "video" | "photo" | "carousel";
  /** 광고 전용 — 최소 집행일. "오래 돌아간 = 검증된" 을 사용자가 직접 조일 수 있게 */
  minRunDays?: number;
  sort?: PoolSort;
  page?: number;
  pageSize?: number;
}

export interface PoolItem {
  id: string;
  /** 플랫폼 쪽 원본 ID — 광고는 Meta ad_archive_id. 원본 링크는 이걸로 만들어야 한다.
      내부 UUID(id)로 만들면 메타가 모르는 ID 라 빈 창이 뜬다(2026-08-12 실측 사고). */
  externalId: string;
  kind: "ad" | "post";
  platform: string;
  title: string;
  body: string;
  permalink: string | null;
  thumbUrl: string | null;
  mediaFormat: string;
  brandName: string | null;
  brandId: string | null;
  views: number;
  likes: number;
  comments: number;
  followerCount: number;
  isActive: boolean | null;
  runDays: number | null;
  /* 광고 3종. 안 뽑으면 화면이 조용히 죽는다:
     · adPlatforms  — 인스타 탭이 platforms.includes("INSTAGRAM") 로 거르므로
                      빈 배열이면 풀 광고가 인스타 탭에서 통째로 사라진다
     · ctaText      — 카드의 CTA 배지가 영영 안 뜨고 검색어에도 안 걸린다
     · endedAt      — 종료된 광고의 집행일수가 오늘까지로 계속 늘어 거짓말을 한다 */
  adPlatforms: string[];
  ctaText: string | null;
  endedAt: string | null;
  industryIds: string[];
  heatScore: number;
  saveCount: number;
  postedAt: string | null;
  /** 풀에 처음 들어온 시각 — 화면의 '수집 시각'에 해당한다 */
  firstSeenAt: string | null;
  /* AI 태깅(enrich 배치) 산출물. 배치가 아직 안 지나간 소재는 전부 빈 값 —
     bridge 가 본문 앞부분 등으로 대체하므로 화면은 안 깨진다. */
  aiSummary: string;
  aiHooks: string[];
  aiTopic: string;
  aiComment: string;
  /** 수집 시 원문 캡션에서 뽑은 해시태그 (0035 미적용이면 빈 배열) */
  hashtags: string[];
}

export interface PoolResult {
  items: PoolItem[];
  total: number;
  hasMore: boolean;
  /** 풀이 이 검색어를 아직 모른다 — 화면이 "수집 예약됨" 안내를 띄우는 신호 */
  isGap: boolean;
  /** 글자 일치로 잡힌 수 — 의미 검색 보충분과 구분한다.
      수집 미스 판정(플래너 큐잉)은 이 값 기준이어야 한다: 의미 보충으로 화면이
      채워졌다고 미스 기록을 안 남기면 그 검색어는 영영 정확 수집되지 않는다. */
  exactCount: number;
}

const DEFAULT_PAGE_SIZE = 40; // 5열 그리드 × 8줄

interface Row {
  id: string;
  external_id: string;
  kind: string;
  platform: string;
  title: string;
  body: string;
  permalink: string | null;
  thumb_path: string | null;
  media_format: string;
  brand_id: string | null;
  views: number;
  likes: number;
  comments: number;
  follower_count: number;
  is_active: boolean | null;
  run_days: number | null;
  ad_platforms: string[] | null;
  cta_text: string | null;
  ended_at: string | null;
  industry_ids: string[] | null;
  heat_score: number;
  posted_at: string | null;
  first_seen_at: string | null;
  ai_summary: string | null;
  ai_hooks: unknown;
  ai_topic?: string | null;
  ai_comment?: string | null;
  hashtags?: unknown;
  brands: { id: string; name: string } | { id: string; name: string }[] | null;
  creative_stats: { save_count: number } | { save_count: number }[] | null;
}

function strArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function one<T>(v: T | T[] | null): T | null {
  if (v === null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

function toItem(r: Row): PoolItem {
  const brand = one(r.brands);
  const stats = one(r.creative_stats);
  return {
    id: r.id,
    externalId: r.external_id,
    kind: r.kind === "ad" ? "ad" : "post",
    platform: r.platform,
    title: r.title,
    body: r.body,
    permalink: r.permalink,
    thumbUrl: thumbPublicUrl(r.thumb_path),
    mediaFormat: r.media_format,
    brandName: brand?.name ?? null,
    brandId: brand?.id ?? null,
    views: r.views ?? 0,
    likes: r.likes ?? 0,
    comments: r.comments ?? 0,
    followerCount: r.follower_count ?? 0,
    isActive: r.is_active,
    runDays: r.run_days,
    adPlatforms: Array.isArray(r.ad_platforms) ? r.ad_platforms : [],
    ctaText: r.cta_text,
    endedAt: r.ended_at,
    industryIds: Array.isArray(r.industry_ids) ? r.industry_ids : [],
    heatScore: r.heat_score ?? 0,
    saveCount: stats?.save_count ?? 0,
    postedAt: r.posted_at,
    firstSeenAt: r.first_seen_at,
    aiSummary: r.ai_summary ?? "",
    aiHooks: strArray(r.ai_hooks),
    aiTopic: r.ai_topic ?? "",
    aiComment: r.ai_comment ?? "",
    hashtags: strArray(r.hashtags),
  };
}

/* ai_summary·ai_hooks 는 0027 컬럼이라 무조건 뽑는다.
   hashtags·ai_topic·ai_comment 는 0035 — 미적용 DB 에서 SELECT 에 넣으면
   검색 전체가 에러로 죽으므로 프로브를 거쳐 조건부로 붙인다. */
const SELECT_BASE =
  "id, external_id, kind, platform, title, body, permalink, thumb_path, media_format, brand_id, " +
  "views, likes, comments, follower_count, is_active, run_days, ad_platforms, cta_text, ended_at, " +
  "industry_ids, heat_score, posted_at, first_seen_at, ai_summary, ai_hooks, " +
  "brands(id, name), creative_stats(save_count)";
const SELECT_TAGS = SELECT_BASE.replace(
  "ai_summary, ai_hooks,",
  "ai_summary, ai_hooks, ai_topic, ai_comment, hashtags,",
);

export async function searchPool(query: PoolQuery): Promise<PoolResult> {
  const supabase = await createClient();
  if (!supabase) return { items: [], total: 0, hasMore: false, isGap: false, exactCount: 0 };

  const page = Math.max(0, query.page ?? 0);
  const size = Math.min(60, Math.max(10, query.pageSize ?? DEFAULT_PAGE_SIZE));
  const from = page * size;

  const withTags = await hasTagColumns(supabase);
  let sel = supabase
    .from("creatives")
    .select(withTags ? SELECT_TAGS : SELECT_BASE, { count: "estimated" });

  if (query.kind) sel = sel.eq("kind", query.kind);
  if (query.platform && query.platform !== "all") sel = sel.eq("platform", query.platform);
  if (query.mediaFormat && query.mediaFormat !== "all") sel = sel.eq("media_format", query.mediaFormat);
  if (query.industryId) sel = sel.contains("industry_ids", [query.industryId]);
  if (query.minRunDays && query.minRunDays > 0) sel = sel.gte("run_days", query.minRunDays);

  const q = (query.q ?? "").trim();
  if (q.length > 0) {
    /* body 의 trigram GIN 인덱스를 타는 경로.
       **다단어는 통문장이 아니라 낱말 AND 다.** '여름 세일'을 통문장으로 걸면 캡션에
       그 두 단어가 붙어 있어야만 잡혀 거의 항상 0건이 된다 — 화면 필터가 이미 같은
       이유로 토큰 AND 를 쓴다(library-client.tsx). 통문장만 걸던 시절엔 방금 수집한
       소재조차 재검색에서 안 보였다(리뷰 확정 결함).
       .or() 를 여러 번 이으면 PostgREST 가 AND 로 묶는다 — 낱말마다 (본문 OR 제목). */
    const tokens = [
      ...new Set(
        q
          .replace(/[%,()"]/g, " ")
          .split(/\s+/)
          /* 1글자 토큰은 거의 모든 캡션에 걸려 AND 한 칸만 낭비한다. 다만 검색어 전체가
             1글자면(단일어 검색) 그건 살려야 하므로 아래에서 되살린다. */
          .filter((t) => t.length >= 2),
      ),
    ].slice(0, 4);
    /* 낱말마다 (캡션 OR 수집 키워드).
       title 은 뺐다 — body 첫 문장을 잘라 만든 값이라(lib/pool/upsert.ts) title 이 걸리면
       body 도 반드시 걸린다. 결과를 못 늘리면서 술어만 늘린다.
       matched_keywords 는 반대로 **반드시** 봐야 한다: 계정(@핸들) 수집분은 핸들이
       캡션 어디에도 안 들어가서(브랜드 표와 이 배열에만 있다) 방금 돈 내고 수집한 소재가
       재검색에서 영원히 0건이었다(적대 검증 확정 결함).
       PostgREST or() 는 쉼표로 절을 가르므로, 배열 절은 파싱이 안전한 토큰에만 붙인다. */
    const clausesFor = (t: string) =>
      /^[\w가-힣._-]+$/.test(t) ? `body.ilike.%${t}%,matched_keywords.cs.{${t}}` : `body.ilike.%${t}%`;
    const applied = tokens.length > 0 ? tokens : [q.replace(/[%,()"]/g, " ").trim()].filter(Boolean);
    for (const t of applied) sel = sel.or(clausesFor(t));
  }

  switch (query.sort ?? "heat") {
    case "recent":
      sel = sel.order("posted_at", { ascending: false, nullsFirst: false });
      break;
    case "longest":
      // "가장 오래 돌아간 광고" — 이 서비스가 파는 정보의 핵심 정렬
      sel = sel.order("run_days", { ascending: false, nullsFirst: false });
      break;
    case "saved":
      sel = sel.order("heat_score", { ascending: false });
      break;
    default:
      sel = sel.order("heat_score", { ascending: false });
  }
  // 동점 tie-break. 없으면 페이지를 넘길 때 같은 항목이 다시 나오거나 건너뛴다.
  sel = sel.order("id", { ascending: false });

  const { data, count, error } = await sel.range(from, from + size - 1);
  if (error) {
    console.error("[pool] 검색 실패", error.message);
    return { items: [], total: 0, hasMore: false, isGap: false, exactCount: 0 };
  }

  const rows = (data ?? []) as unknown as Row[];
  let items = rows.map(toItem);
  const exactCount = count ?? items.length;

  /* 의미 검색 보충 — 글자 일치가 첫 페이지를 못 채울 때만.
     "휘낭시에"처럼 캡션에 그 글자가 없는 롱테일 검색어도 베이킹·디저트 소재가
     떠야 한다(스니핏의 image_description 검색과 같은 방식, 2026-08-13 실측).
     정확 매칭이 앞, 의미 매칭이 뒤 — 유사도 순서 그대로 붙인다.
     미스 큐잉은 exactCount 기준으로 그대로 남으므로, 의미 보충이 화면을 채워도
     그 검색어는 다음 크론에서 정확 수집된다(풀이 점점 정밀해지는 루프 유지). */
  if (q.length > 0 && page === 0 && items.length < size && isEmbeddingConfigured()) {
    try {
      if (await hasEmbeddingColumn(supabase)) {
        const qVec = await embedQuery(q);
        if (qVec) {
          const { data: matches, error: rpcErr } = await supabase.rpc("match_creatives", {
            query_embedding: qVec,
            match_count: size * 2,
            p_kind: query.kind ?? null,
            p_platform: query.platform && query.platform !== "all" ? query.platform : null,
            p_industry: query.industryId ?? null,
          });
          if (!rpcErr && Array.isArray(matches) && matches.length > 0) {
            const seen = new Set(items.map((i) => i.id));
            /* 유사도 하한 0.3 — 그 밑은 "아무거나"에 가깝다. 분포를 보고 조정한다. */
            const ids = (matches as Array<{ id: string; similarity: number }>)
              .filter((m) => m.similarity >= 0.3 && !seen.has(m.id))
              .map((m) => m.id)
              .slice(0, size - items.length);
            if (ids.length > 0) {
              const order = new Map(ids.map((id, i) => [id, i]));
              let fillSel = supabase.from("creatives").select(withTags ? SELECT_TAGS : SELECT_BASE).in("id", ids);
              // RPC 가 안 거른 나머지 필터는 여기서 다시 적용
              if (query.mediaFormat && query.mediaFormat !== "all")
                fillSel = fillSel.eq("media_format", query.mediaFormat);
              if (query.minRunDays && query.minRunDays > 0) fillSel = fillSel.gte("run_days", query.minRunDays);
              const { data: fillRows } = await fillSel;
              const fills = ((fillRows ?? []) as unknown as Row[])
                .map(toItem)
                .sort((a, b) => (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999));
              items = [...items, ...fills];
            }
          }
        }
      }
    } catch (e) {
      // 의미 검색은 보조 경로 — 실패해도 글자 일치 결과는 그대로 나간다
      console.error("[pool] 의미 검색 실패(무시):", e instanceof Error ? e.message : String(e));
    }
  }

  const total = Math.max(exactCount, items.length);

  return {
    items,
    total,
    hasMore: from + items.length < exactCount,
    // "구멍" 판정은 글자 일치 기준 — 의미 보충이 있어도 정확 수집은 예약돼야 한다
    isGap: page === 0 && exactCount === 0 && q.length > 0,
    exactCount,
  };
}

/**
 * 검색을 기록한다. 결과 0건이면 플래너가 이 검색어를 최우선 수집 대상으로 올린다.
 * 실패해도 검색 결과에는 영향을 주지 않는다 — 로그 실패로 화면이 깨지면 안 된다.
 */
export async function logSearch(
  userId: string,
  query: string,
  hitCount: number,
  industryId?: string | null,
  platform?: string | null,
): Promise<void> {
  const q = query.trim();
  if (!q || q.length > 60) return;
  const supabase = await createClient();
  if (!supabase) return;
  const { error } = await supabase.from("search_history").insert({
    user_id: userId,
    query: q,
    hit_count: hitCount,
    industry_id: industryId ?? null,
    platform: platform && platform !== "all" ? platform : null,
  });
  if (error) console.error("[pool] 검색 기록 실패", error.message);
}

/** 업종 허브용 — 노출 자격을 통과한 업종만. RLS 정책이 이미 걸러주지만 정렬만 얹는다. */
export async function listVisibleIndustries(): Promise<
  Array<{ id: string; nameKo: string; groupKey: string; brandCount: number; creativeCount: number }>
> {
  const supabase = await createClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from("industries")
    .select("id, name_ko, group_key, brand_count, creative_count")
    .order("sort_order", { ascending: true });
  return (data ?? []).map((r) => ({
    id: String(r.id),
    nameKo: String(r.name_ko),
    groupKey: String(r.group_key),
    brandCount: Number(r.brand_count ?? 0),
    creativeCount: Number(r.creative_count ?? 0),
  }));
}
