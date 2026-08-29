import type { MetadataRoute } from "next";

/*
  공개 페이지만 포함 (PRD PART 13.2) — 새 공개 페이지 추가 시 여기에도 등록한다.

  ⚠️ lastModified 에 `new Date()` 를 쓰지 않는다(2026-08-29 네이버 색인 점검).
  빌드 시각이 박히면 **배포할 때마다 13개 전 페이지가 «방금 수정됨»** 으로 나가고,
  하루에도 여러 번 배포하는 우리 리듬에서는 수집기가 이 값을 통째로 신뢰하지 않게 된다
  (실제로 바뀐 페이지를 먼저 다시 읽어 달라는 신호가 죽는다).
  내용이 실제로 바뀐 날짜만 손으로 갱신한다 — 문구·섹션을 고쳤을 때만.
*/
const D = (iso: string) => new Date(`${iso}T00:00:00Z`);

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://finch.ai.kr";
  return [
    { url: `${base}/`, lastModified: D("2026-08-29"), changeFrequency: "weekly", priority: 1 },
    { url: `${base}/instagram`, lastModified: D("2026-08-24"), changeFrequency: "weekly", priority: 0.9 },
    { url: `${base}/instagram/auto-dm`, lastModified: D("2026-08-24"), changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/instagram/visitor-check`, lastModified: D("2026-08-24"), changeFrequency: "monthly", priority: 0.7 },
    { url: `${base}/reference`, lastModified: D("2026-08-24"), changeFrequency: "weekly", priority: 0.8 },
    { url: `${base}/tiktok`, lastModified: D("2026-08-24"), changeFrequency: "weekly", priority: 0.8 },
    { url: `${base}/threads`, lastModified: D("2026-08-29"), changeFrequency: "weekly", priority: 0.7 },
    { url: `${base}/pricing`, lastModified: D("2026-08-24"), changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/brand`, lastModified: D("2026-08-24"), changeFrequency: "monthly", priority: 0.4 },
    { url: `${base}/signup`, lastModified: D("2026-08-29"), changeFrequency: "monthly", priority: 0.6 },
    { url: `${base}/login`, lastModified: D("2026-08-29"), changeFrequency: "monthly", priority: 0.3 },
    { url: `${base}/terms`, lastModified: D("2026-08-24"), changeFrequency: "yearly", priority: 0.2 },
    { url: `${base}/privacy`, lastModified: D("2026-08-24"), changeFrequency: "yearly", priority: 0.2 },
  ];
}
