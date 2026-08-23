import { recordDwell } from "../actions";

/*
  체류시간 비콘(0058) — 방문자가 페이지를 떠날 때 ViewBeacon 이 keepalive fetch 로 쏜다.
  서버 액션은 fetch(keepalive) 로 부를 수 없어(액션 id 헤더) 라우트로 받는다.
  본문은 { ms } 하나. 실패해도 200 — 방문자 화면에 아무 영향이 없어야 한다.
*/
export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  let ms = 0;
  try {
    const body = (await req.json()) as { ms?: unknown };
    ms = typeof body.ms === "number" ? body.ms : Number(body.ms);
  } catch {
    return new Response(null, { status: 204 });
  }
  try {
    await recordDwell(slug, ms);
  } catch {
    /* 통계는 방문자의 일이 아니다 */
  }
  return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
}
