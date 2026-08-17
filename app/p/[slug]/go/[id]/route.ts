import { NextResponse } from "next/server";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/*
  프로필 링크 클릭 — 집계 후 목적지로 302.

  왜 서버 리다이렉트인가:
   · 공개 페이지의 <a href> 에 실제 주소를 박으면 클릭을 셀 수 없다
   · 클라이언트에서 fetch/sendBeacon 으로 세면 광고 차단기가 막고, 무엇보다
     link_clicks 에 익명 INSERT 정책을 열어야 한다 = 아무나 카운트를 부풀린다
  그래서 기록은 여기서 **service_role** 로만 남긴다(0045 에 INSERT 정책 없음).

  개인정보: IP·UA·리퍼러를 저장하지 않는다. 세는 건 "몇 번 눌렸나" 하나다.
*/
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, ctx: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await ctx.params;
  if (!isSupabaseConfigured()) return NextResponse.redirect(new URL(`/p/${slug}`, _request.url));

  /* 목적지 조회는 **익명 세션**으로 한다 — RLS 가 published·active 를 강제하므로,
     꺼둔 링크나 비공개 페이지의 id 를 직접 찔러도 목적지가 안 나온다.
     service_role 로 읽으면 그 방어가 통째로 사라진다. */
  const supabase = await createClient();
  const { data: item } = await supabase
    .from("link_items")
    .select("id, url, active, page_id, link_pages!inner(slug, published, user_id)")
    .eq("id", id)
    .maybeSingle();

  type P = { slug: string; published: boolean; user_id: string };
  const row = item as unknown as
    | { id: string; url: string; active: boolean; page_id: string; link_pages: P | P[] }
    | null;
  const page = row ? (Array.isArray(row.link_pages) ? row.link_pages[0] : row.link_pages) : null;

  /* slug 가 안 맞으면 목적지를 주지 않는다 — 남의 페이지 주소에 내 항목 id 를 붙여
     아무 링크로나 보내는 오픈 리다이렉트가 되면 안 된다. */
  if (!row || !page || page.slug !== slug) {
    return NextResponse.redirect(new URL(`/p/${slug}`, _request.url));
  }

  /* 비공개·꺼진 링크는 방문자에게 열지 않는다. 단 **소유자는 통과** — 공개 전에
     링크가 제대로 걸리는지 눌러볼 수 있어야 한다. 소유자 클릭은 집계하지 않는다
     (자기 테스트가 성과로 잡히면 숫자가 거짓말이 된다). */
  const me = await getAuthUser();
  const isOwner = !!me && me.id === page.user_id;
  if ((!page.published || !row.active) && !isOwner) {
    return NextResponse.redirect(new URL(`/p/${slug}`, _request.url));
  }

  /* 집계 실패가 이동을 막으면 안 된다 — 방문자는 링크를 누른 것이지 통계를
     남기러 온 게 아니다. await 하되 실패는 삼킨다. */
  const admin = isOwner ? null : createAdminClient();
  if (admin) {
    const { error } = await admin.from("link_clicks").insert({ page_id: row.page_id, item_id: row.id });
    if (error) console.error("[links] 클릭 기록 실패:", error.message);
  }

  return NextResponse.redirect(row.url, { status: 302 });
}
