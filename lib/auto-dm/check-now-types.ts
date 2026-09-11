/*
  자동 DM «지금 확인» — 결과의 모양과 화면 문구. **의존성 없는 파일이다**(클라이언트가 import 한다).
  서버 쪽 실행(lib/auto-dm/check-now.ts)은 server-only 라 여기로 끌어오면 빌드가 막힌다 — 타입·문구만 여기 둔다.

  고객 문구 규칙: 심사·웹훅·API·권한 심사 같은 운영 용어를 쓰지 않는다(CLAUDE.md). «권한»은 «다시 연결» 안내에만 쓴다.
*/

/** 같은 규칙을 다시 확인할 수 있을 때까지의 간격(초) — 서버가 DB 로 강제한다(0092 claim_auto_dm_check) */
export const CHECK_NOW_COOLDOWN_SEC = 30;

export type CheckNowFailCode =
  /** 로그인이 풀렸다 */
  | "auth"
  /** 예시 화면(데모 배포) — 실제 댓글을 읽지 않는다 */
  | "demo"
  /** 없는 규칙이거나 내 규칙이 아니다 */
  | "not_found"
  /** 일시중지된 규칙 */
  | "inactive"
  /** «다음 게시물» 예약 규칙인데 아직 게시물이 정해지지 않았다 */
  | "unbound"
  /** 인스타 연동이 없다 */
  | "not_connected"
  /** 댓글 권한 없이 연결됐다 — 다시 연결해야 한다 */
  | "scope_missing"
  /** 연결이 만료·무효 — 다시 연결해야 한다 */
  | "token_expired"
  /** 같은 규칙을 방금 확인했다(규칙당 30초에 한 번) */
  | "throttled"
  /** 게시물이 지워졌거나 지금 연결된 계정의 게시물이 아니다 */
  | "post_gone"
  /** 댓글을 가져오지 못했다(일시 오류) */
  | "fetch_failed"
  /** 우리 쪽 문제(DB·설정) — 잠시 후 다시 */
  | "unavailable";

export interface CheckNowSummary {
  /** 확인한 댓글 수(내 계정이 단 댓글은 뺀다) */
  checked: number;
  /** 이번에 DM 을 보냈다 */
  sent: number;
  /** 전에 이미 처리한 댓글(보냈거나, 그때 건너뛰었다) — 다시 보내지 않는다 */
  already: number;
  /** 규칙 조건(키워드)에 안 맞는다 */
  unmatched: number;
  /** 댓글 단 지 7일 가까이 지나 비공개 답장을 보낼 수 없다 */
  expired: number;
  /** 안전장치에 걸렸다 — 하루 상한·수신거부·24시간 안에 이미 받은 사람 등 */
  blocked: number;
  /** 지금은 못 보냈고 나중에 자동으로 보낸다 — 광고 야간 보류·일시 오류 */
  held: number;
  /** 보내지 못했다(되돌릴 수 없는 실패) */
  failed: number;
  /** 확인 중 문제가 생겨 이번엔 처리하지 못했다 — 다시 누르면 다시 본다 */
  errors: number;
  /** 댓글이 많아 이번 확인 시간 안에 못 봤다 — 다시 누르면 이어서 본다 */
  deferred: number;
}

/** 확인이 끝난 뒤 카드 숫자를 맞추기 위한 규칙별 카운터 */
export interface CheckNowRuleCounters {
  id: string;
  sentTotal: number;
  sentToday: number;
  failedTotal: number;
  lastSentAt: string | null;
}

export type CheckNowResult =
  | { ok: true; summary: CheckNowSummary; counters: CheckNowRuleCounters[] }
  | { ok: false; code: CheckNowFailCode; retryAfterSec?: number };

export interface CheckNowMessage {
  tone: "positive" | "warning" | "negative";
  title: string;
  description: string | null;
  /** 이어지는 줄 — 건너뛴 이유·나중에 보낼 것 */
  lines: string[];
  /** 연결해야 풀리는 실패 — connect: 연동이 없다 · reconnect: 다시 연결해야 한다 · null: 해당 없음 */
  reconnect: "connect" | "reconnect" | null;
}

/** 결과 → 결과 모달 문구 */
export function describeCheckNow(result: CheckNowResult): CheckNowMessage {
  if (!result.ok) return describeFailure(result.code, result.retryAfterSec);
  const s = result.summary;
  const skipped = s.already + s.unmatched + s.expired + s.blocked;
  const title =
    s.sent > 0 ? `DM ${s.sent}개를 보냈어요` : s.checked === 0 ? "확인할 댓글이 없어요" : "새로 보낼 DM이 없었어요";
  const description = s.checked === 0 ? "이 게시물에 아직 댓글이 없어요." : `댓글 ${s.checked}개 확인 · DM ${s.sent}개 보냄 · 건너뜀 ${skipped}개`;

  const lines: string[] = [];
  const reasons = [
    s.already > 0 ? `이미 처리함 ${s.already}` : null,
    s.unmatched > 0 ? `조건 불일치 ${s.unmatched}` : null,
    s.expired > 0 ? `기간 지남 ${s.expired}` : null,
    s.blocked > 0 ? `발송 제한 ${s.blocked}` : null,
  ].filter((v): v is string => v !== null);
  if (reasons.length > 0) lines.push(`건너뛴 이유: ${reasons.join(" · ")}`);
  if (s.expired > 0) lines.push("댓글 단 지 7일이 가까워진 댓글에는 DM을 보낼 수 없어요.");
  if (s.blocked > 0) lines.push("발송 제한은 하루 상한·수신거부·24시간 안에 이미 받은 사람 같은 안전장치예요.");
  if (s.held > 0) lines.push(`${s.held}개는 지금 보내지 못해 오전 8시 이후 자동으로 보내요.`);
  if (s.failed > 0) lines.push(`${s.failed}개는 보내지 못했어요. 받는 사람이 메시지를 막았거나 댓글이 지워졌을 수 있어요.`);
  if (s.errors > 0) lines.push(`${s.errors}개는 확인 중 문제가 생겼어요. 잠시 후 다시 확인해 주세요.`);
  if (s.deferred > 0) lines.push(`댓글이 많아 ${s.deferred}개는 이번에 못 봤어요. ${CHECK_NOW_COOLDOWN_SEC}초 뒤 다시 확인하면 이어서 봐요.`);

  const tone = s.failed + s.errors + s.deferred > 0 ? "warning" : "positive";
  return { tone, title, description, lines, reconnect: null };
}

function describeFailure(code: CheckNowFailCode, retryAfterSec?: number): CheckNowMessage {
  const base: Pick<CheckNowMessage, "lines" | "reconnect"> = { lines: [], reconnect: null };
  switch (code) {
    case "auth":
      return { ...base, tone: "negative", title: "로그인이 필요해요", description: "다시 로그인한 뒤 확인해 주세요." };
    case "demo":
      return { ...base, tone: "warning", title: "예시 화면에서는 실제 댓글을 확인하지 않아요", description: null };
    case "not_found":
      return { ...base, tone: "negative", title: "이 자동화를 찾지 못했어요", description: "새로고침한 뒤 다시 시도해 주세요." };
    case "inactive":
      return { ...base, tone: "warning", title: "일시중지된 자동화예요", description: "실행으로 바꾼 뒤 확인할 수 있어요." };
    case "unbound":
      return {
        ...base,
        tone: "warning",
        title: "아직 게시물이 정해지지 않았어요",
        description: "다음 게시물이 정해지면 그 게시물의 댓글을 확인할 수 있어요.",
      };
    case "not_connected":
      return {
        ...base,
        tone: "warning",
        title: "인스타그램이 연결돼 있지 않아요",
        description: "계정을 연결하면 댓글을 확인하고 DM을 보낼 수 있어요.",
        reconnect: "connect",
      };
    case "scope_missing":
      return {
        ...base,
        tone: "warning",
        title: "인스타그램을 다시 연결해 주세요",
        description: "댓글을 읽고 답장하는 권한이 빠진 채 연결돼 있어요. 다시 연결할 때 모든 항목을 허용해 주세요.",
        reconnect: "reconnect",
      };
    case "token_expired":
      return {
        ...base,
        tone: "warning",
        title: "인스타그램 연결이 만료됐어요",
        description: "다시 연결하면 바로 확인할 수 있어요.",
        reconnect: "reconnect",
      };
    case "throttled":
      return {
        ...base,
        tone: "warning",
        title: "방금 확인했어요",
        description: `${Math.max(1, retryAfterSec ?? CHECK_NOW_COOLDOWN_SEC)}초 뒤에 다시 확인할 수 있어요.`,
      };
    case "post_gone":
      return {
        ...base,
        tone: "negative",
        title: "게시물을 찾지 못했어요",
        description: "인스타그램에서 지워졌거나 지금 연결된 계정의 게시물이 아니에요.",
      };
    case "fetch_failed":
      return { ...base, tone: "negative", title: "댓글을 가져오지 못했어요", description: "잠시 후 다시 시도해 주세요." };
    case "unavailable":
      return { ...base, tone: "negative", title: "지금은 확인하지 못했어요", description: "잠시 후 다시 시도해 주세요." };
  }
}
