import type { AutoDmRule } from "@/lib/types";

/**
 * auto_dm_rules 테이블 행 ↔ AutoDmRule 타입 매핑.
 * 서버 액션(쓰기)과 서버 페이지(읽기)가 공유한다 — 필드 대응을 한곳에서만 관리.
 */

/** DB 행 (snake_case) — supabase 조회 결과 형태 */
export interface AutoDmRuleRow {
  id: string;
  post_id: string;
  post_caption: string;
  post_type: AutoDmRule["postType"];
  post_views: number;
  trigger: AutoDmRule["trigger"];
  keywords: string[];
  public_reply: string | null;
  dm_message: string;
  button_label: string | null;
  button_url: string | null;
  status: AutoDmRule["status"];
  is_advertising: boolean;
  daily_cap: number;
  sent_total: number;
  sent_today: number;
  failed_total: number;
  last_sent_at: string | null;
  created_at: string;
}

export const RULE_COLUMNS =
  "id, post_id, post_caption, post_type, post_views, trigger, keywords, public_reply, dm_message, button_label, button_url, status, is_advertising, daily_cap, sent_total, sent_today, failed_total, last_sent_at, created_at";

export function ruleFromRow(row: AutoDmRuleRow): AutoDmRule {
  return {
    id: row.id,
    postId: row.post_id,
    postCaption: row.post_caption,
    postType: row.post_type,
    postViews: row.post_views,
    trigger: row.trigger,
    keywords: row.keywords ?? [],
    publicReply: row.public_reply,
    dmMessage: row.dm_message,
    buttonLabel: row.button_label,
    buttonUrl: row.button_url,
    status: row.status,
    isAdvertising: row.is_advertising,
    dailyCap: row.daily_cap,
    sentTotal: row.sent_total,
    sentToday: row.sent_today,
    failedTotal: row.failed_total,
    lastSentAt: row.last_sent_at,
    createdAt: row.created_at,
  };
}

/** 쓰기용 행 — 카운터·타임스탬프는 DB가 관리하므로 제외 */
export function ruleToWriteRow(input: {
  postId: string;
  postCaption: string;
  postType: AutoDmRule["postType"];
  postViews: number;
  trigger: AutoDmRule["trigger"];
  keywords: string[];
  publicReply: string | null;
  dmMessage: string;
  buttonLabel: string | null;
  buttonUrl: string | null;
  status: AutoDmRule["status"];
  isAdvertising: boolean;
  dailyCap: number;
}) {
  return {
    post_id: input.postId,
    post_caption: input.postCaption,
    post_type: input.postType,
    post_views: input.postViews,
    trigger: input.trigger,
    keywords: input.keywords,
    public_reply: input.publicReply,
    dm_message: input.dmMessage,
    button_label: input.buttonLabel,
    button_url: input.buttonUrl,
    status: input.status,
    is_advertising: input.isAdvertising,
    daily_cap: input.dailyCap,
  };
}
