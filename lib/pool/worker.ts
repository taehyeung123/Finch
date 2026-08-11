import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { claimCalls, refundCalls } from "@/lib/pool/budget";
import { searchAds } from "@/lib/reference/meta-ads";
import { collectFromSource, CollectError } from "@/lib/reference/scrapecreators";
import { upsertAds, upsertPosts } from "@/lib/pool/upsert";

/*
  워커 — 큐에서 job 을 집어 실제로 공급사를 호출하고 풀에 적재한다.
  **돈이 나가는 곳은 이 파일뿐이다.** 그래서 규칙이 셋 있다.

  1. 호출 전에 claimCalls() 로 예산을 청구한다. 0이 오면 그 자리에서 회차를 끝낸다.
  2. 크레딧 소진(out_of_credits)은 재시도하지 않는다 — 재시도할수록 402 만 더 받는다.
     남은 job 은 queued 로 돌려놓고 다음 회차로 넘긴다.
  3. 한 job 이 실패해도 회차 전체를 죽이지 않는다. 실패는 job 에 기록하고 다음으로 간다.
  4. **시간을 스스로 지킨다.** 남은 시간이 모자라면 다음 job 을 집지 않고 반납한다.
     job 개수만으로 조절하면 공급사가 느린 날 실행시간을 넘겨 강제 종료되고,
     그때 집어둔 job 들이 running 에 박제된다(15분간 아무도 못 집는다).
     플랫폼 실행시간 상한은 요금제마다 다르므로(Hobby 60초·Pro 300초) 호출부가 넘겨준다.
*/

const CURSOR_PAGES = 2; // 키워드당 최대 페이지. 1페이지 30건 + 2페이지 10건 ≈ 40건
const MAX_ATTEMPTS = 3;

/**
 * job 하나가 지금까지 **실제로** 쓴 콜 수를 담는 상자.
 *
 * 예전에는 성공했을 때만 { calls } 를 돌려줬다. 그래서 1페이지가 성공한 뒤
 * 2페이지에서 402(크레딧 소진)가 나면, 이미 과금된 1콜이 통째로 유실되고
 * 바깥에서는 청구분을 **전액** 환불해 버렸다 — 실제로는 썼는데 장부에는 안 쓴 걸로 남는다.
 * 일반 실패도 실제 콜 수와 무관하게 1로 고정돼 있었다.
 *
 * 예외가 나도 이 상자에는 값이 남으므로, 바깥에서 실측치로 환불량을 계산할 수 있다.
 * 하드캡이 의미를 가지려면 장부가 실지출과 같아야 한다.
 */
interface CallMeter {
  used: number;
}

export interface WorkResult {
  jobsDone: number;
  callsUsed: number;
  newCreatives: number;
  newBrands: number;
  errors: number;
  stoppedBy: "budget" | "credits" | "empty" | "time" | "complete";
}

interface Job {
  id: number;
  job_type: string;
  platform: string;
  target: string;
  industry_id: string | null;
  brand_id: string | null;
  attempts: number;
  cursor: string | null;
}

/**
 * @param maxJobs  이번 회차에 처리할 job 수 상한.
 * @param budgetMs 이번 회차에 쓸 수 있는 벽시계 시간. 이걸 넘기면 남은 job 을 반납하고 끝낸다.
 *                 플랫폼 실행시간 상한보다 넉넉히 작게 준다(마무리 DB 쓰기 시간이 필요하다).
 */
export async function runCrawlWorker(maxJobs = 12, budgetMs = 240_000): Promise<WorkResult> {
  const startedAt = Date.now();
  const out: WorkResult = {
    jobsDone: 0,
    callsUsed: 0,
    newCreatives: 0,
    newBrands: 0,
    errors: 0,
    stoppedBy: "complete",
  };

  const db = createAdminClient();
  if (!db) return { ...out, stoppedBy: "empty" };

  const { data: claimed, error } = await db.rpc("pick_crawl_jobs", { p_limit: maxJobs });
  if (error) {
    console.error("[pool] job 클레임 실패", error.message);
    return { ...out, errors: 1, stoppedBy: "empty" };
  }
  const jobs = (claimed ?? []) as Job[];
  if (jobs.length === 0) return { ...out, stoppedBy: "empty" };

  for (const job of jobs) {
    // 남은 시간이 job 하나를 감당 못 하면 여기서 접는다. 억지로 시작했다가 잘리면
    // 그 job 은 running 인 채로 남고, 공급사 호출은 이미 과금된 뒤다.
    if (Date.now() - startedAt > budgetMs) {
      await release(db, jobs.slice(jobs.indexOf(job)));
      out.stoppedBy = "time";
      break;
    }

    // job 하나가 최대 CURSOR_PAGES 콜을 쓴다. 통째로 미리 청구한다 —
    // 페이지마다 청구하면 1페이지만 받고 2페이지에서 잘리는 반쪽 수집이 나온다.
    const granted = await claimCalls(CURSOR_PAGES);
    if (granted === 0) {
      await release(db, jobs.slice(jobs.indexOf(job)));
      out.stoppedBy = "budget";
      break;
    }

    const meter: CallMeter = { used: 0 };
    let used = 0;
    try {
      const r = await runJob(db, job, granted, meter);
      used = r.calls;
      out.newCreatives += r.creatives;
      out.newBrands += r.brands;
      out.jobsDone += 1;
      await db
        .from("crawl_jobs")
        .update({ state: "done", finished_at: new Date().toISOString(), error: null })
        .eq("id", job.id);
      await touchKeyword(db, job, r.creatives);
    } catch (e) {
      out.errors += 1;
      const msg = e instanceof Error ? e.message : String(e);
      const outOfCredits = e instanceof CollectError && e.reason === "out_of_credits";
      /* 실제로 쓴 만큼만 청구로 남긴다. 402 를 받은 마지막 콜은 과금되지 않으므로 한 번 뺀다.
         예전처럼 0 이나 1 로 고정하면, 1페이지가 성공한 뒤 2페이지에서 소진된 경우
         이미 과금된 1콜이 장부에서 사라져 하드캡이 실지출보다 헐거워진다. */
      used = Math.max(0, meter.used - (outOfCredits ? 1 : 0));

      await db
        .from("crawl_jobs")
        .update({
          // 3회 실패한 job 은 죽은 대상이다(삭제된 계정 등). 영구 재시도로 예산을 갉지 않게 접는다.
          state: outOfCredits ? "queued" : job.attempts >= MAX_ATTEMPTS ? "failed" : "queued",
          error: msg.slice(0, 300),
          finished_at: new Date().toISOString(),
        })
        .eq("id", job.id);

      if (outOfCredits) {
        // 청구분 중 **안 쓴 몫만** 되돌린다(전액 환불하면 성공한 콜이 장부에서 지워진다)
        if (granted > used) await refundCalls(granted - used);
        out.callsUsed += used;
        await release(db, jobs.slice(jobs.indexOf(job) + 1));
        out.stoppedBy = "credits";
        break;
      }
    }

    out.callsUsed += used;
    if (granted > used) await refundCalls(granted - used);
  }

  return out;
}

/** 아직 손대지 않은 job 을 queued 로 되돌린다 — running 에 박제되면 15분간 아무도 못 집는다 */
async function release(db: ReturnType<typeof createAdminClient>, jobs: Job[]): Promise<void> {
  if (!db || jobs.length === 0) return;
  await db
    .from("crawl_jobs")
    .update({ state: "queued", claimed_at: null })
    .in(
      "id",
      jobs.map((j) => j.id),
    );
}

interface JobOutcome {
  calls: number;
  creatives: number;
  brands: number;
}

async function runJob(
  db: NonNullable<ReturnType<typeof createAdminClient>>,
  job: Job,
  budget: number,
  meter: CallMeter,
): Promise<JobOutcome> {
  if (job.job_type === "kw_ads" || job.job_type === "brand_ads") {
    return runAdJob(db, job, budget, meter);
  }
  return runPostJob(db, job, budget, meter);
}

async function runAdJob(
  db: NonNullable<ReturnType<typeof createAdminClient>>,
  job: Job,
  budget: number,
  meter: CallMeter,
): Promise<JobOutcome> {
  let cursor: string | null = job.cursor;
  let creatives = 0;
  let brands = 0;

  for (let page = 0; page < Math.min(CURSOR_PAGES, budget); page++) {
    // 미터를 **호출 직전에** 올린다. 호출이 던지면 그 콜도 이미 과금됐을 수 있다.
    meter.used += 1;
    const res = await searchAds(job.target, cursor);
    if (res.ads.length === 0) break;

    const r = await upsertAds(db, res.ads, job.industry_id, job.target);
    creatives += r.creatives;
    brands += r.brands;

    cursor = res.cursor;
    if (!cursor) break;
  }

  // 다음 회차가 이어받을 수 있게 커서를 남긴다 — 매번 1페이지만 다시 긁는 낭비를 막는다.
  await db.from("crawl_jobs").update({ cursor }).eq("id", job.id);

  return { calls: meter.used, creatives, brands };
}

async function runPostJob(
  db: NonNullable<ReturnType<typeof createAdminClient>>,
  job: Job,
  budget: number,
  meter: CallMeter,
): Promise<JobOutcome> {
  /* 예산이 1콜밖에 안 남았으면 이 job 을 아예 시작하지 않는다.
     collectFromSource 는 커서가 있으면 **자기 판단으로** 2콜까지 쓰고, 상한을 받는
     인자가 없다. 즉 잔여 1콜일 때 시작하면 청구되지 않은 2번째 콜이 실제로 나간다.
     하루에 한 번은 반드시 이 경계에 걸리므로(부분 허용 설계) 그냥 다음 회차로 미룬다. */
  if (budget < CURSOR_PAGES) {
    return { calls: 0, creatives: 0, brands: 0 };
  }

  const channel = job.platform === "instagram" ? "instagram" : job.platform === "tiktok" ? "tiktok" : "threads";
  // collectFromSource 는 내부에서 여러 콜을 쓴다(IG 키워드 경로는 최대 10콜).
  // 공용 풀에서는 그 경로를 쓰지 않는다 — hashtag 로 넣어 2콜 경로를 타게 한다.
  meter.used += CURSOR_PAGES;
  const posts = await collectFromSource(
    { channel, kind: "hashtag", value: job.target },
    60,
    { period: "all", mediaFormat: "all" },
  );

  const r = await upsertPosts(db, posts, job.industry_id, job.target);

  return { calls: meter.used, creatives: r.creatives, brands: r.brands };
}

/** 키워드의 회전 순서를 갱신한다. 이걸 안 하면 플래너가 같은 키워드만 계속 뽑는다. */
async function touchKeyword(
  db: NonNullable<ReturnType<typeof createAdminClient>>,
  job: Job,
  hits: number,
): Promise<void> {
  if (job.job_type !== "kw_ads" && job.job_type !== "kw_posts") return;

  const { data } = await db
    .from("industry_keywords")
    .select("id, crawl_count, hit_count, weight")
    .eq("platform", job.platform)
    .eq("keyword", job.target)
    .limit(1);

  const row = data?.[0];
  if (!row) {
    // 사용자 검색어에서 올라온 신규 키워드 — 성과가 있었을 때만 목록에 등록한다.
    // 결과 0건인 검색어를 전부 등록하면 크롤 목록이 쓰레기로 찬다.
    if (hits > 0 && job.industry_id) {
      await db.from("industry_keywords").insert({
        industry_id: job.industry_id,
        platform: job.platform,
        keyword: job.target,
        origin: "user_search",
        weight: 120,
        crawl_count: 1,
        hit_count: hits,
        last_crawled_at: new Date().toISOString(),
      });
    }
    return;
  }

  // 세 바퀴 돌았는데 계속 빈손인 키워드는 비활성화한다 — 죽은 검색어에 예산을 태우지 않는다.
  const crawlCount = Number(row.crawl_count) + 1;
  const hitCount = Number(row.hit_count) + hits;
  await db
    .from("industry_keywords")
    .update({
      crawl_count: crawlCount,
      hit_count: hitCount,
      last_crawled_at: new Date().toISOString(),
      is_active: !(crawlCount >= 3 && hitCount === 0),
    })
    .eq("id", row.id);
}
