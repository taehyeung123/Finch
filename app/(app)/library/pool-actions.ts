"use server";

import { createClient, getAuthUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { chargeGeneration, refundGenerationCredits, CREDIT_COSTS } from "@/lib/actions/credits";
import { collectFromSource, fetchIgTranscript, isCollectionConfigured, CollectError } from "@/lib/reference/scrapecreators";
import { upsertPosts } from "@/lib/pool/upsert";
import { claimCalls, refundCalls } from "@/lib/pool/budget";
import { industryFromText } from "@/lib/industry/list";
import { createClaudeClient, CHAT_MODEL } from "@/lib/ai/claude";
import { HOOK_VALUES } from "@/lib/reference/engine";
import { logSearch, searchPool, type PoolPlatformFilter, type PoolSort } from "@/lib/pool/search";
import { poolItemToAd, poolItemToReference } from "@/lib/pool/bridge";
import type { ReferenceAd, ReferenceItem } from "@/lib/types";

/*
  공용 풀 검색 서버 액션.

  **여기서 공급사를 호출하지 않는다.** 검색은 순수한 DB 조회다 — 그게 이번 구조 변경의 핵심이다.
  풀에 없는 검색어는 0건으로 돌려주고 search_history 에 남긴다. 그 기록을 플래너가 읽어
  다음 크롤의 최우선 대상으로 올린다(lib/pool/planner.ts). 없다고 그 자리에서 사오지 않는다.

  왜 클라이언트 필터링으로 안 되는가: 풀은 수백만 행이다. 첫 40건만 받아 브라우저에서
  거르면 "검색해도 처음 40건 안에서만 찾는" 가짜 검색이 된다.
*/

export interface PoolSearchInput {
  query: string;
  /** 화면의 검색 대상 탭 값 */
  target: "all" | "instagram" | "tiktok" | "threads" | "ads";
  /** 업종 id 배열 — 라벨이 아니라 id 로 받는다(라벨은 바뀔 수 있다) */
  industryIds: string[];
  sort: "views" | "likes" | "recent" | "posted";
  page: number;
}

export interface PoolSearchOutput {
  items: ReferenceItem[];
  ads: ReferenceAd[];
  total: number;
  hasMore: boolean;
  /** 풀이 이 검색어를 아직 모른다 — 화면이 "수집 예약됨"을 안내하는 신호 */
  isGap: boolean;
}

const EMPTY: PoolSearchOutput = { items: [], ads: [], total: 0, hasMore: false, isGap: false };

/** 화면 정렬 → 풀 정렬. 광고에는 조회·좋아요가 없으므로 집행 기간으로 대체한다. */
function poolSort(sort: PoolSearchInput["sort"], forAds: boolean): PoolSort {
  if (sort === "recent" || sort === "posted") return "recent";
  if (forAds) return "longest";
  return "heat";
}

export async function searchPoolAction(input: PoolSearchInput): Promise<PoolSearchOutput> {
  const user = await getAuthUser();
  if (!user) return EMPTY;

  const q = input.query.trim().slice(0, 60);
  const page = Math.max(0, Math.min(50, input.page));
  // 업종을 여러 개 고른 경우 첫 번째만 서버에 건다. contains 는 AND 라서 여러 개를 걸면
  // "두 업종에 동시에 속한 소재"만 남아 거의 0건이 된다 — 사용자 의도는 OR 다.
  const industryId = input.industryIds[0] ?? null;

  const wantsOrganic = input.target !== "ads";
  const wantsAds = input.target === "all" || input.target === "ads" || input.target === "instagram";

  const [organic, adResult] = await Promise.all([
    wantsOrganic
      ? searchPool({
          q,
          /* kind 를 명시해야 의미 검색 보충 슬롯을 광고가 잠식하지 않는다 —
             p_kind 없이 부르면 유사도 상위의 광고가 오가닉 몫을 차지하고
             호출측 사후 필터에서 버려져 슬롯만 날린다(리뷰 확정 결함). */
          kind: "post",
          industryId,
          platform: (input.target === "all" ? "all" : input.target) as PoolPlatformFilter,
          sort: poolSort(input.sort, false),
          page,
        })
      : Promise.resolve(null),
    wantsAds
      ? searchPool({
          q,
          industryId,
          platform: "meta_ads",
          sort: poolSort(input.sort, true),
          page,
        })
      : Promise.resolve(null),
  ]);

  // 오가닉 조회는 platform=all 일 때 광고까지 함께 잡히므로 여기서 갈라 준다
  // (두 목록에 같은 소재가 중복으로 뜨는 걸 막는다).
  const items = (organic?.items ?? []).filter((p) => p.kind === "post").map(poolItemToReference);
  const ads = (adResult?.items ?? []).map(poolItemToAd);

  const total = (organic?.total ?? 0) + (adResult?.total ?? 0);

  /* 미스 판정·기록은 **글자 일치 수** 기준 — 의미 검색 보충으로 화면이 채워져도
     hit_count=0 이어야 플래너가 이 검색어를 정확 수집 대상으로 올리고,
     isGap 도 같은 기준이어야 "수집 예약됨" 안내가 정직하다. */
  const exactFound = (organic?.exactCount ?? 0) + (adResult?.exactCount ?? 0);
  if (q && page === 0) {
    await logSearch(user.id, q, exactFound, industryId, input.target === "ads" ? "meta_ads" : input.target);
  }

  return {
    items,
    ads,
    total,
    hasMore: Boolean(organic?.hasMore || adResult?.hasMore),
    isGap: Boolean(q) && page === 0 && exactFound === 0,
  };
}

/* ────────────────────────────────────────────────────────────────
   쓰기 경로 — 풀이 켜지면 저장·수집 버튼의 대상이 바뀐다.

   이걸 안 하면 조용히 깨진다. 풀이 채워지는 순간 화면에는 풀 소재가 뜨는데
   저장 버튼은 여전히 reference_items 를 찾아가고, 그 표에 그 id 는 없다.
   "지금 수집"도 마찬가지로 개인 표에 쌓기만 해서, 크레딧은 나가는데
   화면에는 아무것도 안 보인다.
──────────────────────────────────────────────────────────────── */

/**
 * 풀 소재 저장 토글. saved_creatives 는 own-row RLS 라 사용자 세션으로 직접 쓴다.
 * 저장 수 집계는 DB 트리거(bump_creative_saves)가 처리하므로 여기서 건드리지 않는다.
 */
export async function togglePoolSave(
  creativeId: string,
  on: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const user = await getAuthUser();
  if (!user) return { ok: false, error: "로그인이 필요해요" };

  const supabase = await createClient();
  if (on) {
    const { error } = await supabase
      .from("saved_creatives")
      .upsert({ user_id: user.id, creative_id: creativeId }, { onConflict: "user_id,creative_id" });
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await supabase
      .from("saved_creatives")
      .delete()
      .eq("user_id", user.id)
      .eq("creative_id", creativeId);
    if (error) return { ok: false, error: error.message };
  }
  return { ok: true };
}

/** 이미 저장한 소재 id — 카드의 북마크 상태를 첫 렌더부터 맞추기 위해 필요하다 */
export async function listPoolSaves(): Promise<string[]> {
  const user = await getAuthUser();
  if (!user) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("saved_creatives")
    .select("creative_id")
    .eq("user_id", user.id)
    .order("saved_at", { ascending: false })
    .limit(500);
  return ((data ?? []) as Array<{ creative_id: string }>).map((r) => String(r.creative_id));
}

/**
 * "지금 수집" 의 풀 버전 — 등록해 둔 기준을 **수집 대기열 최상단으로 올린다.**
 *
 * 공급사를 직접 부르지 않는다. 그러면 사용자 수만큼 원가가 늘던 옛 구조로 되돌아간다.
 * 대신 search_history 에 미적중 기록으로 남긴다 — 플래너가 이미 그 기록을
 * 우선순위 30(전 업종 순환보다 훨씬 위)으로 집어 간다.
 *
 * crawl_jobs 에 직접 넣지 않는 이유: 그 표는 사용자에게 완전히 닫혀 있고, 열어주려면
 * SECURITY DEFINER 함수를 새로 만들어야 한다. 즉 예산을 소모시킬 수 있는 창구를
 * 하나 더 여는 셈이다. search_history 는 own-row RLS 로 이미 안전하게 열려 있고
 * 목적도 정확히 같다 — 새 창구를 만들 이유가 없다.
 */
export async function requestPoolCollect(
  targets: Array<{ value: string; platform: string }>,
): Promise<{ ok: boolean; queued: number; error?: string; retriable?: boolean }> {
  const user = await getAuthUser();
  if (!user) return { ok: false, queued: 0, error: "로그인이 필요해요" };

  // 한 번에 10개까지. 상한이 없으면 기준을 100개 등록해 두고 버튼을 연타하는 것만으로
  // 하루 예산이 특정 사용자에게 쏠린다.
  const rows = targets
    .map((t) => ({ value: t.value.trim().replace(/^[#@]/, ""), platform: t.platform }))
    .filter((t) => t.value.length >= 2 && t.value.length <= 60)
    .slice(0, 10)
    .map((t) => ({
      user_id: user.id,
      query: t.value,
      hit_count: 0,
      platform: t.platform === "all" ? null : t.platform,
    }));

  /* 호출측은 이제 검색어 기반 수집뿐이다(2026-08-15 재편) — "등록된 수집 기준" 화법 금지 */
  if (rows.length === 0) return { ok: false, queued: 0, error: "수집할 검색어를 2~60자로 입력해 주세요" };

  const supabase = await createClient();
  const { error } = await supabase.from("search_history").insert(rows);
  // INSERT 실패는 우리 쪽 오류다 — 같은 검색어로 다시 시도할 수 있어야 한다
  if (error) return { ok: false, queued: 0, retriable: true, error: "수집 예약에 실패했어요. 잠시 후 다시 시도해 주세요." };
  return { ok: true, queued: rows.length };
}


/**
 * 풀 소재 대본 추출 — **공용 캐시**가 핵심이다.
 *
 * 개인 수집분과 달리 풀 소재는 전원이 같은 행을 본다. 그래서 대본도
 * creative_transcripts(0027) 한 곳에 저장하고, 누가 이미 추출했으면
 * **다음 사람부터는 공짜다.** 이게 공용 풀의 세일즈 포인트이고
 * (docs/POOL_OPERATIONS.md), 같은 영상에 공급사 크레딧을 두 번 쓰지 않는
 * 원가 장치이기도 하다.
 *
 * 과금은 캐시 확인 뒤·공급사 호출 앞 — 실제로 돈이 나가는 호출만 과금한다.
 * 쓰기는 admin 클라이언트로 한다: 공용 캐시 표는 사용자 쓰기 정책이 없다
 * (일부러 — 아무나 남의 대본을 덮어쓰면 안 된다).
 */
export async function extractPoolTranscript(
  creativeId: string,
): Promise<{ ok: true; transcript: string; cached: boolean } | { ok: false; error: string }> {
  const user = await getAuthUser();
  if (!user) return { ok: false, error: "로그인이 필요해요." };

  const supabase = await createClient();
  const { data: c } = await supabase
    .from("creatives")
    .select("platform, kind, permalink")
    .eq("id", creativeId)
    .maybeSingle();
  if (!c) return { ok: false, error: "게시물을 찾을 수 없어요." };
  if (c.kind !== "post" || c.platform !== "instagram") {
    return { ok: false, error: "대본 추출은 현재 인스타그램 릴스만 지원해요." };
  }

  // 누군가 이미 추출했으면 공짜 — 공용 풀의 존재 이유
  const { data: cached } = await supabase
    .from("creative_transcripts")
    .select("transcript")
    .eq("creative_id", creativeId)
    .maybeSingle();
  if (cached?.transcript) return { ok: true, transcript: cached.transcript as string, cached: true };

  if (!c.permalink) return { ok: false, error: "원본 링크가 없어 추출할 수 없어요." };
  if (!isCollectionConfigured()) return { ok: false, error: "수집 엔진 설정이 완료되지 않았어요." };

  const charge = await chargeGeneration({
    metric: "reference_transcript",
    creditCost: CREDIT_COSTS.transcript,
    reason: "pool_transcript",
  });
  if (!charge.ok) return { ok: false, error: charge.error };
  const refundIfCharged = async () => {
    if (charge.via === "credits") {
      await refundGenerationCredits(charge.userId, CREDIT_COSTS.transcript, "pool_transcript_fail_refund");
    }
  };

  try {
    const text = await fetchIgTranscript(c.permalink as string);
    if (!text) {
      await refundIfCharged();
      return { ok: false, error: "음성이 감지되지 않았어요 — 말로 설명하는 릴스만 대본을 만들 수 있어요." };
    }
    const transcript = text.slice(0, 8000);
    const admin = createAdminClient();
    if (admin) {
      const { error } = await admin
        .from("creative_transcripts")
        .upsert({ creative_id: creativeId, transcript });
      if (error) console.error("[pool] 대본 캐시 저장 실패(추출 결과는 반환):", error.message);
    }
    return { ok: true, transcript, cached: false };
  } catch (e) {
    await refundIfCharged();
    const isCredits = e instanceof CollectError && e.reason === "out_of_credits";
    console.error("[pool] 대본 추출 실패:", e);
    return {
      ok: false,
      error: isCredits
        ? "수집 엔진 사용량이 일시적으로 소진됐어요. 잠시 후 다시 시도해 주세요."
        : "대본 추출에 실패했어요. 2분 미만의 말로 설명하는 영상만 지원돼요.",
    };
  }
}

export interface PoolVideoAnalysis {
  /** 첫 3초에서 시청자를 붙잡는 방식 */
  opening: string;
  /** 영상 전개 구조 3~5단계 */
  flow: string[];
  /** 감지된 후킹 기법 태그 (고정 8종 안에서) */
  hookTags: string[];
  /** 타깃 시청자 추정 */
  target: string;
  /** 내 콘텐츠에 적용할 포인트 */
  improvement: string;
}

type AnalyzeResult =
  | { ok: true; analysis: PoolVideoAnalysis; cached: boolean; transcript?: string }
  | { ok: false; error: string };

function parseAnalysisRow(row: {
  hook_breakdown: unknown;
  target_guess: string | null;
  improvement: string | null;
}): PoolVideoAnalysis {
  const hb = (row.hook_breakdown ?? {}) as Record<string, unknown>;
  const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  return {
    opening: typeof hb.opening === "string" ? hb.opening : "",
    flow: strs(hb.flow),
    hookTags: strs(hb.hook_tags),
    target: row.target_guess ?? "",
    improvement: row.improvement ?? "",
  };
}

/**
 * 풀 영상 AI 분석 — 대본 기반 후킹 구조 분석.
 *
 * 과금(2026-08-14 개편 — 이전의 완전 무료는 하루 지출 상한이 없는 유일한 경로였다):
 *  - 캐시 히트(누군가 이미 분석한 영상)는 무조건 무료 — 공용 풀의 존재 이유.
 *  - 새 분석만 과금: 무료 플랜 월 1회(사장님 확정), 이후·유료는 크레딧(videoAnalysis).
 *  - 모델은 Opus → Sonnet 강등(같은 날): 구조 분석 품질은 유지하면서 건당 ~40원 → ~8원.
 *
 * creative_analyses 공용 캐시: 영상 하나당 원가(대본 공급사 1크레딧 + Sonnet 토큰)는
 * 최초 1회만 나가고 이후 전원이 캐시를 읽는다. 대본이 새로 추출되면 대본 캐시에도 넣는다.
 */
export async function analyzePoolCreative(creativeId: string): Promise<AnalyzeResult> {
  const user = await getAuthUser();
  if (!user) return { ok: false, error: "로그인이 필요해요." };

  const supabase = await createClient();
  const { data: c } = await supabase
    .from("creatives")
    .select("platform, kind, permalink, title, body, views, likes, comments, follower_count")
    .eq("id", creativeId)
    .maybeSingle();
  if (!c) return { ok: false, error: "게시물을 찾을 수 없어요." };
  if (c.kind !== "post" || c.platform !== "instagram") {
    return { ok: false, error: "영상 분석은 현재 인스타그램 릴스만 지원해요." };
  }

  /* 누군가 이미 분석했으면 공짜 — 공용 풀의 존재 이유.
     내용 없는 행은 캐시가 아니라 아래 선점 자리표시다 — 히트로 치지 않는다. */
  const { data: cachedRow } = await supabase
    .from("creative_analyses")
    .select("hook_breakdown, target_guess, improvement, created_at")
    .eq("creative_id", creativeId)
    .maybeSingle();
  if (cachedRow) {
    const parsed = parseAnalysisRow(cachedRow);
    const hasContent = parsed.opening || parsed.target || parsed.improvement || parsed.flow.length > 0;
    if (hasContent) return { ok: true, analysis: parsed, cached: true };
    // 자리표시가 10분 넘게 남아 있으면 죽은 실행의 잔해다 — 이어받아 다시 분석한다
    const ageMs = Date.now() - new Date(String(cachedRow.created_at)).getTime();
    if (ageMs < 10 * 60_000) {
      return { ok: false, error: "다른 요청이 이 영상을 분석하는 중이에요 — 잠시 후 다시 열어 주세요." };
    }
  }

  const claude = createClaudeClient();
  if (!claude) return { ok: false, error: "AI 분석 설정이 완료되지 않았어요." };

  /* 무비용 사전조건(대본 캐시·원본 링크·수집 엔진 설정)을 먼저 확인한다 —
     여기서 걸리는 건 재시도해도 똑같이 실패하는 결정적 실패라, 선점 자리표시를
     만들기 전에 걸러야 잔해도 안 남는다. */
  const { data: t } = await supabase
    .from("creative_transcripts")
    .select("transcript")
    .eq("creative_id", creativeId)
    .maybeSingle();
  const cachedTranscript = (t?.transcript as string | undefined) ?? null;
  if (!cachedTranscript && (!c.permalink || !isCollectionConfigured())) {
    return { ok: false, error: "원본 링크가 없어 대본을 추출할 수 없어요." };
  }

  const admin = createAdminClient();
  /* 동시 호출 선점 — 자리표시 행을 원자적으로 insert 한다. 같은 릴스를 두 사람이
     동시에 분석하면 둘 다 캐시 미스 → Opus 2회(이중 원가)가 되는 걸 PK 충돌로 막는다.
     실패·강제종료 시 잔해는 위의 10분 시효가 회수한다. */
  let preempted = false;
  if (admin && !cachedRow) {
    const { error: lockErr } = await admin.from("creative_analyses").insert({ creative_id: creativeId });
    if (lockErr) {
      if (lockErr.code === "23505") {
        return { ok: false, error: "다른 요청이 이 영상을 분석하는 중이에요 — 잠시 후 다시 열어 주세요." };
      }
      // 자리표시 실패는 치명적이지 않다 — 선점 없이 진행(레이스 방어만 잃는다)
      console.warn("[pool] 분석 선점 실패(진행은 계속):", lockErr.message);
    } else {
      preempted = true;
    }
  }
  /* 자리표시 회수 — 실패 경로 공용. target_guess='' 조건으로 완성된 행은 절대 안 지운다 */
  const releaseLock = async () => {
    if (preempted && admin) {
      await admin.from("creative_analyses").delete().eq("creative_id", creativeId).eq("target_guess", "").eq("improvement", "");
    }
  };

  /* 과금 — 선점까지 통과한 "실제 새 분석"만. 캐시 히트·사전조건 실패·동시 분석 대기는
     여기 도달하지 않아 무료다. 이후 실패 시 크레딧 구간만 환불(무료 카운터 미복구는
     기존 정책과 동일 — credits.ts 안전 원칙). */
  const charge = await chargeGeneration({
    metric: "ai_video_analysis",
    creditCost: CREDIT_COSTS.videoAnalysis,
    reason: "pool_video_analysis",
  });
  if (!charge.ok) {
    await releaseLock();
    return { ok: false, error: charge.error };
  }
  const refundIfCharged = async (why: string) => {
    if (charge.via === "credits") {
      await refundGenerationCredits(charge.userId, CREDIT_COSTS.videoAnalysis, `pool_video_analysis_refund: ${why}`);
    }
  };

  try {
    /* 1. 대본 — 캐시가 없으면 여기서 추출한다 (사전조건은 위에서 이미 통과) */
    let transcript: string | null = cachedTranscript;
    let freshTranscript = false;
    if (!transcript) {
      transcript = await fetchIgTranscript(c.permalink as string);
      freshTranscript = Boolean(transcript);
    }
    if (!transcript) {
      await releaseLock();
      await refundIfCharged("no_voice");
      return { ok: false, error: "음성이 감지되지 않았어요 — 말로 설명하는 릴스만 분석할 수 있어요." };
    }
    transcript = transcript.slice(0, 8000);

    if (freshTranscript && admin) {
      const { error } = await admin.from("creative_transcripts").upsert({ creative_id: creativeId, transcript });
      if (error) console.error("[pool] 대본 캐시 저장 실패(분석은 계속):", error.message);
    }

    /* 2. Sonnet 분석 — 대본 + 캡션 + 반응 수치 (2026-08-14 Opus→Sonnet 강등, 건당 ~40원→~8원) */
    const response = await claude.messages.create({
      model: CHAT_MODEL,
      max_tokens: 2000,
      output_config: {
        format: {
          type: "json_schema",
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["opening", "flow", "hook_tags", "target", "improvement"],
            properties: {
              opening: { type: "string", description: "첫 3초(대본 도입부)가 시청자를 붙잡는 방식 분석, 2문장 이내" },
              flow: { type: "array", items: { type: "string" }, description: "영상 전개 구조 3~5단계, 각 한 문장" },
              hook_tags: { type: "array", items: { enum: HOOK_VALUES }, description: "사용된 후킹 기법 0~3개" },
              target: { type: "string", description: "타깃 시청자 추정 한 문장" },
              improvement: { type: "string", description: "이 구조를 내 콘텐츠에 적용할 때의 포인트 1~2문장" },
            },
          },
        },
      },
      system:
        "너는 숏폼 콘텐츠 구조 분석가다. 인스타그램 릴스의 대본(음성 받아쓰기)과 캡션, 반응 수치를 보고 " +
        "후킹 구조를 분석한다. 대본에 실제로 있는 내용만 근거로 삼고, 지어내지 마라. 이모지 금지. " +
        "improvement 는 '이 영상을 베끼라'가 아니라 구조를 일반화해 적용하는 조언으로 쓴다.",
      messages: [
        {
          role: "user",
          content:
            `제목: ${String(c.title ?? "").slice(0, 80)}\n` +
            `조회:${c.views} 좋아요:${c.likes} 댓글:${c.comments} 팔로워:${c.follower_count}\n` +
            `캡션: ${String(c.body ?? "").slice(0, 400)}\n---\n대본:\n${transcript}`,
        },
      ],
    });
    if (response.stop_reason === "refusal") {
      await releaseLock();
      await refundIfCharged("refusal");
      return { ok: false, error: "이 영상은 분석할 수 없어요." };
    }
    const text = (response.content as { type: string; text?: string }[]).find((b) => b.type === "text")?.text;
    if (!text) throw new Error("빈 응답");
    const parsed = JSON.parse(text) as {
      opening: string;
      flow: string[];
      hook_tags: string[];
      target: string;
      improvement: string;
    };
    const analysis: PoolVideoAnalysis = {
      opening: (parsed.opening ?? "").slice(0, 300),
      flow: (parsed.flow ?? []).slice(0, 5).map((s) => String(s).slice(0, 200)),
      hookTags: (parsed.hook_tags ?? []).filter((h) => (HOOK_VALUES as string[]).includes(h)).slice(0, 3),
      target: (parsed.target ?? "").slice(0, 200),
      improvement: (parsed.improvement ?? "").slice(0, 400),
    };

    /* 3. 공용 캐시 적재 — 쓰기 정책이 없는 표라 admin 으로만 쓴다 */
    if (admin) {
      const { error } = await admin.from("creative_analyses").upsert({
        creative_id: creativeId,
        hook_breakdown: { opening: analysis.opening, flow: analysis.flow, hook_tags: analysis.hookTags },
        target_guess: analysis.target,
        improvement: analysis.improvement,
        model: CHAT_MODEL,
      });
      if (error) console.error("[pool] 분석 캐시 저장 실패(결과는 반환):", error.message);
    }

    return { ok: true, analysis, cached: false, ...(freshTranscript ? { transcript } : {}) };
  } catch (e) {
    await releaseLock();
    await refundIfCharged("analysis_error");
    const isCredits = e instanceof CollectError && e.reason === "out_of_credits";
    console.error("[pool] 영상 분석 실패:", e);
    return {
      ok: false,
      error: isCredits
        ? "수집 엔진 사용량이 일시적으로 소진됐어요. 잠시 후 다시 시도해 주세요."
        : "영상 분석에 실패했어요. 2분 미만의 말로 설명하는 영상만 지원돼요.",
    };
  }
}

/**
 * [지금 수집] 실시간 풀 수집 — 훔쳐봐 방식 + 스니핏 자산화 (2026-08-14 확정 구조).
 *
 * 2트랙 수집 인프라의 트랙 2:
 *  · 트랙 1(기본): 크론이 하루 예산 안에서 자동 수집 → 공용 풀 (스니핏 방식, 회사 부담)
 *  · 트랙 2(부가): 기다리기 싫은 사용자가 이 액션으로 **그 자리에서** 수집 (훔쳐봐 방식)
 *    — 크레딧 과금 + 월 한도로 원가를 사용자가 부담하고,
 *    — 결과는 개인 표가 아니라 **공용 풀에 적재**된다. 즉시성을 산 사람의 돈으로
 *      풀이 영구히 부자가 되는 구조 — 두 벤치마크의 장점 결합.
 *
 * 공급사 지출 통제는 변함없이 crawl_budget 하나다: 여기서도 claimCalls 로 같은
 * 하루 상한에서 차감한다. 상한 소진 시엔 실시간을 거부하고 대기열 폴백을 안내한다 —
 * 유료 사용자가 몰려도 공급사 계정이 하루 상한을 넘길 수 없다.
 *
 * 실시간은 오가닉(인스타)만이다: 광고는 이미 풀에 수백 건 쌓여 있고, 부족한 쪽이
 * 오가닉이라 즉시성의 가치도 오가닉에 있다. 광고 기준은 호출측이 대기열로 보낸다.
 */
export async function collectPoolNow(
  targets: Array<{ value: string; kind?: string }>,
): Promise<{ ok: boolean; added: number; error?: string; retriable?: boolean }> {
  const user = await getAuthUser();
  if (!user) return { ok: false, added: 0, error: "로그인이 필요해요." };
  if (!isCollectionConfigured()) return { ok: false, added: 0, error: "수집 엔진 설정이 완료되지 않았어요." };

  const admin = createAdminClient();
  if (!admin) return { ok: false, added: 0, error: "수집 설정이 완료되지 않았어요." };

  /* 길이 판정은 접두 기호를 뗀 형태로 — requestPoolCollect(/^[#@]/)와 같은 기준이어야
     같은 검색어가 탭에 따라 성패가 갈리지 않는다. value 는 '@'를 남긴 원형 그대로 넘긴다
     (아래 kind 판정이 그 신호를 쓴다). 서버 액션 60초 상한 때문에 최대 2개까지만 실시간. */
  const picked = targets
    .map((t) => ({ value: t.value.trim(), kind: t.kind }))
    .map((t) => ({ ...t, bare: t.value.replace(/^[#@]/, "").trim() }))
    .filter((t) => t.bare.length >= 2 && t.bare.length <= 60)
    .slice(0, 2);
  if (picked.length === 0) return { ok: false, added: 0, error: "수집할 검색어를 2~60자로 입력해 주세요." };

  /* 공급사 실호출 수는 경로마다 다르다 — 이걸 2로 뭉뚱그리면 하루 상한이 뚫린다.
     (lib/reference/scrapecreators.ts: account=1콜, keyword=릴스 검색 4페이지, hashtag=커서 2콜.
     lib/pool/worker.ts 가 같은 이유로 크론에서는 hashtag 를 강제한다.) */
  const CALLS_BY_KIND = { account: 1, keyword: 4, hashtag: 2 } as const;
  const kindOf = (t: { value: string; kind?: string; bare: string }): keyof typeof CALLS_BY_KIND =>
    t.kind === "account" || t.value.startsWith("@")
      ? "account"
      : /* 다단어를 해시태그로 조회하면 존재하지 않는 태그라 항상 0건이다(리뷰 확정 결함) */
        t.kind === "keyword" || /\s/.test(t.bare)
        ? "keyword"
        : "hashtag";

  /* ── 순서가 중요하다: **공급사 예산을 먼저 잡고, 그 다음에 사용자에게 청구한다.**
     반대로 하면 "예산이 없어 아무것도 못 했는데 사용자 계량기만 깎인" 상태를 만들고,
     그걸 되돌리려 무료 한도를 환불하게 된다 — 그 환불이 곧 **공용 예산을 지키는 유일한
     사용자별 브레이크를 없애는 구멍**이었다(적대 검증 확정: 검색어만 바꿔 가며 무한 클릭 시
     한 사람이 하루 420콜을 전부 태울 수 있었다). 이 순서면 그 환불 자체가 필요 없다. ── */
  const need = picked.reduce((sum, t) => sum + CALLS_BY_KIND[kindOf(t)], 0);
  const granted = await claimCalls(need);
  const live: typeof picked = [];
  let planned = 0;
  for (const t of picked) {
    const cost = CALLS_BY_KIND[kindOf(t)];
    if (planned + cost > granted) break;
    live.push(t);
    planned += cost;
  }
  if (live.length === 0) {
    if (granted > 0) await refundCalls(granted);
    /* 검색만으로도 미적중 기록이 남아 플래너가 다음 회차 최우선으로 집어 간다(logSearch) —
       "대기열에 올려두라"고 시키지 않고 이미 올라갔다고 알린다. */
    return {
      ok: false,
      added: 0,
      error: "오늘 실시간 수집 한도가 다 찼어요 — 이 검색어는 다음 자동 수집 회차에 올려뒀어요.",
    };
  }
  // 청구했는데 안 쓰기로 한 몫은 즉시 반납한다 — 안 그러면 공용 예산이 조용히 샌다
  if (granted > planned) await refundCalls(granted - planned);

  const charge = await chargeGeneration({
    metric: "reference_collect",
    creditCost: CREDIT_COSTS.collect,
    reason: "pool_collect_now",
  });
  if (!charge.ok) {
    await refundCalls(planned); // 아직 한 통도 안 걸었다
    return { ok: false, added: 0, error: charge.error };
  }
  /**
   * 사용자 부담 되돌리기 — **크레딧만** 돌려준다.
   * 무료 월 한도(via:"quota")는 공급사를 실제로 호출한 뒤의 실패에서 복구하지 않는다:
   * 돈은 이미 나갔고, 여기서 되돌리면 "0건 나는 검색어를 계속 눌러도 사용자 부담 0"이 되어
   * 공용 하루 예산을 한 사람이 고갈시킬 수 있다(적대 검증 확정 결함).
   */
  const refundUser = async () => {
    if (charge.via === "credits") {
      await refundGenerationCredits(charge.userId, CREDIT_COSTS.collect, "pool_collect_now_fail_refund");
    }
  };

  try {
    const batches = await Promise.all(
      live.map(async (t) => {
        try {
          const posts = await collectFromSource(
            { channel: "instagram", kind: kindOf(t), value: t.value },
            60,
            { period: "all", mediaFormat: "all" },
          );
          return { t, posts };
        } catch (e) {
          console.error("[pool] 실시간 수집 실패:", t.value, e instanceof Error ? e.message : String(e));
          return { t, posts: [] as Awaited<ReturnType<typeof collectFromSource>> };
        }
      }),
    );

    let added = 0;
    for (const { t, posts } of batches) {
      if (posts.length === 0) continue;
      const industry = industryFromText(t.bare);
      const r = await upsertPosts(admin, posts, industry, t.bare);
      added += r.creatives;
    }

    if (added === 0) {
      await refundUser();
      return { ok: false, added: 0, error: "이 검색어로는 새로 모을 게시물이 없었어요 — 다른 말로 검색해 보세요." };
    }
    return { ok: true, added };
  } catch (e) {
    await refundUser();
    console.error("[pool] 실시간 풀 수집 실패:", e);
    // retriable — 우리 쪽 오류다. 호출측이 같은 검색어로 다시 시도할 수 있게 표시한다.
    return { ok: false, added: 0, retriable: true, error: "수집에 실패했어요. 잠시 후 다시 시도해 주세요." };
  }
}
