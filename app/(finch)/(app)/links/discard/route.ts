import { revertLinkDraft } from "../actions";

/*
  나가기 비콘(2026-08-24 사장님 지시 "저장 안 하면 나갈 때 초안 폐기") —
  창 닫기·새로고침·외부 이동은 서버 액션을 부를 수 없어(pagehide) sendBeacon 이 여기로 쏜다.
  인증·소유 확인은 revertLinkDraft 안에서 세션 쿠키로 한다(비콘은 쿠키를 실어 보낸다).
  실패는 조용히 — 나가는 사람에게 보여줄 화면이 없다.
*/
export async function POST(req: Request) {
  let pageId: string | undefined;
  try {
    const body = (await req.json()) as { pageId?: unknown };
    if (typeof body?.pageId === "string") pageId = body.pageId;
  } catch {
    /* 본문 없음·형식 오류 — 첫 페이지 기준으로 진행 */
  }
  try {
    await revertLinkDraft(pageId);
  } catch (e) {
    console.error("[links] 나가기 폐기 실패:", e instanceof Error ? e.message : e);
  }
  return new Response(null, { status: 204 });
}
