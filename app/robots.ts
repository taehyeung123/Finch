import type { MetadataRoute } from "next";

/**
 * robots.txt 자동 생성 (PRD PART 13.2).
 * 로그인 후 영역은 전부 Disallow — (app) 레이아웃의 noindex와 이중 방어.
 * AI 크롤러는 공개 마케팅 페이지에 한해 허용 (PART 13.3 GEO).
 */
const APP_ROUTES = [
  "/dashboard",
  "/analyze",
  "/audience",
  "/discover",
  "/competitors",
  "/ads",
  "/studio",
  "/reports",
  "/notifications",
  "/settings",
  "/onboarding",
];

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
        disallow: APP_ROUTES,
      },
      ...AI_CRAWLERS.map((userAgent) => ({
        userAgent,
        allow: "/",
        disallow: APP_ROUTES,
      })),
    ],
    sitemap: "https://finch.kr/sitemap.xml",
  };
}
