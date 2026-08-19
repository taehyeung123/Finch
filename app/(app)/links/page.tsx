import type { Metadata } from "next";
import { headers } from "next/headers";
import { PageHeader } from "@/components/ui/section-header";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/supabase/config";
import type { LinkBlock } from "@/lib/links/blocks";
import { LinksClient, type LinkPageView } from "./_components/links-client";

export const metadata: Metadata = {
  title: "프로필 링크",
  robots: { index: false, follow: false },
};

/*
  프로필 링크 편집 — 블록 빌더(2026-08-17 재구성).

  링크팜(app.linkfarm.ai) 빌더를 실측 조사해 구조를 맞췄다: 프로필·테마·블록·설정
  4탭 + 라이브 미리보기 + draft→라이브 반영 분리.

  통계는 **여기서 집계해 넘긴다.** 클라이언트가 항목마다 조회하면 N+1 이 되고,
  RLS 를 통과한 뒤에도 블록 10개면 요청 10번이다.
*/

/** 통계 조회 창 — 링크팜 기본값과 같은 30일 */
const STATS_DAYS = 30;

interface Loaded {
  page: LinkPageView | null;
  blocks: LinkBlock[];
  stats: { views: number; clicks: number; ctr: number; returning: number };
}

const EMPTY: Loaded = { page: null, blocks: [], stats: { views: 0, clicks: 0, ctr: 0, returning: 0 } };

async function load(): Promise<Loaded> {
  if (isDemoMode()) return EMPTY;

  const user = await getAuthUser();
  if (!user) return EMPTY;

  const supabase = await createClient();
  const { data: page } = await supabase
    .from("link_pages")
    .select(
      "id, slug, title, bio, published, layout, theme, align, avatar_path, cover_path, sns_links, seo_title, seo_desc, published_at, published_snapshot, updated_at",
    )
    .eq("user_id", user.id)
    .maybeSingle();
  if (!page) return EMPTY;

  const since = new Date(Date.now() - STATS_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const [{ data: rows }, views, clicks] = await Promise.all([
    supabase
      .from("link_blocks")
      .select("id, type, data, sort_order, active")
      .eq("page_id", page.id)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("link_views")
      .select("visitor_hash")
      .eq("page_id", page.id)
      .gte("created_at", since)
      .limit(50_000),
    supabase
      .from("link_clicks")
      .select("id", { count: "exact", head: true })
      .eq("page_id", page.id)
      .gte("created_at", since),
  ]);

  const blocks: LinkBlock[] = (
    (rows ?? []) as Array<{ id: string; type: string; data: Record<string, unknown>; sort_order: number; active: boolean }>
  ).map((r) => ({
    id: r.id,
    type: r.type as LinkBlock["type"],
    data: r.data ?? {},
    sortOrder: r.sort_order,
    active: r.active,
  }));

  /* 재방문율 = (2회 이상 방문한 방문자 수 / 전체 방문자 수). visitor_hash 가 null 인
     방문(쿠키 불가)은 사람 수를 셀 수 없으므로 분모에서 뺀다 — 넣으면 재방문율이
     실제보다 낮게 나온다. */
  const viewRows = (views.data ?? []) as Array<{ visitor_hash: string | null }>;
  const totalViews = viewRows.length;
  const counts = new Map<string, number>();
  for (const v of viewRows) {
    if (!v.visitor_hash) continue;
    counts.set(v.visitor_hash, (counts.get(v.visitor_hash) ?? 0) + 1);
  }
  const uniques = counts.size;
  const repeats = [...counts.values()].filter((c) => c > 1).length;

  const totalClicks = clicks.count ?? 0;
  const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);

  /* 초안이 마지막 발행본과 다른가 — "라이브 반영" 버튼의 상태를 정한다.
     블록 내용까지 비교하면 정확하지만 매 요청 JSON 비교가 붙는다. 발행 이후
     페이지·블록이 한 번이라도 수정됐는지(updated_at)로 판정한다 — 실무상 충분하다. */
  const publishedAt = page.published_at as string | null;
  const pageUpdated = page.updated_at as string | null;
  const dirty =
    !publishedAt ||
    (!!pageUpdated && new Date(pageUpdated).getTime() > new Date(publishedAt).getTime()) ||
    blocks.length !== (((page.published_snapshot as { blocks?: unknown[] } | null)?.blocks ?? []).length ?? 0);

  return {
    page: {
      id: page.id as string,
      slug: page.slug as string,
      title: (page.title as string) ?? "",
      bio: (page.bio as string) ?? "",
      published: !!page.published,
      layout: (page.layout as string) ?? "profile",
      theme: (page.theme as string) ?? "basic",
      align: (page.align as string) ?? "center",
      avatarPath: (page.avatar_path as string | null) ?? null,
      coverPath: (page.cover_path as string | null) ?? null,
      snsLinks: Array.isArray(page.sns_links) ? (page.sns_links as Array<{ kind: string; url: string }>) : [],
      seoTitle: (page.seo_title as string | null) ?? "",
      seoDesc: (page.seo_desc as string | null) ?? "",
      publishedAt,
      dirty,
    },
    blocks,
    stats: {
      views: totalViews,
      clicks: totalClicks,
      ctr: pct(totalClicks, totalViews),
      returning: pct(repeats, uniques),
    },
  };
}

export default async function Page() {
  const { page, blocks, stats } = await load();

  /* 복사 버튼이 주는 주소는 **지금 접속한 도메인** 기준이어야 한다.
     프로덕션 도메인을 하드코딩하면 로컬·프리뷰에서 복사한 주소가 안 열린다. */
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "finch.ai.kr";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");

  return (
    <div className="space-y-5">
      <PageHeader
        title="프로필 링크"
        description="SNS 프로필에 거는 링크 페이지를 만들고 클릭 성과를 봅니다."
      />
      <LinksClient page={page} blocks={blocks} stats={stats} origin={`${proto}://${host}`} />
    </div>
  );
}
