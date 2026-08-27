import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isDemoMode, isSupabaseConfigured } from "@/lib/supabase/config";
import { DEFAULT_LINK_SETTINGS, faviconHref } from "@/lib/links/settings";
import { lpText } from "@/lib/links/i18n";
import { LockScreen } from "./_components/lock-screen";
import { TrackingScripts } from "./_components/tracking-scripts";
import { loadPublicPage, movedTo } from "./public-page";
import { linkWorkspace } from "@/lib/data";
import { FinchPill } from "./_components/finch-pill";
import { SnsIcon } from "@/components/sns-brand-icons";
import { initialOf, publicLinkUrl, sanitizeSnsLinks } from "@/lib/links";
import { emphasizedCta, hiddenReason, isScheduledHidden, type BlockType } from "@/lib/links/blocks";
import { redirect } from "next/navigation";
import { isLightColor, DEFAULT_THEME_KEY as DEFAULT_LINK_THEME_KEY, fontStylesheets, sanitizeThemeCustom, themeByKey, themeVars, SNS_KINDS } from "@/lib/links/themes";
import { ShareButton } from "./_components/share-button";
import { SubscribeButton } from "./_components/subscribe-button";
import { ScreenEffect } from "./_components/screen-effect";
import { BlockRenderer, type GuestbookPublicEntry, type SnapshotBlock } from "./_components/block-renderer";
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
 * 페이지 한 벌 — 조회·소유자·잠금 판정은 public-page.ts(loadPublicPage)가 한다.
 * /go·/vcard·리드·방명록 제출도 같은 함수를 타므로 잠금 규칙이 한 곳에만 있다.
 * 데모 모드는 샘플 페이지를 공개 주소로도 연다(안 하면 /links 의 「열기」가 404 로 떨어진다).
 */
/* generateMetadata 와 본문이 각각 부른다 — cache 로 같은 요청 안에서는 1회만 조회(감사4).
   잠금·로그인 방문 경로는 조회당 admin 쿼리가 여러 번이라 이중 실행 비용이 컸다. */
const load = cache(async (slug: string) => {
  const p = await loadPublicPage(slug, { withOwner: true });
  if (!p) return null;
  /* published 조건을 코드에 걸지 않는다 — RLS 가 이미 그 일을 한다(0045). 여기서 또 걸면
     소유자조차 자기 비공개 페이지를 못 봐서 "일단 공개로 켜서 확인"을 강요하게 된다. */
  if (!p.published && !p.isOwner) return null;
  const snap = (p.snapshot as Snapshot | null) ?? null;
  /* 한 번도 라이브 반영을 안 했으면 보여줄 게 없다. 방문자에겐 404, 소유자에겐 안내(아래에서 분기).
     잠긴 페이지는 snap 이 null 이어도 잠금 화면을 그려야 하므로 통과시킨다. */
  if (!snap && !p.isOwner && !p.locked) return null;
  return { pageId: p.id, published: p.published, isOwner: p.isOwner, locked: p.locked, settings: p.settings, snap };
});

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const data = await load(slug);
  if (data?.locked) {
    /* 잠긴 페이지 — 제목·소개는 스냅샷 안에 있고 스냅샷은 열기 전엔 안 읽는다. 카드에도 아무것도 안 새게 */
    const lt = lpText(data.settings.lang);
    return { title: { absolute: lt.lock.title }, robots: { index: false, follow: false }, openGraph: { title: lt.lock.title, images: [] } };
  }
  if (!data?.snap) return { title: "페이지를 찾을 수 없어요", robots: { index: false, follow: false } };
  const s = data.snap;
  const st = data.settings ?? DEFAULT_LINK_SETTINGS;

  const title = s.seoTitle || s.title || slug;
  const description = s.seoDesc || s.bio || undefined;
  /* 공유 카드(OG) — 페이지 설정이 우선(0058). 없으면 커버 → 프로필 사진. 둘 다 없으면 이미지를 **명시적으로 비운다** */
  const ogTitle = st.ogTitle || title;
  /* 숨김 레이아웃은 화면에서 프로필 사진을 뺀 것 — 공유 카드에만 새어 나가면 안 된다(쏘넷 점검) */
  const image = st.ogImage || s.coverPath || (s.layout === "hidden" ? null : s.avatarPath) || null;
  const icon = faviconHref(st.favicon);
  /* 비공개·비밀번호·검색 비노출 페이지는 색인되면 안 된다 */
  const noindex = !data.published || data.locked || st.robots === "noindex";

  return {
    /* absolute 로 루트 레이아웃의 `%s | 핀치 (Finch)` 접미사를 끊는다.
       링크인바이오의 주 유입은 카카오톡·인스타 DM 붙여넣기다 — 사용자 브랜드 페이지
       공유 카드에 우리 이름이 붙으면 그건 우리 홍보지 그 사람의 페이지가 아니다. */
    title: { absolute: title },
    description,
    alternates: { canonical: `/${slug}` },
    /* openGraph 를 정의하지 않으면 루트 레이아웃의 핀치 OG 이미지·siteName 을 그대로
       물려받는다. 남의 브랜드 페이지에 우리 로고가 걸리는 게 그 경로였다. */
    openGraph: {
      type: "profile",
      siteName: s.title || slug,
      title: ogTitle,
      description,
      url: `/${slug}`,
      images: image ? [image] : [],
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title: ogTitle,
      description,
      images: image ? [image] : [],
    },
    icons: icon ? { icon: [{ url: icon }] } : undefined,
    robots: noindex ? { index: false, follow: false } : undefined,
    /* 소유확인 메타태그(0058 settings) — 서치콘솔·네이버 웹마스터 등록용.
       값은 sanitizeLinkSettings 가 형식으로 거른 것만 온다. 잠긴 페이지는 위에서 이미 빠져나갔다. */
    verification:
      st.verifyGoogle || st.verifyNaver
        ? {
            ...(st.verifyGoogle ? { google: st.verifyGoogle } : {}),
            ...(st.verifyNaver ? { other: { "naver-site-verification": st.verifyNaver } } : {}),
          }
        : undefined,
  };
}

/*
  ⚠️ slug 와 urlBase 는 **다른 것**이다.
   · slug    — 데이터 식별. 서버 액션·집계·스냅샷 조회가 쓰는 그 페이지의 전역 이름.
   · urlBase — 방문자가 실제로 보고 있는 주소. 서브 페이지는 `{부모}/{sub}` 로 들어오고,
               그 아래에 링크·비콘·잠금 쿠키가 놓여야 한다(안 그러면 쿠키 path 가 어긋나
               해제한 페이지가 다시 잠기고, 클릭·체류가 익명으로 쌓인다).
  기본값은 slug — 최상위 페이지는 둘이 같다.
*/
export default async function PublicLinkPage({ params, urlBase }: { params: Promise<{ slug: string }>; urlBase?: string }) {
  const { slug } = await params;
  const base = urlBase ?? slug;
  const data = await load(slug);
  if (!data) {
    /* 주소를 바꾼 페이지면 새 주소로 — 302(임시)다. 무덤 보호가 끝나는 90일 뒤 이 주소를
       다른 사람이 새로 잡을 수 있는데, 301 을 브라우저가 캐시하면 그때 새 주인의 손님을
       옛 페이지로 보낸다(옛 /p/ → 루트 301 과는 다른 상황 — 그 주소 공간은 영구히 우리 것이다). */
    const current = await movedTo(slug);
    if (current) redirect(`/${current}`);
    notFound();
  }

  const { pageId, published, isOwner, snap, locked, settings } = data;
  const t = lpText(settings.lang);
  /* 링크 열기 방식(0058) — 새 창이 기본. 현재 창은 앱 내부 브라우저용 */
  const ext = settings.target === "self" ? { rel: "noopener noreferrer nofollow" } : { target: "_blank", rel: "noopener noreferrer nofollow" };

  /* 비밀번호 페이지 — 스냅샷(제목·테마 포함)은 열기 전엔 읽지 않으므로 기본 테마로 잠금 화면만.
     방문 집계도 열린 뒤에 */
  if (locked) {
    const theme = themeByKey(DEFAULT_LINK_THEME_KEY);
    return (
      <main
        lang={settings.lang}
        style={themeVars(theme, null) as React.CSSProperties}
        className="relative isolate flex min-h-[100dvh] items-center justify-center bg-[var(--lp-bg)] px-5 text-[var(--lp-fg)]"
      >
        <LockScreen slug={slug} urlBase={base} message={settings.lockMessage} t={t.lock} errors={t.errors} />
      </main>
    );
  }

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
  /* 직접 꾸미기 — 스냅샷에 굳은 값. 발행 전 잘못 들어온 값이 있어도 관문을 한 번 더 태운다 */
  const themeCustom = sanitizeThemeCustom((snap as { themeCustom?: unknown }).themeCustom);
  /* 예약 공개·숨김은 **요청 시점**에 판정한다(이 페이지는 force-dynamic). 스냅샷은 그대로 두고 그리는 목록만 거른다 */
  const visibleBlocks = snap.blocks.filter((b) => !isScheduledHidden(b.data));
  const emphasized = (() => {
    for (const b of visibleBlocks) {
      const cta = emphasizedCta(b.type as BlockType, b.data, { donate: t.donate, product: t.product, go: t.go });
      if (cta) return { block: b, cta };
    }
    return null;
  })();
  const align = snap.align === "left" ? "text-left items-start" : snap.align === "right" ? "text-right items-end" : "text-center items-center";
  /* SNS 줄이 줄바꿈될 때 둘째 줄의 정렬 — **페이지 정렬을 따른다**. 강제로 가운데를 주면
     왼쪽 정렬 페이지에서 둘째 줄만 안쪽으로 들어가 제목·소개와 어긋난다(소넷 확정) */
  const justify = snap.align === "left" ? "justify-start" : snap.align === "right" ? "justify-end" : "justify-center";
  const titlePx = snap.titleSize === "sm" ? "text-[21px]" : snap.titleSize === "lg" ? "text-[32px]" : "text-[26px]";
  /* 글자 크기는 대표문구·상세문구가 함께 움직인다(2026-08-26 — 제목만 커지면 위계만 벌어진다) */
  const bioPx = snap.titleSize === "sm" ? "text-[14px]" : snap.titleSize === "lg" ? "text-[17px]" : "text-[15px]";
  /* SNS 줄은 **여기서 한 번 더 거른다** — 스냅샷은 본인 행 직접 PATCH 로 아무 값이나 들어올 수
     있고, 그대로 <a href> 로 찍으면 javascript: 저장형 XSS 가 된다(감사 #5). themeCustom 과 같은 원칙. */
  const snsLinks = sanitizeSnsLinks((snap as { snsLinks?: unknown }).snsLinks);
  const snsNav =
    snsLinks.length > 0 ? (
      <nav
        aria-label="SNS"
        className={
          /* 줄바꿈된 둘째 줄이 첫 줄과 같은 축에 서게 한다(전에는 항상 왼쪽으로 붙었다).
             블록 위(links)에 둘 때는 페이지 폭 전체를 쓰므로 가운데, 프로필 아래에서는 페이지 정렬을 따른다.
             소개와의 간격은 한 단 키운다(아바타-이름과 같은 3.5 면 위계가 안 생긴다). 2026-08-24 비평 */
          snap.snsPlacement === "links" ? "mb-4 flex flex-wrap justify-center gap-2" : `mt-5 flex flex-wrap gap-2 ${justify}`
        }
      >
        {snsLinks.map((s, i) => (
          <a
            key={i}
            href={s.url}
            {...ext}
            aria-label={SNS_LABEL.get(s.kind) ?? s.kind}
            title={SNS_LABEL.get(s.kind) ?? s.kind}
            className="lp-btn flex size-11 items-center justify-center rounded-full border border-[var(--lp-border)] bg-[var(--lp-card)] shadow-[var(--lp-shadow)]"
          >
            <SnsIcon kind={s.kind} className="size-[18px] shrink-0" />
          </a>
        ))}
      </nav>
    ) : null;

  /* 3단계 디자인 옵션 — 값이 없으면 전부 예전과 같은 모양 */
  const fx = themeCustom?.effect && themeCustom.effect !== "none" ? themeCustom.effect : undefined;
  const anim = themeCustom?.anim && themeCustom.anim !== "none" ? themeCustom.anim : undefined;
  /* cover 는 배너가 전폭이라, hidden 은 왼쪽 칸(프로필)이 통째로 비어서 분리 배치가 성립 안 한다
     — 숨김이면 자동으로 한 줄 배치로 떨어진다(쏘넷 점검: 미리보기엔 split 이 없어 안 보이는 회귀) */
  const split = themeCustom?.desktop === "split" && snap.layout !== "cover" && snap.layout !== "hidden";
  const fonts = fontStylesheets(themeCustom?.font);
  /* 디자인 탭 보완(2026-08-23): 상단 메뉴 줄·구독 버튼·내 로고·커서·화면 효과 */
  const topbar = themeCustom?.topbar === "bar";
  const hasSubscribeBlock = visibleBlocks.some((b) => b.type === "subscribe");
  const subscribeOn = !!themeCustom?.subscribe && hasSubscribeBlock;
  const logoImage = themeCustom?.logoImage ?? null;
  const logoPos = themeCustom?.logoPos ?? "bottom";
  const screenFx = themeCustom?.screenFx && themeCustom.screenFx !== "none" ? themeCustom.screenFx : null;
  const logoEl = logoImage ? (
    <div className={`flex justify-center ${logoPos === "top" ? "mb-5" : "mt-10 pb-6"} ${split ? (logoPos === "top" ? "lg:col-span-2" : "lg:col-start-2") : ""}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- Storage 공개 URL */}
      <img src={logoImage} alt="" className="max-h-12 max-w-[200px] object-contain" />
    </div>
  ) : null;
  /* 방명록 블록이 있으면 공개 글(숨김 제외, 최근 20)을 읽는다 — 0057 미적용이면 빈 배열 */
  let guestbook: GuestbookPublicEntry[] = [];
  if (isDemoMode()) {
    guestbook = (linkWorkspace.guestbook ?? []).filter((g) => !g.hidden).map((g) => ({ id: g.id, name: g.name, message: g.message, reply: g.reply, createdAt: g.createdAt }));
  } else if (visibleBlocks.some((b) => b.type === "guestbook") && isSupabaseConfigured()) {
    /* 공개 읽기 정책은 anon 전용(0059) — 로그인한 방문자·열린 비밀번호 페이지는 service_role 로 읽는다(숨김 제외는 아래 eq) */
    const supabase = isOwner ? await createClient() : createAdminClient();
    const { data: rows } = !supabase ? { data: null } : await supabase
      .from("link_guestbook")
      .select("id, name, message, reply, created_at")
      .eq("page_id", pageId)
      .eq("hidden", false)
      .order("created_at", { ascending: false })
      .limit(20);
    guestbook = ((rows ?? []) as Array<{ id: number; name: string; message: string; reply: string | null; created_at: string }>).map((g) => ({
      id: g.id, name: g.name, message: g.message, reply: g.reply, createdAt: g.created_at,
    }));
  }

  return (
    <main
      lang={settings.lang}
      /* 커서는 themeVars 가 결정해 넣는다 — 여기서 var(--lp-cursor) 를 쓰면 기본 커서 페이지에서도
         style 문자열에 토큰 이름이 남아 링크의 손가락 커서가 죽는다(themes.ts 주석) */
      style={{ ...themeVars(theme, themeCustom), fontFamily: "var(--lp-font)" } as React.CSSProperties}
      className="relative isolate min-h-[100dvh] bg-[var(--lp-bg)] text-[var(--lp-fg)]"
      data-lp-fx={fx}
      data-lp-anim={anim}
    >
      {/* 글꼴 — fontsource(jsdelivr). React 19 가 precedence 로 <head> 에 올린다 */}
      {fonts.length ? <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="" /> : null}
      {fonts.map((href) => (
        <link key={href} rel="stylesheet" href={href} precedence="default" />
      ))}
      {/* 배경 이미지·그라데이션은 **뷰포트 크기로 고정된 한 겹**에 깐다. main 에 직접 깔면
          문서 높이 전체(블록 10개면 2400px)를 cover 하느라 이미지가 세로 띠로 확대되고
          스크롤에 따라 움직여, 375×812 프레임에 한 번만 cover 하는 미리보기와 달라진다(감사 #19).
          background-attachment: fixed 는 iOS 가 무시하므로 fixed 레이어로 푼다.
          블러 필터는 레이어를 살짝 키워(-inset) 가장자리 번짐을 숨긴다. */}
      <div
        aria-hidden
        className="pointer-events-none fixed -inset-4 -z-20 bg-[var(--lp-bg)] bg-cover bg-center"
        style={{ backgroundImage: "var(--lp-bg-image)", filter: "blur(var(--lp-bg-blur))" }}
      />
      {/* PC 무대(2026-08-26 사장님 지시 «PC 레이아웃 전부 조정») — 링크인바이오 표준 문법의 재구현:
          넓은 화면에서는 테마 배경을 그대로 펼치지 않고, 흐리고 어둡게 눌러 «무대»로 깔고
          그 위에 또렷한 테마를 품은 캔버스(아래 wrapper)가 뜬다. 테마가 무슨 색이든 무대는
          자기 색으로 은은하게 물들고, 콘텐츠 캔버스가 주인공이 된다. 모바일은 이 레이어가 없다. */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 hidden bg-black/45 backdrop-blur-3xl lg:block" />

      {/* 방문 집계 — 렌더를 막지 않게 클라이언트에서 한 번만 쏜다.
          개인 식별 정보는 안 보낸다(서버가 익명 토큰만 쿠키로 관리). */}
      {published ? <ViewBeacon slug={slug} urlBase={base} /> : null}
      {screenFx ? <ScreenEffect kind={screenFx} light={isLightColor(themeCustom?.bg ?? theme.bg)} /> : null}
      {/* 마케팅 연결(GA4·Meta 픽셀·TikTok 픽셀) — 주인이 ID 를 넣었을 때만, 공개 상태에서만 실린다.
          주인 미리보기(비공개)엔 안 싣는다 — 자기 방문이 광고 계정 통계를 더럽힌다. */}
      {published && !isOwner ? <TrackingScripts settings={settings} /> : null}

      <div
        className={`${
          split
            ? "relative mx-auto flex min-h-[100dvh] w-full max-w-[520px] flex-col px-5 pb-14 lg:grid lg:max-w-[1000px] lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)] lg:items-start lg:gap-x-16 lg:px-14 lg:pb-16 lg:pt-16"
            : "relative mx-auto flex min-h-[100dvh] w-full max-w-[520px] flex-col px-5 pb-14 lg:max-w-[600px] lg:px-10 lg:pb-16"
        } ${topbar ? "pt-4" : snap.layout === "hero" || snap.layout === "cover" || snap.layout === "cover_profile" ? "pt-0" : "pt-20"} lg:isolate lg:my-12 lg:min-h-[calc(100dvh-6rem)] ${topbar ? "" : snap.layout === "hero" || snap.layout === "cover" || snap.layout === "cover_profile" ? "lg:pt-0" : "lg:pt-16"}`}
      >
        {/* PC 캔버스 — 판(색·그림자·테두리)과 이미지(사용자 블러 옵션)를 **두 겹으로 분리**한다:
            한 겹에 filter 를 걸면 그림자·라운드 테두리까지 같이 번진다. 이미지 겹은 clip-path 로
            라운드에 맞춰 잘라 블러 번짐이 모서리 밖으로 새지 않게 한다. overflow-hidden 을 안
            쓰는 이유: 분리 배치의 프로필 sticky·하단 고정 CTA 가 뷰포트 기준 sticky 라 잘라내면
            죽는다. 모바일에는 이 두 겹이 없다(기존 고정 배경 그대로). */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 hidden rounded-[28px] bg-[var(--lp-bg)] shadow-[0_32px_96px_-24px_rgba(0,0,0,0.55)] ring-1 ring-white/15 lg:block"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 hidden bg-cover bg-center lg:block"
          style={{ backgroundImage: "var(--lp-bg-image)", filter: "blur(var(--lp-bg-blur))", clipPath: "inset(0 round 28px)" }}
        />
        {/* 상단 메뉴 줄 — 스크롤해도 붙어 있는 제목 + 공유/구독(리틀리 「상단 메뉴」). 없으면 버튼은 모서리에 떠 있는다 */}
        {topbar ? (
          <div className={`sticky top-0 z-20 -mx-5 mb-5 flex min-h-[52px] items-center gap-3 border-b border-[var(--lp-border)] px-5 py-2.5 backdrop-blur ${split ? "lg:col-span-2 lg:-mx-8 lg:px-8" : ""}`} style={{ backgroundColor: "color-mix(in srgb, var(--lp-bg) 88%, transparent)" }}>
            {snap.avatarPath ? (
              // eslint-disable-next-line @next/next/no-img-element -- Storage 공개 URL
              <img src={snap.avatarPath} alt="" className="size-7 rounded-full object-cover" />
            ) : null}
            <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">{snap.title || slug}</span>
            {subscribeOn ? <SubscribeButton label={t.lead.subscribe} inline /> : null}
            {themeCustom?.share ? <ShareButton url={publicLinkUrl(slug)} title={snap.title || slug} label={t.share} done={t.copied} inline /> : null}
          </div>
        ) : (
          <>
            {/* 공유 버튼 — 콘텐츠 칸 기준 오른쪽 위(창 끝이 아니라, 소넷 확정). 켜져 있으면 위 여백을 pt-16 으로 벌려
                오른쪽 정렬 아바타·제목·주인 배너와 겹치지 않는다(감사 L14) */}
            {themeCustom?.share ? <ShareButton url={publicLinkUrl(slug)} title={snap.title || slug} label={t.share} done={t.copied} /> : null}
            {subscribeOn ? <SubscribeButton label={t.lead.subscribe} /> : null}
          </>
        )}
        {logoPos === "top" ? logoEl : null}
        {isOwner && !published ? (
          <p className={`mb-6 rounded-[var(--lp-radius)] border border-[var(--lp-border)] bg-[var(--lp-card)] px-4 py-2.5 text-center text-[13px] font-medium ${split ? "lg:col-start-1" : ""}`}>
            비공개 미리보기예요. 나에게만 보입니다.
          </p>
        ) : null}

        {/* 커버 — 리틀리 재실측(2026-08-26): 라운드 배너가 아니라 **풀블리드 상단 배경**(4:3).
            사진이 없어도 회색 판으로 자리가 산다 — 레이아웃을 고른 의도가 화면에 남는다.
            분리 배치에선 칸을 넘을 수 없어 칸 폭+라운드로 담는다. */}
        {snap.layout === "cover" || snap.layout === "cover_profile" ? (
          <div
            className={`relative overflow-hidden ${snap.layout === "cover_profile" ? "" : "mb-4"} ${
              split
                ? "w-full rounded-[var(--lp-radius)] lg:col-start-1"
                : "-mx-5 self-stretch lg:-mx-10 lg:rounded-t-[28px]"
            }`}
          >
            {snap.coverPath ? (
              // eslint-disable-next-line @next/next/no-img-element -- Storage 공개 URL
              <img src={snap.coverPath} alt="" className="aspect-[4/3] w-full object-cover" />
            ) : (
              <div aria-hidden className="aspect-[4/3] w-full bg-[var(--lp-border)]" />
            )}
          </div>
        ) : null}

        {/* 프로필 — 분리 배치에선 왼쪽 칸 고정(명시하지 않으면 앞 항목에 밀려 오른쪽 칸으로 튄다, 소넷 확정) */}
        {/* 아바타 반지름(88/2=44px)만큼 끌어올려 커버 하단선을 반쯤 문다 — 레이아웃 선택 썸네일과
            LAYOUTS 힌트("배너 위에 프로필 사진")가 약속한 모양이 화면에 없었다(2026-08-24 비평) */}
        {snap.layout === "hidden" ? null : (
        <header
          className={`relative flex flex-col ${snap.layout === "hero" ? "items-center text-center" : align} ${snap.layout === "cover_profile" ? "-mt-12" : ""} ${split ? "lg:col-start-1 lg:sticky lg:top-16 lg:self-start" : ""}`}
        >
          {/* 배경형(hero, 리틀리 실측) — 프로필 사진이 상단 전체 배경으로 깔리고
              아래로 갈수록 지면색에 녹는다. 사진이 없으면 이 층 없이 문구만(방문자에게
              회색 자리표시자를 보여주지 않는다 — 초대는 편집 미리보기의 몫). */}
          {snap.layout === "hero" && snap.avatarPath ? (
            <div className="relative -mx-5 mb-4 self-stretch overflow-hidden lg:-mx-10 lg:rounded-t-[28px]">
              {/* eslint-disable-next-line @next/next/no-img-element -- Storage 공개 URL */}
              <img src={snap.avatarPath} alt="" className="aspect-[6/5] w-full object-cover" />
              <div aria-hidden className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-b from-transparent to-[var(--lp-bg)]" />
            </div>
          ) : null}
          {snap.layout !== "cover" && snap.layout !== "hero" ? (
            snap.avatarPath ? (
              // eslint-disable-next-line @next/next/no-img-element -- Storage 공개 URL
              <img
                src={snap.avatarPath}
                alt=""
                /* outline 헤어라인 — --lp-shadow 가 none 인 프리셋 8종에서는 box-shadow 선언이
                   통째로 무효라 ring 까지 죽는다. 바깥선 하나로 19종 전부에서 원이 보인다(2026-08-24 비평) */
                className="mb-3.5 size-[96px] rounded-[26px] object-cover shadow-[var(--lp-shadow)] outline-1 outline-offset-[3px] outline-[var(--lp-border)] ring-4 ring-[var(--lp-card)]"
              />
            ) : (
              /* 사진이 없으면 이니셜 원. 아무것도 안 그리면 브랜드 페이지 머리가 통째로
                 비어 허전하다 — 편집 미리보기도 같은 것을 그린다(두 화면이 어긋나면 안 된다). */
              <span
                className="mb-3.5 flex size-[96px] items-center justify-center rounded-[26px] bg-[var(--lp-card)] text-[32px] font-bold text-[var(--lp-muted)] shadow-[var(--lp-shadow)] outline-1 outline-offset-[3px] outline-[var(--lp-border)] ring-4 ring-[var(--lp-card)]"
                aria-hidden
              >
                {initialOf(snap.title || slug)}
              </span>
            )
          ) : null}
          {/* 글자색·자간을 명시한다 — globals.css @layer base 의 h1 규칙(--fg-strong, 자간)이
              테마색 상속을 이겨 다크 프리셋에서 제목이 배경색과 같아졌다(감사 #6). */}
          {/* break-words — 띄어쓰기 없는 긴 이름(URL·해시태그)이 폭을 뚫고 페이지에 가로 스크롤을 만들었다.
              자간은 -0.01em: tracking-normal 은 base 레이어를 끄려던 것인데 26px 볼드 제목의 자간까지
              통째로 0 으로 풀어 버렸다(2026-08-24 비평) */}
          <h1 className={`${titlePx} w-full break-words font-bold leading-[1.3] tracking-[-0.01em] text-[var(--lp-fg)]`}>{snap.title || slug}</h1>
          {snap.bio ? (
            <p className={`mt-2 w-full max-w-[42ch] whitespace-pre-wrap break-words ${bioPx} leading-[1.7] text-[var(--lp-muted)]`}>{snap.bio}</p>
          ) : null}

          {snap.snsPlacement !== "links" ? snsNav : null}
        </header>
        )}

        {/* 블록.
            빈 상태 문구는 **배열 길이가 아니라 그려질 게 있는지**로 정한다.
            createLinkPage 가 주소 없는 「새 링크」를 하나 깔아주므로, 그대로 발행하면
            블록은 1개인데 렌더러가 null 을 돌려줘 방문자는 프로필 아래 공백만 본다.

            ⚠️ hiddenReason 으로 **렌더 목록 자체를 거르지는 않는다.** 이 함수와 렌더러가
            1:1 이 아니라(social_feed 등), 판정이 갈리는 순간 "문구 누락"이
            "정상 블록이 통째로 사라짐"으로 악화된다. 여기서는 문구만 결정한다. */}
        <div className={`mt-8 space-y-4 ${split ? "lg:col-start-2 lg:row-span-3 lg:mt-0" : ""}`}>
          {snap.snsPlacement === "links" ? snsNav : null}
          {visibleBlocks.every(
            (b) =>
              hiddenReason(b.type as BlockType, b.data) ||
              /* 최근 게시물은 연동 전·조회 실패면 렌더러가 null 을 돌려준다 — 문구 판정도 같은 기준 */
              (b.type === "social_feed" && !(Array.isArray(b.data.cached) && b.data.cached.length > 0)),
          ) ? (
            <p className="text-center text-[15px] text-[var(--lp-muted)]">{t.emptyLinks}</p>
          ) : null}
          {visibleBlocks.map((b) => (
            <div key={b.id} className="lp-block" data-lp-subscribe={b.type === "subscribe" ? "" : undefined}>
              {b.type === "contact" || b.type === "subscribe" ? (
                <LeadForm slug={slug} blockId={b.id} kind={b.type} data={b.data} isDemo={isDemoMode()} t={t.lead} errors={t.errors} />
              ) : (
                /* BlockRenderer 의 slug 는 **주소 조립 전용**이다(goHref·vcard) — 서브 페이지에선 표준 주소를 넘긴다 */
                <BlockRenderer block={b} slug={slug} urlBase={base} guestbook={b.type === "guestbook" ? guestbook : undefined} isDemo={isDemoMode()} t={t} ext={ext} />
              )}
            </div>
          ))}
        </div>

        {/* 핀치 배지 — 링크팜의 「링크팜에서 내 프로필 꾸미기」 카피(2026-08-20 지시).
            방문자가 "나도 하나 만들까"로 넘어오는 통로라 마지막 블록 바로 아래 알약으로
            둔다. 미리보기(phone-preview)도 같은 자리에 같은 모양을 그린다. */}
        {logoPos === "bottom" ? logoEl : null}
        {/* 하단 브랜딩 — 플로팅 알약 **하나만**(2026-08-26 2차: 문구+알약 두 겹은 로고가
            나란히 두 번 보여 중복이라는 지적). 내 로고·배지 숨김이면 안 그리고, 강조 블록
            고정 CTA 가 있으면 생략 — 같은 자리라 돈 버는 버튼을 덮으면 안 된다. */}
        {themeCustom?.badge === "hide" || logoImage || emphasized ? null : <FinchPill label={t.badgeCta} />}

        {/* 강조 블록 — 페이지 하단에 **고정 CTA** 로 한 번 더(리틀리 흡수 1단계). 본문 자리에도 그대로 있다.
            흐름의 **맨 마지막**에 두고 sticky bottom — 스크롤 중엔 화면 아래에 붙고, 끝까지 내리면 제자리로
            내려와 배지를 덮지 않는다(소넷 지적). */}
        {emphasized ? (
          /* mt-auto — 콘텐츠가 화면보다 짧으면 sticky 는 "붙을 자리"가 없어 본문 바로 아래(화면 중간)에
             박제된다. 남는 공간을 흡수해 화면 아래로 내려 보낸다(main 은 min-h-[100dvh] flex-col). 2026-08-24 비평.
             ⚠️ 분리 배치(lg:grid)에서는 그리드 트랙이 내용 높이로 잡혀 mt-auto 가 무효다(소넷 확정).
             데스크톱 넓은 화면 + 아주 짧은 페이지에서만 CTA 가 본문 바로 아래에 온다 — 폰(문제의 화면)은 해결됐다.
             그리드 행을 재단하려면 배치 전체를 건드려야 해서 여기서는 한계를 명시만 한다. */
          <div className={`pointer-events-none sticky bottom-4 z-10 mt-auto pt-4 flex justify-center ${split ? "lg:col-start-2" : ""}`}>
            <a
              href={`/${base}/go/${emphasized.block.id}`}
              {...ext}
              className="lp-btn pointer-events-auto inline-flex min-h-[56px] items-center justify-center rounded-[var(--lp-radius-btn)] bg-[var(--lp-accent)] px-6 text-[15px] font-bold text-[var(--lp-on-accent)] shadow-[var(--lp-shadow)]"
            >
              {emphasized.cta.label}
            </a>
          </div>
        ) : null}
      </div>
    </main>
  );
}

/* 라벨은 SNS_KINDS 한 곳에서 온다 — 여기 따로 두면 편집 화면·미리보기와 갈린다
   (실제로 갈려 있었다: 편집기는 "인스타그램", 공개 페이지는 "Instagram") */
const SNS_LABEL = new Map<string, string>(SNS_KINDS.map((k) => [k.key, k.label]));
