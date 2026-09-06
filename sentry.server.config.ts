import * as Sentry from "@sentry/nextjs";
import { scrubEvent } from "@/lib/monitoring/scrub";

/*
  Node 런타임 Sentry — instrumentation.ts 의 register() 가 NEXT_RUNTIME=nodejs 일 때 불러온다.

  - DSN(NEXT_PUBLIC_SENTRY_DSN) 이 없으면 enabled:false — 로컬·데모에서 아무것도 보내지 않는다.
  - 개인정보: sendDefaultPii=false — IP·쿠키·헤더 원문·사용자 식별자를 보내지 않는다.
    거기에 beforeSend 로 메시지·예외 값·extra·브레드크럼 속 메일 주소·토큰 모양을 가린다(lib/monitoring/scrub.ts) —
    console.error 인자에 우리가 직접 넣은 값은 sendDefaultPii 가 못 막는다.
  - console.error → 이벤트: 저장소 곳곳의 console.error(웹훅·크론·액션의 실패 로그)가 코드 수정 없이
    그대로 이벤트가 된다. Vercel 로그에만 흘러가던 것을 한 화면에서 보려는 게 이 연동의 목적이다.
  - 트레이싱은 끈다(tracesSampleRate 0) — 무료 한도(월 오류 5천 건)는 오류에 쓴다.
  - dedupe: Node 기본 통합에는 중복 제거가 없다. 같은 오류가 요청마다 반복되는 핫패스(console.error 루프)가
    한도를 태우지 않게 직전 이벤트와 같은 것은 버린다. Next 가 렌더 오류를 onRequestError 로 넘기면서 console.error 도
    찍는 경우의 «예외 1 + 메시지 1» 쌍은 모양이 달라 여기서 안 합쳐진다 — 운영에서 보이면 beforeSend 로 거른다.
*/
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  tracesSampleRate: 0,
  sendDefaultPii: false,
  integrations: [Sentry.captureConsoleIntegration({ levels: ["error"] }), Sentry.dedupeIntegration()],
  beforeSend: (event) => scrubEvent(event),
});
