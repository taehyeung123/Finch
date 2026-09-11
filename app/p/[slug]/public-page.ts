import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createAnonClient } from "@/lib/supabase/anon";
import { isDemoMode, isSupabaseConfigured } from "@/lib/supabase/config";
import { linkWorkspace } from "@/lib/data";
import { DEFAULT_LINK_SETTINGS, sanitizeLinkSettings, type LinkPageSettings } from "@/lib/links/settings";
import { unlockCookieName, unlockTokenMatches } from "@/lib/links/password";

/**
 * 이 주소가 **이사 간** 페이지인가 — 무덤(link_slug_history)에 page_id 가 살아 있으면
 * 그 페이지의 현재 주소를 돌려준다(방문자를 새 주소로 안내하는 용도, 2026-08-26).
 *
 * 무덤은 원래 «남이 90일간 못 가져가게» 만 했다. 그래서 주소를 바꾸면 인스타 소개란·
 * 인쇄된 QR 로 온 방문자가 전부 404 를 봤다 — 보호는 되는데 안내가 없었다.
 * 페이지 자체가 삭제된 경우는 page_id 가 null(on delete set null)이라 자연히 안내가 없다 —
 * 지운 페이지로 데려갈 곳은 없다.
 */
export async function movedTo(slug: string, opts: { strict?: boolean } = {}): Promise<string | null> {
  if (isDemoMode()) return null;
  const admin = createAdminClient();
  if (!admin) return null; // 키 없는 환경 — 안내는 부가 기능이지 404 의 조건이 아니다
  const { data: grave, error: gErr } = await admin
    .from("link_slug_history")
    .select("page_id")
    .eq("slug", slug)
    .maybeSingle();
  /* strict — 창고(ISR) 렌더. 조회 실패를 «안내 없음»으로 넘기면 404 가 창고에 굳는다. 던지면 Next 가 저장하지 않는다 */
  if (gErr && opts.strict) throw new Error(`movedTo: ${gErr.message}`);
  if (!grave?.page_id) return null;
  const { data: page, error: pErr } = await admin
    .from("link_pages")
    .select("slug, published")
    .eq("id", grave.page_id as string)
    .maybeSingle();
  if (pErr && opts.strict) throw new Error(`movedTo: ${pErr.message}`);
  const current = (page?.slug as string | undefined) ?? null;
  /* 같은 주소로 돌아오는 안내는 루프다 — 이론상 없지만 무덤 기록이 어긋나면 생길 수 있다 */
  if (!current || current === slug) return null;
  return current;
}

/*
  공개 페이지 조회 — **잠금(비밀번호, 0058) 판정을 한 곳에서.**
  page.tsx · /go/[id] · /vcard/[id] · 리드 제출 · 방명록 제출이 전부 이걸 탄다. 잠금을 page.tsx 에서만
  보면 블록 id 만 알면 /go 로 목적지가 나오고 폼 제출도 받아 "잠김"이 화면 장식이 된다(소넷 점검 5단계 #1).

  1) RLS(익명/내 세션)로 읽는다 — 익명은 발행·비잠금 행만, 로그인 세션은 **자기 행만** 본다(0059 부터 공개
     읽기 정책이 anon 전용 — 로그인한 아무 계정이 남의 초안 컬럼을 REST 로 읽던 구멍, 감사 L1).
     그래서 여기서 행이 나왔는데 locked 면 읽은 사람이 주인이다.
  2) 안 나오면 "남"이다(로그인한 방문자거나 잠긴 페이지) → service_role 로 읽되 공개 컬럼만 쓴다.
     발행·비잠금이면 그대로 방문자에게, 잠금이면 열림 쿠키(HMAC)를 해시와 대조해 열렸을 때만 스냅샷을 준다.
*/

export interface PublicPage {
  id: string;
  slug: string;
  published: boolean;
  /** 발행 스냅샷 — 잠겨 있으면 null */
  snapshot: unknown | null;
  settings: LinkPageSettings;
  /** 비밀번호가 걸려 있고 이 요청은 아직 열지 못했다 */
  locked: boolean;
  /** withOwner 일 때만 계산 — 아니면 false */
  isOwner: boolean;
}

type Row = { id: string; slug: string; published: boolean; published_snapshot: unknown; settings?: unknown };
const COLS = "id, slug, published, published_snapshot";

async function readRow(client: SupabaseClient, slug: string, strict = false): Promise<Row | null> {
  /* settings(0058) 계단식 — 미적용 DB 면 컬럼 없이 다시 읽는다 */
  let res = await client.from("link_pages").select(`${COLS}, settings`).eq("slug", slug).maybeSingle();
  if (res.error && /settings/i.test(res.error.message)) {
    res = await client.from("link_pages").select(COLS).eq("slug", slug).maybeSingle();
  }
  /* strict(창고 렌더) — 오류를 null(=없는 페이지)로 삼키면 404 가 하루 동안 창고에 굳는다 */
  if (res.error && strict) throw new Error(`readRow: ${res.error.message}`);
  return (res.data as Row | null) ?? null;
}

export async function loadPublicPage(slug: string, opts: { withOwner?: boolean } = {}): Promise<PublicPage | null> {
  if (isDemoMode()) {
    const p = linkWorkspace.page;
    if (!p || p.slug !== slug) return null;
    return {
      id: p.id,
      slug: p.slug,
      published: true,
      snapshot: {
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
        /* 데모 스냅샷이 themeCustom 을 빠뜨려 「직접 꾸미기」가 공개 화면에 하나도 안 나갔다
           — 편집기 미리보기와 /p 가 서로 다른 그림이 됐다(2026-08-24) */
        themeCustom: p.themeCustom,
        seoTitle: p.seoTitle || null,
        seoDesc: p.seoDesc || null,
        blocks: linkWorkspace.blocks.filter((b) => b.active).map((b) => ({ id: b.id, type: b.type, data: b.data })),
      },
      settings: p.settings ?? DEFAULT_LINK_SETTINGS,
      locked: false,
      isOwner: false,
    };
  }
  if (!isSupabaseConfigured()) return null;

  const supabase = await createClient();
  const row = await readRow(supabase, slug);

  if (row) {
    /* 소유자 판정에 user_id 를 **가져오지 않는다** — 익명 세션도 도는 조회라 select 에 넣으면
       아무나 소유자의 auth.users.id 를 받아간다. "내 페이지 id" 를 따로 읽어 비교한다(RLS 가 증명). */
    let isOwner = false;
    if (opts.withOwner) {
      const me = await getAuthUser();
      if (me) {
        /* 멀티 페이지(0060): user_id 만으로 maybeSingle 하면 두 장부터 터져 주인이 방문자가 된다(감사4 조사 #11).
           "이 행이 내 것인가"를 행 단위로 물어본다 */
        const { data: mine } = await supabase.from("link_pages").select("id").eq("user_id", me.id).eq("id", row.id).maybeSingle();
        isOwner = !!mine;
      }
    }
    return {
      id: row.id,
      slug: row.slug,
      published: !!row.published,
      snapshot: row.published_snapshot ?? null,
      settings: sanitizeLinkSettings(row.settings),
      /* RLS 를 통과한 잠긴 행 = 주인(0058 정책). 주인은 항상 열려 있다 */
      locked: false,
      isOwner,
    };
  }

  /* 2) 남의 페이지 — service_role 로 읽는다. 공개 컬럼(COLS+settings)만 select 하므로 초안 컬럼은 안 나간다 */
  const admin = createAdminClient();
  if (!admin) return null;
  const hidden = await readRow(admin, slug);
  if (!hidden || !hidden.published) return null;
  const settings = sanitizeLinkSettings(hidden.settings);
  /* 잠기지 않은 발행 페이지 — 로그인한 방문자(0059 부터 RLS 가 안 내준다). 익명 방문자와 똑같이 */
  if (!settings.hasPassword) {
    return { id: hidden.id, slug: hidden.slug, published: true, snapshot: hidden.published_snapshot ?? null, settings, locked: false, isOwner: false };
  }

  const { data: secret } = await admin.from("link_page_secrets").select("password_hash").eq("page_id", hidden.id).maybeSingle();
  const stored = (secret?.password_hash as string | undefined) ?? "";
  let unlocked = false;
  if (stored) {
    try {
      const jar = await cookies();
      unlocked = unlockTokenMatches(hidden.id, stored, jar.get(unlockCookieName(hidden.id))?.value);
    } catch {
      unlocked = false;
    }
  }
  return {
    id: hidden.id,
    slug: hidden.slug,
    published: true,
    snapshot: unlocked ? (hidden.published_snapshot ?? null) : null,
    settings,
    locked: !unlocked,
    isOwner: false,
  };
}

/**
 * 창고(ISR)용 조회 — **쿠키를 한 번도 읽지 않는다**(2026-09-11 창고 도입).
 *
 * 공개 프로필의 완성 화면은 Vercel CDN 에 굳혀 모든 방문자에게 같은 것을 준다(app/p/[slug]/page.tsx).
 * 그러니 이 화면은 «처음 온 익명 방문자»의 것이어야 한다:
 *  · 주인 판정 없음(isOwner=false) — 주인·로그인 방문자는 proxy.ts 가 세션 쿠키를 보고 즉석 경로(/p/-live)로 보낸다
 *  · 비밀번호 페이지는 **항상 잠금 화면**(snapshot=null) — 연 방문자는 열림 쿠키를 보고 즉석 경로로 간다
 *  · 발행본은 anon 클라이언트로 읽는다 — RLS(발행·비잠금만)가 코드와 별개로 한 번 더 막는다
 *  · 잠금 여부만 service_role 로 확인하고, 그때 **스냅샷 컬럼은 고르지 않는다**
 *  · 조회 오류는 던진다 — null 은 «없는 페이지»라 404 가 창고에 굳는다. 던진 렌더는 Next 가 저장하지 않고
 *    이전 창고본을 계속 준다(node_modules/next/dist/docs/01-app/02-guides/incremental-static-regeneration.md)
 * 쿠키가 필요한 판정(/go·/vcard·리드·방명록·방문 기록)은 계속 loadPublicPage 가 한다 — 여기로 옮기지 말 것.
 */
export async function loadCachedPublicPage(slug: string): Promise<PublicPage | null> {
  if (isDemoMode()) return loadPublicPage(slug); // 샘플 페이지 — 쿠키를 읽기 전에 돌아가는 분기다
  if (!isSupabaseConfigured()) return null;
  const anon = createAnonClient();
  if (!anon) return null;

  const row = await readRow(anon, slug, true);
  if (row) {
    const settings = sanitizeLinkSettings(row.settings);
    /* RLS 가 이미 잠긴 행을 걸렀다 — 그래도 잠금 표시가 보이면 닫는 쪽으로(스냅샷을 버린다) */
    const locked = settings.hasPassword;
    return {
      id: row.id,
      slug: row.slug,
      published: !!row.published,
      snapshot: locked ? null : (row.published_snapshot ?? null),
      settings,
      locked,
      isOwner: false,
    };
  }

  /* anon 에 안 보인다 = 없는 주소 · 비공개 · 잠금 중 하나. 잠금만 가려 잠금 화면을 그린다(설정: 언어·잠금 문구) */
  const admin = createAdminClient();
  if (!admin) return null; // 키 없는 환경 — 잠금 화면 대신 404. 내용은 새지 않는다
  let res = await admin.from("link_pages").select("id, slug, published, settings").eq("slug", slug).maybeSingle();
  if (res.error && /settings/i.test(res.error.message)) {
    res = await admin.from("link_pages").select("id, slug, published").eq("slug", slug).maybeSingle();
  }
  if (res.error) throw new Error(`loadCachedPublicPage: ${res.error.message}`);
  const hidden = res.data as { id: string; slug: string; published: boolean; settings?: unknown } | null;
  if (!hidden || !hidden.published) return null;
  const settings = sanitizeLinkSettings(hidden.settings);
  /* 발행·비잠금인데 anon 이 못 봤다 — 방금 바뀐 찰나(경합)이거나 정책이 달라진 것. 추측해서 내용을 내주지 않고,
     404 를 굳히지도 않는다(던지면 저장되지 않고 다음 방문자가 다시 그린다) */
  if (!settings.hasPassword) throw new Error("loadCachedPublicPage: published row invisible to anon");
  return { id: hidden.id, slug: hidden.slug, published: true, snapshot: null, settings, locked: true, isOwner: false };
}

/**
 * 서브 페이지 주소 해석(0060) — /p/{부모slug}/{sub_slug} → 자식의 전역 slug.
 * 자식도 전역 slug 를 갖고 모든 방문자 배관(잠금·/go·집계)이 그 슬러그로 돈다.
 * RLS 그대로: 발행된 행만 익명에게 보이고, 주인은 자기 비공개 행도 본다(미리보기).
 * 0060 전(컬럼 없음)·데모 모드는 null — 호출측이 404 로 보낸다.
 */
export async function resolveSubSlug(parentSlug: string, sub: string, opts: { strict?: boolean } = {}): Promise<string | null> {
  if (isDemoMode() || !isSupabaseConfigured()) return null;
  if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(sub)) return null;
  /* 매핑 해석은 RLS **밖**에서 한다(loadPublicPage 와 같은 2단 원칙, 소넷 확정) —
     세션 클라이언트만 쓰면 부모가 비공개·잠금일 때 발행된 자식의 표준 주소가 404 가 되고,
     로그인한 타인은 anon 정책이 안 걸려 항상 404 였다. 여기서 새는 건 slug 문자열뿐이고
     공개·잠금 판정은 렌더러(loadPublicPage)가 자식 행 기준으로 다시 하므로 내용 노출이 없다.
     자식의 전역 slug 를 부모로 착각하지 않게 부모는 메인(parent_id null)만 받는다. */
  const admin = createAdminClient();
  /* strict(창고 렌더)는 쿠키를 읽는 세션 클라이언트로 폴백하지 않는다 — anon 은 발행 행만 보여 매핑이 안 된다 */
  if (!admin && opts.strict) return null;
  const client = admin ?? (await createClient());
  const { data: parent, error: pErr } = await client
    .from("link_pages")
    .select("id")
    .eq("slug", parentSlug)
    .is("parent_id", null)
    .maybeSingle();
  /* strict — 조회 실패를 «없는 서브 주소»로 삼키면 404 가 창고에 굳는다 */
  if (pErr && opts.strict) throw new Error(`resolveSubSlug: ${pErr.message}`);
  if (pErr || !parent) return null;
  const { data: child, error: cErr } = await client
    .from("link_pages")
    .select("slug")
    .eq("parent_id", parent.id)
    .eq("sub_slug", sub)
    .maybeSingle();
  if (cErr && opts.strict) throw new Error(`resolveSubSlug: ${cErr.message}`);
  if (cErr || !child) return null;
  return (child.slug as string) ?? null;
}
