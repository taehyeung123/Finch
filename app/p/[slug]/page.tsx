import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { FinchMark } from "@/components/logo";

/*
  공개 프로필 링크 — /p/{slug}

  (app)·(marketing) 어느 그룹에도 넣지 않았다. 사이드바도 마케팅 헤더/푸터도
  붙으면 안 되는 화면이다 — 이 페이지는 **남의 SNS 프로필에서 넘어온 방문자**가
  보는 곳이고, 그 사람에게 필요한 건 링크 목록 하나다.

  조회는 익명 클라이언트로 한다. RLS 가 published=true 인 페이지와 active=true 인
  항목만 내보낸다(0045) — 초안이 URL 만 알면 보이는 사고를 DB 층에서 막는다.

  링크는 항상 /p/{slug}/go/{id} 를 거친다. 클릭을 세기 위해서이고, 그 기록은
  방문자 IP·UA 를 저장하지 않는다.
*/

export const dynamic = "force-dynamic";

async function load(slug: string) {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();

  /* published 조건을 걸지 않고 조회한다 — **RLS 가 이미 그 일을 한다**(0045):
     익명·타인에게는 published=true 인 행만 보이고, 소유자에게는 자기 행이 보인다.
     여기서 .eq("published", true) 를 또 걸면 소유자조차 자기 비공개 페이지를 볼 수
     없게 되어, "일단 공개로 켜서 확인하고 마음에 안 들면 끄기"를 강요하게 된다. */
  const { data: page } = await supabase
    .from("link_pages")
    .select("id, slug, title, bio, published")
    .eq("slug", slug)
    .maybeSingle();
  if (!page) return null;

  /* 소유자 판정에 user_id 를 **가져오지 않는다.** 이 조회는 익명 세션으로도 도는데,
     select 에 user_id 를 넣으면 공개 페이지를 여는 아무나 소유자의 auth.users.id 를
     받아간다. 대신 "내 페이지의 id" 를 따로 읽어 비교한다 — RLS 가 자기 행만
     내주므로 이 조회 자체가 소유 증명이 된다. */
  const me = await getAuthUser();
  let isOwner = false;
  if (me) {
    const { data: mine } = await supabase.from("link_pages").select("id").eq("user_id", me.id).maybeSingle();
    isOwner = !!mine && mine.id === page.id;
  }
  if (!page.published && !isOwner) return null;

  /* 소유자 미리보기에서는 꺼둔 항목도 보여준다 — 뭘 껐는지 확인하는 게 미리보기의
     목적이다. 방문자에게는 RLS 가 active=true 만 내보낸다. */
  let q = supabase.from("link_items").select("id, label, active").eq("page_id", page.id);
  if (!isOwner) q = q.eq("active", true);
  const { data: items } = await q.order("sort_order", { ascending: true }).order("created_at", { ascending: true });

  return {
    page,
    isOwner,
    items: (items ?? []) as Array<{ id: string; label: string; active: boolean }>,
  };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const data = await load(slug);
  if (!data) return { title: "페이지를 찾을 수 없어요", robots: { index: false, follow: false } };
  return {
    title: data.page.title || slug,
    description: data.page.bio || undefined,
    alternates: { canonical: `/p/${slug}` },
  };
}

export default async function PublicLinkPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await load(slug);
  if (!data) notFound();

  const { page, items, isOwner } = data;

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col px-5 py-14">
      {/* 소유자 미리보기 배너 — 방문자에게는 절대 안 보인다.
          이게 없으면 "왜 남들한테 안 보이지?"를 알 방법이 없다. */}
      {isOwner && !page.published ? (
        <p className="mb-8 rounded-card border border-warning/40 bg-warning-weak px-4 py-2.5 text-center text-[13px] font-medium text-warning-strong">
          비공개 미리보기예요. 나에게만 보입니다.
        </p>
      ) : null}

      <header className="text-center">
        <h1 className="text-[28px] font-bold leading-[1.25]">{page.title || slug}</h1>
        {page.bio ? <p className="mt-2.5 text-[15px] leading-[1.6] text-fg-sub">{page.bio}</p> : null}
      </header>

      {items.length === 0 ? (
        <p className="mt-10 text-center text-[15px] text-fg-sub">아직 등록된 링크가 없어요.</p>
      ) : (
        <ul className="mt-9 space-y-2.5">
          {items.map((it) => (
            <li key={it.id}>
              {/* 실제 목적지를 href 에 노출하지 않는다 — 클릭 집계를 우회당하지 않고,
                  링크를 바꿔도 공유된 주소가 그대로 산다 */}
              <a
                href={`/p/${slug}/go/${it.id}`}
                rel="noopener noreferrer nofollow"
                className={`card-face trans-state flex min-h-12 items-center justify-center gap-2 rounded-card px-5 py-3 text-center text-[15px] font-semibold hover:border-line-strong ${
                  it.active ? "" : "opacity-55"
                }`}
              >
                {it.label}
                {isOwner && !it.active ? (
                  <span className="rounded-chip border border-line px-2 py-0.5 text-[11px] font-medium text-fg-sub">
                    꺼짐
                  </span>
                ) : null}
              </a>
            </li>
          ))}
        </ul>
      )}

      <footer className="mt-auto pt-14 text-center">
        <Link
          href="/"
          className="trans-state inline-flex items-center gap-1.5 text-[12px] font-medium text-fg-sub hover:text-fg"
        >
          <FinchMark className="size-3.5 text-primary" />
          핀치로 만들었어요
        </Link>
      </footer>
    </main>
  );
}
