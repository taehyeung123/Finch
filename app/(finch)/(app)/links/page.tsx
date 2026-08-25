import type { Metadata } from "next";
import { headers } from "next/headers";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/supabase/config";
import { linkWorkspace } from "@/lib/data";
import { sanitizeThemeCustom } from "@/lib/links/themes";
import { sanitizeLinkSettings } from "@/lib/links/settings";
import { blockSummary, type LinkBlock } from "@/lib/links/blocks";
import type { LinkLead, LinkSnapshotView, LinkStats, LinkWorkspace } from "@/lib/links/types";
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
const STATS_RANGES = [1, 7, 30, 90, 180, 365] as const;
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
  sources: [],
  devices: [],
  referrers: [],
  dwell: { avgMs: 0, n: 0 },
};

const EMPTY: Loaded = { page: null, pages: [], pageLimit: { used: 0, max: 1 }, multiReady: false, blocks: [], snapshot: null, stats: EMPTY_STATS, leads: [] };

/** link_page_stats 가 돌려주는 원형 */
interface RawStats {
  views: number;
  uniques: number;
  repeats: number;
  clicks: number;
  daily: Array<{ d: string; v: number; c: number }>;
  blocks: Array<{ id: string; n: number }>;
  regions: Array<{ country: string | null; region: string | null; n: number }>;
  /** 0055 이후에만 온다 — 옛 함수 응답엔 없다 */
  sources?: Array<{ src: string | null; n: number }>;
  /** 0058 이후 */
  devices?: Array<{ device: string | null; n: number }>;
  referrers?: Array<{ host: string | null; n: number }>;
  dwell?: { avg_ms: number; n: number };
}

async function load(days: number, wantPageId?: string): Promise<Loaded> {
  /* 데모 모드는 **샘플 페이지**를 보여준다. 앞서는 빈 값을 돌려줘 생성 폼만 나왔고,
     주소·제목을 다 채워 누른 뒤에야 "데모 모드에서는 저장할 수 없어요"가 떴다 —
     항상 실패하는 폼 하나가 이 화면의 전부였다. 저장은 서버 액션이 막는다. */
  /* days 를 그대로 되비춘다 — 샘플 수치는 그대로여도 기간 토글이 눌린 상태는 맞아야
     한다. 안 그러면 7일을 눌렀는데 30일이 선택된 채로 남아 고장난 것처럼 보인다. */
  if (isDemoMode()) {
    /* 샘플 일별 추이는 90일을 깔아 두고 기간만큼 자른다 — 30개뿐이면 90일 토글이 아무것도 안 바꾼다(감사3).
       ⚠️ 예전엔 **daily 만** 잘랐다. 그래서 「오늘」을 눌러도 KPI 는 90일치 그대로였고,
       같은 카드 안에서 「조회수 4,820」과 「오늘 페이지뷰 254」가 나란히 떴다(실측). 내려받은 CSV 도
       머리는 «기간: 오늘» 인데 몸통은 4,820 이었다. 숫자가 서로를 반박하면 화면 전체를 못 믿는다.

       그래서 자른 구간에서 **다시 계산한다**: 합계(views·clicks)는 잘린 daily 를 실제로 더하고,
       비율로만 의미가 있는 값들(uniques·returning·블록·지역·유입·기기·체류)은 같은 축소비로 줄인다.
       실제 모드가 기간 필터로 하는 일과 같은 모양이다 — 데모라고 다른 규칙을 보여 주지 않는다. */
    const base = linkWorkspace.stats;
    const daily = base.daily.slice(-days);
    const views = daily.reduce((n, d) => n + d.views, 0);
    const clicks = daily.reduce((n, d) => n + d.clicks, 0);
    /* 0 나눗셈 가드 — 90일 합이 0 이면 축소비를 1 로 두고 그대로 통과시킨다 */
    const totalViews = base.daily.reduce((n, d) => n + d.views, 0);
    const ratio = totalViews > 0 ? views / totalViews : 1;
    const cut = (n: number) => Math.max(n > 0 ? 1 : 0, Math.round(n * ratio));
    return {
      ...linkWorkspace,
      stats: {
        ...base,
        days,
        daily,
        views,
        clicks,
        uniques: cut(base.uniques),
        ctr: views > 0 ? clicks / views : 0,
        returning: base.returning,
        blocks: base.blocks.map((b) => ({ ...b, clicks: cut(b.clicks) })),
        regions: base.regions.map((r) => ({ ...r, views: cut(r.views) })),
        sources: base.sources.map((r) => ({ ...r, views: cut(r.views) })),
        devices: base.devices.map((r) => ({ ...r, views: cut(r.views) })),
        referrers: base.referrers.map((r) => ({ ...r, views: cut(r.views) })),
        /* 평균 체류는 «평균»이라 줄이지 않는다 — 표본 수(n)만 기간에 맞춘다 */
        dwell: { ...base.dwell, n: cut(base.dwell.n) },
      },
    };
  }

  const user = await getAuthUser();
  if (!user) return { ...EMPTY, stats: { ...EMPTY_STATS, days } };

  const supabase = await createClient();

  /* 페이지 목록(멀티, 0060) — parent_id/sub_slug 는 미적용 DB 에 없다 → 계단식으로 없이 읽는다 */
  let multiReady = true;
  let listRes = await supabase
    .from("link_pages")
    .select("id, slug, title, published, parent_id, sub_slug")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });
  if (listRes.error && /parent_id|sub_slug/i.test(listRes.error.message)) {
    multiReady = false;
    listRes = (await supabase
      .from("link_pages")
      .select("id, slug, title, published")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })) as unknown as typeof listRes;
  }
  if (listRes.error) {
    console.error("[links] link_pages 목록 조회 실패:", listRes.error.message);
    return { ...EMPTY, loadFailed: true, stats: { ...EMPTY_STATS, days, failed: true } };
  }
  const pageRows = (listRes.data ?? []) as Array<Record<string, unknown> & { id: string; slug: string }>;
  const pages = pageRows.map((r) => ({
    id: r.id,
    slug: r.slug,
    title: (r.title as string) ?? "",
    published: r.published === true,
    parentId: (r.parent_id as string | null) ?? null,
    subSlug: (r.sub_slug as string | null) ?? null,
  }));
  /* 상한 표시용 — 최종 관문은 DB 트리거(0060). 무료 1·유료 3 */
  const { data: prof } = await supabase.from("users_profile").select("plan").eq("id", user.id).maybeSingle();
  const pageLimit = { used: pages.length, max: (prof?.plan ?? "free") === "free" ? 1 : 3 };

  /* 활성 페이지 — ?page= 가 내 것이면 그 장, 아니면 첫 메인 장 */
  const active = (wantPageId && pages.find((p) => p.id === wantPageId)) || pages.find((p) => !p.parentId) || pages[0] || null;
  if (!active) return { ...EMPTY, pages, pageLimit, multiReady, stats: { ...EMPTY_STATS, days } };

  const PAGE_COLS =
    "id, slug, title, bio, published, layout, theme, align, avatar_path, cover_path, sns_links, sns_placement, title_size, seo_title, seo_desc, published_at, published_snapshot, updated_at";
  /* settings(0058)·theme_custom(0056) 계단식 — 미적용 DB 면 그 컬럼 없이 다시 읽는다(0052 관례) */
  let pageRes = await supabase.from("link_pages").select(`${PAGE_COLS}, theme_custom, settings`).eq("id", active.id).maybeSingle();
  if (pageRes.error && /settings/i.test(pageRes.error.message)) {
    pageRes = await supabase.from("link_pages").select(`${PAGE_COLS}, theme_custom`).eq("id", active.id).maybeSingle();
  }
  if (pageRes.error && /theme_custom/i.test(pageRes.error.message)) {
    pageRes = await supabase.from("link_pages").select(PAGE_COLS).eq("id", active.id).maybeSingle();
  }
  /* 조회 오류 ≠ 페이지 없음. 오류를 "없음"으로 흘리면 생성 폼 → 23505 → 새로고침 → 생성 폼 루프(감사 #10) */
  if (pageRes.error) {
    console.error("[links] link_pages 조회 실패:", pageRes.error.message);
    return { ...EMPTY, loadFailed: true, stats: { ...EMPTY_STATS, days, failed: true } };
  }
  const page = pageRes.data as (Record<string, unknown> & { id: string }) | null;
  if (!page) return { ...EMPTY, stats: { ...EMPTY_STATS, days } };

  const [blockRes, statsRes, leadRows, guestRes, contactCnt, subscribeCnt, guestCnt] = await Promise.all([
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
    /* 방명록(0057) — 미적용 DB 면 error 가 오고 빈 배열로 둔다 */
    supabase
      .from("link_guestbook")
      .select("id, name, message, reply, hidden, created_at")
      .eq("page_id", page.id)
      .order("created_at", { ascending: false })
      .limit(50),
    /* 카드 숫자는 **총 건수** — 목록 50건을 세면 구독이 많을 때 문의 0 으로 읽힌다(감사3) */
    supabase.from("link_leads").select("id", { count: "exact", head: true }).eq("page_id", page.id).eq("kind", "contact"),
    supabase.from("link_leads").select("id", { count: "exact", head: true }).eq("page_id", page.id).eq("kind", "subscribe"),
    supabase.from("link_guestbook").select("id", { count: "exact", head: true }).eq("page_id", page.id),
  ]);
  if (leadRows.error) console.error("[links] 받은 내용 조회 실패:", leadRows.error.message);
  if (guestRes.error) console.error("[links] 방명록 조회 실패:", guestRes.error.message);
  if (guestCnt.error) console.error("[links] 방명록 건수 조회 실패:", guestCnt.error.message);
  const leadCounts = {
    contact: contactCnt.error ? 0 : (contactCnt.count ?? 0),
    subscribe: subscribeCnt.error ? 0 : (subscribeCnt.count ?? 0),
    guestbook: guestCnt.error ? 0 : (guestCnt.count ?? 0),
  };
  const guestbook = ((guestRes.error ? [] : (guestRes.data ?? [])) as Array<{
    id: number; name: string; message: string; reply: string | null; hidden: boolean; created_at: string;
  }>).map((g) => ({ id: g.id, name: g.name, message: g.message, reply: g.reply, hidden: g.hidden, createdAt: g.created_at }));

  /* 블록 조회 실패를 빈 배열로 뭉개면 빈 캔버스 + 「초안 수정됨」 + 통계 전부 "지운 블록" 이 된다(감사 #11) */
  if (blockRes.error) {
    console.error("[links] 블록 조회 실패:", blockRes.error.message);
    return { ...EMPTY, loadFailed: true, stats: { ...EMPTY_STATS, days, failed: true } };
  }
  const rows = blockRes.data;
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
    sources: (raw?.sources ?? []).map((x) => ({ src: x.src, views: x.n })),
    devices: (raw?.devices ?? []).map((x) => ({ device: x.device, views: x.n })),
    referrers: (raw?.referrers ?? []).map((x) => ({ host: x.host, views: x.n })),
    dwell: { avgMs: Number(raw?.dwell?.avg_ms ?? 0), n: Number(raw?.dwell?.n ?? 0) },
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

  /* 발행본을 「라이브」 미리보기용으로 파싱한다. 스냅샷은 우리 서버만 쓰는 값이지만
     jsonb 라 형태를 강제할 수 없으므로 방어적으로 읽는다 — 필드가 깨져 있으면
     그 필드만 기본값으로 떨어지고 화면은 산다. */
  const rawSnap = page.published_snapshot as Partial<LinkSnapshotView> | null;
  const snapshot: LinkSnapshotView | null = rawSnap
    ? {
        title: typeof rawSnap.title === "string" ? rawSnap.title : "",
        bio: typeof rawSnap.bio === "string" ? rawSnap.bio : "",
        layout: typeof rawSnap.layout === "string" ? rawSnap.layout : "profile",
        theme: typeof rawSnap.theme === "string" ? rawSnap.theme : "basic",
        align: typeof rawSnap.align === "string" ? rawSnap.align : "center",
        avatarPath: typeof rawSnap.avatarPath === "string" ? rawSnap.avatarPath : null,
        coverPath: typeof rawSnap.coverPath === "string" ? rawSnap.coverPath : null,
        snsLinks: Array.isArray(rawSnap.snsLinks) ? rawSnap.snsLinks : [],
        snsPlacement: typeof rawSnap.snsPlacement === "string" ? rawSnap.snsPlacement : "profile",
        titleSize: typeof rawSnap.titleSize === "string" ? rawSnap.titleSize : "md",
        themeCustom: sanitizeThemeCustom(rawSnap.themeCustom),
        blocks: Array.isArray(rawSnap.blocks) ? rawSnap.blocks : [],
      }
    : null;

  return {
    pages,
    pageLimit,
    multiReady,
    page: {
      id: page.id as string,
      slug: page.slug as string,
      title: (page.title as string) ?? "",
      bio: (page.bio as string) ?? "",
      published: !!page.published,
      layout: (page.layout as string) ?? "profile",
      theme: (page.theme as string) ?? "basic",
      themeCustom: sanitizeThemeCustom(page.theme_custom),
      align: (page.align as string) ?? "center",
      avatarPath: (page.avatar_path as string | null) ?? null,
      coverPath: (page.cover_path as string | null) ?? null,
      snsLinks: Array.isArray(page.sns_links) ? (page.sns_links as Array<{ kind: string; url: string }>) : [],
      seoTitle: (page.seo_title as string | null) ?? "",
      seoDesc: (page.seo_desc as string | null) ?? "",
      snsPlacement: (page.sns_placement as string) ?? "profile",
      titleSize: (page.title_size as string) ?? "md",
      publishedAt,
      dirty,
      settings: sanitizeLinkSettings(page.settings),
    },
    blocks,
    snapshot,
    stats,
    leads,
    leadCounts,
    /* 목록은 성공했는데 count 만 실패하면 카드가 「전체 0건」이라고 거짓말한다 — 실패 신호에 합산(감사4) */
    leadsFailed: !!leadRows.error || !!contactCnt.error || !!subscribeCnt.error,
    /* 방명록은 별도 질의다 — 여기에 안 실으면 조회가 실패해도 화면이 「아직 방명록 글이 없어요」라고
       **사실로 단정**한다(감사5 확정). 받은 내용 쪽은 이미 같은 함정을 막아 뒀다 */
    guestbookFailed: !!guestRes.error || !!guestCnt.error,
    guestbook,
  };
}

export default async function Page({ searchParams }: { searchParams: Promise<{ days?: string; page?: string }> }) {
  const sp = await searchParams;
  const asked = Number(sp.days);
  const days = (STATS_RANGES as readonly number[]).includes(asked) ? asked : DEFAULT_DAYS;

  const wantPage = typeof sp.page === "string" ? sp.page : undefined;
  const { page, pages, pageLimit, multiReady, blocks, snapshot, stats, leads, leadCounts, leadsFailed, guestbookFailed, guestbook, loadFailed } = await load(days, wantPage);

  /* 복사 버튼이 주는 주소는 **지금 접속한 도메인** 기준이어야 한다.
     프로덕션 도메인을 하드코딩하면 로컬·프리뷰에서 복사한 주소가 안 열린다. */
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "finch.ai.kr";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");

  return (
    <div className="space-y-5">
      {/* 페이지 제목·설명 없음 — 편집기가 화면 전체의 주인공이다(2026-08-20 무대화).
          문서 제목은 metadata 가, 위치는 사이드바 활성 항목이 말해 준다. */}
      <LinksClient
        /* 페이지를 갈아타면 **통째로 다시 마운트** — 실행취소 스택·설정 저장 체인이
           페이지 단위 상태라, 남긴 채 갈아타면 다른 페이지에 되돌리기가 꽂힌다(감사4 조사 #10) */
        key={page?.id ?? "none"}
        page={page}
        pages={pages}
        pageLimit={pageLimit}
        multiReady={multiReady}
        blocks={blocks}
        snapshot={snapshot}
        stats={stats}
        leads={leads}
        leadCounts={leadCounts}
        leadsFailed={leadsFailed}
        guestbookFailed={guestbookFailed}
        guestbook={guestbook ?? []}
        origin={`${proto}://${host}`}
        isDemo={isDemoMode()}
        loadFailed={!!loadFailed}
      />
    </div>
  );
}
