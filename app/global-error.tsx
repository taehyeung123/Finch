"use client";

import { useEffect, type CSSProperties } from "react";
import { FinchMark } from "@/components/logo";
import { scrubEvent } from "@/lib/monitoring/scrub";
import "./globals.css";
import "./_fonts/pretendard/pretendardvariable-dynamic-subset.css";

/*
  루트 레이아웃까지 무너졌을 때의 마지막 화면.

  Next 는 이 경우 <html>/<body> 를 대신 그려 주지 않으므로 직접 그린다. 루트 레이아웃이 둘이라도
  (app/(finch)·app/p) 이 파일 하나가 둘 다 덮는다. 오류는 Sentry 로 보내고, 사람에게는 다시 시도
  버튼 하나만 준다 — 오류 원문·운영 용어는 화면에 내지 않는다(고객 문구 규칙).
  의존을 최소로 둔다: 공용 버튼 컴포넌트가 깨진 원인일 수도 있어서 로고와 토큰 클래스만 쓴다.

  ⚠️ Sentry 는 **정적 import 하지 않는다.** Next 는 이 컴포넌트의 청크를 모든 페이지 HTML 에 미리 싣는다 —
  정적으로 가져오면 브라우저 SDK(gzip 80KB 대)가 방문자 프로필 페이지까지 따라간다(소넷 점검, curl 로 확정).
  오류가 실제로 났을 때만 import() 로 불러와 초기화하고 보낸다. 앱 지면에선 sentry-client.tsx 가 먼저 초기화해 뒀을 수 있다.
*/
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
    if (!dsn) return;
    void import("@sentry/nextjs")
      .then((Sentry) => {
        if (!Sentry.isInitialized()) {
          Sentry.init({
            dsn,
            environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
            tracesSampleRate: 0,
            sendDefaultPii: false,
            beforeSend: (event) => scrubEvent(event),
          });
        }
        Sentry.captureException(error);
      })
      .catch(() => {
        /* 수집기가 못 떠도 화면은 그대로 */
      });
  }, [error]);

  return (
    <html
      lang="ko"
      className="h-full antialiased"
      style={{ ["--font-pretendard" as string]: "'Pretendard Variable'" } as CSSProperties}
    >
      <body className="min-h-full">
        <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-surface px-4 text-center">
          <FinchMark className="size-12 text-primary" />
          <h1 className="text-[20px] font-bold">문제가 생겼어요</h1>
          <p className="max-w-sm break-keep text-[15px] text-fg-sub">
            잠시 후 다시 시도해 주세요. 계속 반복되면 support@finch.ai.kr 로 알려 주세요.
          </p>
          <button
            type="button"
            onClick={() => retry()}
            className="mt-2 rounded-card bg-primary px-4 py-2 text-[14px] font-semibold text-on-primary trans-state hover:opacity-90"
          >
            다시 시도
          </button>
        </main>
      </body>
    </html>
  );
}
