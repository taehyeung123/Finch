import { NextResponse } from "next/server";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/supabase/config";
import { LIST_POST_COLUMNS, toListItem, type ListPostRow } from "@/lib/publish/list-item";
import { currentAccountMap, postAccountView } from "@/lib/publish/account-core";
import { MAX_WATCH } from "@/lib/publish/progress";
import { consoleErrorThrottled, flatten } from "@/lib/monitoring/log-throttle";
import type { PublishListItem } from "@/lib/types";

/**
 * 발행 목록의 진행 상황 조회 — 올리는 중·처리 중인 글 몇 개의 지금 상태만 돌려준다 (2026-09-12 비동기 「지금 발행」).
 *
 * 「지금 발행」은 이제 선점한 뒤 바로 돌아오고 메타에 올리는 일은 응답 뒤에 서버가 이어서 한다(publish/actions.ts 머리말).
 * 목록은 그 글이 끝날 때까지 몇 초마다 이 주소를 부른다(주기·합치기 규칙은 lib/publish/progress.ts).
 *
 * 왜 서버 액션이 아니라 GET 라우트인가:
 *  · Next 는 서버 액션을 **클라이언트마다 하나씩 차례로** 보낸다(node_modules/next/dist/docs/01-app/02-guides/server-actions.md) —
 *    4초마다 도는 조회가 작성기의 업로드 확인·저장 액션 앞에 줄을 선다. 문서도 «변경이 아닌 요청은 라우트 핸들러로»라고 권한다.
 *  · 액션 id 는 배포마다 바뀐다 — 화면을 켜 둔 채 배포되면 4초마다 «Failed to find Server Action»이 난다. 주소는 안 바뀐다.
 *  · 읽기만 한다(상태를 바꾸지 않는다) — GET 이 맞다.
 *
 * 가볍게: 목록 전체를 다시 그리지 않고(router.refresh 는 두 조회 + 썸네일 서명 + 서버 렌더), 물어본 글만 세션(RLS)으로 읽는다.
 * 썸네일은 서명하지 않는다 — 화면이 가진 것을 그대로 쓴다(mergeProgress). 계정 칩은 목록과 같은 규칙(postAccountView)으로 다시 정한다.
 * 조회 실패는 «없음»이 아니다 — { ok:false } 로 답하고 화면은 다음 차례에 다시 묻는다(목록을 비우지 않는다).
 */
export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const noStore = { "Cache-Control": "no-store" } as const;

export async function GET(request: Request) {
  /* 예시 화면은 서버에 아무것도 없다 — 화면도 부르지 않지만, 불려도 조용히 빈 답 */
  if (isDemoMode()) return NextResponse.json({ ok: true, items: [] }, { headers: noStore });

  const raw = new URL(request.url).searchParams.get("ids") ?? "";
  const ids = [...new Set(raw.split(",").map((s) => s.trim()).filter((s) => UUID_RE.test(s)))].slice(0, MAX_WATCH);
  if (ids.length === 0) return NextResponse.json({ ok: true, items: [] }, { headers: noStore });

  /* 인증 판단은 getUser() — getAuthUser 가 요청 안에서 한 번만 부른다(lib/supabase/server.ts) */
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ ok: false, error: "login" }, { status: 401, headers: noStore });
  const supabase = await createClient();

  /* 두 조회를 한 번에 — 글은 RLS(auth.uid()=user_id)가 본인 것만 돌려준다. 계정은 칸을 적는다(토큰 칸은 세션이 못 읽는다, 0085) */
  const [posts, accounts] = await Promise.all([
    supabase.from("scheduled_posts").select(LIST_POST_COLUMNS).in("id", ids),
    supabase.from("connected_accounts").select("channel, handle, connected, platform_user_id").eq("user_id", user.id),
  ]);
  if (posts.error) {
    /* 몇 초마다 불리는 주소다 — 장애 한 번이 요청 수만큼의 오류 이벤트가 되지 않게 묶는다 */
    consoleErrorThrottled("publish-progress", 5 * 60_000, "[publish] 진행 상황 조회 실패:", flatten(posts.error.message));
    return NextResponse.json({ ok: false, error: "lookup" }, { status: 503, headers: noStore });
  }
  if (accounts.error) {
    consoleErrorThrottled("publish-progress-accounts", 5 * 60_000, "[publish] 진행 상황 — 연결 계정 조회 실패:", flatten(accounts.error.message));
  }
  /* 계정 조회가 실패하면 «모름»(undefined) — «이전 계정»이라고 단정하지 않는다(page.tsx 와 같은 규칙) */
  const current = accounts.error ? null : currentAccountMap((accounts.data ?? []) as Parameters<typeof currentAccountMap>[0]);
  const now = Date.now();
  const items: PublishListItem[] = ((posts.data ?? []) as unknown as ListPostRow[]).map((r) => {
    const acc = current === null ? undefined : (current.get(r.channel ?? "instagram") ?? null);
    return toListItem(r, null, now, postAccountView(r, acc));
  });
  return NextResponse.json({ ok: true, items }, { headers: noStore });
}
