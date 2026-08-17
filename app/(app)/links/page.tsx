import type { Metadata } from "next";
import { headers } from "next/headers";
import { PageHeader } from "@/components/ui/section-header";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/supabase/config";
import { LinksClient, type LinkItem, type LinkPage } from "./_components/links-client";

export const metadata: Metadata = {
  title: "프로필 링크",
  robots: { index: false, follow: false },
};

/*
  프로필 링크 — 사장님 도입 지시(2026-08-15), 2026-08-16 구현.

  SNS 프로필에 거는 링크 한 장 + 클릭 성과. 공개 화면은 /p/{slug} 이고 이 화면은
  그걸 편집한다.

  클릭 수는 **여기서 집계해 넘긴다.** 클라이언트가 항목마다 조회하면 N+1 이 되고,
  RLS 를 통과한 뒤에도 링크 8개면 요청 8번이다. 한 번에 읽어 메모리에서 센다.
*/
/** 클릭 집계 상한 — 넘으면 화면이 "최근 N건 기준"이라고 밝힌다 */
const CLICK_LIMIT = 50_000;

async function load(): Promise<{
  page: LinkPage | null;
  items: LinkItem[];
  totalClicks: number;
  clicksTruncated: boolean;
}> {
  const empty = { page: null, items: [], totalClicks: 0, clicksTruncated: false };
  if (isDemoMode()) return empty;

  const user = await getAuthUser();
  if (!user) return empty;

  const supabase = await createClient();
  const { data: page } = await supabase
    .from("link_pages")
    .select("id, slug, title, bio, published")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!page) return empty;

  const [{ data: rows }, { data: clicks }] = await Promise.all([
    supabase
      .from("link_items")
      .select("id, label, url, active")
      .eq("page_id", page.id)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("link_clicks")
      .select("item_id")
      .eq("page_id", page.id)
      /* 정렬을 명시한다 — 없으면 상한에 걸렸을 때 "어떤 5만 건"인지가 비결정적이라
         새로고침마다 숫자가 흔들린다. 최신순이면 적어도 "최근 5만 건"이 된다. */
      .order("created_at", { ascending: false })
      .limit(CLICK_LIMIT),
  ]);

  /* 항목별 클릭 수를 메모리에서 센다. 50,000건 상한은 안전장치다 — 그보다 많이
     쌓이면 집계 테이블이 필요하고, 그건 그때 만든다(지금 만들면 쓰지도 않는
     트리거를 유지해야 한다). */
  const counts = new Map<string, number>();
  for (const c of (clicks ?? []) as Array<{ item_id: string | null }>) {
    if (!c.item_id) continue;
    counts.set(c.item_id, (counts.get(c.item_id) ?? 0) + 1);
  }

  const items = ((rows ?? []) as Array<{ id: string; label: string; url: string; active: boolean }>).map((r) => ({
    ...r,
    clicks: counts.get(r.id) ?? 0,
  }));

  const total = (clicks ?? []).length;
  return { page: page as LinkPage, items, totalClicks: total, clicksTruncated: total >= CLICK_LIMIT };
}

export default async function Page() {
  const { page, items, totalClicks, clicksTruncated } = await load();

  /* 복사 버튼이 주는 주소는 **지금 접속한 도메인** 기준이어야 한다.
     프로덕션 도메인을 하드코딩하면 로컬·프리뷰에서 복사한 주소가 안 열린다. */
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "finch.ai.kr";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${proto}://${host}`;

  return (
    <div className="space-y-5">
      <PageHeader
        title="프로필 링크"
        description="SNS 프로필에 거는 링크 페이지를 만들고 클릭 성과를 봅니다."
      />
      <LinksClient
        page={page}
        items={items}
        totalClicks={totalClicks}
        clicksTruncated={clicksTruncated}
        origin={origin}
      />
    </div>
  );
}
