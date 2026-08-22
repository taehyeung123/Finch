import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isDemoMode, isSupabaseConfigured } from "@/lib/supabase/config";
import { linkWorkspace } from "@/lib/data";

/*
  프로필 링크 클릭 — 집계 후 목적지로 302.

  왜 서버 리다이렉트인가:
   · 공개 페이지의 <a href> 에 실제 주소를 박으면 클릭을 셀 수 없다
   · 클라이언트에서 세면 광고 차단기가 막고, 무엇보다 link_clicks 에 익명 INSERT
     정책을 열어야 한다 = 아무나 카운트를 부풀린다
  그래서 기록은 여기서 **service_role** 로만 남긴다(0045·0048 에 INSERT 정책 없음).

  ⚠️ 목적지는 **published_snapshot 에서만** 읽는다(0048). 초안(link_blocks)을 읽으면
  아직 발행하지 않은 URL 이 id 만 알면 새어 나간다 — 스냅샷에 없는 블록은 공개된 적이
  없는 블록이다.

  ?i=N 은 배열형 블록(가로 카드·그리드·최근 게시물)의 몇 번째 항목인지다.

  개인정보: IP·UA·리퍼러를 저장하지 않는다. 방문자 해시는 쿠키의 임의 토큰에서만 온다.
*/
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface SnapBlock {
  id: string;
  type: string;
  data: Record<string, unknown>;
}

/** 스냅샷 블록 + 항목 인덱스 → 실제 목적지. http(s) 가 아니면 null */
function destinationOf(block: SnapBlock, idx: number | null): string | null {
  const d = block.data ?? {};
  let raw: unknown = null;

  if (idx !== null) {
    /* 배열형 — 최근 게시물은 permalink, 나머지는 url */
    const listKey = block.type === "social_feed" ? "cached" : "items";
    const list = Array.isArray(d[listKey]) ? (d[listKey] as Record<string, unknown>[]) : [];
    const item = list[idx];
    if (!item) return null;
    raw = block.type === "social_feed" ? item.permalink : item.url;
  } else {
    raw = d.url;
  }

  if (typeof raw !== "string" || !raw.trim()) return null;
  /* 스냅샷은 저장 시 이미 정규화됐지만, 여기서 한 번 더 본다 —
     이 값이 그대로 Location 헤더가 되므로 마지막 관문이다. */
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

export async function GET(request: Request, ctx: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await ctx.params;
  const back = () => NextResponse.redirect(new URL(`/p/${slug}`, request.url));

  /* 데모 모드는 샘플 블록에서 목적지를 찾는다 — 안 하면 데모 페이지의 모든 버튼이
     제자리로 되던져져서, 고치고 있는 바로 그 증상("누르면 아무 일도 안 남")이 된다.
     집계는 남기지 않는다(샘플이라 셀 것이 없다). */
  if (isDemoMode()) {
    const b = linkWorkspace.blocks.find((x) => x.id === id);
    if (!b) return back();
    const iParam = new URL(request.url).searchParams.get("i");
    const dest = destinationOf(
      { id: b.id, type: b.type, data: b.data },
      iParam !== null && /^\d+$/.test(iParam) ? Number(iParam) : null,
    );
    return dest ? NextResponse.redirect(dest, { status: 302 }) : back();
  }

  if (!isSupabaseConfigured()) return back();

  /* 익명 세션으로 읽는다 — RLS 가 published=true 만 내보내므로 비공개 페이지의
     블록 id 를 직접 찔러도 목적지가 안 나온다. service_role 로 읽으면 그 방어가 사라진다. */
  const supabase = await createClient();
  const { data: page } = await supabase
    .from("link_pages")
    .select("id, published_snapshot")
    .eq("slug", slug)
    .eq("published", true)
    .maybeSingle();
  if (!page?.published_snapshot) return back();

  const snap = page.published_snapshot as { blocks?: SnapBlock[] };
  const block = (snap.blocks ?? []).find((b) => b.id === id);
  if (!block) return back();

  const iParam = new URL(request.url).searchParams.get("i");
  const idx = iParam !== null && /^\d+$/.test(iParam) ? Number(iParam) : null;
  const dest = destinationOf(block, idx);
  if (!dest) return back();

  /* 집계 실패가 이동을 막으면 안 된다 — 방문자는 링크를 누른 것이지 통계를
     남기러 온 게 아니다. await 하되 실패는 삼킨다. */
  const admin = createAdminClient();
  /* 봇(크롤러·링크 미리보기)은 세지 않는다 — 앵커의 rel=nofollow 는 힌트일 뿐이라 크롤러가
     블록 수만큼 /go 를 따라가 "클릭 > 방문" 역전을 만든다(감사 #16). UA 는 메모리에서만 보고
     저장하지 않는다(개인정보 방침 그대로). 이동은 봇에게도 정상으로 해 준다. */
  const ua = request.headers.get("user-agent") ?? "";
  const isBot =
    /* WhatsApp 은 넣지 않는다 — 인앱브라우저(진짜 클릭)도 UA 에 같은 토큰을 붙여 구분이 안 된다(소넷 지적) */
    /bot|crawl|spider|slurp|facebookexternalhit|kakaotalk-scrap|Slackbot|Twitterbot|Discordbot|LinkedInBot|TelegramBot|Googlebot|bingbot/i.test(
      ua,
    );
  if (admin && !isBot) {
    try {
      /* 방문 비콘이 심어둔 쿠키를 읽어 "몇 명이 눌렀나"를 셀 수 있게 한다.
         쿠키가 없으면(첫 진입에 바로 클릭) null — 클릭 수 자체는 그대로 센다.
         방문 비콘(actions.ts)과 같이 **원문 토큰**을 해시한다 — decodeURIComponent 는 깨진
         퍼센트 문자열에서 예외를 던져 리다이렉트 자체를 500 으로 만들었다(감사 #24). */
      const raw = request.headers.get("cookie") ?? "";
      const token = /(?:^|;\s*)finch_lv=([^;]+)/.exec(raw)?.[1] ?? null;
      let visitorHash: string | null = null;
      if (token) {
        const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
        visitorHash = Array.from(new Uint8Array(buf))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("")
          .slice(0, 32);
      }

      /* 방문 비콘과 같은 규칙: 같은 방문자의 같은 링크 연타는 1분에 1건, 해시 없는 요청은
         페이지 분당 60건, 해시 유무와 무관하게 페이지 분당 600건 천장. 넘으면 기록만 건너뛴다. */
      const minuteAgo = new Date(Date.now() - 60 * 1000).toISOString();
      let skip = false;
      if (visitorHash) {
        const { data: last } = await admin
          .from("link_clicks")
          .select("created_at")
          .eq("page_id", page.id)
          .eq("block_id", block.id)
          .eq("visitor_hash", visitorHash)
          .gte("created_at", minuteAgo)
          .limit(1)
          .maybeSingle();
        if (last) skip = true;
      } else {
        const { count } = await admin
          .from("link_clicks")
          .select("id", { count: "exact", head: true })
          .eq("page_id", page.id)
          .is("visitor_hash", null)
          .gte("created_at", minuteAgo);
        if ((count ?? 0) >= 60) skip = true;
      }
      if (!skip) {
        const { count } = await admin
          .from("link_clicks")
          .select("id", { count: "exact", head: true })
          .eq("page_id", page.id)
          .gte("created_at", minuteAgo);
        if ((count ?? 0) >= 600) skip = true;
      }

      if (!skip) {
        const { error } = await admin.from("link_clicks").insert({
          page_id: page.id,
          /* block_id 는 **스냅샷에 굳은 id** 다. 초안(link_blocks)에서 지운 뒤라도 라이브에는
             남아 있고, 그 클릭은 반드시 기록돼야 한다 — 그래서 0049 에서 FK 를 뗐다.
             (0045 의 item_id 는 link_items 와 함께 0049 에서 사라졌다.) */
          block_id: block.id,
          visitor_hash: visitorHash,
        });
        if (error) console.error("[links] 클릭 기록 실패:", error.message);
      }
    } catch (e) {
      /* 집계 부속 실패는 이동을 막지 않는다 */
      console.error("[links] 클릭 집계 예외:", e instanceof Error ? e.message : e);
    }
  }

  return NextResponse.redirect(dest, { status: 302 });
}
