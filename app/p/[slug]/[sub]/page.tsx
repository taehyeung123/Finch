import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { resolveSubSlug } from "../public-page";
import PublicLinkPage, { generateMetadata as pageMetadata } from "../page";

/*
  서브 페이지(0060) — /p/{부모slug}/{sub} 를 자식의 전역 slug 로 풀어 **같은 렌더러**를 태운다.
  자식 페이지의 액션·/go·집계는 전부 자식 slug 기준이라 배관 추가가 없다.
  /p/{slug}/go·vcard·dwell 은 리터럴 세그먼트라 항상 이 동적 라우트보다 먼저 매칭된다
  (그 이름들은 sub_slug 예약어로 막아 두었다 — 0060 트리거·createLinkSubpage).
*/

export async function generateMetadata({ params }: { params: Promise<{ slug: string; sub: string }> }): Promise<Metadata> {
  const { slug, sub } = await params;
  const child = await resolveSubSlug(slug, sub);
  if (!child) return { title: "페이지를 찾을 수 없어요", robots: { index: false, follow: false } };
  return pageMetadata({ params: Promise.resolve({ slug: child }) });
}

export default async function PublicSubPage({ params }: { params: Promise<{ slug: string; sub: string }> }) {
  const { slug, sub } = await params;
  const child = await resolveSubSlug(slug, sub);
  if (!child) notFound();
  return PublicLinkPage({ params: Promise.resolve({ slug: child }) });
}
