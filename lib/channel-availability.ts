/*
  채널이 **지금 연결을 받을 수 있는가** (2026-09-06).

  왜 필요한가: 앱 ID·시크릿이 전부 들어가 있어도, 플랫폼이 우리 앱을 아직 일반 사용자에게 열어 주지 않은
  기간이 있다. 그동안 고객이 「연결하기」를 누르면 플랫폼 화면에서 막히고, 우리 쪽으로 돌아오지도 못한다.
  설정 화면은 계속 「미연결 · 연결하기」라 같은 실패를 무한히 반복하게 된다 — 자격증명 유무로는 이걸 알 수 없다.

  그래서 «자격증명이 있는가»와 «지금 열려 있는가»를 나눈다.
    CHANNELS_CLOSED=instagram,threads,tiktok,ads   ← 닫아 둘 채널을 쉼표로. 비어 있으면 전부 열림(이 파일 넣기 전과 동일).
  하나씩 열릴 때마다 그 이름만 빼고 재배포한다.

  ⚠️ 운영자(OWNER_EMAIL)는 닫혀 있어도 연결할 수 있다 — 고객에게 열기 전에 직접 확인해야 하기 때문이다.
     그래서 판정에 이메일이 필요하고, 서버에서만 부른다(설정 화면·start 라우트).

  고객 문구는 **자격증명 미설정과 똑같이** 나간다: 「준비 중 · 곧 열릴 예정이에요」.
  왜 그 채널이 닫혔는지는 내부 운영 정보라 화면에 쓰지 않는다(CLAUDE.md).
*/

export const AVAILABILITY_KEYS = ["instagram", "threads", "tiktok", "ads"] as const;
export type AvailabilityKey = (typeof AVAILABILITY_KEYS)[number];

function closedSet(): Set<string> {
  return new Set(
    (process.env.CHANNELS_CLOSED ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

function isOwner(viewerEmail: string | null | undefined): boolean {
  const owner = process.env.OWNER_EMAIL?.trim().toLowerCase();
  if (!owner) return false;
  return viewerEmail?.trim().toLowerCase() === owner;
}

/**
 * 이 채널이 지금 닫혀 있는가. 운영자에게는 항상 false(열려 있다).
 * viewerEmail 을 넘기지 않으면 운영자 예외 없이 판정한다.
 */
export function isChannelClosed(channel: AvailabilityKey, viewerEmail?: string | null): boolean {
  if (!closedSet().has(channel)) return false;
  return !isOwner(viewerEmail);
}

/** 화면·라우트가 함께 쓰는 최종 판정 — 자격증명이 있고(configured) 닫히지 않았을 때만 연결을 받는다 */
export function isChannelOpen(channel: AvailabilityKey, configured: boolean, viewerEmail?: string | null): boolean {
  return configured && !isChannelClosed(channel, viewerEmail);
}
