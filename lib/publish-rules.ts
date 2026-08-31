/**
 * 발행 채널별 규칙 — **화면·서버 액션·발행 어댑터가 같은 값을 본다.**
 *
 * 왜 한 파일인가: 인스타 전용이던 시절엔 상한(2200자·10장)이 컴포저와 서버 액션에
 * 각각 하드코딩돼 있었다. 채널이 둘이 되는 순간 그 방식은 «화면은 500자라 막는데
 * 서버는 2200자를 받는» 식으로 갈라진다 — 실제로 이 저장소가 두 벌 렌더러에서
 * 반복해 겪은 종류의 회귀다(CLAUDE.md 프로필 링크 항목).
 *
 * 근거: docs/REAL_API_SPEC.md 1절(Instagram)·5절(Threads).
 */

/** 실제 발행 어댑터가 있는 채널. tiktok 은 발행 API 자체가 없다(docs/API_ROADMAP.md). */
export const PUBLISHABLE_CHANNELS = ["instagram", "threads"] as const;
export type PublishChannel = (typeof PUBLISHABLE_CHANNELS)[number];

/** 컴포저에 보이는 전체 채널 — 발행이 안 되는 것도 «준비 중»으로 보인다 */
export const COMPOSER_CHANNELS = ["instagram", "threads", "tiktok"] as const;

const LABELS: Record<string, string> = {
  instagram: "인스타그램",
  threads: "스레드",
  tiktok: "틱톡",
};

export function channelLabel(channel: string): string {
  return LABELS[channel] ?? channel;
}

export interface ChannelRules {
  /** 본문 글자 상한 */
  textMax: number;
  /**
   * 본문이 **필수**인가.
   * ⚠️ minImages 로 대신할 수 없다 — 스레드를 열면서 «둘 다 비었을 때만 막는다»로 바꿨더니
   * 인스타에서 **캡션 없는 캐러셀이 실제 계정에 게시**되는 경로가 열렸다(2026-08-31 점검 적발).
   * 이미지 요구와 글 요구는 별개다.
   */
  requiresText: boolean;
  /** 이미지 최소 장수 — 0이면 글만 있는 게시물이 가능하다 */
  minImages: number;
  /** 이미지 최대 장수 */
  maxImages: number;
  /** 본문 입력칸 라벨 — 인스타는 «캡션», 스레드는 그 자체가 «글»이다 */
  textLabel: string;
}

/*
  이미지 상한을 스레드도 10으로 두는 이유:
  스펙상 캐러셀은 20장까지지만, 컴포저는 이미지를 data URL 로 실어 보내고
  next.config.ts 의 bodySizeLimit 이 25MB 다. 장당 ~1.5MB(1440px JPEG)라
  20장이면 30MB — 요청이 통째로 잘린다. 실제로 통과하는 값을 상한으로 쓴다.
  (DB 체크는 0074 가 20까지 열어 뒀다 — 업로드 방식을 바꾸면 여기만 올리면 된다.)
*/
const RULES: Record<PublishChannel, ChannelRules> = {
  instagram: { textMax: 2200, requiresText: true, minImages: 1, maxImages: 10, textLabel: "캡션" },
  /* 스레드만 본문이 선택이다 — 이미지 없이 글만, 글 없이 이미지만 둘 다 정상이다.
     대신 «글도 이미지도 없음»은 어댑터가 막는다(threads-publish.ts). */
  threads: { textMax: 500, requiresText: false, minImages: 0, maxImages: 10, textLabel: "글" },
};

/** 발행 불가 채널까지 안전하게 다루기 위한 기본값 — 화면이 상한을 못 구해 깨지지 않게 한다 */
const FALLBACK: ChannelRules = { textMax: 2200, requiresText: true, minImages: 1, maxImages: 10, textLabel: "캡션" };

export function channelRules(channel: string): ChannelRules {
  return RULES[channel as PublishChannel] ?? FALLBACK;
}

export function isPublishableChannel(channel: string): channel is PublishChannel {
  return (PUBLISHABLE_CHANNELS as readonly string[]).includes(channel);
}

/**
 * «그 컬럼이 DB에 아직 없다»를 판정한다 — 마이그레이션 미적용 폴백의 유일한 관문.
 *
 * 왜 한 곳인가: 같은 기능의 저장 경로와 발행 크론이 **서로 다른 식**을 쓰고 있었다.
 * 크론 쪽은 메시지에 컬럼명이 스치기만 해도 폴백이 걸렸는데, 그 분기는 모든 행을
 * 인스타로 읽는다 — 관계없는 오류 한 번에 **스레드 예약 글이 인스타 계정으로 나갈** 수 있었다
 * (2026-08-31 점검 적발). 42703(undefined_column)을 먼저 보고, 메시지 판정은 보조로만 쓴다.
 */
export function isMissingColumnError(
  error: { code?: string; message?: string } | null | undefined,
  column: RegExp,
): boolean {
  if (!error) return false;
  if (error.code === "42703") return true;
  const msg = error.message ?? "";
  return column.test(msg) && /column|schema/i.test(msg);
}
