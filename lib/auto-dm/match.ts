/**
 * 자동 DM 매칭·판정 순수 로직 — IO 없음(웹훅 라우트에서 호출).
 * 정책 근거: docs/AUTO_DM_COST_RISK.md 4-4(키워드 오탐), 4-8(규칙 중복), 3-3(야간 발송).
 */

/** 웹훅에서 추출한 댓글 이벤트의 최소 형태 */
export interface CommentEvent {
  commentId: string;
  mediaId: string;
  text: string;
  fromId: string;
  fromUsername: string | null;
}

/** DB에서 읽은 규칙의 판정에 필요한 필드 (auto_dm_rules 행 서브셋) */
export interface MatchableRule {
  id: string;
  post_id: string;
  trigger: "all" | "keyword";
  keywords: string[];
  status: "active" | "paused" | "review";
  is_advertising: boolean;
}

/** 대소문자·공백 정규화 후 포함 매칭 (한국어는 단어 경계가 없어 includes 기준) */
export function matchesKeywords(commentText: string, keywords: string[]): boolean {
  const text = commentText.toLowerCase();
  return keywords.some((k) => {
    const kw = k.trim().toLowerCase();
    return kw.length > 0 && text.includes(kw);
  });
}

/**
 * 댓글 1건당 규칙 1개만 실행한다 (한 사람이 DM을 두 번 받는 것 방지).
 * 우선순위: 키워드 규칙(구체적) > 전체 댓글 규칙. 같은 급이면 먼저 정의된 것.
 */
export function pickRule(rules: MatchableRule[], event: CommentEvent): MatchableRule | null {
  const candidates = rules.filter((r) => r.status === "active" && r.post_id === event.mediaId);
  const keywordHit = candidates.find((r) => r.trigger === "keyword" && matchesKeywords(event.text, r.keywords));
  if (keywordHit) return keywordHit;
  return candidates.find((r) => r.trigger === "all") ?? null;
}

/**
 * 야간(21:00~08:00 KST) 여부 — 광고성 DM은 정보통신망법상 야간 전송에 별도 동의가 필요해
 * 이 시간대의 광고성 발송은 보류(held_night)한다.
 */
export function isNightInKST(now: Date = new Date()): boolean {
  const kstHour = Number(
    new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: "Asia/Seoul" }).format(now),
  );
  return kstHour >= 21 || kstHour < 8;
}

/** 수신거부 의사 감지 — DM 답장 텍스트에서 옵트아웃 처리 */
export function isOptOutMessage(text: string): boolean {
  const t = text.replace(/\s+/g, "").toLowerCase();
  return t.includes("수신거부") || t === "stop" || t === "unsubscribe";
}
