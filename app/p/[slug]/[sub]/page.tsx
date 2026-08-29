import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { movedTo, resolveSubSlug } from "../public-page";
import { redirect } from "next/navigation";
import PublicLinkPage, { generateMetadata as pageMetadata, generateViewport as pageViewport } from "../page";

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

/* 사파리 상단바 색 — 부모 페이지 규칙(자식 테마) 재사용 */
export async function generateViewport({ params }: { params: Promise<{ slug: string; sub: string }> }) {
  const { slug, sub } = await params;
  const child = await resolveSubSlug(slug, sub);
  if (!child) return {};
  return pageViewport({ params: Promise.resolve({ slug: child }) });
}

export default async function PublicSubPage({ params }: { params: Promise<{ slug: string; sub: string }> }) {
  const { slug, sub } = await params;
  const child = await resolveSubSlug(slug, sub);
  if (!child) {
    /* 부모 주소가 이사했으면 서브 경로도 따라간다 — 서브 페이지 QR·링크도 인쇄돼 나가 있다.
       302 인 이유는 [slug]/page.tsx 의 같은 자리 주석 참조. */
    const moved = await movedTo(slug);
    if (moved) redirect(`/${moved}/${sub}`);
    notFound();
  }
  /* 데이터는 자식 slug 로, 주소는 방문자가 들어온 표준 주소로 —
     링크·비콘·잠금 쿠키가 `/{부모}/{sub}` 아래에 놓여야 방문자 쿠키(path=`/{부모}`)가 실린다 */
  return PublicLinkPage({ params: Promise.resolve({ slug: child }), urlBase: `${slug}/${sub}` });
}
