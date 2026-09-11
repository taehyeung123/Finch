import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import { movedTo, resolveSubSlug } from "../public-page";
import { redirect } from "next/navigation";
import PublicLinkPage, { generateMetadata as pageMetadata, generateViewport as pageViewport } from "../page";

/*
  서브 페이지(0060) — /p/{부모slug}/{sub} 를 자식의 전역 slug 로 풀어 **같은 렌더러**를 태운다.
  자식 페이지의 액션·/go·집계는 전부 자식 slug 기준이라 배관 추가가 없다.
  /p/{slug}/go·vcard·dwell 은 리터럴 세그먼트라 항상 이 동적 라우트보다 먼저 매칭된다
  (그 이름들은 sub_slug 예약어로 막아 두었다 — 0060 트리거·createLinkSubpage).

  창고(ISR) — 부모 페이지(../page.tsx)와 같은 규칙이다. 설정은 **파일마다** 따로 적어야 한다
  (Next 는 각 라우트 파일의 export 만 읽는다 — ../page 에서 import 한 것은 설정이 아니다).
  즉석 경로는 app/p/-live/[slug]/[sub]/page.tsx — live=true 로 이 파일의 함수들을 부른다.
*/
export const dynamic = "force-static";
export const revalidate = 86400;
export function generateStaticParams(): Array<{ slug: string; sub: string }> {
  return [];
}

/* metadata·viewport·본문이 같은 요청에서 세 번 부른다 — 요청 단위로 한 번만 조회 */
const resolve = cache((slug: string, sub: string, live: boolean) => resolveSubSlug(slug, sub, { strict: !live }));

type SubParams = { params: Promise<{ slug: string; sub: string }>; live?: boolean };

export async function generateMetadata({ params, live = false }: SubParams): Promise<Metadata> {
  const { slug, sub } = await params;
  const child = await resolve(slug, sub, live);
  if (!child) return { title: "페이지를 찾을 수 없어요", robots: { index: false, follow: false } };
  /* 데이터는 자식 slug 로, 정본 주소(canonical·og:url)는 방문자가 들어온 `{부모}/{서브}` 로 —
     본문 렌더러가 하는 것과 같은 분리다(쏘넷 점검: 내부 slug 가 정본으로 새어 나갔다) */
  return pageMetadata({ params: Promise.resolve({ slug: child }), urlBase: `${slug}/${sub}`, live });
}

/* 사파리 상단바 색 — 부모 페이지 규칙(자식 테마) 재사용 */
export async function generateViewport({ params, live = false }: SubParams) {
  const { slug, sub } = await params;
  const child = await resolve(slug, sub, live);
  if (!child) return {};
  return pageViewport({ params: Promise.resolve({ slug: child }), live });
}

export default async function PublicSubPage({ params, live = false }: SubParams) {
  const { slug, sub } = await params;
  const child = await resolve(slug, sub, live);
  if (!child) {
    /* 부모 주소가 이사했으면 서브 경로도 따라간다 — 서브 페이지 QR·링크도 인쇄돼 나가 있다.
       임시 이동(307)인 이유는 [slug]/page.tsx 의 같은 자리 주석 참조. */
    const moved = await movedTo(slug, { strict: !live });
    /* sub 는 라우트 파라미터라 **디코드된 값**이다 — 형식을 확인하고서야 주소로 되돌린다.
       여기서 `moved` 가 앞에 오므로 `//evil.com` 같은 오리진 탈출은 안 되지만, 검증 없는 경로 조각을
       Location 에 그대로 싣는 습관 자체가 /go 에서 사고가 됐다(2026-09-07 감사).
       형식은 DB 의 sub_slug check(0060)와 같게 본다. */
    if (moved && /^[a-z0-9][a-z0-9-]{0,39}$/.test(sub)) redirect(`/${moved}/${sub}`);
    if (moved) redirect(`/${moved}`);
    notFound();
  }
  /* 데이터는 자식 slug 로, 주소는 방문자가 들어온 표준 주소로 —
     링크·비콘·잠금 쿠키가 `/{부모}/{sub}` 아래에 놓여야 방문자 쿠키(path=`/{부모}`)가 실린다 */
  return PublicLinkPage({ params: Promise.resolve({ slug: child }), urlBase: `${slug}/${sub}`, live });
}
