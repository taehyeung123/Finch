import { GET as vcardGet } from "../../../vcard/[id]/route";
import { resolveSubSlug } from "../../../public-page";

/* 서브 페이지의 연락처 저장 — 표준 주소(`/{부모}/{sub}/vcard/{blockId}`) 아래에서 받는다.
   자식 slug 로 풀어 같은 핸들러를 태운다(go 와 같은 이유·같은 방식). */
export async function GET(request: Request, ctx: { params: Promise<{ slug: string; sub: string; id: string }> }) {
  const { slug, sub, id } = await ctx.params;
  const child = await resolveSubSlug(slug, sub);
  if (!child) return new Response(null, { status: 404 });
  return vcardGet(request, { params: Promise.resolve({ slug: child, id }) });
}
