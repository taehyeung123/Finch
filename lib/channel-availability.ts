/* 시크릿(OWNER_EMAIL)을 읽는 모듈이다 — 이 한 줄이 있으면 클라이언트 그래프에 닿는 순간 **빌드가 실패한다.**
   경계를 사람의 주의력이 아니라 빌드가 지키게 한다(2026-09-07 감사: 같은 저장소의 다른 6개 모듈에는 이미 있었다). */
import "server-only";
/*
  채널이 **지금 고객에게 열려 있는가** (2026-09-06).

  왜 필요한가: 앱 ID·시크릿이 전부 들어가 있어도, 플랫폼이 우리 앱을 아직 일반 사용자에게 열어 주지 않은
  기간이 있다. 그동안 고객이 「연결하기」를 누르면 플랫폼 화면에서 막히고, 우리 쪽으로 돌아오지도 못한다.
  설정 화면은 계속 「미연결 · 연결하기」라 같은 실패를 무한히 반복하게 된다 — 자격증명 유무로는 이걸 알 수 없다.

  **기본값은 닫힘이다.** 열려 있다고 증명된 채널만 연다:
    CHANNELS_OPEN=instagram,threads   ← 플랫폼 승인이 끝난 채널만 쉼표로 나열. 비어 있으면 넷 다 닫힘.
  이 방향이 맞는 이유: 안 열린 채널을 열어 두면 고객이 매번 벽에 부딪히지만, 열린 채널을 닫아 두면
  「곧 열려요」를 하루 더 보는 것뿐이다. 사고의 크기가 다르다.

  ⚠️ 운영자(OWNER_EMAIL)는 닫혀 있어도 연결할 수 있다 — 고객에게 열기 전에 직접 확인해야 하기 때문이다.
     그래서 판정에 이메일이 필요하고, 서버에서만 부른다(설정 화면·start 라우트).
     같은 이유로 **운영자에게는 설정 화면이 「고객에게는 아직 닫혀 있다」고 따로 알려 준다** — 안 그러면
     운영자 화면만 멀쩡해서 승인이 난 뒤에도 고객이 계속 막혀 있는 걸 아무도 모른다.

  고객 문구는 자격증명 미설정과 **똑같이** 나간다: 「준비 중 · 곧 열릴 예정이에요」.
  왜 그 채널이 닫혔는지는 내부 운영 정보라 화면에 쓰지 않는다(CLAUDE.md).
*/

export const AVAILABILITY_KEYS = ["instagram", "threads", "tiktok", "ads"] as const;
export type AvailabilityKey = (typeof AVAILABILITY_KEYS)[number];

function openSet(): Set<string> {
  return new Set(
    (process.env.CHANNELS_OPEN ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

/**
 * 이 이메일이 운영자인가 — 같은 비교가 설정 화면·콜백 라우트에도 필요해 여기서 한 번만 정의한다.
 * ⚠️ 양쪽 다 값이 있을 때만 비교한다. 둘 다 비어 있으면 «같다»가 되어 아무나 운영자가 된다.
 */
export function isOwnerEmail(viewerEmail: string | null | undefined): boolean {
  const owner = process.env.OWNER_EMAIL?.trim().toLowerCase();
  const viewer = viewerEmail?.trim().toLowerCase();
  if (!owner || !viewer) return false;
  return owner === viewer;
}

/** 이 채널이 **고객에게** 닫혀 있는가 — 운영자 예외를 보지 않는 순수 판정 */
export function isChannelClosedForCustomers(channel: AvailabilityKey): boolean {
  return !openSet().has(channel);
}

/**
 * 이 요청에서 이 채널이 닫혀 있는가. 운영자에게는 항상 false(열려 있다).
 * viewerEmail 을 넘기지 않으면 운영자 예외 없이 판정한다.
 */
export function isChannelClosed(channel: AvailabilityKey, viewerEmail?: string | null): boolean {
  if (!isChannelClosedForCustomers(channel)) return false;
  return !isOwnerEmail(viewerEmail);
}

/** 화면·라우트가 함께 쓰는 최종 판정 — 자격증명이 있고(configured) 닫히지 않았을 때만 연결을 받는다 */
export function isChannelOpen(channel: AvailabilityKey, configured: boolean, viewerEmail?: string | null): boolean {
  return configured && !isChannelClosed(channel, viewerEmail);
}

/** 운영자 화면에 「고객에게는 아직 닫혀 있다」고 알릴 채널 목록 — 운영자일 때만 부른다 */
export function closedForCustomers(): AvailabilityKey[] {
  return AVAILABILITY_KEYS.filter(isChannelClosedForCustomers);
}
