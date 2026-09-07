import * as Sentry from "@sentry/nextjs";
import { scrubEvent } from "@/lib/monitoring/scrub";

/*
  Edge 런타임 Sentry — instrumentation.ts 의 register() 가 NEXT_RUNTIME=edge 일 때 불러온다.
  지금 edge 로 도는 코드는 없지만(proxy.ts 도 Next 16 에선 Node), 나중에 하나라도 생기면 조용히 빠지지 않게 둔다.
  설정은 서버와 같다 — DSN 없으면 꺼짐, 개인정보 미전송, 트레이싱 없음.
*/
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  tracesSampleRate: 0,
  sendDefaultPii: false,
  /* ⚠️ sendDefaultPii:false 로는 **쿠키·헤더가 안 막힌다.** SDK v10 부터 그 수집은 dataCollection 이 따로
     관장하고 기본값이 켜짐이다(@sentry/core types/datacollection.d.ts:27-38). 끄지 않으면 서버 오류 하나마다
     로그인 세션 쿠키(sb-*-auth-token) 원문이 통째로 외부로 나가고, 그걸 본 사람은 그 사용자로 로그인할 수 있다.
     본문(httpBodies)도 비운다 — 서버 액션 본문에 무엇이 실릴지 우리가 다 알 수 없다(2026-09-07 감사). */
  dataCollection: {
    cookies: false,
    httpHeaders: { request: false, response: false },
    httpBodies: [],
  },
  beforeSend: (event) => scrubEvent(event),
});
