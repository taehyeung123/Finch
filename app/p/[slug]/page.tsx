import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { isDemoMode, isSupabaseConfigured } from "@/lib/supabase/config";
import { linkWorkspace } from "@/lib/data";
import { FinchMark } from "@/components/logo";
import { initialOf } from "@/lib/links";
import { hiddenReason, type BlockType } from "@/lib/links/blocks";
import { themeByKey, themeVars, SNS_KINDS } from "@/lib/links/themes";
import { BlockRenderer, type SnapshotBlock } from "./_components/block-renderer";
import { LeadForm } from "./_components/lead-form";
import { ViewBeacon } from "./_components/view-beacon";

/*
  공개 프로필 링크 — /p/{slug}

  (app)·(marketing) 어느 그룹에도 넣지 않았다. 사이드바도 마케팅 헤더/푸터도 붙으면
  안 되는 화면이다 — 여기 오는 사람에게 필요한 건 이 사람의 링크뿐이다.

  **published_snapshot 하나만 읽는다**(0048). 초안(link_blocks)을 조인하지 않는 이유:
   ① 편집 중인 반쪽 상태가 방문자에게 보이면 안 된다
   ② SNS 프로필에서 유입이 몰리는 경로라 조인 없는 단일 행 조회여야 한다
  RLS 가 published=true 인 행만 익명에게 내보내므로, 비공개 페이지는 DB 층에서 막힌다.

  소유자는 비공개여도 자기 페이지를 본다(발행 전 확인). 그때는 초안이 아니라
  **마지막 스냅샷**을 보여준다 — "라이브에 지금 뭐가 걸려 있나"가 이 화면의 질문이다.
*/

export const dynamic = "force-dynamic";

interface Snapshot {
  v: number;
  title: string;
  bio: string;
  layout: string;
  theme: string;
  align: string;
  avatarPath: string | null;
  coverPath: string | null;
  snsLinks: Array<{ kind: string; url: string }>;
  /** SNS 줄 위치 — 0051 이후 스냅샷에 담긴다. 없으면 profile */
  snsPlacement?: string;
  /** 타이틀 크기 — 0051 이후. 없으면 md */
  titleSize?: string;
  seoTitle: string | null;
  seoDesc: string | null;
  blocks: SnapshotBlock[];
}

/**
 * 데모 모드에서 샘플 페이지를 공개 주소로도 연다.
 *
 * 안 하면 /links 는 샘플 페이지를 보여주는데 그 「열기」 버튼이 404 로 떨어진다 —
 * 둘러보러 온 사람에게 제품이 고장난 것으로 읽힌다. 초안을 스냅샷 모양으로 굽는 건
 * publishLinkPage 가 하는 일과 같다(social_feed 의 cached 만 없다 — 연동이 없으므로).
 */
function demoSnapshot(slug: string): { pageId: string; published: boolean; isOwner: boolean; snap: Snapshot } | null {
  const p = linkWorkspace.page;
  if (!p || p.slug !== slug) return null;
  return {
    pageId: p.id,
    published: true,
    isOwner: false,
    snap: {
      v: 1,
      title: p.title,
      bio: p.bio,
      layout: p.layout,
      theme: p.theme,
      align: p.align,
      avatarPath: p.avatarPath,
      coverPath: p.coverPath,
      snsLinks: p.snsLinks,
      snsPlacement: p.snsPlacement,
      titleSize: p.titleSize,
      seoTitle: p.seoTitle || null,
      seoDesc: p.seoDesc || null,
      blocks: linkWorkspace.blocks
        .filter((b) => b.active)
        .map((b) => ({ id: b.id, type: b.type, data: b.data })),
    },
  };
}

async function load(slug: string) {
  if (isDemoMode()) return demoSnapshot(slug);
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();

  /* published 조건을 코드에 걸지 않는다 — RLS 가 이미 그 일을 한다(0045).
     여기서 또 걸면 소유자조차 자기 비공개 페이지를 못 봐서, "일단 공개로 켜서
     확인하고 아니면 끄기"를 강요하게 된다. */
  const { data: page } = await supabase
    .from("link_pages")
    .select("id, slug, published, published_snapshot")
    .eq("slug", slug)
    .maybeSingle();
  if (!page) return null;

  /* 소유자 판정에 user_id 를 **가져오지 않는다.** 이 조회는 익명 세션으로도 도는데
     select 에 user_id 를 넣으면 아무나 소유자의 auth.users.id 를 받아간다.
     대신 "내 페이지의 id"를 따로 읽어 비교한다 — RLS 가 자기 행만 내주므로
     이 조회 자체가 소유 증명이 된다. */
  const me = await getAuthUser();
  let isOwner = false;
  if (me) {
    const { data: mine } = await supabase.from("link_pages").select("id").eq("user_id", me.id).maybeSingle();
    isOwner = !!mine && mine.id === page.id;
  }

  if (!page.published && !isOwner) return null;

  const snap = page.published_snapshot as Snapshot | null;
  /* 한 번도 라이브 반영을 안 했으면 보여줄 게 없다. 방문자에겐 404,
     소유자에겐 안내(아래에서 분기)로 나눈다. */
  if (!snap && !isOwner) return null;

  return { pageId: page.id as string, published: !!page.published, isOwner, snap };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const data = await load(slug);
  if (!data?.snap) return { title: "페이지를 찾을 수 없어요", robots: { index: false, follow: false } };
  const s = data.snap;

  const title = s.seoTitle || s.title || slug;
  const description = s.seoDesc || s.bio || undefined;
  /* 커버가 있으면 커버, 없으면 프로필 사진. 둘 다 없으면 이미지를 **명시적으로 비운다** */
  const image = s.coverPath || s.avatarPath || null;

  return {
    /* absolute 로 루트 레이아웃의 `%s | 핀치 (Finch)` 접미사를 끊는다.
       링크인바이오의 주 유입은 카카오톡·인스타 DM 붙여넣기다 — 사용자 브랜드 페이지
       공유 카드에 우리 이름이 붙으면 그건 우리 홍보지 그 사람의 페이지가 아니다. */
    title: { absolute: title },
    description,
    alternates: { canonical: `/p/${slug}` },
    /* openGraph 를 정의하지 않으면 루트 레이아웃의 핀치 OG 이미지·siteName 을 그대로
       물려받는다. 남의 브랜드 페이지에 우리 로고가 걸리는 게 그 경로였다. */
    openGraph: {
      type: "profile",
      siteName: s.title || slug,
      title,
      description,
      url: `/p/${slug}`,
      images: image ? [image] : [],
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      description,
      images: image ? [image] : [],
    },
    /* 비공개 페이지(소유자 미리보기)는 색인되면 안 된다 */
    robots: data.published ? undefined : { index: false, follow: false },
  };
}

export default async function PublicLinkPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await load(slug);
  if (!data) notFound();

  const { published, isOwner, snap } = data;

  /* 소유자인데 아직 한 번도 발행 안 한 경우 — 404 대신 무엇을 해야 하는지 알린다 */
  if (!snap) {
    return (
      <main className="mx-auto flex min-h-[100dvh] max-w-md flex-col items-center justify-center gap-3 px-5 text-center">
        <p className="text-[17px] font-bold">아직 발행하지 않았어요</p>
        <p className="text-[15px] leading-[1.7] text-fg-sub">
          편집 화면에서 <strong className="font-semibold">라이브 반영</strong>을 누르면 이 주소가 살아납니다.
        </p>
        <Link href="/links" className="mt-2 text-[14px] font-semibold text-primary-ink underline underline-offset-2">
          편집하러 가기
        </Link>
      </main>
    );
  }

  const theme = themeByKey(snap.theme);
  const align = snap.align === "left" ? "text-left items-start" : snap.align === "right" ? "text-right items-end" : "text-center items-center";
  const titlePx = snap.titleSize === "sm" ? "text-[20px]" : snap.titleSize === "lg" ? "text-[30px]" : "text-[24px]";
  const snsNav =
    snap.snsLinks.length > 0 ? (
      <nav
        aria-label="SNS"
        className={
          snap.snsPlacement === "links" ? "mb-4 flex flex-wrap justify-center gap-2" : "mt-3.5 flex flex-wrap gap-2"
        }
      >
        {snap.snsLinks.map((s, i) => (
          <a
            key={i}
            href={s.url}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="rounded-full border border-[var(--lp-border)] bg-[var(--lp-card)] px-3 py-1.5 text-[13px] font-medium"
          >
            {SNS_LABEL.get(s.kind) ?? s.kind}
          </a>
        ))}
      </nav>
    ) : null;

  return (
    <main
      style={themeVars(theme) as React.CSSProperties}
      className="min-h-[100dvh] bg-[var(--lp-bg)] text-[var(--lp-fg)]"
    >
      {/* 방문 집계 — 렌더를 막지 않게 클라이언트에서 한 번만 쏜다.
          개인 식별 정보는 안 보낸다(서버가 익명 토큰만 쿠키로 관리). */}
      {published ? <ViewBeacon slug={slug} /> : null}

      <div className="mx-auto flex min-h-[100dvh] w-full max-w-[520px] flex-col px-5 pb-14 pt-10">
        {isOwner && !published ? (
          <p className="mb-6 rounded-[var(--lp-radius)] border border-[var(--lp-border)] bg-[var(--lp-card)] px-4 py-2.5 text-center text-[13px] font-medium">
            비공개 미리보기예요. 나에게만 보입니다.
          </p>
        ) : null}

        {/* 커버 */}
        {(snap.layout === "cover" || snap.layout === "cover_profile") && snap.coverPath ? (
          // eslint-disable-next-line @next/next/no-img-element -- Storage 공개 URL
          <img
            src={snap.coverPath}
            alt=""
            className="mb-4 aspect-[3/1] w-full rounded-[var(--lp-radius)] object-cover"
          />
        ) : null}

        {/* 프로필 */}
        <header className={`flex flex-col ${align}`}>
          {snap.layout !== "cover" ? (
            snap.avatarPath ? (
              // eslint-disable-next-line @next/next/no-img-element -- Storage 공개 URL
              <img
                src={snap.avatarPath}
                alt=""
                className="mb-3 size-20 rounded-full border-2 border-[var(--lp-card)] object-cover shadow-[var(--lp-shadow)]"
              />
            ) : (
              /* 사진이 없으면 이니셜 원. 아무것도 안 그리면 브랜드 페이지 머리가 통째로
                 비어 허전하다 — 편집 미리보기도 같은 것을 그린다(두 화면이 어긋나면 안 된다). */
              <span
                className="mb-3 flex size-20 items-center justify-center rounded-full border-2 border-[var(--lp-card)] bg-[var(--lp-card)] text-[24px] font-bold text-[var(--lp-muted)] shadow-[var(--lp-shadow)]"
                aria-hidden
              >
                {initialOf(snap.title || slug)}
              </span>
            )
          ) : null}
          <h1 className={`${titlePx} font-bold leading-[1.3]`}>{snap.title || slug}</h1>
          {snap.bio ? (
            <p className="mt-2 whitespace-pre-wrap text-[15px] leading-[1.6] text-[var(--lp-muted)]">{snap.bio}</p>
          ) : null}

          {snap.snsPlacement !== "links" ? snsNav : null}
        </header>

        {/* 블록.
            빈 상태 문구는 **배열 길이가 아니라 그려질 게 있는지**로 정한다.
            createLinkPage 가 주소 없는 「새 링크」를 하나 깔아주므로, 그대로 발행하면
            블록은 1개인데 렌더러가 null 을 돌려줘 방문자는 프로필 아래 공백만 본다.

            ⚠️ hiddenReason 으로 **렌더 목록 자체를 거르지는 않는다.** 이 함수와 렌더러가
            1:1 이 아니라(social_feed 등), 판정이 갈리는 순간 "문구 누락"이
            "정상 블록이 통째로 사라짐"으로 악화된다. 여기서는 문구만 결정한다. */}
        <div className="mt-8 space-y-3">
          {snap.snsPlacement === "links" ? snsNav : null}
          {snap.blocks.every((b) => hiddenReason(b.type as BlockType, b.data)) ? (
            <p className="text-center text-[15px] text-[var(--lp-muted)]">아직 등록된 링크가 없어요.</p>
          ) : null}
          {snap.blocks.map((b) =>
            b.type === "contact" || b.type === "subscribe" ? (
              <LeadForm key={b.id} slug={slug} blockId={b.id} kind={b.type} data={b.data} isDemo={isDemoMode()} />
            ) : (
              <BlockRenderer key={b.id} block={b} slug={slug} />
            ),
          )}
        </div>

        <footer className="mt-auto pt-14 text-center">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[var(--lp-muted)] transition-opacity hover:opacity-70"
          >
            <FinchMark className="size-3.5" />
            핀치로 만들었어요
          </Link>
        </footer>
      </div>
    </main>
  );
}

/* 라벨은 SNS_KINDS 한 곳에서 온다 — 여기 따로 두면 편집 화면·미리보기와 갈린다
   (실제로 갈려 있었다: 편집기는 "인스타그램", 공개 페이지는 "Instagram") */
const SNS_LABEL = new Map<string, string>(SNS_KINDS.map((k) => [k.key, k.label]));
