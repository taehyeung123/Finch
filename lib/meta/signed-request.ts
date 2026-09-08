import crypto from "node:crypto";
import { consoleErrorThrottled } from "@/lib/monitoring/log-throttle";

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
 * 신선도 창 — 이 시간을 넘긴 서명은 거절한다.
 *
 * 왜 필요한가 (2026-09-08 보안 감사): 예전엔 `issued_at` 을 **읽지도 않았다.** 인터페이스에 선언만
 * 있고 저장소 전체에서 그 이름이 나오는 곳이 그 한 줄뿐이었다. 즉 만료 개념이 없어서,
 * 한 번 새어 나간 서명 문자열 하나가 **영원히 유효한 명령**이었다:
 *  · 사용자가 연동을 해제 → 그 서명이 어딘가에 기록됨 → 사용자가 다시 연동
 *  · 공격자가 같은 서명을 재전송 → 다시 해제. 원할 때마다, 몇 번이든.
 *  · 같은 서명을 데이터 삭제 콜백에 보내면(서명·시크릿이 같고 payload 검사는 user_id 유무뿐)
 *    «해제» 하나가 «영구 삭제» 권한으로 승격된다.
 * 이 라우트들에는 인증도 횟수 제한도 없다.
 *
 * 10분인 이유: Meta 가 실패한 콜백을 재시도하는 여유는 두되 무기한은 아니게. 미래 방향으로는
 * 60초만 허용한다(서버리스 인스턴스 시계가 조금 앞설 수 있다).
 * ⚠️ 실 자격증명으로 한 번 통과를 확인하기 전에는 이 창을 **더 좁히지 말 것** — 심사관이 «앱 삭제»를
 * 눌렀을 때 거부되면 심사가 반려된다.
 */
export const SIGNED_REQUEST_MAX_AGE_SEC = 600;
const SIGNED_REQUEST_FUTURE_SKEW_SEC = 60;

/**
 * 서명 검증 — 실패·포맷 오류·**신선도 초과**면 null. appSecret은 이 요청을 보낸 제품의 앱 시크릿
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

  /* 신선도. issued_at 은 **서명이 덮는 필드**라 공격자가 지우거나 앞당길 수 없다 —
     그래서 «없으면 통과»가 우회로가 되지 않는다. 다만 없으면 로그를 남긴다:
     조용히 검사가 꺼져 있는 상태를 아무도 모르는 것이 이 결함의 원래 모양이었다. */
  if (typeof payload.issued_at === "number" && Number.isFinite(payload.issued_at)) {
    const ageSec = Math.floor(Date.now() / 1000) - payload.issued_at;
    if (ageSec > SIGNED_REQUEST_MAX_AGE_SEC || ageSec < -SIGNED_REQUEST_FUTURE_SKEW_SEC) {
      consoleErrorThrottled(
        "signed-request.stale",
        10 * 60 * 1000,
        "[signed-request] 신선도 초과로 거절:",
        `age=${ageSec}s`,
      );
      return null;
    }
  } else {
    consoleErrorThrottled(
      "signed-request.no-issued-at",
      60 * 60 * 1000,
      "[signed-request] issued_at 없음 — 신선도 검사를 건너뛰었다(스펙 확인 필요)",
    );
  }

  return payload;
}
