import { POST as dwellPost } from "../../dwell/route";
import { resolveSubSlug } from "../../public-page";

/* 서브 페이지의 체류 비콘 — 표준 주소(`/{부모}/{sub}/dwell`) 아래에서 받는다.
   비콘이 전역 slug 로 쏘면 방문자 쿠키(path=`/{부모}`)가 안 실려 체류가 익명으로 쌓였다. */
export async function POST(request: Request, ctx: { params: Promise<{ slug: string; sub: string }> }) {
  const { slug, sub } = await ctx.params;
  const child = await resolveSubSlug(slug, sub);
  if (!child) return new Response(null, { status: 404 });
  return dwellPost(request, { params: Promise.resolve({ slug: child }) });
}
