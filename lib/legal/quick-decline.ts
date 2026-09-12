/**
 * «동의하지 않고 나가기»(확인 문구 없는 계정 삭제)를 보여 줘도 되는 계정인가 — **순수 모듈**(검증 스크립트가 직접 부른다).
 *
 * 그 버튼은 막 로그인한 사람을 위한 출구다: 첫 로그인 순간 이메일·이름·사진이 이미 저장됐는데 탈퇴 화면은 동의 게이트 뒤라,
 * 동의 화면에서 바로 지울 수 있어야 거부자가 갇히지 않는다(2026-09-02 감사).
 *
 * 그런데 «동의 기록 없음»만으로는 막 로그인한 사람인지 알 수 없다 — 0079(2026-09-02) 전에 가입해 그 뒤 들어오지 않은 회원도
 * 기록이 없어 같은 첫 가입 화면을 받는다. 그 회원에게는 채널·프로필 링크·크레딧이 쌓여 있고, 한 번 클릭으로 지우면 되돌릴 수 없다
 * (2026-09-12 점검). 그래서 가입한 지 하루가 지난 계정은 확인 문구를 타이핑하는 회원 탈퇴로만 지운다 —
 * 출구는 그대로 있고(탈퇴·로그아웃), 손이 한 번 멈출 뿐이다.
 *
 * 화면(onboarding/consent/page.tsx)과 서버 액션(declineConsent)이 같은 함수를 쓴다.
 * 만든 시각을 읽지 못하면 «오래된 계정»으로 본다 — 모르는 쪽을 되돌릴 수 없는 삭제로 풀지 않는다.
 */

export const QUICK_DECLINE_WINDOW_MS = 24 * 60 * 60 * 1000;

export function canQuickDecline(createdAt: string | null | undefined, now: number = Date.now()): boolean {
  const t = Date.parse(createdAt ?? "");
  if (Number.isNaN(t)) return false;
  return now - t <= QUICK_DECLINE_WINDOW_MS;
}
