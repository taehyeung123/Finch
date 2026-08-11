"use server";

import { revalidatePath } from "next/cache";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/supabase/config";
import { chargeGeneration, refundGenerationCredits, CREDIT_COSTS } from "@/lib/actions/credits";
import { fetchIgTranscript, isCollectionConfigured, CollectError } from "@/lib/reference/scrapecreators";
import {
  HOOK_VALUES,
  PERIODS,
  FORMATS,
  MAX_EXCLUDE_KEYWORDS,
  loadCollectSettings,
  acquireCollectLock,
  releaseCollectLock,
  executeCollection,
} from "@/lib/reference/engine";
import type { Channel, CollectSettings, HookType, ReferenceItem, ReferenceSource } from "@/lib/types";
import { DEFAULT_COLLECT_SETTINGS } from "@/lib/types";

/*
  레퍼런스 수집 기준 CRUD — 마이그레이션 0018_reference_library.sql 위에서 동작.

  - 인증은 getUser()로만 확인, 쓰기는 사용자 세션(RLS 본인 행)으로만.
  - 값 검증은 서버에서 하고, 길이·종류는 DB 제약이 한 번 더 막는다(이중 방어).
  - 데모 모드는 DB 없이 화면 목데이터로만 동작하므로 여기서는 거부한다.
  - 수집 실행 자체는 수집 엔진(3rd party) 연동 후 추가된다 — 지금은 기준 등록까지가 실기능.
*/

const CHANNELS: Channel[] = ["instagram", "tiktok", "threads"];
const KINDS = ["keyword", "account", "hashtag"] as const;
type SourceKind = (typeof KINDS)[number];

/** 사용자당 수집 기준 상한 — 무분별한 등록으로 수집 큐가 터지는 것 방지 */
const MAX_SOURCES = 30;

export type AddSourceResult = { ok: true; source: ReferenceSource } | { ok: false; error: string };

/** kind별 값 정규화·검증. 실패 시 null */
function normalizeValue(kind: SourceKind, raw: string): string | null {
  let v = raw.trim();
  if (kind === "account") {
    v = v.replace(/^@/, "");
    // 프로필 URL 붙여넣기 허용 — 마지막 경로 조각에서 핸들 추출
    const m = v.match(/(?:instagram\.com|tiktok\.com|threads\.net)\/@?([A-Za-z0-9._]+)/);
    if (m) v = m[1];
    if (!/^[A-Za-z0-9._]{2,30}$/.test(v)) return null;
    return `@${v}`;
  }
  if (kind === "hashtag") {
    v = v.replace(/^#/, "");
    if (v.length < 1 || v.length > 40 || /\s/.test(v)) return null;
    return `#${v}`;
  }
  // keyword
  if (v.length < 1 || v.length > 60) return null;
  return v;
}

export async function listReferenceSources(): Promise<ReferenceSource[] | null> {
  if (isDemoMode()) return null;
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("reference_sources")
    .select("id, channel, kind, value, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });
  if (error) {
    // 테이블 미적용(0018 미실행)이면 빈 목록으로 화면은 살리고 로그로만 알린다
    console.error("[reference] 소스 조회 실패:", error.message);
    return [];
  }
  return (data ?? []).map((r) => ({
    id: r.id as string,
    channel: r.channel as Channel,
    kind: r.kind as SourceKind,
    value: r.value as string,
    createdAt: r.created_at as string,
  }));
}

export async function addReferenceSource(input: {
  channel: string;
  kind: string;
  value: string;
}): Promise<AddSourceResult> {
  if (!CHANNELS.includes(input.channel as Channel)) return { ok: false, error: "채널을 선택해주세요." };
  if (!KINDS.includes(input.kind as SourceKind)) return { ok: false, error: "종류를 선택해주세요." };
  const value = normalizeValue(input.kind as SourceKind, String(input.value ?? ""));
  if (!value) {
    return {
      ok: false,
      error:
        input.kind === "account"
          ? "계정은 @핸들 또는 프로필 주소 형식으로 입력해주세요."
          : input.kind === "hashtag"
            ? "해시태그는 공백 없이 40자 이내로 입력해주세요."
            : "키워드는 1~60자로 입력해주세요.",
    };
  }

  if (isDemoMode()) return { ok: false, error: "데모 모드에서는 등록할 수 없습니다." };

  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  const { count } = await supabase
    .from("reference_sources")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);
  if ((count ?? 0) >= MAX_SOURCES) {
    return { ok: false, error: `수집 기준은 최대 ${MAX_SOURCES}개까지 등록할 수 있어요.` };
  }

  const { data, error } = await supabase
    .from("reference_sources")
    .insert({ user_id: user.id, channel: input.channel, kind: input.kind, value })
    .select("id, channel, kind, value, created_at")
    .single();
  if (error) {
    if (error.code === "23505") return { ok: false, error: "이미 등록된 기준이에요." };
    const missing =
      error.message.includes("does not exist") || error.message.includes("Could not find the table");
    console.error("[reference] 소스 등록 실패:", error.message);
    return {
      ok: false,
      error: missing
        ? "수집함 기능이 아직 준비되지 않았습니다(마이그레이션 0018 미적용). 잠시 후 다시 시도해주세요."
        : "등록에 실패했습니다. 잠시 후 다시 시도해주세요.",
    };
  }

  revalidatePath("/library");
  return {
    ok: true,
    source: {
      id: data.id as string,
      channel: data.channel as Channel,
      kind: data.kind as SourceKind,
      value: data.value as string,
      createdAt: data.created_at as string,
    },
  };
}

export async function removeReferenceSource(id: string): Promise<{ ok: boolean }> {
  if (isDemoMode()) return { ok: false };
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) return { ok: false };

  // RLS가 본인 행만 허용하지만, 의도를 명시하기 위해 user_id 필터도 건다
  const { error } = await supabase.from("reference_sources").delete().eq("id", id).eq("user_id", user.id);
  if (error) {
    console.error("[reference] 소스 삭제 실패:", error.message);
    return { ok: false };
  }
  revalidatePath("/library");
  return { ok: true };
}

/* ============================ 수집 필터 설정 (0021) ============================ */
/* 값 정규화·조회는 lib/reference/engine.ts loadCollectSettings가 담당(크론과 공유) */

export async function getCollectSettings(): Promise<CollectSettings> {
  if (isDemoMode()) return DEFAULT_COLLECT_SETTINGS;
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) return DEFAULT_COLLECT_SETTINGS;
  return loadCollectSettings(supabase, user.id);
}

export async function saveCollectSettings(input: CollectSettings): Promise<{ ok: boolean; error?: string }> {
  if (!PERIODS.includes(input.period) || !FORMATS.includes(input.mediaFormat)) {
    return { ok: false, error: "잘못된 설정값이에요." };
  }
  const excludeKeywords = (input.excludeKeywords ?? [])
    .map((k) => String(k).trim())
    .filter((k) => k.length >= 1 && k.length <= 30)
    .slice(0, MAX_EXCLUDE_KEYWORDS);

  if (isDemoMode()) return { ok: false, error: "데모 모드에서는 저장할 수 없습니다." };
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  const { error } = await supabase.from("reference_collect_settings").upsert({
    user_id: user.id,
    period: input.period,
    kr_only: input.krOnly,
    media_format: input.mediaFormat,
    exclude_keywords: excludeKeywords,
  });
  if (error) {
    const missing =
      error.message.includes("does not exist") || error.message.includes("Could not find the table");
    console.error("[reference] 수집 설정 저장 실패:", error.message);
    return {
      ok: false,
      error: missing
        ? "필터 설정 저장소가 아직 준비되지 않았습니다(마이그레이션 0021 미적용)."
        : "설정 저장에 실패했습니다. 잠시 후 다시 시도해주세요.",
    };
  }
  revalidatePath("/library");
  return { ok: true };
}

/* ============================ 수집 실행 (실연동) ============================ */
/* 필터·랭킹·AI 분석·저장 파이프라인 전체는 lib/reference/engine.ts로 이동(크론과 공유) */

export type CollectRunResult =
  | {
      ok: true;
      added: number;
      duplicates: number;
      usedSources: number;
      totalSources: number;
      /** 실패한 기준 — 조용히 삼키지 않고 화면에 표기한다 */
      failedSources: string[];
      /** 반응 점수 미달로 제외한 게시물 수 */
      excludedLowQuality: number;
      /** 수집 필터(기간·KR·형식·제외 키워드)로 걸러진 게시물 수 */
      excludedByFilter: number;
      /** AI가 검색 주제와 무관하다고 판단해 제외한 게시물 수 */
      excludedIrrelevant: number;
      /** AI 단계(확장 검색어·요약·태그) 실패 시 사용자에게 보여줄 경고 — 조용히 삼키지 않는다 */
      aiWarning: string | null;
    }
  | { ok: false; reason: "demo" | "auth" | "no_sources" | "not_configured" | "charge" | "out_of_credits" | "table_missing" | "provider" | "save" | "already_running"; error: string };

interface DbItemRow {
  id: string;
  channel: Channel;
  title: string;
  summary: string;
  category: string;
  hooks: unknown;
  creator_handle: string;
  url: string | null;
  thumbnail_url: string | null;
  views: number;
  likes: number;
  comments: number;
  hashtags: unknown;
  ai_comment: string;
  caption: string;
  note: string;
  transcript: string;
  status: string;
  follower_count: number;
  matched_source: string;
  favorite: boolean;
  posted_at: string | null;
  collected_at: string;
}

function rowToItem(r: DbItemRow): ReferenceItem {
  const hours = Math.max(0, Math.floor((Date.now() - new Date(r.collected_at).getTime()) / 3_600_000));
  return {
    id: r.id,
    channel: r.channel,
    category: r.category || "일반",
    title: r.title,
    summary: r.summary,
    creatorHandle: r.creator_handle,
    hooks: (Array.isArray(r.hooks) ? r.hooks : []).filter((h): h is HookType =>
      (HOOK_VALUES as string[]).includes(String(h)),
    ),
    views: Math.max(0, Number(r.views) || 0),
    likes: Math.max(0, Number(r.likes) || 0),
    followerCount: Math.max(0, Number(r.follower_count) || 0),
    matchedSource: r.matched_source,
    collectedAgoHours: hours,
    // 게시 시각은 0019부터 저장 — 없는 행(구 수집분·공급사 미제공)은 undefined로 남긴다
    postedAgoHours: r.posted_at
      ? Math.max(0, Math.floor((Date.now() - new Date(r.posted_at).getTime()) / 3_600_000))
      : undefined,
    dataSource: "thirdparty",
    url: r.url,
    thumbnailUrl: r.thumbnail_url,
    comments: Math.max(0, Number(r.comments) || 0),
    hashtags: Array.isArray(r.hashtags) ? (r.hashtags as unknown[]).map(String).slice(0, 6) : [],
    aiComment: r.ai_comment || "",
    caption: r.caption || "",
    note: r.note || "",
    transcript: r.transcript || "",
    status: r.status === "seen" || r.status === "skipped" ? r.status : "unseen",
    favorite: r.favorite,
  };
}

/** 실 모드 수집 아이템 목록 — 페이지 서버 컴포넌트용 */
export async function listReferenceItems(): Promise<ReferenceItem[]> {
  if (isDemoMode()) return [];
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) return [];

  // 스키마 세대별 컬럼 목록 — 미적용 마이그레이션이 있어도 목록은 항상 살린다
  // posted_at은 0019부터 존재하는 컬럼이라 네 세대 모두에 안전하게 들어간다
  const SELECT_FULL =
    "id, channel, title, summary, category, hooks, creator_handle, url, thumbnail_url, views, likes, comments, hashtags, ai_comment, caption, note, transcript, status, follower_count, matched_source, favorite, posted_at, collected_at";
  const SELECT_0022 =
    "id, channel, title, summary, category, hooks, creator_handle, url, thumbnail_url, views, likes, comments, hashtags, ai_comment, caption, follower_count, matched_source, favorite, posted_at, collected_at";
  const SELECT_0020 =
    "id, channel, title, summary, category, hooks, creator_handle, url, thumbnail_url, views, likes, follower_count, matched_source, favorite, posted_at, collected_at";
  const SELECT_0019 =
    "id, channel, title, summary, category, hooks, creator_handle, url, views, likes, follower_count, matched_source, favorite, posted_at, collected_at";

  for (const columns of [SELECT_FULL, SELECT_0022, SELECT_0020, SELECT_0019]) {
    const { data, error } = await supabase
      .from("reference_items")
      .select(columns)
      .eq("user_id", user.id)
      .order("collected_at", { ascending: false })
      .order("likes", { ascending: false })
      .limit(200);
    if (!error) {
      return ((data ?? []) as unknown as Partial<DbItemRow>[]).map((r) =>
        rowToItem({
          thumbnail_url: null,
          comments: 0,
          hashtags: [],
          ai_comment: "",
          caption: "",
          note: "",
          transcript: "",
          status: "unseen",
          posted_at: null,
          ...r,
        } as DbItemRow),
      );
    }
    // 컬럼 미존재(마이그레이션 미적용)면 이전 세대 컬럼으로 재시도, 그 외 오류는 종료
    if (!error.message.includes("column") && !error.message.includes("does not exist")) {
      console.error("[reference] 아이템 조회 실패:", error.message);
      return [];
    }
  }
  console.error("[reference] 아이템 조회 실패: 스키마 미적용(0019)");
  return [];
}

/** 수집 아이템 삭제 — RLS 본인 행만 */
export async function deleteReferenceItem(id: string): Promise<{ ok: boolean }> {
  if (isDemoMode()) return { ok: false };
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) return { ok: false };
  const { error } = await supabase.from("reference_items").delete().eq("id", id).eq("user_id", user.id);
  if (error) {
    console.error("[reference] 아이템 삭제 실패:", error.message);
    return { ok: false };
  }
  revalidatePath("/library");
  return { ok: true };
}

/** 내 메모 저장 (0023) — 최대 2000자 */
export async function saveReferenceNote(id: string, note: string): Promise<{ ok: boolean; error?: string }> {
  if (isDemoMode()) return { ok: false, error: "데모 모드에서는 저장되지 않아요." };
  const trimmed = String(note ?? "").slice(0, 2000);
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };
  const { error } = await supabase
    .from("reference_items")
    .update({ note: trimmed })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) {
    console.error("[reference] 메모 저장 실패:", error.message);
    return {
      ok: false,
      error: error.message.includes("note")
        ? "메모 저장소가 아직 준비되지 않았습니다(마이그레이션 0023 미적용)."
        : "메모 저장에 실패했습니다.",
    };
  }
  return { ok: true };
}

/** 확인 상태 변경 (0023) — 안 봄/봤음/건너뜀 */
export async function setReferenceStatus(
  id: string,
  status: "unseen" | "seen" | "skipped",
): Promise<{ ok: boolean }> {
  if (isDemoMode()) return { ok: false };
  if (!["unseen", "seen", "skipped"].includes(status)) return { ok: false };
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) return { ok: false };
  const { error } = await supabase
    .from("reference_items")
    .update({ status })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) {
    console.error("[reference] 상태 변경 실패:", error.message);
    return { ok: false };
  }
  return { ok: true };
}

export type TranscriptResult = { ok: true; transcript: string } | { ok: false; error: string };

/** 릴스 대본 추출 (인스타그램만) — 추출 후 DB에 캐시해 재요청 비용을 없앤다 */
export async function extractTranscript(id: string): Promise<TranscriptResult> {
  if (isDemoMode()) return { ok: false, error: "데모 모드에서는 추출할 수 없어요." };
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };
  if (!isCollectionConfigured()) return { ok: false, error: "수집 엔진 설정이 완료되지 않았어요." };

  const { data: row } = await supabase
    .from("reference_items")
    .select("channel, url, transcript")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!row) return { ok: false, error: "게시물을 찾을 수 없어요." };
  if (row.transcript) return { ok: true, transcript: row.transcript as string };
  if (row.channel !== "instagram") {
    return { ok: false, error: "대본 추출은 현재 인스타그램 릴스만 지원해요." };
  }
  if (!row.url) return { ok: false, error: "원본 링크가 없어 추출할 수 없어요." };

  /* 과금은 캐시 확인 뒤·공급사 호출 앞이다. 이미 추출해 둔 대본을 다시 보는 건
     공짜여야 하고(위에서 이미 반환됐다), 실제로 돈이 나가는 호출만 과금해야 한다.
     이 게이트가 없어서 "대본 추출"을 연타하면 공급사 크레딧이 무제한으로 나갔다. */
  const charge = await chargeGeneration({
    metric: "reference_transcript",
    creditCost: CREDIT_COSTS.transcript,
    reason: "reference_transcript",
  });
  if (!charge.ok) return { ok: false, error: charge.error };
  const refundIfCharged = async () => {
    if (charge.via === "credits") {
      await refundGenerationCredits(charge.userId, CREDIT_COSTS.transcript, "transcript_fail_refund");
    }
  };

  try {
    const text = await fetchIgTranscript(row.url as string);
    if (!text) {
      // 음성이 없는 영상은 우리 잘못이 아니지만 사용자 잘못도 아니다 — 돌려준다
      await refundIfCharged();
      return { ok: false, error: "음성이 감지되지 않았어요 — 말로 설명하는 릴스만 대본을 만들 수 있어요." };
    }
    const transcript = text.slice(0, 8000);
    await supabase.from("reference_items").update({ transcript }).eq("id", id).eq("user_id", user.id);
    return { ok: true, transcript };
  } catch (e) {
    await refundIfCharged();
    const isCredits = e instanceof CollectError && e.reason === "out_of_credits";
    console.error("[reference] 대본 추출 실패:", e);
    return {
      ok: false,
      error: isCredits
        ? "수집 엔진 사용량이 일시적으로 소진됐어요. 잠시 후 다시 시도해 주세요."
        : "대본 추출에 실패했어요. 2분 미만의 말로 설명하는 영상만 지원돼요.",
    };
  }
}

/** 즐겨찾기 영속 토글 — RLS 본인 행만 */
export async function toggleReferenceFavorite(id: string, favorite: boolean): Promise<{ ok: boolean }> {
  if (isDemoMode()) return { ok: false };
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) return { ok: false };
  const { error } = await supabase
    .from("reference_items")
    .update({ favorite })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) {
    console.error("[reference] 즐겨찾기 갱신 실패:", error.message);
    return { ok: false };
  }
  return { ok: true };
}


/**
 * 지금 수집 — 등록 기준으로 공급사 호출 → 중복 제거 → AI 요약·태깅 → 저장.
 * 과금: 무료 월 한도(reference_collect) → 크레딧 2. 전량 실패·신규 0건이면 크레딧 환불.
 */
export async function runCollection(): Promise<CollectRunResult> {
  if (isDemoMode()) return { ok: false, reason: "demo", error: "데모 모드에서는 수집할 수 없습니다." };

  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) return { ok: false, reason: "auth", error: "로그인이 필요합니다." };

  if (!isCollectionConfigured()) {
    return {
      ok: false,
      reason: "not_configured",
      error: "수집 엔진 설정이 완료되지 않았어요. 잠시 후 다시 시도해 주세요.",
    };
  }

  // 동시 실행 방지 — 락 획득/해제 로직은 engine(크론과 공유)에 있다
  const lock = await acquireCollectLock(supabase, user.id);
  if (lock === "error") {
    return { ok: false, reason: "provider", error: "수집을 시작하지 못했어요. 잠시 후 다시 시도해 주세요." };
  }
  if (lock === "already_running") {
    return { ok: false, reason: "already_running", error: "이미 수집이 진행 중이에요. 잠시 후 다시 시도해 주세요." };
  }

  try {
    const { data: sourceRows, error: srcErr } = await supabase
      .from("reference_sources")
      .select("id, channel, kind, value, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });
    if (srcErr) {
      console.error("[reference] 수집 기준 조회 실패:", srcErr.message);
      return { ok: false, reason: "provider", error: "수집 기준을 불러오지 못했어요. 잠시 후 다시 시도해 주세요." };
    }
    const sources = (sourceRows ?? []) as { id: string; channel: Channel; kind: string; value: string }[];
    if (sources.length === 0) {
      return { ok: false, reason: "no_sources", error: "먼저 수집 기준(키워드·계정·해시태그)을 등록해 주세요." };
    }

    const charge = await chargeGeneration({
      metric: "reference_collect",
      creditCost: CREDIT_COSTS.collect,
      reason: "reference_collect",
    });
    if (!charge.ok) return { ok: false, reason: "charge", error: charge.error };
    const refundIfCharged = async (why: string) => {
      if (charge.via === "credits") {
        await refundGenerationCredits(charge.userId, CREDIT_COSTS.collect, `collect_refund: ${why}`);
      }
    };

    // 수집 파이프라인 전체(로테이션→fetch→필터/랭킹→AI→저장)는 엔진이 담당 — 크론과 동일 경로
    const settings = await getCollectSettings();
    const result = await executeCollection(supabase, user.id, sources, settings);

    if (result.tableMissing) {
      await refundIfCharged("table_missing");
      return {
        ok: false,
        reason: "table_missing",
        error: "수집 저장소가 아직 준비되지 않았습니다(마이그레이션 0019 미적용). 잠시 후 다시 시도해 주세요.",
      };
    }
    const { added, duplicates, failedSources, excludedLowQuality, excludedByFilter, excludedIrrelevant, aiWarning } =
      result;

    if (added === 0) {
      await refundIfCharged("all_failed_or_empty");
      if (result.anyOutOfCredits) {
        return {
          ok: false,
          reason: "out_of_credits",
          error: "수집 엔진 사용량이 일시적으로 소진됐어요. 잠시 후 다시 시도해 주세요 — 사용하신 횟수는 차감되지 않았습니다.",
        };
      }
      if (result.providerFailures > 0) {
        console.error("[reference] 수집 전량 실패:", failedSources.join(" / "));
        return {
          ok: false,
          reason: "provider",
          error: "수집에 실패했어요. 잠시 후 다시 시도해 주세요 — 사용하신 횟수는 차감되지 않았습니다.",
        };
      }
      if (excludedByFilter > 0) {
        return {
          ok: false,
          reason: "provider",
          error: `${excludedByFilter}개를 발견했지만 전부 수집 필터(기간·한국·형식·제외 키워드)에 걸렸어요. 필터를 완화해보세요 — 사용하신 횟수는 차감되지 않았습니다.`,
        };
      }
      if (excludedLowQuality > 0) {
        return {
          ok: false,
          reason: "provider",
          error: `${excludedLowQuality}개를 발견했지만 반응(조회·좋아요)이 기준에 못 미쳐 제외했어요. 키워드를 더 널리 쓰이는 말로 바꿔보세요 — 사용하신 횟수는 차감되지 않았습니다.`,
        };
      }
      /* 중복만 나온 건 실패가 아니다 — 이미 최신 상태라는 뜻이다.
         수집 커버리지가 좋을수록 사용자에게 빨간 실패로 보이던 분기를 정상 응답으로 뒤집는다. */
      if (duplicates > 0) {
        return {
          ok: true,
          added: 0,
          duplicates,
          usedSources: result.usedSources,
          totalSources: sources.length,
          failedSources,
          excludedLowQuality,
          excludedByFilter,
          excludedIrrelevant,
          aiWarning,
        };
      }
      if (excludedIrrelevant > 0) {
        return {
          ok: false,
          reason: "provider",
          error: `${excludedIrrelevant}개를 발견했지만 AI가 "${sources.map((s) => s.value).join(", ")}" 주제와 무관하다고 판단해 제외했어요. 사용하신 횟수는 차감되지 않았습니다.`,
        };
      }
      return {
        ok: false,
        reason: "provider",
        error: "등록된 기준으로 발견된 콘텐츠가 없어요. 키워드를 조금 더 일반적인 말로 바꿔보세요 — 사용하신 횟수는 차감되지 않았습니다.",
      };
    }

    revalidatePath("/library");
    return {
      ok: true,
      added,
      duplicates,
      usedSources: result.usedSources,
      totalSources: sources.length,
      failedSources,
      excludedLowQuality,
      excludedByFilter,
      excludedIrrelevant,
      aiWarning,
    };
  } finally {
    await releaseCollectLock(supabase, user.id);
  }
}
