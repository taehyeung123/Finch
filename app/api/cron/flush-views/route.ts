import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAuthorizedCron } from "@/lib/cron";
import { isKvConfigured } from "@/lib/kv/upstash";
import { flushViewQueue } from "@/lib/links/views";

/**
 * 프로필 링크 방문·체류 버퍼 flush 크론 (매분, vercel.json — Pro 라 분 단위 허용).
 *
 * Upstash 큐(lv:q)의 머리를 500개씩 떼어 link_views 에 INSERT 배열로 넣고, 체류는 RPC 한 번(0083)으로 반영한다.
 * 알고리즘·실패 처리·잠금은 전부 lib/links/views.ts flushViewQueue 에 있다 — 이 파일은 인증과 응답뿐.
 *
 * 응답으로 상태를 본다: {ok, inserted, dwellApplied, dropped, batches, remaining, ms}. remaining 이 계속 늘면
 * 크론이 못 따라가는 것이고, ok:false 가 이어지면 DB 쪽 장애다(그동안 방문자 요청은 5분 뒤부터 DB 직접 경로로 간다).
 * KV 가 설정돼 있지 않으면 할 일이 없다 — 200 으로 조용히 끝난다.
 */
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return new NextResponse("unauthorized", { status: 401 });
  }
  if (!isKvConfigured()) {
    return NextResponse.json({ ok: true, skipped: "kv_not_configured" });
  }
  const admin = createAdminClient();
  if (!admin) {
    return new NextResponse("not_configured", { status: 503 });
  }
  /* flushViewQueue 는 자기 예외를 구조화해 돌려준다 — 여기서 throw 가 새어 나오면 그건 코드 결함이다. 그래도 로그 모양은 지킨다 */
  try {
    const result = await flushViewQueue(admin);
    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
  } catch (e) {
    console.error("[cron:flush-views] 처리 실패:", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, error: "unexpected" }, { status: 500 });
  }
}
