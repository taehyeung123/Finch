"use client";

import { useEffect } from "react";
import { scrubEvent } from "@/lib/monitoring/scrub";

/*
  브라우저 Sentry — **앱 루트 레이아웃(app/(finch)/layout.tsx)에서만** 마운트한다.

  왜 instrumentation-client.ts(전역 파일 규약)를 안 쓰나: 그 파일은 루트 청크에 들어가 방문자 프로필 페이지
  (/{slug})에도 실린다. 오류 전용 브라우저 SDK 만으로도 gzip 20KB 대라, 2MB 폰트를 분할본으로 바꿔 가며
  지켜 온 방문자 첫 화면에 그대로 얹힌다. 방문자 페이지의 서버 쪽 오류(액션·라우트)는 서버 SDK 가 잡는다.

  하이드레이션 뒤 dynamic import 로 불러오므로 앱 첫 화면 시간에도 안 걸린다. 대신 초기화 전 몇백 ms 사이의
  오류는 놓친다 — 감수한다. DSN 이 없으면 import 자체를 안 해 청크를 받지도 않는다.
  구성은 서버와 같다: 리플레이·트레이싱 없음, 개인정보 미전송.
*/
export function SentryClient() {
  useEffect(() => {
    const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
    if (!dsn) return;
    void import("@sentry/nextjs")
      .then((Sentry) => {
        if (Sentry.isInitialized()) return;
        Sentry.init({
          dsn,
          environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
          tracesSampleRate: 0,
          sendDefaultPii: false,
          /* 쿠키·헤더 수집은 sendDefaultPii 가 아니라 이 옵션이 관장하고 기본이 켜짐이다(SDK v10).
             브라우저 쪽 세션 쿠키는 httpOnly 라 JS 가 못 읽지만, 서버와 같은 규칙을 두어 설정이 갈리지 않게 한다. */
          dataCollection: {
            cookies: false,
            httpHeaders: { request: false, response: false },
            httpBodies: [],
          },
          beforeSend: (event) => scrubEvent(event),
        });
      })
      .catch(() => {
        /* 오류 수집기가 못 떠도 앱은 그대로 — 조용히 넘어간다 */
      });
  }, []);
  return null;
}
