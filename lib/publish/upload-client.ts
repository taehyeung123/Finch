/**
 * 발행 사진·영상 올리기(브라우저 → Storage 직접) — 서명 업로드 URL 에 원본 바이트를 한 번 PUT 한다 (2026-09-11 영상 발행).
 *
 * 왜 XHR 인가: fetch 는 올리는 쪽 진행률을 못 준다. 300MB 영상이 몇 분 걸리는데 막대가 안 움직이면 멈춘 줄 안다.
 * 왜 multipart 가 아닌가: storage-js 의 uploadToSignedUrl 은 Blob 을 FormData 로 싸서 보낸다. 원본 바이트를 그대로 보내면
 * 저장소가 content-type 헤더를 그 객체의 형식으로 기록한다 — 서버 확인(finalize)이 그 값을 발급 때 정한 형식과 대조한다.
 *
 * 순서: 발급(createPublishUploads, 서버 액션) → 여기(PUT) → 확인(finalizePublishUploads, 서버 액션).
 * 확인은 이 모듈이 부르지 않는다 — lib 가 app 의 서버 액션을 끌어오지 않게, 부르는 쪽(use-media-tiles)이 묶어서 부른다.
 *
 * 브라우저 전용(XMLHttpRequest). 서버에서 부르지 않는다.
 */
import type { PublishMime } from "../publish-rules";
import type { PublishUploadTicket } from "./upload-types";

export type PutResult =
  | { ok: true }
  | { ok: false; reason: "aborted" | "network" | "too_large" | "expired" | "exists" | "rejected"; status?: number };

/** 이 시간 동안 진행이 한 번도 없으면 끊긴 것으로 본다(xhr.timeout 은 0 — 큰 영상은 몇 분이 정상이다) */
const STALL_MS = 60_000;
/** 다 보낸 뒤 응답을 기다리는 상한 — 저장소가 큰 파일을 받아 적는 시간. 진행 감시는 100% 에서 끈다(그 뒤엔 진행 이벤트가 없다) */
const RESPONSE_WAIT_MS = 180_000;
const RETRY_DELAY_MS = 1_500;

/** 우리 Supabase 오리진 — 발급된 URL 이 여기가 아니면 보내지 않는다(바이트·공개 키를 엉뚱한 곳에 싣지 않는다) */
function supabaseOrigin(): string | null {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin;
  } catch {
    return null;
  }
}

/** 저장소 오류는 HTTP 400 에 본문 statusCode 로 진짜 코드를 싣는 경우가 많다 — 본문 값을 먼저 본다(scripts/test-upload-client.ts) */
export function classifyPutResponse(httpStatus: number, body: string): PutResult {
  let code = httpStatus;
  let text = body;
  try {
    const j = JSON.parse(body) as { statusCode?: unknown; error?: unknown; message?: unknown };
    const n = Number(j.statusCode);
    if (Number.isFinite(n) && n >= 100) code = n;
    text = `${String(j.error ?? "")} ${String(j.message ?? "")}`;
  } catch {
    /* 본문이 JSON 이 아니다 — HTTP 코드와 원문으로 가른다 */
  }
  if (code >= 200 && code < 300 && httpStatus >= 200 && httpStatus < 300) return { ok: true };
  if (code === 409 || ((code === 400 || httpStatus === 400) && /exist|duplicate/i.test(text))) return { ok: false, reason: "exists", status: code };
  if (code === 413 || /too large|maximum allowed size/i.test(text)) return { ok: false, reason: "too_large", status: code };
  if ((code === 400 || code === 401 || code === 403) && /signature|expired|jwt|token/i.test(text)) return { ok: false, reason: "expired", status: code };
  /* 429(요청 과다)·5xx·연결 끊김은 잠시 뒤 다시 하면 되는 쪽이다 */
  if (code === 429 || code >= 500 || httpStatus >= 500 || httpStatus === 0) return { ok: false, reason: "network", status: code };
  return { ok: false, reason: "rejected", status: code };
}

/** 서명 업로드 URL 로 원본 바이트를 PUT — 진행률이 나온다. abort() 는 언제 불러도 안전하다 */
export function putSignedUpload(args: {
  uploadUrl: string;
  body: Blob;
  contentType: PublishMime;
  onProgress?: (loaded: number, total: number) => void;
}): { done: Promise<PutResult>; abort: () => void } {
  const origin = supabaseOrigin();
  let target: URL | null = null;
  try {
    target = new URL(args.uploadUrl);
  } catch {
    target = null;
  }
  if (!origin || !target || target.origin !== origin) {
    return { done: Promise.resolve({ ok: false, reason: "rejected" }), abort: () => {} };
  }

  const xhr = new XMLHttpRequest();
  let settled = false;
  let resolveDone: (r: PutResult) => void = () => {};
  const done = new Promise<PutResult>((resolve) => {
    resolveDone = resolve;
  });
  let watchdog: ReturnType<typeof setTimeout> | null = null;
  const settle = (r: PutResult) => {
    if (settled) return;
    settled = true;
    if (watchdog) clearTimeout(watchdog);
    resolveDone(r);
  };
  const arm = (ms: number) => {
    if (watchdog) clearTimeout(watchdog);
    watchdog = setTimeout(() => {
      /* 끊긴 연결 — 끊고 «네트워크»로 닫는다(호출측이 한 번 다시 올린다) */
      settle({ ok: false, reason: "network" });
      try {
        xhr.abort();
      } catch {
        /* 이미 닫혔다 */
      }
    }, ms);
  };

  xhr.open("PUT", target.toString());
  xhr.setRequestHeader("content-type", args.contentType);
  xhr.setRequestHeader("cache-control", "max-age=3600");
  /* 공개 키 — 게이트웨이가 요구하는지는 실측 전이다(보내도 해가 없다). Authorization 은 보내지 않는다 — 서명 토큰이 권한이다.
     x-upsert 도 보내지 않는다 — 덮어쓰기 여부는 발급 때 토큰에 이미 정해져 있다. */
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (anon) xhr.setRequestHeader("apikey", anon);
  xhr.upload.onprogress = (e) => {
    const total = e.lengthComputable ? e.total : args.body.size;
    args.onProgress?.(e.loaded, total);
    arm(e.loaded >= total ? RESPONSE_WAIT_MS : STALL_MS);
  };
  xhr.upload.onload = () => arm(RESPONSE_WAIT_MS);
  xhr.onload = () => settle(classifyPutResponse(xhr.status, typeof xhr.responseText === "string" ? xhr.responseText : ""));
  xhr.onerror = () => settle({ ok: false, reason: "network" });
  xhr.onabort = () => settle({ ok: false, reason: "aborted" });
  arm(STALL_MS);
  xhr.send(args.body);

  return {
    done,
    abort: () => {
      if (settled) return;
      settle({ ok: false, reason: "aborted" });
      try {
        xhr.abort();
      } catch {
        /* 이미 닫혔다 */
      }
    },
  };
}

/** 사용자 문구 — 저장소·HTTP 용어를 쓰지 않는다 */
const TEXT: Record<Exclude<PutResult, { ok: true }>["reason"], { error: string; retryable: boolean }> = {
  aborted: { error: "올리기를 멈췄어요.", retryable: true },
  network: { error: "올리지 못했어요 — 연결을 확인하고 다시 올려 주세요.", retryable: true },
  too_large: { error: "파일이 너무 커요.", retryable: false },
  expired: { error: "업로드 시간이 지났어요 — 다시 올려 주세요.", retryable: true },
  exists: { error: "이미 올라간 파일이에요 — 다시 올려 주세요.", retryable: true },
  rejected: { error: "이 파일은 올릴 수 없어요.", retryable: false },
};

/**
 * 발급받은 자리 하나에 올린다. 네트워크로 끊기면 1.5초 쉬고 **같은 URL 로 한 번 더** 올린다 —
 * 그 재시도가 «이미 있음»이면 첫 시도가 사실은 들어간 것이다(응답만 잃었다) → 성공으로 본다(확인 단계가 크기·형식을 다시 본다).
 * 확인(finalize)은 부르는 쪽 몫이다.
 */
export async function uploadToTicket(args: {
  ticket: Extract<PublishUploadTicket, { ok: true }>;
  body: Blob;
  onProgress?: (loaded: number, total: number) => void;
  signal: AbortSignal;
}): Promise<{ ok: true } | { ok: false; aborted: boolean; error: string; retryable: boolean }> {
  const attempt = async (): Promise<PutResult> => {
    if (args.signal.aborted) return { ok: false, reason: "aborted" };
    const put = putSignedUpload({ uploadUrl: args.ticket.uploadUrl, body: args.body, contentType: args.ticket.contentType, onProgress: args.onProgress });
    const onAbort = () => put.abort();
    args.signal.addEventListener("abort", onAbort);
    try {
      return await put.done;
    } finally {
      args.signal.removeEventListener("abort", onAbort);
    }
  };

  let r = await attempt();
  if (!r.ok && r.reason === "network" && !args.signal.aborted) {
    await new Promise((res) => setTimeout(res, RETRY_DELAY_MS));
    r = await attempt();
  }
  if (r.ok) return { ok: true };
  /* 첫 시도에서 «이미 있음»이어도 같다 — 경로는 서버가 이번에 새로 만든 것이라 거기 있는 건 우리가 보낸 바이트뿐이다 */
  if (r.reason === "exists") return { ok: true };
  if (r.reason === "aborted") return { ok: false, aborted: true, ...TEXT.aborted };
  return { ok: false, aborted: false, ...TEXT[r.reason] };
}
