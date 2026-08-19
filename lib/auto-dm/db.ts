import type { AutoDmRule, DmButton } from "@/lib/types";

/**
 * auto_dm_rules 테이블 행 ↔ AutoDmRule 타입 매핑.
 * 서버 액션(쓰기)과 서버 페이지(읽기)가 공유한다 — 필드 대응을 한곳에서만 관리.
 *
 * buttons/post_thumb는 0038 마이그레이션 컬럼이다. 미적용 DB에서도 죽지 않도록
 * 읽기는 LEGACY 컬럼 셋으로 폴백하고(호출측), 쓰기는 'buttons' 오류 시 legacy만 재시도한다.
 */

/**
 * "다음에 올릴 게시물" 예약 규칙의 post_id 센티널 (2026-08-14, 리틀리 예약발송 대응).
 * 웹훅이 새 게시물의 첫 댓글을 받으면 — 게시물 업로드 시각 > 규칙 생성 시각일 때 —
 * 이 센티널을 실제 media id로 치환(바인딩)한다. 콘텐츠 개수 한도에서는 게시물 1개로 센다.
 */
export const NEXT_POST_SENTINEL = "__next__";

/**
 * 버튼 URL 정규화 — 프로토콜 없이 "finch.ai.kr"처럼 입력해도 https://를 붙여 통과시킨다
 * (2026-08-14 사장님 지시). 유효하면 정규화된 절대 URL, 아니면 null.
 * 위저드(클라이언트)와 서버 액션이 같은 규칙을 쓰도록 여기 한 곳에만 둔다.
 */
export function normalizeHttpUrl(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  const withProto = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  try {
    const u = new URL(withProto);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    // "abc" 같은 점 없는 호스트는 실수 입력일 확률이 높다 — 도메인 형태만 허용
    if (!u.hostname.includes(".")) return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** DB 행 (snake_case) — supabase 조회 결과 형태 */
export interface AutoDmRuleRow {
  id: string;
  post_id: string;
  post_caption: string;
  post_type: AutoDmRule["postType"];
  post_views: number;
  post_thumb?: string | null;
  trigger: AutoDmRule["trigger"];
  keywords: string[];
  public_reply: string | null;
  public_replies?: unknown;
  dm_message: string;
  button_label: string | null;
  button_url: string | null;
  buttons?: unknown;
  status: AutoDmRule["status"];
  follow_request?: boolean;
  is_advertising: boolean;
  daily_cap: number;
  sent_total: number;
  sent_today: number;
  failed_total: number;
  last_sent_at: string | null;
  created_at: string;
}

const BASE_COLUMNS =
  "id, post_id, post_caption, post_type, post_views, trigger, keywords, public_reply, dm_message, button_label, button_url, status, is_advertising, daily_cap, sent_total, sent_today, failed_total, last_sent_at, created_at";

export const RULE_COLUMNS = `${BASE_COLUMNS}, buttons, post_thumb, public_replies, follow_request`;
/** 0052(follow_request) 만 미적용일 때 — 0038·0042 컬럼은 그대로 읽는다 */
export const RULE_COLUMNS_NO_FOLLOW = `${BASE_COLUMNS}, buttons, post_thumb, public_replies`;
/** 0038·0042 미적용 DB 폴백 — buttons/post_thumb/public_replies 없이 조회 */
export const RULE_COLUMNS_LEGACY = BASE_COLUMNS;

/** 컬럼 없음 오류가 어느 세대 것인지 — 폴백을 **한 단계씩만** 내려가게 가른다.
    한 번에 legacy 로 떨어지면 0052 하나 없다고 0038·0042 데이터까지 못 읽는다. */
export function missingFollowRequest(message: string | null | undefined): boolean {
  return /follow_request/i.test(message ?? "");
}
export function missingLegacyColumns(message: string | null | undefined): boolean {
  return /buttons|post_thumb|public_replies/i.test(message ?? "");
}

/** public_replies jsonb → string[] — 비면 legacy 단일 public_reply로 폴백 (0042 미적용 호환) */
export function parseReplies(row: Pick<AutoDmRuleRow, "public_replies" | "public_reply">): string[] {
  if (Array.isArray(row.public_replies)) {
    const parsed = row.public_replies
      .map((r) => String(r ?? "").trim())
      .filter(Boolean)
      .slice(0, 10);
    if (parsed.length > 0) return parsed;
  }
  return row.public_reply && row.public_reply.trim() ? [row.public_reply.trim()] : [];
}

/** buttons jsonb → DmButton[] — 형식이 어긋난 항목은 버리고, 비면 legacy 단일 버튼으로 폴백 */
export function parseButtons(row: Pick<AutoDmRuleRow, "buttons" | "button_label" | "button_url">): DmButton[] {
  if (Array.isArray(row.buttons)) {
    const parsed = row.buttons
      .filter((b): b is { label: unknown; url: unknown } => typeof b === "object" && b !== null)
      .map((b) => ({ label: String(b.label ?? ""), url: String(b.url ?? "") }))
      .filter((b) => b.label.length > 0 && b.url.length > 0)
      .slice(0, 3);
    if (parsed.length > 0) return parsed;
  }
  if (row.button_label && row.button_url) return [{ label: row.button_label, url: row.button_url }];
  return [];
}

export function ruleFromRow(row: AutoDmRuleRow): AutoDmRule {
  return {
    id: row.id,
    postId: row.post_id,
    postCaption: row.post_caption,
    postType: row.post_type,
    postViews: row.post_views,
    postThumb: row.post_thumb ?? null,
    trigger: row.trigger,
    keywords: row.keywords ?? [],
    publicReplies: parseReplies(row),
    dmMessage: row.dm_message,
    buttons: parseButtons(row),
    status: row.status,
    followRequest: row.follow_request ?? false,
    isAdvertising: row.is_advertising,
    dailyCap: row.daily_cap,
    sentTotal: row.sent_total,
    sentToday: row.sent_today,
    failedTotal: row.failed_total,
    lastSentAt: row.last_sent_at,
    createdAt: row.created_at,
  };
}

/** 쓰기용 행 — 카운터·타임스탬프는 DB가 관리하므로 제외.
 *  legacy button_label/url·public_reply에는 첫 항목을 미러링해 미적용 DB·구버전 발송 경로와 호환을 유지한다. */
export function ruleToWriteRow(input: {
  postId: string;
  postCaption: string;
  postType: AutoDmRule["postType"];
  postViews: number;
  postThumb: string | null;
  trigger: AutoDmRule["trigger"];
  keywords: string[];
  publicReplies: string[];
  dmMessage: string;
  buttons: DmButton[];
  status: AutoDmRule["status"];
  followRequest: boolean;
  isAdvertising: boolean;
  dailyCap: number;
}) {
  const first = input.buttons[0] ?? null;
  const replies = input.publicReplies.map((r) => r.trim()).filter(Boolean).slice(0, 10);
  return {
    post_id: input.postId,
    post_caption: input.postCaption,
    post_type: input.postType,
    post_views: input.postViews,
    post_thumb: input.postThumb,
    trigger: input.trigger,
    keywords: input.keywords,
    public_replies: replies,
    public_reply: replies[0] ?? null,
    dm_message: input.dmMessage,
    buttons: input.buttons.slice(0, 3),
    button_label: first?.label ?? null,
    button_url: first?.url ?? null,
    status: input.status,
    follow_request: input.followRequest,
    is_advertising: input.isAdvertising,
    daily_cap: input.dailyCap,
  };
}

/** 0052 미적용 DB 폴백 — follow_request 만 뺀 행(0038·0042 컬럼은 유지) */
export function stripFollowRequest(row: ReturnType<typeof ruleToWriteRow>): Record<string, unknown> {
  const rest: Record<string, unknown> = { ...row };
  delete rest.follow_request;
  return rest;
}

/** 0038·0042 미적용 DB에 쓸 때 — buttons/post_thumb/public_replies 컬럼을 뺀 행 */
export function stripNewColumns(row: ReturnType<typeof ruleToWriteRow>): Record<string, unknown> {
  const rest: Record<string, unknown> = { ...row };
  delete rest.buttons;
  delete rest.post_thumb;
  delete rest.public_replies;
  delete rest.follow_request;
  return rest;
}
