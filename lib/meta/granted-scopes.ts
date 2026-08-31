import "server-only";

import { INSTAGRAM_SCOPES } from "@/lib/meta/instagram-oauth";
import { THREADS_SCOPES } from "@/lib/meta/threads-oauth";

/**
 * 연동 토큰이 실제로 받은 권한과, 지금 코드가 요구하는 권한을 대조한다.
 *
 * 왜 필요한가: OAuth 스코프는 **동의 시점에 고정**된다. 코드의 배열을 나중에 늘려도
 * 이미 발급된 토큰은 그대로다. 실제로 이 저장소에서 사고가 났다 —
 * 인스타 토큰은 2026-07-18 발급인데 예약 발행 권한은 2026-08-30 에야 배열에 들어갔다.
 * 그 토큰으로 예약을 걸면 **새벽 6시 크론이 돌 때** 권한 오류로 실패하고,
 * 그 전까지 화면 어디에도 신호가 없다.
 *
 * ⚠️ **모르는 것과 없는 것을 구분한다.** granted_scopes 가 null 이면 «확인 불가»(0075 이전 연동)이지
 * «권한 없음»이 아니다. 모른다고 멀쩡한 연동을 막으면 그게 더 나쁘다 —
 * 확인 불가일 때는 통과시키고, **확실히 없을 때만** 막는다.
 */

/** 기능별로 필요한 스코프 — 화면·서버가 같은 값을 본다 */
export const REQUIRED_SCOPE = {
  instagramPublish: "instagram_business_content_publish",
  instagramComments: "instagram_business_manage_comments",
  instagramMessages: "instagram_business_manage_messages",
  threadsPublish: "threads_content_publish",
} as const;

export type ScopeCheck =
  /** 권한이 있다 */
  | { state: "ok" }
  /** 확인할 수 없다(0075 이전 연동) — 막지 않는다 */
  | { state: "unknown" }
  /** 확실히 없다 — 재연동이 필요하다 */
  | { state: "missing"; scope: string };

/**
 * @param granted DB 의 connected_accounts.granted_scopes (null = 확인 불가)
 * @param scope   확인할 스코프
 */
export function checkScope(granted: string[] | null | undefined, scope: string): ScopeCheck {
  if (!granted || granted.length === 0) return { state: "unknown" };
  return granted.includes(scope) ? { state: "ok" } : { state: "missing", scope };
}

/** 이 연동이 지금 코드가 요구하는 스코프를 전부 갖고 있는가 — 설정 화면의 «재연동 필요» 배지용 */
export function missingScopes(
  channel: "instagram" | "threads",
  granted: string[] | null | undefined,
): string[] {
  if (!granted || granted.length === 0) return []; // 확인 불가 — 없다고 단정하지 않는다
  const wanted: readonly string[] = channel === "instagram" ? INSTAGRAM_SCOPES : THREADS_SCOPES;
  return wanted.filter((s) => !granted.includes(s));
}
