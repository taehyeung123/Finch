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
        const { data: mine } = await supabase.from("link_pages").select("id").eq("user_id", me.id).maybeSingle();
        isOwner = !!mine && mine.id === row.id;
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
