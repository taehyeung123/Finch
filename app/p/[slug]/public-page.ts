import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isDemoMode, isSupabaseConfigured } from "@/lib/supabase/config";
import { linkWorkspace } from "@/lib/data";
import { DEFAULT_LINK_SETTINGS, sanitizeLinkSettings, type LinkPageSettings } from "@/lib/links/settings";
import { unlockCookieName, unlockTokenMatches } from "@/lib/links/password";

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

async function readRow(client: SupabaseClient, slug: string): Promise<Row | null> {
  /* settings(0058) 계단식 — 미적용 DB 면 컬럼 없이 다시 읽는다 */
  let res = await client.from("link_pages").select(`${COLS}, settings`).eq("slug", slug).maybeSingle();
  if (res.error && /settings/i.test(res.error.message)) {
    res = await client.from("link_pages").select(COLS).eq("slug", slug).maybeSingle();
  }
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
 * 서브 페이지 주소 해석(0060) — /p/{부모slug}/{sub_slug} → 자식의 전역 slug.
 * 자식도 전역 slug 를 갖고 모든 방문자 배관(잠금·/go·집계)이 그 슬러그로 돈다.
 * RLS 그대로: 발행된 행만 익명에게 보이고, 주인은 자기 비공개 행도 본다(미리보기).
 * 0060 전(컬럼 없음)·데모 모드는 null — 호출측이 404 로 보낸다.
 */
export async function resolveSubSlug(parentSlug: string, sub: string): Promise<string | null> {
  if (isDemoMode() || !isSupabaseConfigured()) return null;
  if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(sub)) return null;
  /* 매핑 해석은 RLS **밖**에서 한다(loadPublicPage 와 같은 2단 원칙, 소넷 확정) —
     세션 클라이언트만 쓰면 부모가 비공개·잠금일 때 발행된 자식의 표준 주소가 404 가 되고,
     로그인한 타인은 anon 정책이 안 걸려 항상 404 였다. 여기서 새는 건 slug 문자열뿐이고
     공개·잠금 판정은 렌더러(loadPublicPage)가 자식 행 기준으로 다시 하므로 내용 노출이 없다.
     자식의 전역 slug 를 부모로 착각하지 않게 부모는 메인(parent_id null)만 받는다. */
  const admin = createAdminClient();
  const client = admin ?? (await createClient());
  const { data: parent, error: pErr } = await client
    .from("link_pages")
    .select("id")
    .eq("slug", parentSlug)
    .is("parent_id", null)
    .maybeSingle();
  if (pErr || !parent) return null;
  const { data: child, error: cErr } = await client
    .from("link_pages")
    .select("slug")
    .eq("parent_id", parent.id)
    .eq("sub_slug", sub)
    .maybeSingle();
  if (cErr || !child) return null;
  return (child.slug as string) ?? null;
}
