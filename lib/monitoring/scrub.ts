/*
  Sentry 로 나가기 전 비식별화.

  sendDefaultPii=false 는 Sentry 가 **스스로** 모으는 IP·헤더·쿠키만 막는다. console.error 인자와 예외 메시지에
  우리가 직접 넣은 값 — 메일 주소, 토큰, 키 — 는 그대로 나간다(소넷 점검: Resend 오류 메시지가 수신자 주소를
  되돌려준다). 그래서 이벤트의 사람이 읽는 자리(메시지·예외 값·extra·브레드크럼·요청 URL)를 훑어 모양으로 가린다.
  서버·엣지·브라우저 init 이 전부 같은 함수를 쓴다. 의존 없음 — 클라이언트 번들에도 들어간다.
*/
const PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  /* 쿼리스트링에 실린 비밀 — **이름으로** 자른다. 값의 모양을 보고 자르는 아래 규칙들보다 먼저 돌아야
     한다(짧은 인가 코드·서명처럼 «비밀처럼 안 생긴» 값도 이름만으로 걸린다).
     Graph 호출은 토큰을 URL 에 담고(`?access_token=…`), OAuth 콜백 URL 에는 code 가 실린다.
     init 에서 아웃고잉 브레드크럼 자체를 껐지만, 예외 메시지·request.url 로도 같은 문자열이 흘러올 수 있다. */
  [
    /([?&](?:access_token|refresh_token|client_secret|app_secret|appsecret_proof|code|id_token|token|secret|api_?key|signature|sig|password|pepper)=)[^&\s"'<>]+/gi,
    "$1[redacted]",
  ],
  [/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]"],
  [/\bBearer\s+[A-Za-z0-9\-._~+/]+=*/g, "Bearer [token]"],
  /* Meta 사용자·페이지 토큰 접두, JWT 3분절, 토스·Resend·Anthropic 키 접두 */
  [/\bEAA[A-Za-z0-9]{20,}/g, "[meta-token]"],
  [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, "[jwt]"],
  [/\bsk-ant-[A-Za-z0-9_-]{16,}/g, "[key]"],
  [/\b(?:live|test)_(?:sk|ck|gsk|gck)_[A-Za-z0-9_]{12,}/g, "[key]"],
  [/\bre_[A-Za-z0-9_]{16,}/g, "[key]"],
  /* 긴 base64 덩어리(암호화된 토큰·서비스 키·data URL 본문). UUID(36자·하이픈)와 32자 해시는 걸리지 않는다 */
  [/\b[A-Za-z0-9+/]{48,}={0,2}/g, "[secret]"],
];

export function scrubText(s: string): string {
  let out = s;
  for (const [re, rep] of PATTERNS) out = out.replace(re, rep);
  return out;
}

function scrubUnknown(v: unknown, depth: number): unknown {
  if (typeof v === "string") return scrubText(v);
  if (depth >= 6 || v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map((x) => scrubUnknown(x, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) out[k] = scrubUnknown(val, depth + 1);
  return out;
}

/** 값 트리를 훑어 문자열만 가린다 — extra·breadcrumb data 처럼 «사람이 넣은 데이터» 자리에만 쓴다(깊이 6) */
export function scrubDeep<T>(v: T): T {
  return scrubUnknown(v, 0) as T;
}

interface ScrubbableEvent {
  message?: string;
  logentry?: { message?: string; params?: unknown[] };
  exception?: { values?: Array<{ value?: string }> };
  extra?: Record<string, unknown>;
  breadcrumbs?: Array<{ message?: string; data?: Record<string, unknown> }>;
  request?: {
    url?: string;
    query_string?: unknown;
    data?: unknown;
    /** ⚠️ 여기에 **세션 쿠키 원문**이 들어온다 — 아래에서 통째로 지운다 */
    cookies?: unknown;
    headers?: Record<string, unknown>;
  };
  tags?: Record<string, unknown>;
}

/**
 * Sentry beforeSend 용 — 이벤트의 사람이 읽는 자리만 골라 가린다(제자리 수정).
 * 이벤트 전체를 재귀로 복사하지 않는 이유: sdkProcessingMetadata 같은 내부 필드에 순환·대형 객체가 들어 있다.
 */
export function scrubEvent<E extends ScrubbableEvent>(event: E): E {
  if (typeof event.message === "string") event.message = scrubText(event.message);
  if (event.logentry) {
    if (typeof event.logentry.message === "string") event.logentry.message = scrubText(event.logentry.message);
    if (event.logentry.params) event.logentry.params = scrubDeep(event.logentry.params);
  }
  for (const ex of event.exception?.values ?? []) {
    if (typeof ex.value === "string") ex.value = scrubText(ex.value);
  }
  if (event.extra) event.extra = scrubDeep(event.extra);
  if (event.tags) event.tags = scrubDeep(event.tags);
  for (const b of event.breadcrumbs ?? []) {
    if (typeof b.message === "string") b.message = scrubText(b.message);
    if (b.data) b.data = scrubDeep(b.data);
  }
  if (event.request) {
    /* ⚠️ 쿠키·헤더는 **가리는 게 아니라 지운다.** 여기 sb-<project>-auth-token(로그인 세션 전체)이 들어오고,
       그걸 본 사람은 그 사용자로 로그인할 수 있다. sendDefaultPii:false 는 이걸 막지 않는다 —
       SDK v10 에서 쿠키·헤더 수집은 dataCollection 이 따로 관장하고 기본값이 켜짐이다
       (node_modules/@sentry/core/build/types/types/datacollection.d.ts:27-38). init 에서도 끄지만,
       옵션 이름이 바뀌거나 다른 경로로 실려도 여기서 한 번 더 잘린다(2026-09-07 감사). */
    delete event.request.cookies;
    delete event.request.headers;
    if (typeof event.request.url === "string") event.request.url = scrubText(event.request.url);
    if (event.request.query_string !== undefined) event.request.query_string = scrubDeep(event.request.query_string);
    if (event.request.data !== undefined) event.request.data = scrubDeep(event.request.data);
  }
  return event;
}
