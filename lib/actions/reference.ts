"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isDemoMode } from "@/lib/supabase/config";
import { createClaudeClient, STUDIO_MODEL } from "@/lib/ai/claude";
import { chargeGeneration, refundGenerationCredits, CREDIT_COSTS } from "@/lib/actions/credits";
import {
  collectFromSource,
  isCollectionConfigured,
  CollectError,
  type CollectedPost,
} from "@/lib/reference/scrapecreators";
import type { Channel, CollectSettings, HookType, ReferenceItem, ReferenceSource } from "@/lib/types";
import { DEFAULT_COLLECT_SETTINGS, PERIOD_DAYS } from "@/lib/types";

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
  const {
    data: { user },
  } = await supabase.auth.getUser();
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
  const {
    data: { user },
  } = await supabase.auth.getUser();
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
  const {
    data: { user },
  } = await supabase.auth.getUser();
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

const PERIODS: CollectSettings["period"][] = ["all", "7d", "1m", "3m", "6m", "1y"];
/** 0022 이전 저장값 이관 매핑 — DB 마이그레이션 전에도 화면이 깨지지 않게 */
const LEGACY_PERIODS: Record<string, CollectSettings["period"]> = { "1d": "7d", "30d": "1m" };
const FORMATS: CollectSettings["mediaFormat"][] = ["all", "video", "photo", "carousel"];
const MAX_EXCLUDE_KEYWORDS = 10;

export async function getCollectSettings(): Promise<CollectSettings> {
  if (isDemoMode()) return DEFAULT_COLLECT_SETTINGS;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return DEFAULT_COLLECT_SETTINGS;

  const { data } = await supabase
    .from("reference_collect_settings")
    .select("period, kr_only, media_format, exclude_keywords")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!data) return DEFAULT_COLLECT_SETTINGS;
  const rawPeriod = LEGACY_PERIODS[String(data.period)] ?? data.period;
  return {
    period: PERIODS.includes(rawPeriod as CollectSettings["period"]) ? (rawPeriod as CollectSettings["period"]) : "all",
    krOnly: Boolean(data.kr_only),
    mediaFormat: FORMATS.includes(data.media_format as CollectSettings["mediaFormat"])
      ? (data.media_format as CollectSettings["mediaFormat"])
      : "all",
    excludeKeywords: Array.isArray(data.exclude_keywords)
      ? (data.exclude_keywords as unknown[]).map(String).slice(0, MAX_EXCLUDE_KEYWORDS)
      : [],
  };
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
  const {
    data: { user },
  } = await supabase.auth.getUser();
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

/** 후처리 필터 — 공급사 서버 파라미터로 못 거르는 조건을 여기서 거른다 */
function passesFilters(p: CollectedPost, s: CollectSettings): boolean {
  const periodDays = PERIOD_DAYS[s.period];
  if (periodDays !== null) {
    if (!p.postedAt || new Date(p.postedAt).getTime() < Date.now() - periodDays * 86_400_000) return false;
  }
  if (s.krOnly) {
    // 틱톡은 국가 정보로, 인스타·스레드는 한글 포함으로 판단(휴리스틱 — UI에 고지)
    if (p.channel === "tiktok") {
      if (p.region !== "KR") return false;
    } else if (!/[가-힣]/.test(p.caption)) {
      return false;
    }
  }
  if (s.mediaFormat !== "all" && p.mediaFormat !== s.mediaFormat) return false;
  if (s.excludeKeywords.length > 0) {
    const haystack = p.caption.toLowerCase();
    if (s.excludeKeywords.some((k) => haystack.includes(k.toLowerCase()))) return false;
  }
  return true;
}

/* ============================ 수집 실행 (실연동) ============================ */

/** 1회 수집에서 공급사 API를 부르는 최대 기준 수 — 기준당 1크레딧 실비 상한 */
const MAX_SOURCES_PER_RUN = 6;
/** 기준 하나당 공급사에서 받아오는 최대 게시물 수 (랭킹 전 후보군) */
const FETCH_PER_SOURCE = 30;
/** 랭킹 후 기준 하나당 저장할 최대 게시물 수 */
const KEEP_PER_SOURCE = 8;
/** 반응 점수 최소선 — 이 밑은 "죽은 게시물"로 보고 제외한다 (제외 수는 안내에 표기) */
const MIN_ENGAGEMENT_SCORE = 50;

/** 반응 점수 — 조회수 + 좋아요·댓글 가중. Threads(조회수 미공개)도 좋아요·댓글로 비교 가능 */
function engagementScore(p: CollectedPost): number {
  return p.views + p.likes * 20 + p.comments * 40;
}

const HOOK_VALUES: HookType[] = [
  "숫자리스트", "손실회피", "통념깨기", "질문호명", "결과수치", "시의성", "공감자극", "호기심",
];

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
    }
  | { ok: false; reason: "demo" | "auth" | "no_sources" | "not_configured" | "charge" | "out_of_credits" | "table_missing" | "provider" | "save"; error: string };

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
  follower_count: number;
  matched_source: string;
  favorite: boolean;
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
    views: Number(r.views) || 0,
    likes: Number(r.likes) || 0,
    followerCount: Number(r.follower_count) || 0,
    matchedSource: r.matched_source,
    collectedAgoHours: hours,
    dataSource: "thirdparty",
    url: r.url,
    thumbnailUrl: r.thumbnail_url,
    comments: Number(r.comments) || 0,
    hashtags: Array.isArray(r.hashtags) ? (r.hashtags as unknown[]).map(String).slice(0, 6) : [],
    aiComment: r.ai_comment || "",
    favorite: r.favorite,
  };
}

/** 캡션에서 해시태그 추출 (최대 6개, 중복 제거) */
function extractHashtags(caption: string): string[] {
  const matches = caption.match(/#[^\s#@.,!?()[\]{}"']+/g) ?? [];
  return [...new Set(matches.map((m) => m.slice(0, 30)))].slice(0, 6);
}

/** 실 모드 수집 아이템 목록 — 페이지 서버 컴포넌트용 */
export async function listReferenceItems(): Promise<ReferenceItem[]> {
  if (isDemoMode()) return [];
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  // 스키마 세대별 컬럼 목록 — 미적용 마이그레이션이 있어도 목록은 항상 살린다
  const SELECT_FULL =
    "id, channel, title, summary, category, hooks, creator_handle, url, thumbnail_url, views, likes, comments, hashtags, ai_comment, follower_count, matched_source, favorite, collected_at";
  const SELECT_0020 =
    "id, channel, title, summary, category, hooks, creator_handle, url, thumbnail_url, views, likes, follower_count, matched_source, favorite, collected_at";
  const SELECT_0019 =
    "id, channel, title, summary, category, hooks, creator_handle, url, views, likes, follower_count, matched_source, favorite, collected_at";

  for (const columns of [SELECT_FULL, SELECT_0020, SELECT_0019]) {
    const { data, error } = await supabase
      .from("reference_items")
      .select(columns)
      .eq("user_id", user.id)
      .order("collected_at", { ascending: false })
      .order("likes", { ascending: false })
      .limit(60);
    if (!error) {
      return ((data ?? []) as unknown as Partial<DbItemRow>[]).map((r) =>
        rowToItem({ thumbnail_url: null, comments: 0, hashtags: [], ai_comment: "", ...r } as DbItemRow),
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

/**
 * 썸네일 캐시 — 공급사 CDN 이미지를 받아 Storage에 저장하고 공개 URL을 돌려준다.
 * 실패는 null (카드가 글리프 자리표시로 대체) — 수집 자체를 막지 않는다.
 */
async function cacheThumbnail(userId: string, post: CollectedPost): Promise<string | null> {
  if (!post.thumbnailUrl) return null;
  const admin = createAdminClient();
  if (!admin) return null;
  try {
    const res = await fetch(post.thumbnailUrl, { signal: AbortSignal.timeout(10_000), cache: "no-store" });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "";
    if (!type.startsWith("image/")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > 2_000_000) return null; // 2MB 초과는 캐시하지 않는다 (커버 이미지 기준 과대)
    const ext = type.includes("png") ? "png" : type.includes("webp") ? "webp" : "jpg";
    const path = `${userId}/${post.channel}-${post.externalId}.${ext}`;
    const { error } = await admin.storage
      .from("reference-thumbs")
      .upload(path, buf, { contentType: type, upsert: true });
    if (error) {
      console.error("[reference] 썸네일 업로드 실패:", error.message);
      return null;
    }
    return admin.storage.from("reference-thumbs").getPublicUrl(path).data.publicUrl;
  } catch {
    return null;
  }
}

/** 즐겨찾기 영속 토글 — RLS 본인 행만 */
export async function toggleReferenceFavorite(id: string, favorite: boolean): Promise<{ ok: boolean }> {
  if (isDemoMode()) return { ok: false };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
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

/** AI 요약·후킹 태깅 — 실패해도 수집 자체는 살린다(요약 없이 저장) */
async function enrichWithAi(
  posts: CollectedPost[],
): Promise<Map<string, { summary: string; hooks: HookType[]; category: string; comment: string }>> {
  const out = new Map<string, { summary: string; hooks: HookType[]; category: string; comment: string }>();
  const claude = createClaudeClient();
  if (!claude || posts.length === 0) return out;

  try {
    const response = await claude.messages.create({
      model: STUDIO_MODEL,
      max_tokens: 10000,
      output_config: {
        format: {
          type: "json_schema",
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["items"],
            properties: {
              items: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["external_id", "summary", "hooks", "category", "comment"],
                  properties: {
                    external_id: { type: "string" },
                    summary: { type: "string", description: "캡션 내용 기반 2문장 한국어 요약. 캡션에 없는 사실을 지어내지 말 것" },
                    hooks: { type: "array", items: { enum: HOOK_VALUES }, description: "감지된 후킹 기법 0~2개" },
                    category: { type: "string", description: "카테고리 한 단어 (예: 뷰티, 푸드, 커리어)" },
                    comment: { type: "string", description: "이 콘텐츠가 반응을 얻은 이유 분석 한 문장 (캡션 구조·후킹·반응 수치 근거로, 40자 이내)" },
                  },
                },
              },
            },
          },
        },
      },
      system:
        "너는 SNS 콘텐츠 분석가다. 각 게시물의 캡션과 반응 수치를 보고 (1) 캡션에 실제로 있는 내용만으로 2문장 요약, (2) 사용된 후킹 기법 태그 0~2개, (3) 카테고리 한 단어, (4) 반응을 얻은 이유 한 문장(comment)을 붙인다. comment는 '~해서 반응이 좋다' 식의 구체적 분석 — 캡션 구조, 후킹 방식, 수치 중 근거가 있는 것만 말하라. 캡션이 짧거나 정보가 없으면 요약·코멘트도 짧게 — 내용을 지어내지 마라. 이모지 금지.",
      messages: [
        {
          role: "user",
          content: posts
            .map(
              (p) =>
                `[${p.externalId}] 채널:${p.channel} 작성자:${p.creatorHandle} 조회:${p.views} 좋아요:${p.likes} 댓글:${p.comments}\n캡션: ${p.caption.slice(0, 400) || "(캡션 없음)"}`,
            )
            .join("\n---\n"),
        },
      ],
    });
    if (response.stop_reason === "refusal") return out;
    const text = (response.content as { type: string; text?: string }[]).find((b) => b.type === "text")?.text;
    const parsed = text
      ? (JSON.parse(text) as {
          items?: { external_id: string; summary: string; hooks: string[]; category: string; comment: string }[];
        })
      : null;
    for (const item of parsed?.items ?? []) {
      out.set(item.external_id, {
        summary: item.summary ?? "",
        hooks: (item.hooks ?? []).filter((h): h is HookType => (HOOK_VALUES as string[]).includes(h)).slice(0, 2),
        category: (item.category ?? "").slice(0, 20),
        comment: (item.comment ?? "").slice(0, 80),
      });
    }
  } catch (e) {
    console.error("[reference] AI 요약 실패 (요약 없이 저장 진행):", e);
  }
  return out;
}

/**
 * 지금 수집 — 등록 기준으로 공급사 호출 → 중복 제거 → AI 요약·태깅 → 저장.
 * 과금: 무료 월 한도(reference_collect) → 크레딧 2. 전량 실패·신규 0건이면 크레딧 환불.
 */
export async function runCollection(): Promise<CollectRunResult> {
  if (isDemoMode()) return { ok: false, reason: "demo", error: "데모 모드에서는 수집할 수 없습니다." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: "auth", error: "로그인이 필요합니다." };

  if (!isCollectionConfigured()) {
    return {
      ok: false,
      reason: "not_configured",
      error: "수집 엔진 설정이 완료되지 않았어요. 잠시 후 다시 시도해 주세요.",
    };
  }

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

  // 기준이 상한보다 많으면 라운드로빈처럼 매번 다른 묶음이 돌게 시간 기반 오프셋으로 자른다
  const offset = sources.length > MAX_SOURCES_PER_RUN ? Math.floor(Date.now() / 3_600_000) % sources.length : 0;
  const rotated = [...sources.slice(offset), ...sources.slice(0, offset)];
  const used = rotated.slice(0, MAX_SOURCES_PER_RUN);

  const settings = await getCollectSettings();

  const settled = await Promise.allSettled(
    used.map(async (s) => ({
      source: s,
      posts: await collectFromSource(
        { channel: s.channel, kind: s.kind as ReferenceSource["kind"], value: s.value },
        FETCH_PER_SOURCE,
        { period: settings.period, mediaFormat: settings.mediaFormat },
      ),
    })),
  );

  // 기준별 결과 — 실패는 조용히 삼키지 않고 기준 이름과 함께 표면화한다
  const collected: { post: CollectedPost; matchedSource: string }[] = [];
  const failures: CollectError[] = [];
  const failedSources: string[] = [];
  let excludedLowQuality = 0;
  let excludedByFilter = 0;
  for (let i = 0; i < settled.length; i++) {
    const r = settled[i];
    if (r.status === "fulfilled") {
      // 수집 필터(기간·KR·형식·제외 키워드) → 반응 점수 랭킹 → 죽은 게시물 제외 → 기준당 상위 N개
      const filteredPosts = r.value.posts.filter((p) => passesFilters(p, settings));
      excludedByFilter += r.value.posts.length - filteredPosts.length;
      const ranked = [...filteredPosts].sort((a, b) => engagementScore(b) - engagementScore(a));
      const alive = ranked.filter((p) => engagementScore(p) >= MIN_ENGAGEMENT_SCORE);
      excludedLowQuality += ranked.length - alive.length;
      for (const post of alive.slice(0, KEEP_PER_SOURCE)) {
        collected.push({ post, matchedSource: r.value.source.value });
      }
    } else {
      const err =
        r.reason instanceof CollectError ? r.reason : new CollectError("provider_error", String(r.reason));
      failures.push(err);
      failedSources.push(used[i].value);
      console.error(`[reference] 기준 '${used[i].value}' 수집 실패:`, err.message);
    }
  }

  if (collected.length === 0) {
    await refundIfCharged("all_failed_or_empty");
    if (failures.some((f) => f.reason === "out_of_credits")) {
      return {
        ok: false,
        reason: "out_of_credits",
        error: "수집 엔진 사용량이 일시적으로 소진됐어요. 잠시 후 다시 시도해 주세요 — 사용하신 횟수는 차감되지 않았습니다.",
      };
    }
    if (failures.length > 0) {
      console.error("[reference] 수집 전량 실패:", failures.map((f) => f.message).join(" / "));
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
    return {
      ok: false,
      reason: "provider",
      error: "등록된 기준으로 발견된 콘텐츠가 없어요. 키워드를 조금 더 일반적인 말로 바꿔보세요 — 사용하신 횟수는 차감되지 않았습니다.",
    };
  }

  // 게시물 단위 중복 제거 (같은 게시물이 여러 기준에 걸릴 수 있다)
  const uniqueMap = new Map<string, { post: CollectedPost; matchedSource: string }>();
  for (const c of collected) {
    const key = `${c.post.channel}:${c.post.externalId}`;
    if (!uniqueMap.has(key)) uniqueMap.set(key, c);
  }
  const unique = [...uniqueMap.values()];

  // 기존 수집분과 중복 제거
  const { data: existing } = await supabase
    .from("reference_items")
    .select("channel, external_id")
    .eq("user_id", user.id)
    .in("external_id", unique.map((c) => c.post.externalId));
  const existingKeys = new Set((existing ?? []).map((r) => `${r.channel}:${r.external_id}`));
  const fresh = unique.filter((c) => !existingKeys.has(`${c.post.channel}:${c.post.externalId}`));

  if (fresh.length === 0) {
    await refundIfCharged("all_duplicates");
    return {
      ok: false,
      reason: "provider",
      error: `${unique.length}개를 발견했지만 전부 이미 수집된 콘텐츠예요. 새 게시물이 올라오면 다시 수집돼요 — 사용하신 횟수는 차감되지 않았습니다.`,
    };
  }

  // AI 요약과 썸네일 캐시는 서로 독립 — 병렬 수행
  const [enriched, thumbnails] = await Promise.all([
    enrichWithAi(fresh.map((c) => c.post)),
    Promise.all(fresh.map(({ post }) => cacheThumbnail(user.id, post))),
  ]);

  const rows = fresh.map(({ post, matchedSource }, i) => {
    const ai = enriched.get(post.externalId);
    const firstLine = post.caption.split("\n").map((s) => s.trim()).find((s) => s.length > 0) ?? "";
    return {
      user_id: user.id,
      channel: post.channel,
      external_id: post.externalId,
      title: (firstLine || `${post.creatorHandle}의 게시물`).slice(0, 80),
      caption: post.caption.slice(0, 500),
      summary: ai?.summary ?? (post.caption ? post.caption.slice(0, 140) : ""),
      category: ai?.category || "일반",
      hooks: ai?.hooks ?? [],
      creator_handle: post.creatorHandle,
      url: post.url,
      thumbnail_url: thumbnails[i],
      views: post.views,
      likes: post.likes,
      comments: post.comments,
      hashtags: extractHashtags(post.caption),
      ai_comment: ai?.comment ?? "",
      follower_count: post.followerCount,
      matched_source: matchedSource,
      posted_at: post.postedAt,
    };
  });

  // 스키마 세대 폴백 — 0022(댓글·해시태그·코멘트) → 0020(썸네일) 순으로 컬럼을 줄여 재시도
  const stripColumns = (cols: string[]) =>
    rows.map((row) => {
      const rest = { ...row } as Record<string, unknown>;
      for (const c of cols) delete rest[c];
      return rest;
    });
  let { error: insertErr } = await supabase.from("reference_items").insert(rows);
  if (insertErr && /comments|hashtags|ai_comment/.test(insertErr.message)) {
    ({ error: insertErr } = await supabase
      .from("reference_items")
      .insert(stripColumns(["comments", "hashtags", "ai_comment"])));
  }
  if (insertErr && insertErr.message.includes("thumbnail_url")) {
    ({ error: insertErr } = await supabase
      .from("reference_items")
      .insert(stripColumns(["comments", "hashtags", "ai_comment", "thumbnail_url"])));
  }
  if (insertErr) {
    await refundIfCharged("insert_failed");
    const missing =
      insertErr.message.includes("does not exist") || insertErr.message.includes("Could not find the table");
    console.error("[reference] 수집 저장 실패:", insertErr.message);
    return missing
      ? { ok: false, reason: "table_missing", error: "수집 저장소가 아직 준비되지 않았습니다(마이그레이션 0019 미적용). 잠시 후 다시 시도해 주세요." }
      : { ok: false, reason: "save", error: "수집 결과 저장에 실패했어요. 잠시 후 다시 시도해 주세요." };
  }

  revalidatePath("/library");
  return {
    ok: true,
    added: fresh.length,
    duplicates: unique.length - fresh.length,
    usedSources: used.length,
    totalSources: sources.length,
    failedSources,
    excludedLowQuality,
    excludedByFilter,
  };
}
