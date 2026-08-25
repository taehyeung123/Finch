import { GET as goGet } from "../../../go/[id]/route";
import { resolveSubSlug } from "../../../public-page";

/*
  서브 페이지의 클릭 집계 — `/{부모}/{sub}/go/{blockId}`.

  서브 페이지는 **두 주소**로 열린다: 자식의 전역 slug(`/{childSlug}`)와 표준 주소(`/{부모}/{sub}`).
  예전엔 링크를 전부 전역 slug 로 그려서, 표준 주소로 들어온 방문자가 링크를 누르는 순간
  **다른 경로로 넘어갔다** — 그 경로엔 방문자 쿠키(path=`/{부모}`)가 안 실려 클릭이 누구 것인지 못 셌다.
  이제 표준 주소 아래에서 눌리고, 여기서 자식 slug 로 풀어 **같은 핸들러**를 태운다([sub]/page.tsx 와 같은 방식).
*/
export async function GET(request: Request, ctx: { params: Promise<{ slug: string; sub: string; id: string }> }) {
  const { slug, sub, id } = await ctx.params;
  const child = await resolveSubSlug(slug, sub);
  if (!child) return new Response(null, { status: 404 });
  return goGet(request, { params: Promise.resolve({ slug: child, id }) });
}
