/**
 * 발행 채널별 규칙 — **화면·서버 액션·발행 엔진·DB 체크가 같은 값을 본다.**
 *
 * 왜 한 파일인가: 인스타 전용이던 시절엔 상한(2200자·10장)이 컴포저와 서버 액션에
 * 각각 하드코딩돼 있었다. 채널이 둘이 되는 순간 그 방식은 «화면은 500자라 막는데
 * 서버는 2200자를 받는» 식으로 갈라진다 — 실제로 이 저장소가 두 벌 렌더러에서
 * 반복해 겪은 종류의 회귀다(CLAUDE.md 프로필 링크 항목).
 *
 * ⚠️ 이 파일은 **아무것도 import 하지 않는다.** 브라우저(컴포저)·서버(액션·엔진)·Node 검사
 * (scripts/test-publish-rules.ts, 타입 스트리핑)가 같은 파일을 그대로 읽는다 — 확장자 없는 상대 import 하나만
 * 들어가도 Node 검사가 모듈을 못 찾는다. 조사 도우미도 그래서 아래에 작게 따로 둔다.
 *
 * 근거: docs/REAL_API_SPEC.md 1절(Instagram)·5절(Threads), docs/PUBLISH_VIDEO_PLAN.md, 메타 문서(2026-09-11 확인):
 *   IG 릴스 3초~15분·300MB·가로 1920px·23~60fps·H.264/HEVC+AAC / IG 스토리 영상 3~60초·100MB /
 *   IG 캐러셀 2~10개(사진·영상 섞음) / 스레드 영상 5분·1GB, 캐러셀 2~20개 / 사진 JPEG 8MB.
 * DB 쪽 같은 규칙: supabase/migrations/0093_publish_media.sql 의 publish_media_shape_ok·publish_media_count_ok.
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

/* lib/josa.ts 와 같은 규칙의 작은 사본 — 이 파일은 import 를 못 한다(위 머리말) */
function batchim(word: string): boolean {
  const code = word.trim().slice(-1).charCodeAt(0);
  if (!(code >= 0xac00 && code <= 0xd7a3)) return false;
  return (code - 0xac00) % 28 !== 0;
}
const topic = (w: string) => `${w}${batchim(w) ? "은" : "는"}`;
const subject = (w: string) => `${w}${batchim(w) ? "이" : "가"}`;
const object = (w: string) => `${w}${batchim(w) ? "을" : "를"}`;

export interface ChannelRules {
  /** 본문 글자 상한 */
  textMax: number;
  /**
   * 본문이 **필수**인가.
   * ⚠️ minMedia 로 대신할 수 없다 — 스레드를 열면서 «둘 다 비었을 때만 막는다»로 바꿨더니
   * 인스타에서 **캡션 없는 캐러셀이 실제 계정에 게시**되는 경로가 열렸다(2026-08-31 점검 적발).
   * 사진·영상 요구와 글 요구는 별개다. (스토리는 예외 — 글이 올라가지 않는다, validatePostText)
   */
  requiresText: boolean;
  /** 사진·영상 최소 개수 — 0이면 글만 있는 게시물이 가능하다 */
  minMedia: number;
  /** 사진·영상 최대 개수(직접 업로드 기준 — 인스타 10, 스레드 20) */
  maxMedia: number;
  /**
   * @deprecated 옛 컴포저(사진을 data URL 로 서버 액션에 싣던 길) 전용. 그 길은 Vercel 요청 본문 4.5MB 에 묶여
   * 합계 3MB·10장이 실제 상한이었다. UI 조각이 직접 업로드로 옮기면 minMedia/maxMedia 만 남기고 지운다.
   */
  minImages: number;
  /** @deprecated minImages 와 같다 */
  maxImages: number;
  /** 본문 입력칸 라벨 — 인스타는 «캡션», 스레드는 그 자체가 «글»이다 */
  textLabel: string;
}

const RULES: Record<PublishChannel, ChannelRules> = {
  instagram: { textMax: 2200, requiresText: true, minMedia: 1, maxMedia: 10, minImages: 1, maxImages: 10, textLabel: "캡션" },
  /* 스레드만 본문이 선택이다 — 사진·영상 없이 글만, 글 없이 사진·영상만 둘 다 정상이다.
     대신 «글도 미디어도 없음»은 validatePostText 가 막는다. */
  threads: { textMax: 500, requiresText: false, minMedia: 0, maxMedia: 20, minImages: 0, maxImages: 10, textLabel: "글" },
};

/** 발행 불가 채널까지 안전하게 다루기 위한 기본값 — 화면이 상한을 못 구해 깨지지 않게 한다 */
const FALLBACK: ChannelRules = {
  textMax: 2200,
  requiresText: true,
  minMedia: 1,
  maxMedia: 10,
  minImages: 1,
  maxImages: 10,
  textLabel: "캡션",
};

export function channelRules(channel: string): ChannelRules {
  return RULES[channel as PublishChannel] ?? FALLBACK;
}

export function isPublishableChannel(channel: string): channel is PublishChannel {
  return (PUBLISHABLE_CHANNELS as readonly string[]).includes(channel);
}

/* ══════════════════════════════════════════════════════════════════
   미디어(사진·영상) 규칙 — 2026-09-11 영상 발행
   ══════════════════════════════════════════════════════════════════ */

export type MediaKind = "image" | "video";
/** 인스타 게시 면. 스레드는 면이 없다(null) */
export type IgSurface = "feed" | "reels" | "story";

/**
 * 인스타 스토리 — 같은 미디어 모델에서 싸게 떨어지는 덤이라 켜 둔다(사장님 지시: «싸게 되면»).
 * 끄면 컴포저가 «스토리로 올리기» 스위치를 숨기고 서버도 story 를 받지 않는다(createPost).
 * ⚠️ 인스타 로그인 방식에서 스토리의 게시물 링크(permalink)·최근 목록 조회는 실측 전이다 — 링크 없이 «발행됨»으로 남을 수 있다.
 */
export const IG_STORY_ENABLED = true;

/** 업로드 형식 — 버킷(publish-media) allowed_mime_types 와 같아야 한다(0093) */
export type PublishMime = "image/jpeg" | "video/mp4" | "video/quicktime";
/** 업로드 종류 — 사진(게시물 항목)·영상(게시물 항목)·커버(영상 목록 썸네일용 JPEG) */
export type PublishUploadKind = "image" | "video" | "cover";

/** 버킷 파일 상한(0093 file_size_limit) — 영상 한 개가 넘을 수 없는 절대 상한 */
export const PUBLISH_MAX_VIDEO_BYTES = 300 * 1024 * 1024;
/** 사진·커버 JPEG 상한 — 인스타·스레드 모두 8MB */
export const PUBLISH_MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export interface ImageLimits {
  /** 가로/세로 비율 하한 — 이보다 세로로 길면 가운데를 잘라 맞춘다 */
  minRatio: number;
  /** 가로/세로 비율 상한 */
  maxRatio: number;
  /** 긴 변 상한(px) — 굽기(bakeJpeg)가 줄인다 */
  maxLongSidePx: number;
  maxBytes: number;
}

export interface VideoLimits {
  /** null = 하한 없음 */
  minDurationMs: number | null;
  maxDurationMs: number;
  maxBytes: number;
  /** 표시 기준(회전 반영) 가로 픽셀 상한 */
  maxWidthPx: number;
  /** 이보다 낮으면 **경고만** 한다 — 가변 프레임 화면 녹화는 평균이 23 밑으로 나올 수 있다(실측 전) */
  minFpsWarn: number;
  maxFps: number;
  /** 허용 영상 코덱(fourcc) — 허용 목록으로 본다. 막을 것을 열거하면 새 형식이 조용히 통과한다 */
  videoCodecs: readonly string[];
  /** 허용 소리 코덱(fourcc) — 소리 없는 영상은 통과 */
  audioCodecs: readonly string[];
  maxAudioChannels: number;
  maxAudioSampleRate: number;
  /** 평균 비트레이트(bps) — 넘으면 error */
  maxBitrateBps: number | null;
  /** 평균 비트레이트(bps) — 넘으면 warning(메타가 실제로 거절하는지 실측 전) */
  warnBitrateBps: number | null;
}

export interface MediaRules {
  minItems: number;
  maxItems: number;
  image: ImageLimits;
  video: VideoLimits;
}

const VIDEO_CODECS = ["avc1", "avc3", "hvc1", "hev1"] as const;
const AUDIO_CODECS = ["mp4a"] as const;

const IG_FEED_IMAGE: ImageLimits = { minRatio: 4 / 5, maxRatio: 1.91, maxLongSidePx: 1440, maxBytes: PUBLISH_MAX_IMAGE_BYTES };
/* 스토리·스레드 사진은 자르지 않는다 — 스토리는 9:16 «권장»일 뿐이고 스레드는 10:1 까지 받는다 */
const OPEN_IMAGE: ImageLimits = { minRatio: 1 / 10, maxRatio: 10, maxLongSidePx: 1440, maxBytes: PUBLISH_MAX_IMAGE_BYTES };

const BASE_VIDEO: Omit<VideoLimits, "minDurationMs" | "maxDurationMs" | "maxBytes"> = {
  maxWidthPx: 1920,
  minFpsWarn: 23,
  maxFps: 60,
  videoCodecs: VIDEO_CODECS,
  audioCodecs: AUDIO_CODECS,
  maxAudioChannels: 2,
  maxAudioSampleRate: 48_000,
  maxBitrateBps: null,
  warnBitrateBps: 25_000_000,
};

const IG_REELS_VIDEO: VideoLimits = { ...BASE_VIDEO, minDurationMs: 3_000, maxDurationMs: 15 * 60_000, maxBytes: PUBLISH_MAX_VIDEO_BYTES };
const IG_STORY_VIDEO: VideoLimits = { ...BASE_VIDEO, minDurationMs: 3_000, maxDurationMs: 60_000, maxBytes: 100 * 1024 * 1024 };
/* 캐러셀 속 영상의 한도는 메타 문서에 없다(실측 전) — 스토리와 같은 값으로 보수적으로 둔다 */
const IG_CAROUSEL_VIDEO: VideoLimits = IG_STORY_VIDEO;
const THREADS_VIDEO: VideoLimits = {
  ...BASE_VIDEO,
  minDurationMs: null,
  maxDurationMs: 5 * 60_000,
  /* 스레드는 1GB 까지 받지만 우리 버킷 상한(300MB)이 먼저다 */
  maxBytes: PUBLISH_MAX_VIDEO_BYTES,
  /* 스레드는 100Mbps 를 넘으면 INVALID_BIT_RATE 로 거절한다고 문서가 말한다 */
  maxBitrateBps: 100_000_000,
  warnBitrateBps: null,
};

/**
 * 인스타 게시 면 판정 — 한 곳에서만 정한다(화면·서버·DB 체크가 같은 답을 내야 한다).
 * 스토리는 «스토리로 올리기»를 켰고 항목이 정확히 1개일 때만. 영상 1개는 릴스, 나머지는 피드(사진 1장·캐러셀).
 */
export function resolveIgSurface(args: { count: number; firstKind: MediaKind | null; story: boolean }): IgSurface {
  if (args.story && args.count === 1) return "story";
  if (args.count === 1 && args.firstKind === "video") return "reels";
  return "feed";
}

/** 채널·면별 미디어 규칙. 스레드는 면을 무시한다. */
export function mediaRules(channel: string, surface: IgSurface | null): MediaRules {
  if (channel === "threads") {
    return { minItems: 0, maxItems: 20, image: OPEN_IMAGE, video: THREADS_VIDEO };
  }
  if (surface === "story") return { minItems: 1, maxItems: 1, image: OPEN_IMAGE, video: IG_STORY_VIDEO };
  if (surface === "reels") return { minItems: 1, maxItems: 1, image: IG_FEED_IMAGE, video: IG_REELS_VIDEO };
  return { minItems: 1, maxItems: 10, image: IG_FEED_IMAGE, video: IG_CAROUSEL_VIDEO };
}

/** 검사에 쓰는 사실 — 모르는 값은 null 이고, **null 은 절대 막지 않는다**(메타가 최종 판정한다) */
export interface MediaItemFacts {
  kind: MediaKind;
  bytes: number | null;
  /** 표시 기준(회전 반영) */
  width: number | null;
  height: number | null;
  durationMs: number | null;
  fps: number | null;
  /** fourcc — 'avc1'·'hvc1'·'apch'(ProRes)… */
  videoCodec: string | null;
  /** fourcc — 'mp4a'(AAC)·'sowt'·'lpcm'… */
  audioCodec: string | null;
  audioChannels: number | null;
  audioSampleRate: number | null;
}

export type MediaIssueCode =
  | "count_low"
  | "count_high"
  | "story_single"
  | "video_single_feed"
  | "reels_video_only"
  | "too_large"
  | "too_short"
  | "too_long"
  | "too_wide"
  | "fps_high"
  | "fps_low"
  | "video_codec"
  | "audio_codec"
  | "audio_channels"
  | "audio_rate"
  | "bitrate_high";

export interface MediaIssue {
  /** 0부터 — null 이면 묶음 전체의 문제(개수 등) */
  index: number | null;
  severity: "error" | "warning";
  code: MediaIssueCode;
  message: string;
}

function mb(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))}MB`;
}

/** 길이 문구 — 60초 미만은 «N초», 그 이상은 «N분»(나머지 초가 있으면 «N분 M초») */
export function formatDurationKo(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}초`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m}분 ${r}초` : `${m}분`;
}

/**
 * 사진·영상 묶음 검사. 컴포저(고르는 즉시)와 createPost(저장 직전)가 같은 함수를 부른다.
 * error 가 하나라도 있으면 저장하지 않는다. warning 은 알리기만 한다.
 * 스레드 0개(글만)는 여기서 통과한다 — «글도 미디어도 없음»은 validatePostText 몫이다.
 */
export function validateMediaSet(channel: string, surface: IgSurface | null, items: MediaItemFacts[]): MediaIssue[] {
  const issues: MediaIssue[] = [];
  const label = channelLabel(channel);
  const ig = channel === "instagram";
  const rules = mediaRules(channel, ig ? surface : null);

  if (items.length < rules.minItems) {
    issues.push({ index: null, severity: "error", code: "count_low", message: "사진이나 영상을 1개 이상 올려 주세요." });
  }
  if (ig && surface === "story" && items.length > 1) {
    issues.push({ index: null, severity: "error", code: "story_single", message: "스토리는 사진이나 영상 1개만 올릴 수 있어요." });
  } else if (items.length > rules.maxItems) {
    issues.push({
      index: null,
      severity: "error",
      code: "count_high",
      message: `${topic(label)} 사진·영상을 ${rules.maxItems}개까지 올릴 수 있어요.`,
    });
  }
  if (ig && surface === "feed" && items.length === 1 && items[0].kind === "video") {
    issues.push({ index: 0, severity: "error", code: "video_single_feed", message: "영상 1개는 릴스로 올라가요 — 다시 골라 주세요." });
  }
  if (ig && surface === "reels" && items.some((it) => it.kind !== "video")) {
    issues.push({ index: null, severity: "error", code: "reels_video_only", message: "릴스는 영상 1개만 올릴 수 있어요." });
  }

  items.forEach((it, i) => {
    const n = `${i + 1}번째 ${it.kind === "video" ? "영상" : "사진"}`;
    const push = (severity: MediaIssue["severity"], code: MediaIssueCode, text: string) =>
      issues.push({ index: i, severity, code, message: `${n} — ${text}` });

    if (it.kind === "image") {
      if (it.bytes !== null && it.bytes > rules.image.maxBytes) push("error", "too_large", `파일이 너무 커요(${mb(rules.image.maxBytes)}까지).`);
      return;
    }

    const v = rules.video;
    if (it.bytes !== null && it.bytes > v.maxBytes) push("error", "too_large", `파일이 너무 커요(${mb(v.maxBytes)}까지).`);
    if (it.durationMs !== null) {
      /* 50ms 여유 — 브라우저·파서가 읽는 길이는 컨테이너 기록값이라 몇 프레임씩 흔들린다 */
      if (v.minDurationMs !== null && it.durationMs < v.minDurationMs - 50) {
        push("error", "too_short", `${formatDurationKo(v.minDurationMs)}보다 짧아요. ${formatDurationKo(v.minDurationMs)} 이상 영상만 올릴 수 있어요.`);
      } else if (it.durationMs > v.maxDurationMs + 50) {
        push("error", "too_long", `${formatDurationKo(v.maxDurationMs)}까지 올릴 수 있어요.`);
      }
    }
    if (it.width !== null && it.width > v.maxWidthPx) {
      push("error", "too_wide", `해상도가 너무 높아요(가로 ${v.maxWidthPx}px까지). 1080p 로 내보내 다시 올려 주세요.`);
    }
    if (it.fps !== null) {
      if (it.fps > v.maxFps + 0.5) push("error", "fps_high", `초당 ${v.maxFps}프레임까지 올릴 수 있어요(슬로 모션 원본은 안 돼요).`);
      else if (it.fps < v.minFpsWarn - 0.5) push("warning", "fps_low", `프레임 수가 낮아 거절될 수 있어요(초당 ${v.minFpsWarn}프레임 이상 권장).`);
    }
    if (it.videoCodec !== null && !v.videoCodecs.includes(it.videoCodec)) {
      push("error", "video_codec", "이 영상 형식은 올릴 수 없어요. 휴대폰 기본 카메라나 편집 앱에서 MP4·MOV 로 내보낸 영상만 돼요.");
    }
    if (it.audioCodec !== null && !v.audioCodecs.includes(it.audioCodec)) {
      push("error", "audio_codec", "소리 형식이 맞지 않아요(AAC 만 돼요). 편집 앱에서 다시 내보내 주세요.");
    }
    if (it.audioChannels !== null && it.audioChannels > v.maxAudioChannels) {
      push("error", "audio_channels", "소리 채널이 너무 많아요(스테레오까지).");
    }
    if (it.audioSampleRate !== null && it.audioSampleRate > v.maxAudioSampleRate) {
      push("error", "audio_rate", "소리 샘플레이트가 너무 높아요(48kHz까지).");
    }
    if (it.bytes !== null && it.durationMs !== null && it.durationMs > 0) {
      const bps = (it.bytes * 8) / (it.durationMs / 1000);
      if (v.maxBitrateBps !== null && bps > v.maxBitrateBps) {
        push("error", "bitrate_high", "화질(비트레이트)이 너무 높아요. 편집 앱에서 조금 낮춰 내보내 주세요.");
      } else if (v.warnBitrateBps !== null && bps > v.warnBitrateBps) {
        push("warning", "bitrate_high", `화질(비트레이트)이 높아 ${subject(label)} 거절할 수 있어요.`);
      }
    }
  });

  return issues;
}

/** error 가 하나라도 있는가 — 저장 관문 */
export function hasBlockingIssue(issues: MediaIssue[]): boolean {
  return issues.some((i) => i.severity === "error");
}

/**
 * 글·미디어 조합 검사 — 채널 규칙의 글 쪽. 스토리는 글이 올라가지 않으므로 글을 요구하지 않는다.
 * 반환 null = 통과.
 */
export function validatePostText(channel: string, surface: IgSurface | null, caption: string, mediaCount: number): string | null {
  const rules = channelRules(channel);
  const text = caption.trim();
  const story = channel === "instagram" && surface === "story";
  if (story) return null;
  if (rules.requiresText && !text) return `${object(rules.textLabel)} 입력해 주세요.`;
  if (!text && mediaCount === 0) return "내용을 입력해 주세요.";
  if (text.length > rules.textMax) return `${topic(rules.textLabel)} ${rules.textMax}자까지 쓸 수 있어요.`;
  return null;
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
