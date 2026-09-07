/*
  팀 초대장 판정 — 수락 화면(렌더)과 수락 액션(쓰기)이 **같은 규칙**을 써야 한다.
  두 벌로 두면 화면은 «수락 가능»이라 말하고 액션은 거절하는(또는 그 반대의) 어긋남이 생긴다.

  의존이 없다 — "use server" 파일은 async 함수만 export 할 수 있어서, 순수 판정은 여기 둔다.
*/

/** 초대장 유효 기간 — 메일함에 남은 옛 링크가 영구 유효하지 않게 한다 */
export const INVITE_TTL_DAYS = 14;

/** 발송 시각이 TTL 을 넘었는가. ⚠️ 시각을 모르면(null·파싱 실패) **만료로 단정하지 않는다** — «모름»은 «만료»가 아니다. */
export function isInviteExpired(invitedAt: string | null | undefined): boolean {
  if (!invitedAt) return false;
  const t = new Date(invitedAt).getTime();
  if (!Number.isFinite(t)) return false;
  return Date.now() - t > INVITE_TTL_DAYS * 86_400_000;
}

/**
 * 초대장 이메일과 로그인 이메일이 같은 사람인가.
 *
 * ⚠️ **둘 다 비어 있지 않을 때만** 같다고 본다. 카카오 로그인은 이메일이 없을 수 있어(user.email = null)
 * 예전 비교(`(user.email ?? "").toLowerCase() !== invite.email.toLowerCase()`)에서는
 * 초대장 이메일이 빈 문자열이면 **양쪽이 ""** 가 되어 일치했다 — 링크 한 번으로 남을 자기
 * 워크스페이스에 편입시킬 수 있었다(2026-09-07 감사, 0084 수정의 미완결분).
 * 편입되면 피해자의 대시보드·연동 계정·광고 화면 스코프가 공격자 소유로 바뀐다(lib/team.ts).
 */
export function sameInvitee(inviteEmail: string | null | undefined, userEmail: string | null | undefined): boolean {
  const a = (inviteEmail ?? "").trim().toLowerCase();
  const b = (userEmail ?? "").trim().toLowerCase();
  if (!a || !b) return false;
  return a === b;
}
