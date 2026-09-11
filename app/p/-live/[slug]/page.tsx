import type { Metadata, Viewport } from "next";
import PublicLinkPage, { generateMetadata as pageMetadata, generateViewport as pageViewport } from "../../[slug]/page";

/*
  공개 프로필 — **즉석 경로**(2026-09-11 창고 도입).

  방문자 대부분은 창고(app/p/[slug]/page.tsx, Vercel CDN 에 굳힌 완성 화면)에서 받는다.
  그 화면은 «익명 방문자 화면» 하나뿐이라, 쿠키에 따라 달라져야 하는 요청은 proxy.ts 가 여기로 보낸다:
   · 핀치 로그인 세션이 있는 요청 — 주인이면 비공개 미리보기·«아직 발행 안 함» 안내, 픽셀 제외
   · 비밀번호를 연 쿠키(finch_lu_*)가 있는 요청 — 잠긴 페이지의 내용
  렌더러는 같은 것을 live=true 로 부른다. 여기서는 매번 새로 그리고, 응답은 private·no-store 다(창고에 안 들어간다).

  주소 `/p/-live/…` 는 방문자가 직접 칠 수 없다 — slug 는 영문·숫자로 시작해야 해서(SLUG_RE, DB 0045) `-live` 는
  누구의 slug 도 될 수 없고, proxy.ts 는 그런 첫 조각을 리라이트하지 않는다(옛 /p/ 주소 GET 은 301 로 돌려보낸다).
*/
export const dynamic = "force-dynamic";

export async function generateViewport({ params }: { params: Promise<{ slug: string }> }): Promise<Viewport> {
  return pageViewport({ params, live: true });
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  return pageMetadata({ params, live: true });
}

export default async function LivePublicLinkPage({ params }: { params: Promise<{ slug: string }> }) {
  return PublicLinkPage({ params, live: true });
}
