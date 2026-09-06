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
  beforeSend: (event) => scrubEvent(event),
});
