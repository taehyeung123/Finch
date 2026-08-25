import type { MetadataRoute } from "next";

/**
 * robots.txt 자동 생성 (PRD PART 13.2).
 * 로그인 후 영역은 전부 Disallow — (app) 레이아웃의 noindex와 이중 방어.
 * AI 크롤러는 공개 마케팅 페이지에 한해 허용 (PART 13.3 GEO).
 */
const APP_ROUTES = [
  "/dashboard",
  "/publish",
  "/auto-dm",
  "/links",
  "/insights",
  "/reports",
  "/library",
  "/scrap",
  "/competitors",
  "/studio",
  "/ads",
  "/notifications",
  "/settings",
  "/support",
  "/onboarding",
  // 구 경로 — 리다이렉트 스텁이지만 크롤 대상은 아니다
  "/analyze",
  "/audience",
  "/growth",
  "/discover",
];

/* 프로필 링크의 클릭 집계 경로 — 크롤러가 따라가면 클릭이 기록된다. 앱 경로와 의미가 달라 따로 둔다. */
/* 클릭 집계 경로 — 2026-08-25 주소가 루트로 올라오면서 /p 프리픽스가 빠졌다 */
const TRACKING_ROUTES = ["/*/go/", "/p/*/go/"];

const AI_CRAWLERS = [
  "GPTBot",
  "ChatGPT-User",
  "PerplexityBot",
  "ClaudeBot",
  "anthropic-ai",
  "Google-Extended",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [...APP_ROUTES, ...TRACKING_ROUTES],
      },
      ...AI_CRAWLERS.map((userAgent) => ({
        userAgent,
        allow: "/",
        disallow: [...APP_ROUTES, ...TRACKING_ROUTES],
      })),
    ],
    sitemap: "https://finch.ai.kr/sitemap.xml",
  };
}
