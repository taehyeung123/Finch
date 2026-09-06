import * as Sentry from "@sentry/nextjs";

/*
  서버 계측 진입점(Next 파일 규약). 런타임별 Sentry 설정을 불러오고, Next 가 잡은 서버 오류
  (라우트·서버 액션·서버 컴포넌트·크론)를 onRequestError 로 Sentry 에 넘긴다.
  Turbopack 빌드에서는 Sentry 가 빌드 타임 계측을 하지 않고 이 훅에만 의존한다(@sentry/nextjs 타입 주석).
  DSN 이 없으면 각 설정 파일이 enabled:false 로 초기화해 아무것도 보내지 않는다.
*/
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
