import type { Metadata } from "next";
import "../globals.css";
import "../_fonts/pretendard/pretendardvariable-dynamic-subset.css";

/*
  /p/* 방문자 페이지 전용 루트 레이아웃 (2026-08-24 지면 분리).

  핀치 앱 루트(app/(finch)/layout.tsx)와 일부러 갈라놨다 — 이 화면은 방문자의
  브랜드 화면이라, 핀치 GA 태그도 finch-theme 다크모드 스크립트도 실으면 안 된다.
  (GA 는 방문자 트래픽을 핀치 계정에 쌓고, 다크 스크립트는 페이지 소유자가 고른
  테마 위에 이 브라우저 주인의 앱 설정을 덮어쓴다.)
  문서 언어는 페이지 설정(settings.lang)을 아는 page.tsx 가 <main lang> 으로 정한다.

  ⚠️ **글꼴은 앱과 다르게 싣는다(2026-08-24 실측).** 앱은 next/font 로 Pretendard Variable
  통짜(2,009KB)를 싣는데, 방문자 페이지에서 그건 너무 무겁다 — 처음 오는 사람이 4G 에서 열면
  글자가 몇 초간 안 나온다. 여기서는 **유니코드 구간별 분할본**(92개, 개당 ~34KB)을 쓴다.
  브라우저가 실제로 쓰는 구간만 내려받아 한글 페이지 기준 100~250KB 로 떨어진다.
  --font-pretendard 를 같은 이름으로 정의해 두면 globals.css(--font-sans)와
  테마 글꼴 스택(lib/links/themes.ts)이 앱과 똑같이 동작한다.
*/
export const metadata: Metadata = {
  metadataBase: new URL("https://finch.ai.kr"),
};

export default function PublicRootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    /* --font-pretendard 는 분할본이 선언하는 이름으로 고정한다 — globals.css(--font-sans)와
       테마 글꼴 스택(lib/links/themes.ts)이 이 변수를 맨 앞에 두고 있어 앱과 똑같이 동작한다 */
    <html
      lang="ko"
      className="h-full antialiased"
      style={{ ["--font-pretendard" as string]: "'Pretendard Variable'" } as React.CSSProperties}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
