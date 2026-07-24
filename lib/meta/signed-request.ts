import crypto from "node:crypto";

/**
 * Meta 서명된 요청(signed_request) 파싱 — 앱 제거(Deauthorize)·데이터 삭제 요청 콜백에서 쓴다.
 * 포맷: "<base64url(HMAC-SHA256 서명)>.<base64url(JSON payload)>"
 * 참고: https://developers.facebook.com/docs/development/create-an-app/threads-use-case/
 */

function base64UrlDecode(input: string): Buffer {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(padded, "base64");
}

export interface SignedRequestPayload {
  algorithm: string;
  issued_at?: number;
  user_id?: string;
  [key: string]: unknown;
}

/**
 * 서명 검증 — 실패·포맷 오류면 null. appSecret은 이 요청을 보낸 제품의 앱 시크릿
 * (예: Threads 콜백이면 THREADS_APP_SECRET) — 메인 앱 시크릿과 다를 수 있다.
 */
export function parseSignedRequest(signedRequest: string, appSecret: string): SignedRequestPayload | null {
  const parts = signedRequest.split(".");
  if (parts.length !== 2) return null;
  const [encodedSig, encodedPayload] = parts;

  let payload: SignedRequestPayload;
  try {
    payload = JSON.parse(base64UrlDecode(encodedPayload).toString("utf8")) as SignedRequestPayload;
  } catch {
    return null;
  }
  if (payload.algorithm !== "HMAC-SHA256") return null;

  const expectedSig = crypto.createHmac("sha256", appSecret).update(encodedPayload).digest();
  const actualSig = base64UrlDecode(encodedSig);
  if (expectedSig.length !== actualSig.length || !crypto.timingSafeEqual(expectedSig, actualSig)) {
    // 변조되었거나 다른 시크릿으로 서명된 요청
    return null;
  }
  return payload;
}
