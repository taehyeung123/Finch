import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { FinchMark } from "@/components/logo";
import { themeByKey, themeVars } from "@/lib/links/themes";
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
  seoTitle: string | null;
  seoDesc: string | null;
  blocks: SnapshotBlock[];
}

async function load(slug: string) {
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
  return {
    title: s.seoTitle || s.title || slug,
    description: s.seoDesc || s.bio || undefined,
    alternates: { canonical: `/p/${slug}` },
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
          {snap.layout !== "cover" && snap.avatarPath ? (
            // eslint-disable-next-line @next/next/no-img-element -- Storage 공개 URL
            <img
              src={snap.avatarPath}
              alt=""
              className="mb-3 size-20 rounded-full border-2 border-[var(--lp-card)] object-cover shadow-[var(--lp-shadow)]"
            />
          ) : null}
          <h1 className="text-[24px] font-bold leading-[1.3]">{snap.title || slug}</h1>
          {snap.bio ? (
            <p className="mt-2 whitespace-pre-wrap text-[15px] leading-[1.6] text-[var(--lp-muted)]">{snap.bio}</p>
          ) : null}

          {snap.snsLinks.length > 0 ? (
            <nav aria-label="SNS" className="mt-3.5 flex flex-wrap gap-2">
              {snap.snsLinks.map((s, i) => (
                <a
                  key={i}
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="rounded-full border border-[var(--lp-border)] bg-[var(--lp-card)] px-3 py-1.5 text-[13px] font-medium"
                >
                  {SNS_LABEL[s.kind] ?? s.kind}
                </a>
              ))}
            </nav>
          ) : null}
        </header>

        {/* 블록 */}
        <div className="mt-8 space-y-3">
          {snap.blocks.length === 0 ? (
            <p className="text-center text-[15px] text-[var(--lp-muted)]">아직 등록된 링크가 없어요.</p>
          ) : (
            snap.blocks.map((b) =>
              b.type === "contact" || b.type === "subscribe" ? (
                <LeadForm key={b.id} slug={slug} blockId={b.id} kind={b.type} data={b.data} />
              ) : (
                <BlockRenderer key={b.id} block={b} slug={slug} />
              ),
            )
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

const SNS_LABEL: Record<string, string> = {
  website: "웹사이트",
  instagram: "Instagram",
  youtube: "YouTube",
  tiktok: "TikTok",
  threads: "Threads",
  x: "X",
  kakao: "카카오톡",
};
