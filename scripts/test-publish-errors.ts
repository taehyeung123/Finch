/**
 * 발행 오류 → 한국어 문구·처리 방식 검증.
 * 실행: node scripts/test-publish-errors.ts  (Node 24 타입 스트리핑)
 */
import {
  ALL_PUBLISH_ERROR_CODES,
  extractIgSubcode,
  isFormatError,
  mapContainerError,
  mapGraphFailure,
  publishError,
  redactSecrets,
} from "../lib/meta/publish-errors.ts";

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

const http = (code: number | null, subcode: number | null = null, httpStatus = 400, message: string | null = null) => ({
  kind: "http" as const,
  httpStatus,
  code,
  subcode,
  message,
});

console.log("문구 규칙 — 모든 코드 × 두 채널");
/* 고객에게 보여도 되는 라틴 문자 토큰(형식·단위 이름) — 이것 말고 영어 단어가 있으면 원문이 샌 것이다 */
const ALLOWED_LATIN = new Set(["MP4", "MOV", "JPG", "JPEG", "PNG", "WEBP", "AAC", "HEVC", "Mbps", "kHz", "px"]);
for (const ch of ["instagram", "threads"]) {
  for (const code of ALL_PUBLISH_ERROR_CODES) {
    const m = publishError(code, ch).message;
    const latin = (m.match(/[A-Za-z][A-Za-z0-9.]*/g) ?? []).filter((w) => !ALLOWED_LATIN.has(w));
    const banned = /컨테이너|API|Graph|그래프|토큰|null|undefined/.test(m);
    const ok = m.length > 0 && /[가-힣]/.test(m) && latin.length === 0 && !banned && !m.endsWith(".") && !/(인스타그램가|스레드이|스레드은|인스타그램는)/.test(m);
    if (!ok) check(`${ch} ${code}: «${m}»`, false, latin);
    else pass++;
  }
}
console.log(`  ✓ ${ALL_PUBLISH_ERROR_CODES.length * 2}개 문구 — 한국어·금지어 없음·마침표 없음·조사 맞음`);

console.log("인스타 하위 코드(2207xxx)");
const ig = (sub: number, phase: "create" | "status" | "publish" = "create") => mapGraphFailure("instagram", phase, http(null, sub));
check("2207026 → 형식(permanent)", ig(2207026).code === "UNSUPPORTED_FORMAT" && ig(2207026).kind === "permanent");
check("2207052 → 파일 못 가져감(recreate)", ig(2207052).code === "MEDIA_FETCH_FAILED" && ig(2207052).kind === "recreate");
check("2207003 → 다운로드 시간 초과(recreate)", ig(2207003).code === "DOWNLOAD_TIMEOUT");
check("2207027 → 아직 처리 중(not_ready)", ig(2207027, "publish").kind === "not_ready");
check("2207042 → 하루 한도(QUOTA)", ig(2207042, "publish").code === "QUOTA");
check("2207050 → 계정 제한", ig(2207050).code === "ACCOUNT_RESTRICTED");
check("2207051 → 스팸", ig(2207051).code === "SPAM");
check("2207057 → 커버 위치", ig(2207057).code === "COVER_OFFSET");
check("2207009 → 비율", ig(2207009).code === "ASPECT_RATIO");
check("2207010 → 글 길이", ig(2207010).code === "CAPTION_TOO_LONG");
check("2207028 → 캐러셀 개수", ig(2207028).code === "CAROUSEL_COUNT");
check("2207006 → 만료(recreate)", ig(2207006).code === "CONTAINER_EXPIRED" && ig(2207006).kind === "recreate");
check("2207020 → 만료(recreate)", ig(2207020).code === "CONTAINER_EXPIRED");
check("2207001 → 일시(transient)", ig(2207001).kind === "transient");
/* 2207008 — 메타 표: 문구는 «없거나 만료», 권고는 «발행 때 일시 오류, 30초~2분 안에 1~2번 다시»(2026-09-12 점검) */
check("2207008 만들기·발행 → 일시(transient, 메타 권고대로 다시)", ig(2207008, "create").kind === "transient" && ig(2207008, "publish").kind === "transient");
check("2207008 상태 읽기 → 만료(그 준비물은 없다 → 새로 만든다)", ig(2207008, "status").code === "CONTAINER_EXPIRED");
check("2207008 준비물 ERROR → 만료", mapContainerError("instagram", { status: "ERROR", subcode: 2207008, detail: null }).code === "CONTAINER_EXPIRED");
check("2207008 원문 속 코드도 상태 읽기면 만료", mapGraphFailure("instagram", "status", http(24, null, 400, "code 2207008")).code === "CONTAINER_EXPIRED");
/* 2207053 — 메타 표 권고 «새 준비물을 만들라» */
check("2207053 만들기 → 일시(다시 만들면 된다)", ig(2207053, "create").kind === "transient");
check("2207053 발행 → 준비물 버림(recreate)", ig(2207053, "publish").kind === "recreate");
check("메시지 속 하위 코드도 읽는다", mapGraphFailure("instagram", "create", http(9004, null, 400, "failed with error code 2207052")).code === "MEDIA_FETCH_FAILED");
check("하위 코드는 5xx 여도 믿는다", mapGraphFailure("instagram", "publish", http(null, 2207042, 500)).code === "QUOTA");

console.log("그래프 코드");
check("190 → 연동 만료(auth)", mapGraphFailure("instagram", "create", http(190)).kind === "auth");
check("10 → 권한(auth)", mapGraphFailure("threads", "create", http(10)).code === "PERMISSION");
check("4·17·32·613 → 잠시 막음(transient)", [4, 17, 32, 613].every((c) => mapGraphFailure("instagram", "publish", http(c)).code === "RATE_LIMITED"));
check("100/33 → 만료", mapGraphFailure("instagram", "status", http(100, 33)).code === "CONTAINER_EXPIRED");
check("9007 → 아직 처리 중", mapGraphFailure("instagram", "publish", http(9007)).kind === "not_ready");
check("352 → 형식", mapGraphFailure("instagram", "create", http(352)).code === "UNSUPPORTED_FORMAT");

console.log("답을 못 받은 발행은 «모름»이다");
check("발행 중 시간 초과 → ambiguous", mapGraphFailure("instagram", "publish", { kind: "timeout", httpStatus: null, code: null, subcode: null, message: null }).kind === "ambiguous");
check("발행 중 네트워크 → ambiguous", mapGraphFailure("threads", "publish", { kind: "network", httpStatus: null, code: null, subcode: null, message: "reset" }).kind === "ambiguous");
check("발행 중 500 → ambiguous", mapGraphFailure("instagram", "publish", http(null, null, 500)).kind === "ambiguous");
check("발행 중 code 2 → ambiguous", mapGraphFailure("instagram", "publish", http(2)).kind === "ambiguous");
check("만들기 중 시간 초과 → transient(모름 아님)", mapGraphFailure("instagram", "create", { kind: "timeout", httpStatus: null, code: null, subcode: null, message: null }).kind === "transient");
check("예산 없어 안 불렀다 → transient", mapGraphFailure("instagram", "publish", { kind: "budget", httpStatus: null, code: null, subcode: null, message: null }).kind === "transient");
check("발행 중 모르는 400 → 확정 거절(permanent)", mapGraphFailure("instagram", "publish", http(999)).kind === "permanent");
check("상태 읽기 중 모르는 400 → transient", mapGraphFailure("instagram", "status", http(999)).kind === "transient");

console.log("준비물 상태 오류");
check("스레드 FAILED_DOWNLOADING_VIDEO", mapContainerError("threads", { status: "ERROR", subcode: null, detail: "FAILED_DOWNLOADING_VIDEO" }).code === "MEDIA_FETCH_FAILED");
check("스레드 INVALID_ASPEC_RATIO(메타 오타)", mapContainerError("threads", { status: "ERROR", subcode: null, detail: "INVALID_ASPEC_RATIO" }).code === "ASPECT_RATIO");
check("스레드 INVALID_ASPECT_RATIO(바른 철자)", mapContainerError("threads", { status: "ERROR", subcode: null, detail: "INVALID_ASPECT_RATIO" }).code === "ASPECT_RATIO");
check("스레드 INVALID_DURATION", mapContainerError("threads", { status: "ERROR", subcode: null, detail: "INVALID_DURATION" }).code === "DURATION");
check("스레드 INVALID_FRAME_RATE", mapContainerError("threads", { status: "ERROR", subcode: null, detail: "INVALID_FRAME_RATE" }).code === "FRAME_RATE");
check("스레드 INVALID_BIT_RATE", mapContainerError("threads", { status: "ERROR", subcode: null, detail: "INVALID_BIT_RATE" }).code === "BITRATE");
check("스레드 INVALID_AUDIO_CHANNEL_LAYOUT", mapContainerError("threads", { status: "ERROR", subcode: null, detail: "INVALID_AUDIO_CHANNEL_LAYOUT" }).code === "AUDIO");
check("스레드 모르는 값 → 처리 실패", mapContainerError("threads", { status: "ERROR", subcode: null, detail: "SOMETHING_NEW" }).code === "CONTAINER_ERROR");
check("인스타 ERROR + 2207026", mapContainerError("instagram", { status: "ERROR", subcode: 2207026, detail: null }).code === "UNSUPPORTED_FORMAT");
check("인스타 ERROR 원문에서 코드", mapContainerError("instagram", { status: "ERROR", subcode: null, detail: "Error: code 2207052" }).code === "MEDIA_FETCH_FAILED");
check("EXPIRED → 만료", mapContainerError("instagram", { status: "EXPIRED", subcode: null, detail: null }).code === "CONTAINER_EXPIRED");
check("하위 코드 추출", extractIgSubcode("status: Error 2207026 foo") === 2207026 && extractIgSubcode("none") === null);

console.log("미리 만들기에서 실패로 확정하는 것은 형식 오류뿐");
check("형식 → 확정", isFormatError(publishError("UNSUPPORTED_FORMAT", "instagram")));
check("한도 → 미룸", !isFormatError(publishError("QUOTA", "instagram")));
check("연동 → 미룸", !isFormatError(publishError("NOT_CONNECTED", "instagram")));
check("파일 못 가져감 → 미룸", !isFormatError(publishError("MEDIA_FETCH_FAILED", "instagram")));

console.log("로그 가림");
const red = redactSecrets("GET https://x/y?fields=a&access_token=EAAB123&z=1 token=abc https://s/sign/p?token=eyJhbGci");
check("access_token 가림", !red.includes("EAAB123") && red.includes("access_token=***"));
check("서명 token 가림", !red.includes("eyJhbGci"));
check("raw 는 가려서 담는다", publishError("TRANSIENT", "instagram", "access_token=SECRET").raw === "access_token=***");

console.log("조사");
check("인스타그램이", publishError("MEDIA_FETCH_FAILED", "instagram").message.startsWith("인스타그램이 "));
check("스레드가", publishError("MEDIA_FETCH_FAILED", "threads").message.startsWith("스레드가 "));

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILED"} — ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
