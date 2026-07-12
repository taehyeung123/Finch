import localFont from "next/font/local";

/*
 * Pretendard Variable 자체 호스팅 (next/font/local).
 * jsdelivr CDN <link rel="stylesheet"> 대신 사용 — render-blocking 제거, font-display 제어.
 * 경로는 pretendard@1.3.9 실제 패키지 구조 기준 (public/variable은 ttf만 제공, woff2 풀 버전은 web/variable에 위치).
 */
export const pretendard = localFont({
  src: "../node_modules/pretendard/dist/web/variable/woff2/PretendardVariable.woff2",
  variable: "--font-pretendard",
  display: "swap",
  weight: "45 920",
});
