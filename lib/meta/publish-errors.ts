/**
 * 발행 오류 → 한국어 문구·처리 방식 (2026-09-11 영상 발행).
 *
 * 예전엔 메타 원문("Error validating access token…", "container_error")이 그대로 실패 사유가 되어
 * 목록·알림·결과 모달에 영어가 나갔다. 이제 **고객 문구는 이 파일에서만 만든다** — 원문은 raw 로 로그에만 남긴다.
 * 문구 규칙: 한국어, 끝에 마침표 없음(모달·알림이 « — …» 를 이어 붙인다), «컨테이너»·«API»·«Graph» 같은 말 금지
 * (scripts/test-publish-errors.ts 가 검사한다).
 *
 * kind 가 엔진의 다음 걸음을 정한다:
 *   permanent  사용자가 무언가 바꿔야 한다. 확실히 안 올라갔다
 *   recreate   이번 준비물(메타 쪽 작업)은 죽었다 — 새로 만들면 될 수 있다. 확실히 안 올라갔다
 *   transient  잠시 뒤 다시. 확실히 안 올라갔다
 *   not_ready  발행 시점에 메타가 아직 처리 중(2207027) — 안 올라갔다, 발행 시도 횟수에 세지 않는다
 *   auth       연동 문제. 확실히 안 올라갔다
 *   ambiguous  발행 호출이 끊겼다 — **올라갔는지 모른다**(다시 부르기 전에 반드시 확인한다)
 *
 * 근거: IG error codes 문서(2207xxx), Threads troubleshooting(error_message 값 — INVALID_ASPEC_RATIO 는 메타 쪽 오타 그대로).
 * 이 파일은 런타임 import 가 없다 — Node 검사가 그대로 읽는다.
 */
import type { ContainerCheck, GraphFailure } from "./publish-types";

export type PublishErrorCode =
  | "NOT_CONNECTED"
  | "TOKEN_EXPIRED"
  | "PERMISSION"
  | "LOOKUP_FAILED"
  | "UNSUPPORTED_CHANNEL"
  | "MEDIA_INVALID"
  | "MEDIA_MISSING"
  | "MEDIA_PURGED"
  | "MEDIA_FETCH_FAILED"
  | "DOWNLOAD_TIMEOUT"
  | "UNSUPPORTED_FORMAT"
  | "VIDEO_PROCESSING"
  | "AUDIO"
  | "DURATION"
  | "FRAME_RATE"
  | "BITRATE"
  | "ASPECT_RATIO"
  | "IMAGE_TOO_LARGE"
  | "IMAGE_FORMAT"
  | "CAPTION_TOO_LONG"
  | "TOO_MANY_TAGS"
  | "CAROUSEL_COUNT"
  | "COVER_OFFSET"
  | "QUOTA"
  | "ACCOUNT_RESTRICTED"
  | "SPAM"
  | "RATE_LIMITED"
  | "POST_RETRY_LIMIT"
  | "DAILY_BYTES"
  | "NOT_READY"
  | "CONTAINER_EXPIRED"
  | "CONTAINER_ERROR"
  | "PROCESSING_TIMEOUT"
  | "PUBLISH_AMBIGUOUS"
  | "INTERRUPTED"
  | "INTERRUPTED_LEGACY"
  | "LOST"
  | "ACCOUNT_SWITCHED"
  | "TRANSIENT"
  | "UNKNOWN";

export type PublishErrorKind = "permanent" | "recreate" | "transient" | "not_ready" | "auth" | "ambiguous";

export interface PublishError {
  code: PublishErrorCode;
  kind: PublishErrorKind;
  /** 고객 문구(한국어, 마침표 없음) */
  message: string;
  /** 메타 원문 등 — 로그 전용(토큰 가림) */
  raw: string | null;
}

/* lib/josa.ts 와 같은 규칙의 작은 사본 — 이 파일은 런타임 import 를 하지 않는다 */
function batchim(word: string): boolean {
  const code = word.trim().slice(-1).charCodeAt(0);
  if (!(code >= 0xac00 && code <= 0xd7a3)) return false;
  return (code - 0xac00) % 28 !== 0;
}
const subj = (w: string) => `${w}${batchim(w) ? "이" : "가"}`;

const LABELS: Record<string, string> = { instagram: "인스타그램", threads: "스레드" };
const labelOf = (channel: string) => LABELS[channel] ?? channel;

/** 코드별 기본 처리 방식과 문구. c = 채널 이름(인스타그램·스레드) */
const TABLE: Record<PublishErrorCode, { kind: PublishErrorKind; text: (c: string) => string }> = {
  NOT_CONNECTED: { kind: "auth", text: (c) => `${c} 연동이 끊겼어요 — 설정에서 다시 연동해 주세요` },
  TOKEN_EXPIRED: { kind: "auth", text: (c) => `${c} 연동이 만료됐어요 — 설정에서 다시 연동해 주세요` },
  PERMISSION: { kind: "auth", text: (c) => `${c} 발행 권한이 없어요 — 설정에서 다시 연동해 주세요` },
  LOOKUP_FAILED: { kind: "transient", text: () => "연동 상태를 확인하지 못했어요 — 잠시 후 다시 시도해 주세요" },
  UNSUPPORTED_CHANNEL: { kind: "permanent", text: (c) => `${c} 발행은 아직 지원하지 않아요` },
  MEDIA_INVALID: { kind: "permanent", text: () => "첨부한 파일을 확인하지 못했어요 — 지운 뒤 다시 만들어 주세요" },
  MEDIA_MISSING: { kind: "permanent", text: () => "올린 파일을 찾지 못했어요 — 지운 뒤 다시 만들어 주세요" },
  MEDIA_PURGED: { kind: "permanent", text: () => "영상 파일이 보관 기간이 지나 지워졌어요 — 지운 뒤 다시 만들어 주세요" },
  MEDIA_FETCH_FAILED: { kind: "recreate", text: (c) => `${subj(c)} 파일을 가져가지 못했어요 — 잠시 후 다시 시도해 주세요` },
  DOWNLOAD_TIMEOUT: { kind: "recreate", text: (c) => `${subj(c)} 파일을 받는 데 너무 오래 걸렸어요 — 잠시 후 다시 시도해 주세요` },
  UNSUPPORTED_FORMAT: {
    kind: "permanent",
    text: (c) => `${subj(c)} 이 영상 형식을 받지 않았어요 — 휴대폰 기본 카메라나 편집 앱에서 MP4 로 다시 내보내 주세요`,
  },
  VIDEO_PROCESSING: { kind: "permanent", text: (c) => `${subj(c)} 영상을 처리하지 못했어요 — 다른 파일로 다시 시도해 주세요` },
  AUDIO: { kind: "permanent", text: () => "소리 형식이 맞지 않아요 — 편집 앱에서 AAC 스테레오로 다시 내보내 주세요" },
  DURATION: { kind: "permanent", text: () => "영상 길이가 맞지 않아요 — 길이를 확인하고 다시 올려 주세요" },
  FRAME_RATE: { kind: "permanent", text: () => "프레임 수가 맞지 않아요 — 초당 23~60프레임으로 다시 내보내 주세요" },
  BITRATE: { kind: "permanent", text: () => "화질(비트레이트)이 맞지 않아요 — 편집 앱에서 조금 낮춰 다시 내보내 주세요" },
  ASPECT_RATIO: { kind: "permanent", text: () => "사진·영상 비율이 맞지 않아요 — 비율을 바꿔 다시 올려 주세요" },
  IMAGE_TOO_LARGE: { kind: "permanent", text: () => "사진이 너무 커요 — 더 작은 사진으로 다시 올려 주세요" },
  IMAGE_FORMAT: { kind: "permanent", text: () => "사진 형식을 받지 않았어요 — JPG 사진으로 다시 올려 주세요" },
  CAPTION_TOO_LONG: { kind: "permanent", text: () => "글이 너무 길어요 — 줄여서 다시 만들어 주세요" },
  TOO_MANY_TAGS: { kind: "permanent", text: () => "해시태그나 @태그가 너무 많아요 — 줄여서 다시 만들어 주세요" },
  CAROUSEL_COUNT: { kind: "permanent", text: () => "사진·영상 개수가 맞지 않아요 — 개수를 확인해 주세요" },
  COVER_OFFSET: { kind: "permanent", text: () => "커버로 고른 장면이 영상 길이를 벗어났어요 — 커버를 다시 골라 주세요" },
  QUOTA: { kind: "permanent", text: (c) => `오늘 ${c}에 올릴 수 있는 게시물 수를 다 썼어요 — 내일 다시 시도해 주세요` },
  ACCOUNT_RESTRICTED: {
    kind: "permanent",
    text: (c) => `${c} 계정이 지금 게시물을 올릴 수 없는 상태예요 — ${c} 앱에서 계정 상태를 확인해 주세요`,
  },
  SPAM: { kind: "permanent", text: (c) => `${subj(c)} 스팸으로 의심해 막았어요 — 시간을 두고 내용을 바꿔 다시 시도해 주세요` },
  RATE_LIMITED: { kind: "transient", text: (c) => `요청이 많아 ${subj(c)} 잠시 막았어요 — 잠시 후 다시 시도해 주세요` },
  POST_RETRY_LIMIT: { kind: "permanent", text: () => "같은 게시물을 너무 여러 번 다시 시도했어요 — 하루 뒤 다시 시도해 주세요" },
  DAILY_BYTES: { kind: "permanent", text: () => "오늘 올릴 수 있는 영상 용량을 다 썼어요 — 내일 다시 시도해 주세요" },
  NOT_READY: { kind: "not_ready", text: (c) => `${subj(c)} 아직 처리하고 있어요 — 끝나는 대로 자동으로 올라가요` },
  CONTAINER_EXPIRED: { kind: "recreate", text: () => "준비해 둔 게시물이 만료됐어요 — 다시 시도해 주세요" },
  CONTAINER_ERROR: { kind: "recreate", text: (c) => `${subj(c)} 게시물을 처리하지 못했어요 — 형식을 확인하고 다시 시도해 주세요` },
  PROCESSING_TIMEOUT: {
    /* 사진만인 글도 같은 마감(10분)에 걸린다 — «영상»이라고 하지 않는다. 다시 시도하면 새 처리 창이 열린다(engine-core «처리 창») */
    kind: "permanent",
    text: (c) => `${subj(c)} 게시물을 처리하는 데 너무 오래 걸려요 — 잠시 후 다시 시도해 주세요`,
  },
  PUBLISH_AMBIGUOUS: {
    kind: "ambiguous",
    text: (c) => `올라갔는지 확인하지 못했어요 — ${c}에서 먼저 확인하고, 없으면 지운 뒤 다시 만들어 주세요`,
  },
  INTERRUPTED: { kind: "transient", text: () => "발행이 도중에 끊겼어요 — 다시 시도해 주세요" },
  INTERRUPTED_LEGACY: { kind: "ambiguous", text: () => "발행이 도중에 끊겼어요 — 실제로 올라갔는지 확인한 뒤 다시 시도해 주세요" },
  LOST: { kind: "recreate", text: () => "발행 준비 상태를 잃었어요 — 다시 시도해 주세요" },
  /* 대상 계정이 아닌 계정이 연결돼 있다(2026-09-12 계정 전환). 이 기본 문구는 연동 콜백이 «바꾸는 순간» 멈춘 글에 쓴다 —
     엔진은 계정 이름을 아는 accountSwitchedError 를 쓴다. 다시 예약하면 그 순간 연결된 새 계정이 대상이 된다(account-core) */
  ACCOUNT_SWITCHED: { kind: "permanent", text: () => "계정을 바꿔서 발행하지 못했어요 — 새 계정으로 올리려면 다시 예약해 주세요" },
  TRANSIENT: { kind: "transient", text: (c) => `${c}에 잠시 연결하지 못했어요 — 잠시 후 다시 시도해 주세요` },
  UNKNOWN: { kind: "permanent", text: (c) => `${subj(c)} 게시물을 받지 않았어요 — 잠시 후 다시 시도해 주세요` },
};

/** 코드 → 오류 객체. kind 를 바꿔야 할 때(같은 코드라도 단계에 따라 다를 때)만 둘째 인자를 쓴다 */
export function publishError(code: PublishErrorCode, channel: string, raw: string | null = null, kind?: PublishErrorKind): PublishError {
  const row = TABLE[code];
  return { code, kind: kind ?? row.kind, message: row.text(labelOf(channel)), raw: raw === null ? null : redactSecrets(raw) };
}

/** 모든 코드 — 문구 검사용 */
export const ALL_PUBLISH_ERROR_CODES = Object.keys(TABLE) as PublishErrorCode[];

/** 계정 이름을 문구에 싣기 전에 — «@아이디» 모양만, 길이 제한(적힌 값이 망가졌어도 알림·목록이 이상한 글을 싣지 않게) */
function safeHandle(h: string | null | undefined): string | null {
  const v = (h ?? "").trim();
  return /^@[A-Za-z0-9._]{1,40}$/.test(v) ? v : null;
}

/**
 * 계정 전환 오류 — 글의 대상 계정(예약할 때 연결돼 있던 계정)과 지금 연결된 계정이 다르다(2026-09-12).
 * 계정 이름을 알면 둘 다 말한다(«예약할 때 연결돼 있던 @A 계정이 아니라 지금은 @B 계정이 연결돼 있어요 — …»).
 * attempted = 발행을 **시도한 뒤에** 바뀌었다 — 옛 계정에 올라갔을 수 있는데 지금 토큰으로는 확인할 수 없다(모름, 다시 부르지 않는다).
 */
export function accountSwitchedError(
  channel: string,
  target: string | null | undefined,
  current: string | null | undefined,
  attempted: boolean,
): PublishError {
  const was = safeHandle(target);
  const now = safeHandle(current);
  if (attempted) {
    return {
      code: "PUBLISH_AMBIGUOUS",
      kind: "ambiguous",
      message: `발행을 시도한 뒤 연결된 계정이 바뀌어 올라갔는지 확인하지 못했어요 — ${was ? `${was} 계정` : "이전 계정"}에서 먼저 확인하고, 없으면 지운 뒤 다시 만들어 주세요`,
      raw: "account_switched_after_attempt",
    };
  }
  if (!was && !now) return publishError("ACCOUNT_SWITCHED", channel, "account_switched");
  return {
    code: "ACCOUNT_SWITCHED",
    kind: "permanent",
    message: `예약할 때 연결돼 있던 ${was ? `${was} 계정` : "계정"}이 아니라 지금은 ${now ? `${now} 계정` : "다른 계정"}이 연결돼 있어요 — 새 계정으로 올리려면 다시 예약해 주세요`,
    raw: "account_switched",
  };
}

/** 인스타 2207xxx 하위 코드 표 — 단계에 따라 뜻이 갈리는 것은 igSubcodeError 가 먼저 본다 */
const IG_SUBCODES: Record<number, PublishErrorCode> = {
  2207001: "TRANSIENT",
  2207003: "DOWNLOAD_TIMEOUT",
  2207004: "IMAGE_TOO_LARGE",
  2207005: "IMAGE_FORMAT",
  2207006: "CONTAINER_EXPIRED",
  2207008: "TRANSIENT",
  2207009: "ASPECT_RATIO",
  2207010: "CAPTION_TOO_LONG",
  2207020: "CONTAINER_EXPIRED",
  2207026: "UNSUPPORTED_FORMAT",
  2207027: "NOT_READY",
  2207028: "CAROUSEL_COUNT",
  2207032: "TRANSIENT",
  2207040: "TOO_MANY_TAGS",
  2207042: "QUOTA",
  2207050: "ACCOUNT_RESTRICTED",
  2207051: "SPAM",
  2207052: "MEDIA_FETCH_FAILED",
  2207053: "TRANSIENT",
  2207057: "COVER_OFFSET",
};

/** 스레드 컨테이너 error_message 표 — 문서 철자 그대로(INVALID_ASPEC_RATIO 는 메타의 오타) */
const THREADS_ERRORS: Record<string, PublishErrorCode> = {
  FAILED_DOWNLOADING_VIDEO: "MEDIA_FETCH_FAILED",
  FAILED_PROCESSING_AUDIO: "AUDIO",
  FAILED_PROCESSING_VIDEO: "VIDEO_PROCESSING",
  INVALID_ASPEC_RATIO: "ASPECT_RATIO",
  INVALID_ASPECT_RATIO: "ASPECT_RATIO",
  INVALID_BIT_RATE: "BITRATE",
  INVALID_DURATION: "DURATION",
  INVALID_FRAME_RATE: "FRAME_RATE",
  INVALID_AUDIO_CHANNELS: "AUDIO",
  INVALID_AUDIO_CHANNEL_LAYOUT: "AUDIO",
  UNKNOWN: "CONTAINER_ERROR",
};

/** 원문에서 2207xxx 를 뽑는다(인스타 status 필드 형식이 문서에 없다 — 숫자만 믿는다) */
export function extractIgSubcode(text: string | null | undefined): number | null {
  const m = /\b(2207\d{3})\b/.exec(text ?? "");
  return m ? Number(m[1]) : null;
}

type GraphPhase = "create" | "status" | "publish" | "read";

/**
 * 인스타 하위 코드 → 오류. 표에 없으면 null. 메타 오류 코드 표(2026-09-12 다시 확인)에서 **단계에 따라 뜻이 갈리는** 둘:
 *  · 2207008 «그 준비물이 없거나 만료됐다» — 표의 권고는 «발행 때의 일시 오류, 30초~2분 안에 1~2번 다시»다.
 *    그래서 만들기·발행에서는 일시 오류로 두고 다음 확인에서 다시 부른다(다시 부르기 전에 상태부터 읽는다 — run.ts).
 *    하지만 **상태를 읽을 때** 이 답이 오면 그 준비물은 정말 없다 — 만료로 본다(시도 전이면 새로 만든다, engine-core).
 *    예전엔 상태 읽기에서도 «일시 오류 → 상태 모름»이 되어 죽은 준비물을 처리 마감까지 붙잡고 있었다(2026-09-12 점검).
 *  · 2207053 «알 수 없는 업로드 오류» — 권고가 «새 준비물을 만들라»다. 만들기에서는 다시 만들면 되고(일시 오류),
 *    발행에서 오면 같은 준비물을 또 부르지 않고 버린다(recreate — 확실히 안 올라갔다).
 */
function igSubcodeError(sub: number, phase: GraphPhase, channel: string, raw: string): PublishError | null {
  const code = IG_SUBCODES[sub];
  if (!code) return null;
  if (sub === 2207008 && phase === "status") return publishError("CONTAINER_EXPIRED", channel, raw);
  if (sub === 2207053 && phase === "publish") return publishError("TRANSIENT", channel, raw, "recreate");
  return publishError(code, channel, raw);
}

/**
 * 그래프 호출 실패 → 오류.
 * @param phase create(준비물 만들기)·status(상태 읽기)·publish(발행 호출)·read(링크·목록·한도 — 부가 조회)
 *
 * ⚠️ publish 단계에서 **답을 못 받은** 실패(시간 초과·네트워크·5xx)는 ambiguous 다 — 메타는 받았을 수 있다.
 * 반대로 메타가 4xx 로 **답한** 실패는 거절이 확실하다(안 올라갔다).
 */
export function mapGraphFailure(channel: string, phase: GraphPhase, f: GraphFailure): PublishError {
  const raw = `${phase}:${f.kind}:${f.httpStatus ?? "-"}:${f.code ?? "-"}/${f.subcode ?? "-"} ${f.message ?? ""}`.trim();
  const unsure = () => (phase === "publish" ? publishError("PUBLISH_AMBIGUOUS", channel, raw) : publishError("TRANSIENT", channel, raw));
  if (f.kind === "budget") {
    /* 부르지 않았다 — 확실히 안 올라갔다 */
    return publishError("TRANSIENT", channel, raw);
  }
  if (f.kind === "network" || f.kind === "timeout") return unsure();

  const code = f.code;
  const sub = f.subcode ?? extractIgSubcode(f.message);
  /* 하위 코드는 메타가 이유를 밝힌 확정 답이다 — 5xx 여도 이쪽을 믿는다 */
  const bySub = sub !== null ? igSubcodeError(sub, phase, channel, raw) : null;
  if (bySub) return bySub;
  /* 서버 오류(5xx) — 발행 단계라면 결과를 장담 못 한다 */
  if ((f.httpStatus ?? 0) >= 500) return unsure();
  if (code === 190) return publishError("TOKEN_EXPIRED", channel, raw);
  if (code === 10 || code === 3 || (code !== null && code >= 200 && code <= 299)) return publishError("PERMISSION", channel, raw);
  if (code === 4 || code === 17 || code === 32 || code === 613 || code === 9 || code === 80002) {
    return publishError("RATE_LIMITED", channel, raw);
  }
  if (code === 9004) return publishError("MEDIA_FETCH_FAILED", channel, raw);
  if (code === 9007) return publishError("NOT_READY", channel, raw);
  if (code === 352) return publishError("UNSUPPORTED_FORMAT", channel, raw);
  if (code === 100 && sub === 33) {
    /* «그런 개체가 없다» — 준비물이 지워졌거나(24시간) 다른 계정 것이다 */
    return publishError("CONTAINER_EXPIRED", channel, raw);
  }
  if (code === 1 || code === 2) {
    /* 메타 쪽 일시 오류 — 발행 단계라도 «답을 했다»지만 결과를 장담 못 하는 서버 오류다 */
    return unsure();
  }
  if (phase === "status" || phase === "read") {
    /* 상태를 못 읽은 것이지 실패한 것이 아니다 — 다음 확인에서 다시 본다 */
    return publishError("TRANSIENT", channel, raw);
  }
  return publishError("UNKNOWN", channel, raw);
}

/** 컨테이너가 ERROR·EXPIRED 로 끝났을 때의 오류 */
export function mapContainerError(channel: string, check: ContainerCheck): PublishError {
  const raw = `container:${check.status}:${check.subcode ?? "-"} ${check.detail ?? ""}`.trim();
  if (check.status === "EXPIRED") return publishError("CONTAINER_EXPIRED", channel, raw);
  if (channel === "threads") {
    const key = (check.detail ?? "").trim().toUpperCase();
    const mapped = THREADS_ERRORS[key];
    return publishError(mapped ?? "CONTAINER_ERROR", channel, raw);
  }
  const sub = check.subcode ?? extractIgSubcode(check.detail);
  /* 준비물 자신의 상태가 말한 오류 — 상태 읽기와 같은 뜻으로 읽는다(2207008 = 이 준비물은 없다 → 만료) */
  const bySub = sub !== null ? igSubcodeError(sub, "status", channel, raw) : null;
  return bySub ?? publishError("CONTAINER_ERROR", channel, raw);
}

/**
 * 준비(예약 영상 미리 만들기) 단계에서 **실패로 확정해도 되는** 오류인가 — 형식 오류만.
 * 나머지(한도·일시 오류·연동·파일 못 가져감)는 예약 시각에 본 발행이 다시 시도한다(2026-09-11 점검).
 */
export function isFormatError(e: PublishError): boolean {
  return (
    e.code === "UNSUPPORTED_FORMAT" ||
    e.code === "VIDEO_PROCESSING" ||
    e.code === "AUDIO" ||
    e.code === "DURATION" ||
    e.code === "FRAME_RATE" ||
    e.code === "BITRATE" ||
    e.code === "ASPECT_RATIO" ||
    e.code === "IMAGE_TOO_LARGE" ||
    e.code === "IMAGE_FORMAT" ||
    e.code === "CAPTION_TOO_LONG" ||
    e.code === "TOO_MANY_TAGS" ||
    e.code === "CAROUSEL_COUNT" ||
    e.code === "COVER_OFFSET" ||
    e.code === "MEDIA_INVALID" ||
    e.code === "CONTAINER_ERROR"
  );
}

/** 로그에 실리기 전에 토큰을 가린다 — 서명 URL 의 token=·그래프 access_token= 둘 다 */
export function redactSecrets(s: string): string {
  return s
    .replace(/(access_token=)[^&\s"']+/gi, "$1***")
    .replace(/([?&]token=)[^&\s"']+/gi, "$1***")
    .replace(/("access_token"\s*:\s*")[^"]+/gi, "$1***");
}
