import type { NextConfig } from "next";
/* 루트 진입점의 withSentryConfig 는 v11 에서 사라진다(빌드 경고) — 설정 전용 서브패스에서 가져온다 */
import { withSentryConfig } from "@sentry/nextjs/config";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      /* 발행 컴포저(post-composer.tsx)가 이미지를 base64 data URL 로 서버 액션에
         넘긴다. 기본 1MB 로는 사진 한 장도 못 들어간다 — 컴포저가 클라이언트에서
         1440px JPEG 로 축소해 장당 ~1.5MB(base64 ~2MB), 캐러셀 10장이면 ~20MB 라
         25mb 로 잡는다. 컴포저의 축소 상수(MAX_DIMENSION)와 짝이다 — 한쪽만
         바꾸면 저장이 프레임워크 단에서 조용히 막힌다. */
      bodySizeLimit: "25mb",
    },
  },
};

/* 소스맵 업로드는 빌드 시점 값 셋이 다 있을 때만 — 하나라도 없으면 업로드만 건너뛰고 빌드는 그대로 성공한다.
   런타임 오류 수집은 이것과 무관하게 NEXT_PUBLIC_SENTRY_DSN 만으로 동작한다(sentry.*.config.ts). */
const sentryUploadReady = Boolean(process.env.SENTRY_ORG && process.env.SENTRY_PROJECT && process.env.SENTRY_AUTH_TOKEN);

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  /* 로컬 빌드 로그를 어지럽히지 않는다 — CI(Vercel)에서만 플러그인 로그를 낸다 */
  silent: !process.env.CI,
  telemetry: false,
  sourcemaps: { disable: !sentryUploadReady },
  /* 터널 라우트는 쓰지 않는다 — 이벤트마다 Vercel 함수 호출이 붙는다. 대신 proxy.ts CSP connect-src 에 인제스트 오리진을 연다. */
  /* 브라우저 SDK 는 instrumentation-client.ts(전역 파일 규약)가 아니라 앱 레이아웃에서 지연 로드한다
     (components/monitoring/sentry-client.tsx) — 그 파일이 없으니 라우터 전환 훅 경고도 끈다.
     bundleSizeOptimizations / webpack.* 는 Turbopack 빌드에서 조용히 무시된다(Sentry 문서·코드) — 두지 않는다. */
  suppressOnRouterTransitionStartWarning: true,
});
