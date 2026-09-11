/**
 * 직접 업로드 응답 판정 검증 — lib/publish/upload-client.ts classifyPutResponse (2026-09-11 영상 발행).
 * 실행: node scripts/test-upload-client.ts  (Node 24 타입 스트리핑)
 *
 * 저장소(Supabase Storage)는 오류를 HTTP 400 에 싣고 **본문 statusCode** 로 진짜 코드를 알려 주는 경우가 많다.
 * HTTP 코드만 보면 «이미 있음»(= 첫 시도가 사실 들어갔다)·«너무 큼»·«토큰 만료»가 전부 «거절»로 뭉쳐,
 * 들어간 파일을 실패로 말하거나 다시 올리면 되는 것을 못 올린다고 말하게 된다.
 */
import { classifyPutResponse } from "../lib/publish/upload-client.ts";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, got?: unknown) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.error(`  ✗ ${name}${got !== undefined ? ` — got ${JSON.stringify(got)}` : ""}`);
  }
}
const reason = (status: number, body: string) => {
  const r = classifyPutResponse(status, body);
  return r.ok ? "ok" : r.reason;
};
const j = (o: unknown) => JSON.stringify(o);

check("200 → ok", reason(200, j({ Key: "publish-media/u/a.mp4", Id: "x" })) === "ok");
check("200 빈 본문 → ok", reason(200, "") === "ok");
check("400 + statusCode 409 Duplicate → exists", reason(400, j({ statusCode: "409", error: "Duplicate", message: "The resource already exists" })) === "exists");
check("409 → exists", reason(409, "") === "exists");
check("400 + «already exists» 문구 → exists", reason(400, j({ error: "x", message: "The resource already exists" })) === "exists");
check(
  "400 + statusCode 413 → too_large",
  reason(400, j({ statusCode: "413", error: "Payload too large", message: "The object exceeded the maximum allowed size" })) === "too_large",
);
check("413 → too_large", reason(413, "") === "too_large");
check("400 + invalid signature → expired", reason(400, j({ statusCode: "400", error: "InvalidSignature", message: "invalid signature" })) === "expired");
check("400 + statusCode 403 jwt expired → expired", reason(400, j({ statusCode: "403", error: "Unauthorized", message: "jwt expired" })) === "expired");
check("401 token → expired", reason(401, j({ message: "Invalid token" })) === "expired");
check("429 → network(다시 하면 된다)", reason(429, "") === "network");
check("400 + statusCode 429 → network", reason(400, j({ statusCode: "429", error: "too many requests" })) === "network");
check("«rate limit exceeded» 는 too_large 가 아니다", reason(400, j({ statusCode: "429", message: "rate limit exceeded" })) === "network");
check("500 → network", reason(500, "oops") === "network");
check("502 HTML → network", reason(502, "<html>bad gateway</html>") === "network");
check("0(연결 끊김) → network", reason(0, "") === "network");
check("400 + mime 거절 → rejected", reason(400, j({ statusCode: "415", error: "invalid_mime_type", message: "mime type video/webm is not supported" })) === "rejected");
check("403 권한 → rejected", reason(403, j({ statusCode: "403", error: "Unauthorized", message: "new row violates row-level security policy" })) === "rejected");
check("본문이 JSON 이 아니어도 죽지 않는다", reason(400, "not json") === "rejected");

console.log(`\n${pass} 통과 · ${fail} 실패`);
if (fail > 0) process.exit(1);
