import "server-only";
import { revalidatePath, revalidateTag } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { consoleErrorThrottled, flatten } from "@/lib/monitoring/log-throttle";

/*
  공개 프로필 «창고» 비우기 — 정본(2026-09-11 창고 도입).

  공개 프로필(finch.ai.kr/{slug})은 방문마다 새로 그리지 않는다. 처음 온 방문자 때 한 번 그린 완성 화면을
  Vercel CDN(창고)에 넣어 두고, 다음 방문자부터는 서버·DB 를 거치지 않고 거기서 꺼내 준다
  (app/p/[slug]/page.tsx 의 force-static · revalidate). 창고본의 수명은 하루다 — 그 전에 바뀌면 여기서 비운다.

  ⚠️ **방문자에게 보이는 것을 바꾸는 쓰기는 반드시 이 파일을 거친다.** 안 거치면 옛 화면이 최대 하루 동안
     계속 나간다 — 비공개로 돌린 페이지, 비밀번호를 건 페이지, 숨긴 방명록까지. 새 쓰기 경로를 만들면
     «이게 공개 화면·설정·주소·방명록을 바꾸나?»를 먼저 묻고, 그렇다면 purgePublicPage 를 부른다.

  규칙:
   · 비우는 대상은 **라우트 경로**(/p/{slug})다 — 방문자 주소(/{slug})가 아니다. proxy.ts 가 리라이트하고
     Next 는 목적지 경로로 창고본을 찾는다(node_modules/next/dist/docs/01-app/03-api-reference/04-functions/revalidatePath.md).
   · 서브 페이지는 창고본이 **두 개**다: 자기 전역 slug(/p/{child}) 와 방문자가 쓰는 /p/{부모}/{서브}.
     `revalidatePath('/p/abc', 'layout')` 는 /p/abc/{서브} 를 **못 비운다**(Next 가 파생 태그를 파일 경로로 만든다).
   · revalidatePath 는 **즉시 만료**다 — 다음 방문자는 반드시 새 화면을 받는다. 그래서 비공개·잠금·삭제에도 이걸 쓴다.
     revalidateTag(…, "max") 는 옛 화면을 한 번 더 준다 — 여기서 쓰지 말 것.
   · 비우기는 액션 본문이 끝난 뒤 한꺼번에 실행된다(Next 가 줄 세웠다가 처리) — 쓰기 전에 불러도 순서는 안전하다.
     다만 «쓰기 전에만 알 수 있는 주소»(옛 slug·지워질 자식)는 쓰기 **전에** collectPublicPaths 로 모아 둔다.
*/

/** 방문 기록(recordView)이 쓰는 «이 slug 의 공개 여부» 캐시 태그 — app/p/[slug]/actions.ts */
export function publicPageTag(slug: string): string {
  return `lp:${slug}`;
}

export interface PublicPaths {
  /** revalidatePath 대상(라우트 경로) */
  paths: string[];
  /** publicPageTag 대상 slug */
  slugs: string[];
}

type Row = { id: string; slug: string; parent_id: string | null; sub_slug: string | null };

const EMPTY = (): PublicPaths => ({ paths: [], slugs: [] });

function logFail(where: string, e: unknown) {
  /* 방문자 액션(방명록)에서도 불린다 — 인증 전 경로 규칙대로 스로틀(CLAUDE.md 보안 규칙) */
  consoleErrorThrottled(`links.cache.${where}`, 60_000, `[links] 창고 주소 조회 실패(${where}):`, flatten(e instanceof Error ? e.message : String(e)));
}

async function rowsById(admin: SupabaseClient, ids: string[]): Promise<Row[]> {
  let res: { data: unknown[] | null; error: { message: string } | null } = await admin
    .from("link_pages")
    .select("id, slug, parent_id, sub_slug")
    .in("id", ids);
  if (res.error && /parent_id|sub_slug/i.test(res.error.message)) {
    /* 0060 미적용 DB — 서브 페이지가 없다 */
    res = await admin.from("link_pages").select("id, slug").in("id", ids);
  }
  if (res.error) throw new Error(res.error.message);
  return ((res.data ?? []) as Array<Partial<Row> & { id: string; slug: string }>).map((r) => ({
    id: r.id,
    slug: r.slug,
    parent_id: r.parent_id ?? null,
    sub_slug: r.sub_slug ?? null,
  }));
}

/**
 * 페이지들이 방문자에게 보이는 창고 주소를 모은다.
 *  · 기본: 자기 주소 /p/{slug} + (서브면) /p/{부모}/{서브}
 *  · structure: true — 주소 구조가 바뀔 때(주소 변경·삭제·탈퇴)
 *      + (루트면) 자식들의 두 주소
 *      + 이 페이지를 가리키는 **무덤 주소**(옛 주소 → 새 주소 안내, public-page.ts movedTo) 와 그 아래 서브 주소
 * service_role 로 읽는다 — 부르는 쪽이 이미 권한을 확인했다(무덤 표는 정책이 없어 세션으로는 못 읽는다).
 * 조회가 실패하면 모은 만큼만 돌려주고 기록을 남긴다 — 비우기 실패로 사용자의 저장을 되돌리지 않는다.
 */
export async function collectPublicPaths(pageIds: string[], opts: { structure?: boolean } = {}): Promise<PublicPaths> {
  const out = EMPTY();
  const ids = [...new Set(pageIds.filter(Boolean))];
  if (ids.length === 0) return out;
  const admin = createAdminClient();
  if (!admin) {
    logFail("collect", "service-role 키 없음 — 페이지 id 로 주소를 풀 수 없다");
    return out;
  }
  try {
    const rows = await rowsById(admin, ids);
    const parentIds = [...new Set(rows.map((r) => r.parent_id).filter((v): v is string => !!v))];
    const parents = parentIds.length ? await rowsById(admin, parentIds) : [];
    const parentSlug = new Map(parents.map((p) => [p.id, p.slug]));
    for (const r of rows) {
      out.paths.push(`/p/${r.slug}`);
      out.slugs.push(r.slug);
      const ps = r.parent_id ? parentSlug.get(r.parent_id) : null;
      if (ps && r.sub_slug) out.paths.push(`/p/${ps}/${r.sub_slug}`);
    }
    if (!opts.structure) return out;

    /* 자식 — 루트 페이지의 주소가 바뀌거나 지워지면 /p/{루트}/{서브} 가 통째로 달라진다 */
    const roots = rows.filter((r) => !r.parent_id);
    let kids: Row[] = [];
    if (roots.length) {
      const k = await admin.from("link_pages").select("id, slug, parent_id, sub_slug").in("parent_id", roots.map((r) => r.id));
      if (k.error && !/parent_id|sub_slug/i.test(k.error.message)) throw new Error(k.error.message);
      kids = ((k.data ?? []) as Row[]).filter((c) => c.sub_slug);
    }
    const rootSlug = new Map(roots.map((r) => [r.id, r.slug]));
    for (const c of kids) {
      out.paths.push(`/p/${c.slug}`);
      out.slugs.push(c.slug);
      const rs = c.parent_id ? rootSlug.get(c.parent_id) : null;
      if (rs) out.paths.push(`/p/${rs}/${c.sub_slug}`);
    }

    /* 무덤 — 옛 주소는 «현재 주소로 보내는 안내»가 창고에 굳어 있다. 주소가 또 바뀌거나 페이지가 지워지면 틀린 안내다 */
    const allIds = [...ids, ...kids.map((c) => c.id)];
    const g = await admin.from("link_slug_history").select("slug, page_id").in("page_id", allIds);
    if (g.error) throw new Error(g.error.message);
    const kidsOf = new Map<string, string[]>();
    for (const c of kids) if (c.parent_id && c.sub_slug) kidsOf.set(c.parent_id, [...(kidsOf.get(c.parent_id) ?? []), c.sub_slug]);
    for (const grave of (g.data ?? []) as Array<{ slug: string; page_id: string | null }>) {
      out.paths.push(`/p/${grave.slug}`);
      out.slugs.push(grave.slug);
      for (const sub of (grave.page_id && kidsOf.get(grave.page_id)) || []) out.paths.push(`/p/${grave.slug}/${sub}`);
    }
  } catch (e) {
    logFail("collect", e);
  }
  return out;
}

/** 여러 묶음을 하나로 */
export function mergePublicPaths(...parts: PublicPaths[]): PublicPaths {
  return { paths: parts.flatMap((p) => p.paths), slugs: parts.flatMap((p) => p.slugs) };
}

/** 모은 주소를 즉시 만료한다. 서버 액션·라우트 핸들러에서만(렌더 중 호출은 Next 가 막는다) */
export function purgePublicPaths({ paths, slugs }: PublicPaths): void {
  try {
    for (const p of new Set(paths)) revalidatePath(p);
    for (const s of new Set(slugs)) revalidateTag(publicPageTag(s), { expire: 0 });
  } catch (e) {
    consoleErrorThrottled("links.cache.purge", 60_000, "[links] 창고 비우기 실패:", flatten(e instanceof Error ? e.message : String(e)));
  }
}

/**
 * 한 페이지의 «모습»이 바뀌었을 때 — 발행·공개 전환·설정·비밀번호·방명록.
 * knownSlug 를 넘기면 조회가 실패해도 자기 주소만큼은 비운다.
 */
export async function purgePublicPage(pageId: string, knownSlug?: string | null): Promise<void> {
  const found = await collectPublicPaths([pageId]);
  if (knownSlug) {
    found.paths.push(`/p/${knownSlug}`);
    found.slugs.push(knownSlug);
  }
  purgePublicPaths(found);
}
