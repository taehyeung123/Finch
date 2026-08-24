import type { Metadata } from "next";
import { pretendard } from "@/lib/fonts";
import "../globals.css";

/*
  /p/* 방문자 페이지 전용 루트 레이아웃 (2026-08-24 지면 분리).

  핀치 앱 루트(app/(finch)/layout.tsx)와 일부러 갈라놨다 — 이 화면은 방문자의
  브랜드 화면이라, 핀치 GA 태그도 finch-theme 다크모드 스크립트도 실으면 안 된다.
  (GA 는 방문자 트래픽을 핀치 계정에 쌓고, 다크 스크립트는 페이지 소유자가 고른
  테마 위에 이 브라우저 주인의 앱 설정을 덮어쓴다.)
  문서 언어는 페이지 설정(settings.lang)을 아는 page.tsx 가 <main lang> 으로 정한다.
*/
export const metadata: Metadata = {
  metadataBase: new URL("https://finch.ai.kr"),
};

export default function PublicRootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" className={`${pretendard.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
