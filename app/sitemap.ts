import type { MetadataRoute } from "next";

/** 공개 페이지만 포함 (PRD PART 13.2) — 새 공개 페이지 추가 시 여기에도 등록한다 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://finch.kr";
  return [
    { url: `${base}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/pricing`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/signup`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${base}/login`, changeFrequency: "monthly", priority: 0.3 },
  ];
}
