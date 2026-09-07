/*
  알림 유형별 **기본값** — 화면과 발송 경로가 같은 것을 읽어야 한다.

  왜 파일이 따로 있나(2026-09-07 감사): 기본값이 설정 화면(클라이언트 컴포넌트)에만 있었다.
  가입 시 notification_settings 행을 만드는 코드가 없어서, 설정 화면에 한 번도 안 들어갔거나
  들어갔어도 아무것도 안 바꾼 사용자는 그 행이 **없다.** notifyUser 는 행이 있을 때만 메일을 보냈으므로
  그 사람들에게는 결제 실패·구독 해지·토큰 만료 메일이 **한 통도 안 나갔다** — 화면은 「켜짐」으로 보이는데.
  이제 발송 경로가 행이 없을 때 이 표를 쓴다. 정본이 한 곳이라 화면과 갈릴 수 없다.

  이 파일에 의존이 없어야 한다 — 클라이언트 컴포넌트와 server-only 모듈이 함께 읽는다.
*/

export type NotifyChannelPref = { inapp: boolean; email: boolean };

/** 유형 → 기본 수신 설정. 여기 없는 유형은 «인앱만 켜짐»으로 본다(notifyUser) */
export const NOTIFY_DEFAULTS: Record<string, NotifyChannelPref> = {
  competitor_ad: { inapp: true, email: true },
  trend: { inapp: true, email: false },
  account: { inapp: true, email: false },
  token_expiry: { inapp: true, email: true },
  budget: { inapp: true, email: false },
  billing: { inapp: true, email: true },
  studio: { inapp: true, email: false },
};

/** 저장된 설정이 없을 때 쓰는 값 — 모르는 유형은 인앱만 */
export function defaultPrefFor(settingKey: string): NotifyChannelPref {
  return NOTIFY_DEFAULTS[settingKey] ?? { inapp: true, email: false };
}
