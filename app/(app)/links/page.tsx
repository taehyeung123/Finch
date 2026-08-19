import type { Metadata } from "next";
import { headers } from "next/headers";
import { PageHeader } from "@/components/ui/section-header";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/supabase/config";
import { linkWorkspace } from "@/lib/data";
import { blockSummary, type LinkBlock } from "@/lib/links/blocks";
import type { LinkLead, LinkStats, LinkWorkspace } from "@/lib/links/types";
import { LinksClient } from "./_components/links-client";

export const metadata: Metadata = {
  title: "프로필 링크",
  robots: { index: false, follow: false },
};

/*
  프로필 링크 편집 — 블록 빌더(2026-08-17 재구성, 2026-08-19 점검 반영).

  링크팜(app.linkfarm.ai) 빌더를 실측 조사해 구조를 맞췄다: 프로필·테마·블록·설정
  4탭 + 라이브 미리보기 + draft→라이브 반영 분리.

  통계는 **DB 함수 하나로 집계해 넘긴다**(0049 link_page_stats). 앞서는 방문 행을
  통째로 끌어와 JS 로 셌는데, PostgREST 가 응답을 db-max-rows(기본 1000)에서 자르는
  바람에 방문이 1000건을 넘으면 분모가 거기서 멈춰 **클릭률이 100% 를 넘었다.**
*/

/** 통계 조회 창 — 링크팜과 같은 3단 */
const STATS_RANGES = [7, 30, 90] as const;
const DEFAULT_DAYS = 30;

type Loaded = LinkWorkspace;

const EMPTY_STATS: LinkStats = {
  days: DEFAULT_DAYS,
  failed: false,
  views: 0,
  uniques: 0,
  clicks: 0,
  ctr: 0,
  returning: 0,
  daily: [],
  blocks: [],
  regions: [],
};

const EMPTY: Loaded = { page: null, blocks: [], stats: EMPTY_STATS, leads: [] };

/** link_page_stats 가 돌려주는 원형 */
interface RawStats {
  views: number;
  uniques: number;
  repeats: number;
  clicks: number;
  daily: Array<{ d: string; v: number; c: number }>;
  blocks: Array<{ id: string; n: number }>;
  regions: Array<{ country: string | null; region: string | null; n: number }>;
}

async function load(days: number): Promise<Loaded> {
  /* 데모 모드는 **샘플 페이지**를 보여준다. 앞서는 빈 값을 돌려줘 생성 폼만 나왔고,
     주소·제목을 다 채워 누른 뒤에야 "데모 모드에서는 저장할 수 없어요"가 떴다 —
     항상 실패하는 폼 하나가 이 화면의 전부였다. 저장은 서버 액션이 막는다. */
  /* days 를 그대로 되비춘다 — 샘플 수치는 그대로여도 기간 토글이 눌린 상태는 맞아야
     한다. 안 그러면 7일을 눌렀는데 30일이 선택된 채로 남아 고장난 것처럼 보인다. */
  if (isDemoMode()) return { ...linkWorkspace, stats: { ...linkWorkspace.stats, days } };

  const user = await getAuthUser();
  if (!user) return { ...EMPTY, stats: { ...EMPTY_STATS, days } };

  const supabase = await createClient();
  const { data: page } = await supabase
    .from("link_pages")
    .select(
      "id, slug, title, bio, published, layout, theme, align, avatar_path, cover_path, sns_links, seo_title, seo_desc, published_at, published_snapshot, updated_at",
    )
    .eq("user_id", user.id)
    .maybeSingle();
  if (!page) return { ...EMPTY, stats: { ...EMPTY_STATS, days } };

  const [{ data: rows }, statsRes, leadRows] = await Promise.all([
    supabase
      .from("link_blocks")
      .select("id, type, data, sort_order, active, updated_at")
      .eq("page_id", page.id)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    /* 집계는 전부 SQL 에서. 행을 끌어오지 않으므로 상한에 걸리지 않고,
       country/region·block_id 도 여기서 함께 나온다(0048 이 쌓기만 하고 아무도
       안 읽던 값들이다). */
    supabase.rpc("link_page_stats", { p_page: page.id, p_days: days }),
    /* 받은 리드 — 문의받기·구독신청 블록이 약속한 "받은 내용"의 실체.
       최근 50건만. 그보다 많이 쌓이면 전용 화면이 필요하고, 그건 그때 만든다. */
    supabase
      .from("link_leads")
      .select("id, kind, name, email, phone, message, created_at")
      .eq("page_id", page.id)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const blocks: LinkBlock[] = (
    (rows ?? []) as Array<{
      id: string; type: string; data: Record<string, unknown>;
      sort_order: number; active: boolean; updated_at: string;
    }>
  ).map((r) => ({
    id: r.id,
    type: r.type as LinkBlock["type"],
    data: r.data ?? {},
    sortOrder: r.sort_order,
    active: r.active,
  }));

  /* 초안이 마지막 발행본과 다른가 — "라이브 반영" 버튼의 상태를 정한다.
     ⚠️ **블록의 updated_at 을 반드시 본다.** link_blocks 수정은 link_pages 를 건드리지
     않으므로, 페이지 updated_at 만 보면 "블록 내용만 고친" 경우가 dirty 로 안 잡혀
     버튼이 「반영됨」인 채로 남고 사용자는 발행할 방법이 없다(가장 흔한 편집이 그건데).

     반대 방향의 함정도 있었다: publishLinkPage 가 published_at 을 **앱 시각**으로
     보내는 바람에 DB 시각으로 찍히는 updated_at 이 언제나 더 늦어, 발행 직후에도
     dirty 가 참이었다 — 「반영됨」에 도달할 수 없었다. 0049 의
     trg_link_pages_zz_publish 가 두 값을 같은 트랜잭션 시각으로 맞춘다. */
  const publishedAt = page.published_at as string | null;
  const pageUpdated = page.updated_at as string | null;
  const newest = (
    (rows ?? []) as Array<{ updated_at: string }>
  ).reduce<number>((max, r) => Math.max(max, new Date(r.updated_at).getTime() || 0), 0);
  const pubMs = publishedAt ? new Date(publishedAt).getTime() : 0;
  const snapBlocks = ((page.published_snapshot as { blocks?: unknown[] } | null)?.blocks ?? []).length;
  const activeCount = blocks.filter((b) => b.active).length;

  const dirty =
    !publishedAt ||
    (!!pageUpdated && new Date(pageUpdated).getTime() > pubMs) ||
    newest > pubMs ||
    /* 발행은 active=true 만 담는다 — 켜진 블록 수로 비교해야 맞다 */
    activeCount !== snapBlocks;

  const raw = (statsRes.data ?? null) as RawStats | null;
  if (statsRes.error) console.error("[links] 통계 집계 실패:", statsRes.error.message);

  const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);
  const byId = new Map(blocks.map((b) => [b.id, b]));
  const snapById = new Map(
    (((page.published_snapshot as { blocks?: Array<{ id: string; type: string; data: Record<string, unknown> }> } | null)
      ?.blocks ?? [])).map((b) => [b.id, b]),
  );

  const stats: LinkStats = {
    days,
    /* 실패를 0 으로 뭉개지 않는다 — 화면이 "성과 0" 으로 읽고 사장님이 오판한다 */
    failed: !!statsRes.error,
    views: raw?.views ?? 0,
    uniques: raw?.uniques ?? 0,
    clicks: raw?.clicks ?? 0,
    ctr: pct(raw?.clicks ?? 0, raw?.views ?? 0),
    /* 재방문율 = 2회 이상 온 방문자 / 사람 수를 셀 수 있었던 방문자.
       visitor_hash 가 null 인 방문(쿠키 불가)은 분모에서 빠진다 — 넣으면 낮게 나온다. */
    returning: pct(raw?.repeats ?? 0, raw?.uniques ?? 0),
    daily: (raw?.daily ?? []).map((x) => ({ date: x.d, views: x.v, clicks: x.c })),
    /* 클릭은 **스냅샷에 굳은 블록 id** 를 가리킨다. 초안에서 지운 블록의 클릭도
       남아 있어야 성과를 되짚을 수 있다(0049 에서 FK 를 뗀 이유) — 그래서
       지금 초안에 없는 id 는 "지운 블록"으로 표시한다. */
    blocks: (raw?.blocks ?? []).map((x) => {
      const b = byId.get(x.id);
      if (b) return { id: x.id, label: blockSummary(b.type, b.data), removed: false, clicks: x.n };
      /* 초안에 없는 id 는 **발행본에서** 이름을 찾는다. "지운 블록" 한 문구로
         뭉개면 「템플릿 적용」 한 번에 목록 전 줄이 "지운 블록"이 된다(적용이 블록을
         전부 지우고 새 id 로 다시 깔기 때문에). 스냅샷은 이미 select 중이라 추가 쿼리 0회. */
      const snapBlock = snapById.get(x.id);
      return {
        id: x.id,
        label: snapBlock
          ? blockSummary(snapBlock.type as LinkBlock["type"], snapBlock.data ?? {})
          : `블록 ${x.id.slice(0, 6)}`,
        removed: true,
        clicks: x.n,
      };
    }),
    regions: (raw?.regions ?? []).map((x) => ({
      country: x.country ?? "",
      region: x.region ?? "",
      views: x.n,
    })),
  };

  const leads: LinkLead[] = (
    (leadRows.data ?? []) as Array<{
      id: number; kind: string; name: string | null; email: string | null;
      phone: string | null; message: string | null; created_at: string;
    }>
  ).map((r) => ({
    id: r.id,
    kind: r.kind === "subscribe" ? "subscribe" : "contact",
    name: r.name,
    email: r.email,
    phone: r.phone,
    message: r.message,
    createdAt: r.created_at,
  }));

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
    stats,
    leads,
  };
}

export default async function Page({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const sp = await searchParams;
  const asked = Number(sp.days);
  const days = (STATS_RANGES as readonly number[]).includes(asked) ? asked : DEFAULT_DAYS;

  const { page, blocks, stats, leads } = await load(days);

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
      <LinksClient
        page={page}
        blocks={blocks}
        stats={stats}
        leads={leads}
        origin={`${proto}://${host}`}
        isDemo={isDemoMode()}
      />
    </div>
  );
}
