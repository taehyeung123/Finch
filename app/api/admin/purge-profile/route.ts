import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { isAuthorizedCron } from "@/lib/cron";
import { SLUG_RE } from "@/lib/links";
import { createAdminClient } from "@/lib/supabase/admin";
import { collectPublicPaths, purgePublicPaths } from "@/lib/links/public-cache";

/**
 * 공개 프로필 창고 수동 비우기 — 운영자 전용(2026-09-11 창고 도입).
 *
 * 앱의 저장 경로는 전부 lib/links/public-cache.ts 로 창고를 비운다. 하지만 **앱 밖에서** 바꾼 것 —
 * Supabase 대시보드에서 신고 처리로 페이지를 내리거나 지운 것, SQL 로 고친 것 — 은 코드가 모른다.
 * 그대로 두면 창고에 굳은 화면이 최대 하루(창고 수명) 동안 계속 나간다. 그때 이걸 부른다.
 *
 * 인증은 크론과 같은 비밀(CRON_SECRET, Authorization: Bearer) — 운영 비밀을 하나 더 늘리지 않는다.
 *   POST {"slug":"abc"} — 그 주소와 서브 주소·무덤 안내까지(페이지가 이미 지워졌어도 그 주소 자체는 비운다)
 *   POST {"all":true}   — 모든 공개 프로필(비상용). 다음 방문부터 하나씩 다시 굽는다 — 잠깐 느려질 뿐 틀리지 않는다.
 * 사용법은 docs/PROFILE_CACHE.md.
 */
export async function POST(request: Request) {
  if (!isAuthorizedCron(request)) return NextResponse.json({ ok: false }, { status: 401 });

  let body: { slug?: unknown; all?: unknown } = {};
  try {
    body = ((await request.json()) ?? {}) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "JSON 본문이 필요해요." }, { status: 400 });
  }

  if (body.all === true) {
    /* 'layout' 은 /p 아래 전부(서브 페이지까지)를 덮는다 — 'page' 나 경로 문자열로는 하위가 안 비워진다 */
    revalidatePath("/p", "layout");
    return NextResponse.json({ ok: true, scope: "all" });
  }

  const slug = typeof body.slug === "string" ? body.slug.trim().toLowerCase() : "";
  if (!SLUG_RE.test(slug)) return NextResponse.json({ ok: false, error: "slug 형식이 아니에요." }, { status: 400 });

  const ids: string[] = [];
  const admin = createAdminClient();
  if (admin) {
    const { data } = await admin.from("link_pages").select("id").eq("slug", slug).maybeSingle();
    if (typeof data?.id === "string") ids.push(data.id);
  }
  const found = await collectPublicPaths(ids, { structure: true });
  found.paths.push(`/p/${slug}`);
  found.slugs.push(slug);
  purgePublicPaths(found);
  return NextResponse.json({ ok: true, scope: "slug", paths: [...new Set(found.paths)] });
}
