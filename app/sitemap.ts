import type { MetadataRoute } from "next";
import { createAdminClient } from "@/lib/supabase/admin";

/*
  공개 페이지 사이트맵 (PRD PART 13.2) — 마케팅 지면 + 발행된 프로필 링크 페이지.

  ⚠️ lastModified 에 `new Date()` 를 쓰지 않는다(2026-08-29 네이버 색인 점검).
  빌드 시각이 박히면 **배포할 때마다 전 페이지가 «방금 수정됨»** 으로 나가고,
  하루에도 여러 번 배포하는 우리 리듬에서는 수집기가 이 값을 통째로 신뢰하지 않게 된다
  (실제로 바뀐 페이지를 먼저 다시 읽어 달라는 신호가 죽는다).
  아래 날짜는 내용이 실제로 바뀐 날에만 손으로 갱신한다.
*/
const D = (iso: string) => new Date(`${iso}T00:00:00Z`);

/** 한 시간 캐시 — 수집기가 몰려와도 DB 조회는 시간당 한 번이다 */
export const revalidate = 3600;

const STATIC: MetadataRoute.Sitemap = [
  { url: "https://finch.ai.kr/", lastModified: D("2026-08-29"), changeFrequency: "weekly", priority: 1 },
  { url: "https://finch.ai.kr/instagram", lastModified: D("2026-08-24"), changeFrequency: "weekly", priority: 0.9 },
  { url: "https://finch.ai.kr/instagram/auto-dm", lastModified: D("2026-08-24"), changeFrequency: "monthly", priority: 0.8 },
  { url: "https://finch.ai.kr/instagram/visitor-check", lastModified: D("2026-08-24"), changeFrequency: "monthly", priority: 0.7 },
  { url: "https://finch.ai.kr/reference", lastModified: D("2026-08-24"), changeFrequency: "weekly", priority: 0.8 },
  { url: "https://finch.ai.kr/tiktok", lastModified: D("2026-08-24"), changeFrequency: "weekly", priority: 0.8 },
  { url: "https://finch.ai.kr/threads", lastModified: D("2026-08-29"), changeFrequency: "weekly", priority: 0.7 },
  { url: "https://finch.ai.kr/pricing", lastModified: D("2026-08-24"), changeFrequency: "monthly", priority: 0.8 },
  { url: "https://finch.ai.kr/brand", lastModified: D("2026-08-24"), changeFrequency: "monthly", priority: 0.4 },
  { url: "https://finch.ai.kr/signup", lastModified: D("2026-08-29"), changeFrequency: "monthly", priority: 0.6 },
  { url: "https://finch.ai.kr/login", lastModified: D("2026-08-29"), changeFrequency: "monthly", priority: 0.3 },
  { url: "https://finch.ai.kr/terms", lastModified: D("2026-08-24"), changeFrequency: "yearly", priority: 0.2 },
  { url: "https://finch.ai.kr/privacy", lastModified: D("2026-08-24"), changeFrequency: "yearly", priority: 0.2 },
];

/** 사이트맵 하나가 감당할 상한(규격은 5만) — 넘어가면 분할 사이트맵으로 나눈다 */
const MAX_PAGES = 5000;

/**
 * 발행된 프로필 링크 페이지 — 주소는 루트(`finch.ai.kr/{slug}`).
 * 각 페이지의 문서 제목이 «{페이지 이름} | 핀치» 라서, 이 목록이 색인될수록
 * 브랜드 토큰을 단 문서가 늘어난다(2026-08-29 «핀치 검색 노출» 지시의 핵심 레버).
 *
 * 제외: 미발행 · 비밀번호 잠금 · 사용자가 «검색 비노출»로 설정한 페이지.
 * 이 조건은 app/p/[slug]/page.tsx 의 noindex 판정과 같은 규칙이어야 한다 —
 * 사이트맵이 noindex 페이지를 부르면 수집기에 모순된 신호를 준다.
 */
async function publishedPages(): Promise<MetadataRoute.Sitemap> {
  const admin = createAdminClient();
  if (!admin) return [];
  const { data, error } = await admin
    .from("link_pages")
    .select("slug, settings, updated_at")
    .eq("published", true)
    .order("updated_at", { ascending: false })
    .limit(MAX_PAGES);
  /* 조회가 실패하면 마케팅 지면만이라도 온전히 내보낸다 — 사이트맵이 통째로
     깨지면 이미 색인된 페이지까지 신호를 잃는다(실패는 «없음»이 아니다) */
  if (error || !data) return [];
  return data.flatMap((row) => {
    const s = (row.settings ?? {}) as { robots?: string; locked?: boolean };
    if (s.robots === "noindex" || s.locked === true) return [];
    const slug = String(row.slug ?? "");
    if (!/^[a-z0-9-]{1,80}$/.test(slug)) return [];
    const at = row.updated_at ? new Date(String(row.updated_at)) : undefined;
    return [
      {
        url: `https://finch.ai.kr/${slug}`,
        ...(at && !Number.isNaN(at.getTime()) ? { lastModified: at } : {}),
        changeFrequency: "weekly" as const,
        priority: 0.5,
      },
    ];
  });
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return [...STATIC, ...(await publishedPages())];
}
