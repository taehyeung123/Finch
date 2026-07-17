import type { MetadataRoute } from "next";

/** 공개 페이지만 포함 (PRD PART 13.2) — 새 공개 페이지 추가 시 여기에도 등록한다 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://finch.ai.kr";
  const now = new Date();
  return [
    { url: `${base}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/instagram`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${base}/instagram/auto-dm`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/instagram/visitor-check`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${base}/tiktok`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${base}/threads`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${base}/pricing`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/brand`, lastModified: now, changeFrequency: "monthly", priority: 0.4 },
    { url: `${base}/signup`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${base}/login`, lastModified: now, changeFrequency: "monthly", priority: 0.3 },
    { url: `${base}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
    { url: `${base}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
  ];
}
