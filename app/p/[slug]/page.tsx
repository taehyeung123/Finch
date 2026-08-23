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
import { loadPublicPage } from "./public-page";
import { linkWorkspace } from "@/lib/data";
import { FinchMark } from "@/components/logo";
import { SnsIcon } from "@/components/sns-brand-icons";
import { initialOf, publicLinkUrl, sanitizeSnsLinks } from "@/lib/links";
import { emphasizedCta, hiddenReason, isScheduledHidden, type BlockType } from "@/lib/links/blocks";
import { DEFAULT_THEME_KEY as DEFAULT_LINK_THEME_KEY, fontStylesheets, sanitizeThemeCustom, themeByKey, themeVars, SNS_KINDS } from "@/lib/links/themes";
import { ShareButton } from "./_components/share-button";
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
async function load(slug: string) {
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
}

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
  const image = st.ogImage || s.coverPath || s.avatarPath || null;
  const icon = faviconHref(st.favicon);
  /* 비공개·비밀번호·검색 비노출 페이지는 색인되면 안 된다 */
  const noindex = !data.published || data.locked || st.robots === "noindex";

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
      title: ogTitle,
      description,
      url: `/p/${slug}`,
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
  };
}

export default async function PublicLinkPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await load(slug);
  if (!data) notFound();

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
        <LockScreen slug={slug} message={settings.lockMessage} t={t.lock} errors={t.errors} />
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
  const titlePx = snap.titleSize === "sm" ? "text-[20px]" : snap.titleSize === "lg" ? "text-[30px]" : "text-[24px]";
  /* SNS 줄은 **여기서 한 번 더 거른다** — 스냅샷은 본인 행 직접 PATCH 로 아무 값이나 들어올 수
     있고, 그대로 <a href> 로 찍으면 javascript: 저장형 XSS 가 된다(감사 #5). themeCustom 과 같은 원칙. */
  const snsLinks = sanitizeSnsLinks((snap as { snsLinks?: unknown }).snsLinks);
  const snsNav =
    snsLinks.length > 0 ? (
      <nav
        aria-label="SNS"
        className={
          snap.snsPlacement === "links" ? "mb-4 flex flex-wrap justify-center gap-2" : "mt-3.5 flex flex-wrap gap-2"
        }
      >
        {snsLinks.map((s, i) => (
          <a
            key={i}
            href={s.url}
            {...ext}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full border border-[var(--lp-border)] bg-[var(--lp-card)] px-3.5 py-2 text-[13px] font-medium"
          >
            <SnsIcon kind={s.kind} className="size-3.5 shrink-0" />
            {SNS_LABEL.get(s.kind) ?? s.kind}
          </a>
        ))}
      </nav>
    ) : null;

  /* 3단계 디자인 옵션 — 값이 없으면 전부 예전과 같은 모양 */
  const fx = themeCustom?.effect && themeCustom.effect !== "none" ? themeCustom.effect : undefined;
  const anim = themeCustom?.anim && themeCustom.anim !== "none" ? themeCustom.anim : undefined;
  const split = themeCustom?.desktop === "split" && snap.layout !== "cover";
  const fonts = fontStylesheets(themeCustom?.font);
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
        className="pointer-events-none fixed -inset-4 -z-10 bg-[var(--lp-bg)] bg-cover bg-center"
        style={{ backgroundImage: "var(--lp-bg-image)", filter: "blur(var(--lp-bg-blur))" }}
      />

      {/* 방문 집계 — 렌더를 막지 않게 클라이언트에서 한 번만 쏜다.
          개인 식별 정보는 안 보낸다(서버가 익명 토큰만 쿠키로 관리). */}
      {published ? <ViewBeacon slug={slug} /> : null}
      {/* 마케팅 연결(GA4·Meta 픽셀·TikTok 픽셀) — 주인이 ID 를 넣었을 때만, 공개 상태에서만 실린다.
          주인 미리보기(비공개)엔 안 싣는다 — 자기 방문이 광고 계정 통계를 더럽힌다. */}
      {published && !isOwner ? <TrackingScripts settings={settings} /> : null}

      <div
        className={`${
          split
            ? "relative mx-auto flex min-h-[100dvh] w-full max-w-[520px] flex-col px-5 pb-14 lg:grid lg:max-w-[980px] lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] lg:items-start lg:gap-x-14 lg:px-8 lg:pt-16"
            : "relative mx-auto flex min-h-[100dvh] w-full max-w-[520px] flex-col px-5 pb-14"
        } ${themeCustom?.share ? "pt-16" : "pt-10"}`}
      >
        {/* 공유 버튼 — 콘텐츠 칸 기준 오른쪽 위(창 끝이 아니라, 소넷 확정). 켜져 있으면 위 여백을 pt-16 으로 벌려
            오른쪽 정렬 아바타·제목·주인 배너와 겹치지 않는다(감사 L14) */}
        {themeCustom?.share ? <ShareButton url={publicLinkUrl(slug)} title={snap.title || slug} label={t.share} done={t.copied} /> : null}
        {isOwner && !published ? (
          <p className={`mb-6 rounded-[var(--lp-radius)] border border-[var(--lp-border)] bg-[var(--lp-card)] px-4 py-2.5 text-center text-[13px] font-medium ${split ? "lg:col-start-1" : ""}`}>
            비공개 미리보기예요. 나에게만 보입니다.
          </p>
        ) : null}

        {/* 커버 */}
        {(snap.layout === "cover" || snap.layout === "cover_profile") && snap.coverPath ? (
          // eslint-disable-next-line @next/next/no-img-element -- Storage 공개 URL
          <img
            src={snap.coverPath}
            alt=""
            className={`mb-4 aspect-[3/1] w-full rounded-[var(--lp-radius)] object-cover ${split ? "lg:col-start-1" : ""}`}
          />
        ) : null}

        {/* 프로필 — 분리 배치에선 왼쪽 칸 고정(명시하지 않으면 앞 항목에 밀려 오른쪽 칸으로 튄다, 소넷 확정) */}
        <header className={`flex flex-col ${align} ${split ? "lg:col-start-1 lg:sticky lg:top-16 lg:self-start" : ""}`}>
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
          {/* 글자색·자간을 명시한다 — globals.css @layer base 의 h1 규칙(--fg-strong, 자간)이
              테마색 상속을 이겨 다크 프리셋에서 제목이 배경색과 같아졌다(감사 #6). */}
          <h1 className={`${titlePx} font-bold leading-[1.3] tracking-normal text-[var(--lp-fg)]`}>{snap.title || slug}</h1>
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
        <div className={`mt-8 space-y-3 ${split ? "lg:col-start-2 lg:row-span-3 lg:mt-0" : ""}`}>
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
            <div key={b.id} className="lp-block">
              {b.type === "contact" || b.type === "subscribe" ? (
                <LeadForm slug={slug} blockId={b.id} kind={b.type} data={b.data} isDemo={isDemoMode()} t={t.lead} errors={t.errors} />
              ) : (
                <BlockRenderer block={b} slug={slug} guestbook={b.type === "guestbook" ? guestbook : undefined} isDemo={isDemoMode()} t={t} ext={ext} />
              )}
            </div>
          ))}
        </div>

        {/* 핀치 배지 — 링크팜의 「링크팜에서 내 프로필 꾸미기」 카피(2026-08-20 지시).
            방문자가 "나도 하나 만들까"로 넘어오는 통로라 마지막 블록 바로 아래 알약으로
            둔다. 미리보기(phone-preview)도 같은 자리에 같은 모양을 그린다. */}
        {themeCustom?.badge === "hide" ? null : (
        <footer className={`mt-10 pb-6 text-center ${split ? "lg:col-start-2" : ""}`}>
          <Link
            href="/?utm_source=profile_link&utm_medium=badge"
            target="_blank"
            className="inline-flex items-center gap-2 rounded-full border border-[var(--lp-border)] bg-[var(--lp-card)] px-4 py-2 text-[13px] font-semibold text-[var(--lp-muted)] shadow-[var(--lp-shadow)] transition-opacity hover:opacity-80"
          >
            <FinchMark className="size-4 text-primary" />
            {t.badge}
          </Link>
        </footer>
        )}

        {/* 강조 블록 — 페이지 하단에 **고정 CTA** 로 한 번 더(리틀리 흡수 1단계). 본문 자리에도 그대로 있다.
            흐름의 **맨 마지막**에 두고 sticky bottom — 스크롤 중엔 화면 아래에 붙고, 끝까지 내리면 제자리로
            내려와 배지를 덮지 않는다(소넷 지적). */}
        {emphasized ? (
          <div className={`pointer-events-none sticky bottom-4 z-10 mt-4 flex justify-center ${split ? "lg:col-start-2" : ""}`}>
            <a
              href={`/p/${slug}/go/${emphasized.block.id}`}
              {...ext}
              className="lp-btn pointer-events-auto inline-flex min-h-[48px] items-center justify-center rounded-[var(--lp-radius-btn)] bg-[var(--lp-accent)] px-6 text-[15px] font-bold text-[var(--lp-on-accent)] shadow-[var(--lp-shadow)]"
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
