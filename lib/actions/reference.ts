"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isDemoMode } from "@/lib/supabase/config";
import { createClaudeClient, FAST_MODEL } from "@/lib/ai/claude";
import { chargeGeneration, refundGenerationCredits, CREDIT_COSTS } from "@/lib/actions/credits";
import {
  fetchIgTranscript,
  isCollectionConfigured,
  CollectError,
  type CollectedPost,
} from "@/lib/reference/scrapecreators";
import { collectForSource } from "@/lib/reference/collect";
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

/**
 * 키워드 확장 — IG 키워드 소스마다 연관 검색어 3개를 만들어 후보 풀을 키운다.
 * 실측('웨딩'): 원 키워드만으론 최고 ~30만 뷰, '결혼식' 등 확장을 섞으면 100만+ 유입.
 * Claude 1회 호출, 실패하면 빈 맵(확장 없이 진행 — 수집을 막지 않는다).
 */
async function expandKeywords(keywords: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  const claude = createClaudeClient();
  if (!claude || keywords.length === 0) return out;
  try {
    const response = await claude.messages.create({
      model: FAST_MODEL,
      max_tokens: 1500,
      output_config: {
        format: {
          type: "json_schema",
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["expansions"],
            properties: {
              expansions: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["keyword", "variants"],
                  properties: {
                    keyword: { type: "string" },
                    variants: { type: "array", items: { type: "string" }, description: "연관 검색어 정확히 3개, 각 20자 이내" },
                  },
                },
              },
            },
          },
        },
      },
      system:
        "인스타그램 검색어 확장기다. 각 키워드마다 한국 사용자들이 실제로 검색할 연관 검색어 3개를 만든다. 동의어·인접 개념·구체 상황을 섞어라(예: 웨딩 → 결혼식, 웨딩 준비, 결혼 준비 브이로그). 원 키워드 그대로 반복 금지, 이모지 금지.",
      messages: [{ role: "user", content: keywords.join("\n") }],
    });
    if (response.stop_reason === "refusal") return out;
    const text = (response.content as { type: string; text?: string }[]).find((b) => b.type === "text")?.text;
    const parsed = text ? (JSON.parse(text) as { expansions?: { keyword: string; variants: string[] }[] }) : null;
    for (const e of parsed?.expansions ?? []) {
      out.set(
        e.keyword,
        (e.variants ?? []).map((v) => String(v).trim()).filter((v) => v.length >= 1 && v.length <= 20).slice(0, 3),
      );
    }
  } catch (e) {
    console.error("[reference] 검색어 확장 실패 (확장 없이 진행):", e);
  }
  return out;
}

/**
 * 한글 캡션 판정 — 캡션 전체(해시태그 포함)의 한글 음절 총량이 10자 이상인지로 본다.
 * 해시태그를 떼고 본문만 보는 1차 시도는 실측(웨딩 라이브 재현)에서 대량 오탈락을
 * 냈다 — 이 업계(웨딩·뷰티 스튜디오)는 본문은 스타일링용 영어 문구로 짧게 쓰고
 * 실제 브랜드·업종 정보는 해시태그에 담는 게 표준 관행이라, 해시태그를 버리면
 * "신라호텔 영빈관 야외웨딩" 같은 명백한 국내 업체 게시물까지 외국으로 오판했다.
 * 원래 문제였던 "영어 캡션 + 한글 해시태그 1개"(예: #다이어트 하나)는 총량이
 * 10자를 못 넘어 여전히 걸러진다. 해시태그 스팸(태그 수 12개 초과)은 여기서
 * 막지 않고 relevanceMultiplier의 기존 감점 로직에 맡긴다.
 */
function isKoreanCaption(caption: string): boolean {
  const hangul = (caption.match(/[가-힣]/g) ?? []).length;
  return hangul >= 10;
}

/** 후처리 필터 — 공급사 서버 파라미터로 못 거르는 조건을 여기서 거른다 */
function passesFilters(p: CollectedPost, s: CollectSettings): boolean {
  const periodDays = PERIOD_DAYS[s.period];
  if (periodDays !== null) {
    if (!p.postedAt || new Date(p.postedAt).getTime() < Date.now() - periodDays * 86_400_000) return false;
  }
  if (s.krOnly) {
    // 틱톡은 국가 정보로, 인스타·스레드는 한글 캡션 판정으로 거른다(휴리스틱 — UI에 고지)
    if (p.channel === "tiktok") {
      if (p.region !== "KR") return false;
    } else if (!isKoreanCaption(p.caption)) {
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

/** 1회 수집에서 공급사 API를 부르는 최대 기준 수 — 기준당 1~4크레딧 실비 상한 */
const MAX_SOURCES_PER_RUN = 6;
/** 기준 하나당 공급사에서 받아오는 최대 게시물 수 (랭킹 전 후보군 — 확장 검색어 포함 최대 100) */
const FETCH_PER_SOURCE = 120;
/** 랭킹 후 기준 하나당 저장할 최대 게시물 수 — 넉넉히 20개(레퍼런스 도구 통상 수준) */
const KEEP_PER_SOURCE = 20;
/** 1회 수집의 전체 저장 상한 — AI 요약·썸네일 비용 폭주 방지 */
const MAX_TOTAL_PER_RUN = 40;
/**
 * 절대 최저 생존선 — views가 실제로 집계되는 콘텐츠(릴스·영상)에서 이 밑이면 반응률이
 * 아무리 좋아도 그냥 죽은 게시물(또는 매크로성 계정)로 보고 제외한다. 키워드마다 조회수
 * 스케일이 워낙 달라(예: 웨딩은 보통 조회수 자체가 수만~수십만) 이보다 위 단계는 절대값이
 * 아니라 아래 상대 기준이 담당한다. Threads처럼 views가 원래 0으로만 오는 채널·형식은
 * 이 조건을 적용하지 않는다(views>0 조건).
 */
const ABSOLUTE_DEAD_VIEWS = 500;
/**
 * 키워드별 상대 참여 기준 — "이 키워드로 지금까지 모인 글 대비 얼마나 잘했는가"로 살아있는
 * 게시물을 가른다. 고정 절대값(이전 MIN_ENGAGEMENT_SCORE=500→10000 조회수 하한 등)은
 * 웨딩처럼 원래 조회수 규모가 큰 카테고리에서 "조회수 5천~9천대의 정상 웨딩 스튜디오
 * 게시물"까지 그냥 절대선 밑이라는 이유로 잘라내는 게 실측(캡처된 실제 후보 40건) 재현
 * 시뮬레이션에서 확인됐다 — 상대 기준(중앙값의 30%)으로 바꾸면 그 오탈락 8~15건을
 * 손해 없이 구제했다(같은 표본에서 신규 오탈락 0건). 계수는 시작값이며 실배포 후
 * 스팟체크로 조정한다.
 */
const RELATIVE_ENGAGEMENT_FACTOR = 0.3;
/**
 * 이 개수 미만이면 "이 키워드로 지금까지 모인 글"이 통계적으로 안 미덥다고 보고,
 * 대신 이번 실행에서 새로 받아온 후보 풀 자체의 분포로 기준을 계산한다(콜드 스타트).
 * 수집을 반복할수록 저장분이 쌓여 자연스럽게 누적 이력 기준으로 넘어간다.
 */
const MIN_HISTORY_FOR_RELATIVE = 5;

/** 반응 점수 — 조회수 + 좋아요·댓글 가중. Threads(조회수 미공개)도 좋아요·댓글로 비교 가능 */
function engagementScore(p: CollectedPost): number {
  return p.views + p.likes * 20 + p.comments * 40;
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** 키워드별 상대 참여 임계값 — 누적 이력이 충분하면 이력 기준, 아니면 이번 후보 풀 기준 */
function computeRelativeThreshold(historyScores: number[], poolScores: number[]): number {
  const basis = historyScores.length >= MIN_HISTORY_FOR_RELATIVE ? historyScores : poolScores;
  return median(basis) * RELATIVE_ENGAGEMENT_FACTOR;
}

/**
 * 품질 가중치 — 공감률(좋아요+댓글÷조회)이 높을수록 가산, 해시태그 12개 초과
 * 도배(업체 홍보물의 전형)는 크게 감점. 실측('웨딩') 결과 키워드 포함 가산 방식은
 * 태그 도배 업체물을 오히려 밀어올려 폐기 — 검색 자체가 이미 관련도 랭킹이므로
 * 반응의 "질"로만 보정한다. 공감률 5%면 +1.0, 상한 +1.5.
 */
function relevanceMultiplier(p: CollectedPost, source: { kind: string; value: string }): number {
  const rate = p.views > 0 ? (p.likes + p.comments) / p.views : 0;
  let m = 1 + Math.min(rate * 20, 1.5);
  if (source.kind !== "account") {
    const tagCount = (p.caption.match(/#/g) ?? []).length;
    if (tagCount > 12) m *= 0.4;
  }
  return m;
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
    "id, channel, title, summary, category, hooks, creator_handle, url, thumbnail_url, views, likes, comments, hashtags, ai_comment, caption, note, transcript, status, follower_count, matched_source, favorite, collected_at";
  const SELECT_0022 =
    "id, channel, title, summary, category, hooks, creator_handle, url, thumbnail_url, views, likes, comments, hashtags, ai_comment, caption, follower_count, matched_source, favorite, collected_at";
  const SELECT_0020 =
    "id, channel, title, summary, category, hooks, creator_handle, url, thumbnail_url, views, likes, follower_count, matched_source, favorite, collected_at";
  const SELECT_0019 =
    "id, channel, title, summary, category, hooks, creator_handle, url, views, likes, follower_count, matched_source, favorite, collected_at";

  for (const columns of [SELECT_FULL, SELECT_0022, SELECT_0020, SELECT_0019]) {
    const { data, error } = await supabase
      .from("reference_items")
      .select(columns)
      .eq("user_id", user.id)
      .order("collected_at", { ascending: false })
      .order("likes", { ascending: false })
      .limit(60);
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

/** 수집 아이템 삭제 — RLS 본인 행만 */
export async function deleteReferenceItem(id: string): Promise<{ ok: boolean }> {
  if (isDemoMode()) return { ok: false };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
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
  const {
    data: { user },
  } = await supabase.auth.getUser();
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
  const {
    data: { user },
  } = await supabase.auth.getUser();
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
  const {
    data: { user },
  } = await supabase.auth.getUser();
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

  try {
    const text = await fetchIgTranscript(row.url as string);
    if (!text) {
      return { ok: false, error: "음성이 감지되지 않았어요 — 말로 설명하는 릴스만 대본을 만들 수 있어요." };
    }
    const transcript = text.slice(0, 8000);
    await supabase.from("reference_items").update({ transcript }).eq("id", id).eq("user_id", user.id);
    return { ok: true, transcript };
  } catch (e) {
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

type EnrichResult = Map<
  string,
  { relevant: boolean; summary: string; hooks: HookType[]; category: string; comment: string }
>;

/** AI 요약·후킹 태깅·관련도 판정 — 20개 단위로 나눠 병렬 호출(타임아웃·출력 절단 방지). 실패해도 수집은 살린다 */
async function enrichWithAi(posts: CollectedPost[], topic: string): Promise<EnrichResult> {
  const merged: EnrichResult = new Map();
  const chunks: CollectedPost[][] = [];
  for (let i = 0; i < posts.length; i += 20) chunks.push(posts.slice(i, i + 20));
  const results = await Promise.all(chunks.map((c) => enrichChunk(c, topic)));
  for (const r of results) for (const [k, v] of r) merged.set(k, v);
  return merged;
}

async function enrichChunk(posts: CollectedPost[], topic: string): Promise<EnrichResult> {
  const out: EnrichResult = new Map();
  const claude = createClaudeClient();
  if (!claude || posts.length === 0) return out;

  try {
    const response = await claude.messages.create({
      model: FAST_MODEL,
      max_tokens: 6000,
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
                  required: ["external_id", "relevant", "summary", "hooks", "category", "comment"],
                  properties: {
                    external_id: { type: "string" },
                    relevant: {
                      type: "boolean",
                      description: "캡션이 실제로 검색 주제를 다루는 내용이면 true, 검색어가 캡션·해시태그에 우연히 한 번 섞였을 뿐 실제 내용은 무관하면 false",
                    },
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
        `너는 SNS 콘텐츠 분석가다. 검색 주제는 "${topic}"다. 각 게시물의 캡션과 반응 수치를 보고 ` +
        `(1) 이 게시물이 실제로 "${topic}" 주제를 다루는 콘텐츠인지 relevant에 담고(검색어가 캡션·해시태그에 우연히 한 번 섞였을 뿐 내용 자체는 다른 주제면 false), ` +
        "(2) 캡션에 실제로 있는 내용만으로 2문장 요약, (3) 사용된 후킹 기법 태그 0~2개, (4) 카테고리 한 단어, (5) 반응을 얻은 이유 한 문장(comment)을 붙인다. " +
        "comment는 '~해서 반응이 좋다' 식의 구체적 분석 — 캡션 구조, 후킹 방식, 수치 중 근거가 있는 것만 말하라. 캡션이 짧거나 정보가 없으면 요약·코멘트도 짧게 — 내용을 지어내지 마라. " +
        "relevant=false인 항목도 summary 등 나머지 필드는 캡션 그대로 채워라. 이모지 금지.",
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
          items?: {
            external_id: string;
            relevant: boolean;
            summary: string;
            hooks: string[];
            category: string;
            comment: string;
          }[];
        })
      : null;
    for (const item of parsed?.items ?? []) {
      out.set(item.external_id, {
        relevant: item.relevant !== false,
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

  // 동시 실행 방지 — user_id PK insert로 원자적 락 획득(check-then-insert보다 레이스 안전)
  const STALE_LOCK_MS = 10 * 60_000;
  const { error: lockErr } = await supabase.from("reference_collect_locks").insert({ user_id: user.id });
  if (lockErr) {
    if (lockErr.code !== "23505") {
      console.error("[reference] 수집 락 획득 실패:", lockErr.message);
      return { ok: false, reason: "provider", error: "수집을 시작하지 못했어요. 잠시 후 다시 시도해 주세요." };
    }
    const { data: existingLock } = await supabase
      .from("reference_collect_locks")
      .select("started_at")
      .eq("user_id", user.id)
      .maybeSingle();
    const startedAt = existingLock?.started_at ? new Date(existingLock.started_at).getTime() : 0;
    if (Date.now() - startedAt < STALE_LOCK_MS) {
      return { ok: false, reason: "already_running", error: "이미 수집이 진행 중이에요. 잠시 후 다시 시도해 주세요." };
    }
    // 죽은 락(서버가 크래시해서 finally를 못 탄 경우) — 강제로 재획득
    await supabase.from("reference_collect_locks").delete().eq("user_id", user.id);
    const { error: retryErr } = await supabase.from("reference_collect_locks").insert({ user_id: user.id });
    if (retryErr) {
      console.error("[reference] 수집 락 재획득 실패:", retryErr.message);
      return { ok: false, reason: "provider", error: "수집을 시작하지 못했어요. 잠시 후 다시 시도해 주세요." };
    }
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

    // 기준이 상한보다 많으면 라운드로빈처럼 매번 다른 묶음이 돌게 시간 기반 오프셋으로 자른다
    const offset = sources.length > MAX_SOURCES_PER_RUN ? Math.floor(Date.now() / 3_600_000) % sources.length : 0;
    const rotated = [...sources.slice(offset), ...sources.slice(0, offset)];
    const used = rotated.slice(0, MAX_SOURCES_PER_RUN);

    const settings = await getCollectSettings();

    // IG 키워드 소스는 AI 확장 검색어로 후보 풀을 키운다 (Claude 1회, 실패 시 확장 없이 진행)
    const igKeywords = used.filter((s) => s.channel === "instagram" && s.kind === "keyword").map((s) => s.value);
    const expansions = await expandKeywords(igKeywords);

    const settled = await Promise.allSettled(
      used.map(async (s) => ({
        source: s,
        posts: await collectForSource(
          { channel: s.channel, kind: s.kind as ReferenceSource["kind"], value: s.value },
          FETCH_PER_SOURCE,
          {
            period: settings.period,
            mediaFormat: settings.mediaFormat,
            queryVariants: expansions.get(s.value) ?? [],
          },
        ),
      })),
    );

    // 이번 실행 후보 전체의 기존 DB 보유 여부를 한 번에 조회(쿼리 횟수 절약) —
    // 실제 저장은 기준 단위로 즉시 수행해 타임아웃이 나도 이미 처리된 기준분은 남는다
    const allCandidateIds = new Set<string>();
    for (const r of settled) {
      if (r.status === "fulfilled") for (const p of r.value.posts) allCandidateIds.add(p.externalId);
    }
    const { data: existingRows } = await supabase
      .from("reference_items")
      .select("channel, external_id")
      .eq("user_id", user.id)
      .in("external_id", [...allCandidateIds]);
    const existingKeys = new Set((existingRows ?? []).map((r) => `${r.channel}:${r.external_id}`));
    const insertedThisRunKeys = new Set<string>();

    // 기준별 상대 참여 기준 계산용 — 사용자가 이 채널·키워드로 지금까지 모은 글의 반응 점수 이력
    const usedMatchedSources = [...new Set(used.map((s) => s.value))];
    const { data: historyRows } = await supabase
      .from("reference_items")
      .select("channel, matched_source, views, likes, comments")
      .eq("user_id", user.id)
      .in("matched_source", usedMatchedSources);
    const historyScoresBySource = new Map<string, number[]>();
    for (const r of historyRows ?? []) {
      const key = `${r.channel}:${r.matched_source}`;
      const score = Math.max(0, Number(r.views) || 0) + Math.max(0, Number(r.likes) || 0) * 20 + Math.max(0, Number(r.comments) || 0) * 40;
      const arr = historyScoresBySource.get(key);
      if (arr) arr.push(score);
      else historyScoresBySource.set(key, [score]);
    }

    const failures: CollectError[] = [];
    const failedSources: string[] = [];
    let excludedLowQuality = 0;
    let excludedByFilter = 0;
    let excludedIrrelevant = 0;
    let added = 0;
    let duplicates = 0;
    let anyEnrichAttempted = false;
    let anyEnrichSucceeded = false;
    const anyExpansionAttempted = igKeywords.length > 0;

    for (let i = 0; i < settled.length; i++) {
      const r = settled[i];
      if (r.status !== "fulfilled") {
        const err =
          r.reason instanceof CollectError ? r.reason : new CollectError("provider_error", String(r.reason));
        failures.push(err);
        failedSources.push(used[i].value);
        console.error(`[reference] 기준 '${used[i].value}' 수집 실패:`, err.message);
        continue;
      }
      if (added >= MAX_TOTAL_PER_RUN) break; // 이번 실행 전체 저장 상한 도달 — 남은 기준은 건너뜀

      // 수집 필터(기간·KR·형식·제외 키워드) → 관련도 가중 반응 랭킹 → 죽은 게시물 제외 → 기준당 상위 N개
      const src = r.value.source;
      const filteredPosts = r.value.posts.filter((p) => passesFilters(p, settings));
      excludedByFilter += r.value.posts.length - filteredPosts.length;
      const weighted = (p: CollectedPost) => engagementScore(p) * relevanceMultiplier(p, src);
      const ranked = [...filteredPosts].sort((a, b) => weighted(b) - weighted(a));
      const historyScores = historyScoresBySource.get(`${src.channel}:${src.value}`) ?? [];
      const poolScores = ranked.map((p) => engagementScore(p));
      const relativeThreshold = computeRelativeThreshold(historyScores, poolScores);
      const alive = ranked.filter(
        (p) => !(p.views > 0 && p.views < ABSOLUTE_DEAD_VIEWS) && engagementScore(p) >= relativeThreshold,
      );
      excludedLowQuality += ranked.length - alive.length;

      // 이번 기준의 실제 신규 저장 대상 — 기존 DB에도, 이번 실행 다른 기준에도 없는 것만
      const room = MAX_TOTAL_PER_RUN - added;
      const freshThisSource: { post: CollectedPost; matchedSource: string }[] = [];
      for (const post of alive) {
        if (freshThisSource.length >= Math.min(KEEP_PER_SOURCE, room)) break;
        const key = `${post.channel}:${post.externalId}`;
        if (existingKeys.has(key) || insertedThisRunKeys.has(key)) {
          duplicates++;
          continue;
        }
        insertedThisRunKeys.add(key);
        freshThisSource.push({ post, matchedSource: src.value });
      }
      if (freshThisSource.length === 0) continue;

      // AI 요약·후킹태깅과 함께 관련도(이 게시물이 실제로 이 기준 주제를 다루는지)도 같이 판정한다
      anyEnrichAttempted = true;
      const enriched = await enrichWithAi(freshThisSource.map((c) => c.post), src.value);
      if (enriched.size > 0) anyEnrichSucceeded = true;

      // relevant=false로 명시적으로 판정된 것만 제외 — AI 실패/누락(맵에 없음)은 기존 철학대로 유지(fail-open)
      const relevantThisSource = freshThisSource.filter(({ post }) => enriched.get(post.externalId)?.relevant !== false);
      const irrelevantThisSource = freshThisSource.filter(({ post }) => enriched.get(post.externalId)?.relevant === false);
      excludedIrrelevant += irrelevantThisSource.length;
      for (const { post } of irrelevantThisSource) insertedThisRunKeys.delete(`${post.channel}:${post.externalId}`);
      if (relevantThisSource.length === 0) continue;

      // 썸네일 캐시는 실제로 저장할 항목에만 — 관련 없다고 판정된 건 스토리지 비용도 안 씀
      const thumbnails = await Promise.all(relevantThisSource.map(({ post }) => cacheThumbnail(user.id, post)));

      const rows = relevantThisSource.map(({ post, matchedSource }, idx) => {
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
          thumbnail_url: thumbnails[idx],
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
        const missing =
          insertErr.message.includes("does not exist") || insertErr.message.includes("Could not find the table");
        console.error(`[reference] 기준 '${src.value}' 저장 실패:`, insertErr.message);
        if (missing) {
          await refundIfCharged("table_missing");
          return {
            ok: false,
            reason: "table_missing",
            error: "수집 저장소가 아직 준비되지 않았습니다(마이그레이션 0019 미적용). 잠시 후 다시 시도해 주세요.",
          };
        }
        // 이 기준분 저장만 실패 — 이미 저장된 다른 기준분은 그대로 두고 실패로 기록 후 계속
        failures.push(new CollectError("provider_error", insertErr.message));
        failedSources.push(src.value);
        for (const { post } of relevantThisSource) insertedThisRunKeys.delete(`${post.channel}:${post.externalId}`);
        continue;
      }

      added += relevantThisSource.length;
    }

    if (added === 0) {
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
      if (duplicates > 0) {
        return {
          ok: false,
          reason: "provider",
          error: `${duplicates}개를 발견했지만 전부 이미 수집된 콘텐츠예요. 새 게시물이 올라오면 다시 수집돼요 — 사용하신 횟수는 차감되지 않았습니다.`,
        };
      }
      if (excludedIrrelevant > 0) {
        return {
          ok: false,
          reason: "provider",
          error: `${excludedIrrelevant}개를 발견했지만 AI가 "${used.map((s) => s.value).join(", ")}" 주제와 무관하다고 판단해 제외했어요. 사용하신 횟수는 차감되지 않았습니다.`,
        };
      }
      return {
        ok: false,
        reason: "provider",
        error: "등록된 기준으로 발견된 콘텐츠가 없어요. 키워드를 조금 더 일반적인 말로 바꿔보세요 — 사용하신 횟수는 차감되지 않았습니다.",
      };
    }

    // AI 단계 실패 감지 — 요약이 전 기준에서 하나도 안 붙었거나 확장 검색어 생성이 통째로 실패한 경우
    const expansionFailed = anyExpansionAttempted && expansions.size === 0;
    const enrichFailed = anyEnrichAttempted && !anyEnrichSucceeded;
    const aiWarning =
      enrichFailed || expansionFailed
        ? "AI 분석이 적용되지 않았어요(요약·후킹 태그" +
          (expansionFailed ? "·확장 검색어" : "") +
          " 누락). Anthropic API 크레딧 소진이 가장 흔한 원인이에요 — 충전 후 다시 수집하면 정상 적용됩니다. 이번 수집분은 원본 그대로 저장했어요."
        : null;

    revalidatePath("/library");
    return {
      ok: true,
      added,
      duplicates,
      usedSources: used.length,
      totalSources: sources.length,
      failedSources,
      excludedLowQuality,
      excludedByFilter,
      excludedIrrelevant,
      aiWarning,
    };
  } finally {
    await supabase.from("reference_collect_locks").delete().eq("user_id", user.id);
  }
}
