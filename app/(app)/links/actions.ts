"use server";

import { revalidatePath } from "next/cache";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/supabase/config";
import { SLUG_MESSAGES, normalizeUrl, validateSlug } from "@/lib/links";

/*
  프로필 링크 편집 — 전부 own-row RLS 위에서 돈다. 여기서 user_id 를 다시 거는 건
  방어가 아니라 **인덱스**를 타기 위해서다(RLS 는 조건을 얹지 인덱스를 고르진 않는다).

  slug 검증은 lib/links 한 곳에서 온다 — 화면·서버·DB 가 각각 다른 규칙을 갖는
  순간, 화면은 통과했는데 저장이 실패하는(또는 그 반대) 상태가 생긴다.
*/

type Result = { ok: boolean; error?: string };

const DEMO: Result = { ok: false, error: "데모 모드에서는 저장할 수 없어요." };
const AUTH: Result = { ok: false, error: "로그인이 필요해요." };

/** 페이지가 없으면 만든다. slug 는 사용자가 정한다 — 자동 생성하면 대개 못 읽는 주소가 된다. */
export async function createLinkPage(slug: string, title: string): Promise<Result> {
  if (isDemoMode()) return DEMO;
  const user = await getAuthUser();
  if (!user) return AUTH;

  const clean = slug.trim().toLowerCase();
  const err = validateSlug(clean);
  if (err) return { ok: false, error: SLUG_MESSAGES[err] };

  const supabase = await createClient();
  const { error } = await supabase.from("link_pages").insert({
    user_id: user.id,
    slug: clean,
    title: title.trim().slice(0, 40),
  });
  if (error) {
    /* unique 위반은 두 가지다: slug 중복(23505 on slug) 과 페이지 중복(23505 on user_id).
       사용자에게 의미가 완전히 다르므로 갈라서 말한다. */
    if (error.code === "23505") {
      return {
        ok: false,
        error: error.message.includes("user_id")
          ? "이미 프로필 링크가 있어요. 새로고침해 주세요."
          : "이미 사용 중인 주소예요. 다른 주소를 입력해 주세요.",
      };
    }
    console.error("[links] 페이지 생성 실패:", error.message);
    return { ok: false, error: "만들지 못했어요. 잠시 후 다시 시도해 주세요." };
  }
  revalidatePath("/links");
  return { ok: true };
}

export async function updateLinkPage(input: {
  slug: string;
  title: string;
  bio: string;
  published: boolean;
}): Promise<Result> {
  if (isDemoMode()) return DEMO;
  const user = await getAuthUser();
  if (!user) return AUTH;

  const clean = input.slug.trim().toLowerCase();
  const err = validateSlug(clean);
  if (err) return { ok: false, error: SLUG_MESSAGES[err] };

  const supabase = await createClient();
  /* 주소를 바꾸면 **옛 경로도** 무효화해야 한다 — 안 하면 옛 주소가 캐시된 채로
     계속 열리고(이미 남에게 넘어간 페이지처럼 보인다), 새 주소는 404 를 캐시한다. */
  const { data: before } = await supabase.from("link_pages").select("slug").eq("user_id", user.id).maybeSingle();

  const { error } = await supabase
    .from("link_pages")
    .update({
      slug: clean,
      title: input.title.trim().slice(0, 40),
      bio: input.bio.trim().slice(0, 160),
      published: input.published,
    })
    .eq("user_id", user.id);
  if (error) {
    if (error.code === "23505") return { ok: false, error: "이미 사용 중인 주소예요." };
    console.error("[links] 페이지 저장 실패:", error.message);
    return { ok: false, error: "저장하지 못했어요." };
  }
  revalidatePath("/links");
  /* 공개 페이지도 즉시 반영한다 — 주소를 바꾸면 옛 주소는 404 가 되어야 하고
     새 주소는 바로 살아야 한다. 캐시가 남으면 둘 다 틀린 상태가 된다. */
  revalidatePath(`/p/${clean}`);
  if (before?.slug && before.slug !== clean) revalidatePath(`/p/${before.slug}`);
  return { ok: true };
}

/**
 * 공개/비공개만 토글한다.
 *
 * 앞서는 스위치가 updateLinkPage 를 불러 **입력창의 미저장 값(slug·제목·소개)까지
 * 함께 커밋**했다. 주소를 고치던 중에 공개만 눌렀는데 검증 안 된 주소가 저장되거나,
 * 유효하지 않으면 "토글만 눌렀는데" 이해 못 할 오류를 만났다.
 */
export async function setLinkPublished(published: boolean): Promise<Result> {
  if (isDemoMode()) return DEMO;
  const user = await getAuthUser();
  if (!user) return AUTH;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("link_pages")
    .update({ published })
    .eq("user_id", user.id)
    .select("slug")
    .maybeSingle();
  if (error) {
    console.error("[links] 공개 상태 변경 실패:", error.message);
    return { ok: false, error: "변경하지 못했어요." };
  }
  revalidatePath("/links");
  if (data?.slug) revalidatePath(`/p/${data.slug}`);
  return { ok: true };
}

/** 페이지 삭제 — 항목·클릭 기록이 cascade 로 함께 사라진다 */
export async function deleteLinkPage(): Promise<Result> {
  if (isDemoMode()) return DEMO;
  const user = await getAuthUser();
  if (!user) return AUTH;

  const supabase = await createClient();
  const { data: page } = await supabase.from("link_pages").select("slug").eq("user_id", user.id).maybeSingle();
  const { error } = await supabase.from("link_pages").delete().eq("user_id", user.id);
  if (error) {
    console.error("[links] 페이지 삭제 실패:", error.message);
    return { ok: false, error: "삭제하지 못했어요." };
  }
  revalidatePath("/links");
  if (page?.slug) revalidatePath(`/p/${page.slug}`);
  return { ok: true };
}

export async function addLinkItem(label: string, url: string): Promise<Result> {
  if (isDemoMode()) return DEMO;
  const user = await getAuthUser();
  if (!user) return AUTH;

  const name = label.trim().slice(0, 40);
  if (!name) return { ok: false, error: "링크 이름을 입력해 주세요." };
  const href = normalizeUrl(url);
  if (!href) return { ok: false, error: "http 또는 https 로 시작하는 주소만 넣을 수 있어요." };

  const supabase = await createClient();
  const { data: page } = await supabase.from("link_pages").select("id, slug").eq("user_id", user.id).maybeSingle();
  if (!page) return { ok: false, error: "먼저 프로필 링크를 만들어 주세요." };

  /* 새 항목은 맨 아래로. max+1 을 읽어서 넣는다 — count 를 쓰면 중간 삭제 후
     기존 항목과 sort_order 가 겹쳐 순서가 뒤섞인다. */
  const { data: last } = await supabase
    .from("link_items")
    .select("sort_order")
    .eq("page_id", page.id)
    .order("sort_order", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const next = (last?.sort_order ?? -1) + 1;

  const { error } = await supabase
    .from("link_items")
    .insert({ page_id: page.id, label: name, url: href, sort_order: next });
  if (error) {
    console.error("[links] 항목 추가 실패:", error.message);
    return { ok: false, error: "추가하지 못했어요." };
  }
  revalidatePath("/links");
  revalidatePath(`/p/${page.slug}`);
  return { ok: true };
}

export async function updateLinkItem(id: string, patch: { label?: string; url?: string; active?: boolean }): Promise<Result> {
  if (isDemoMode()) return DEMO;
  const user = await getAuthUser();
  if (!user) return AUTH;

  const fields: Record<string, unknown> = {};
  if (patch.label !== undefined) {
    const name = patch.label.trim().slice(0, 40);
    if (!name) return { ok: false, error: "링크 이름을 입력해 주세요." };
    fields.label = name;
  }
  if (patch.url !== undefined) {
    const href = normalizeUrl(patch.url);
    if (!href) return { ok: false, error: "http 또는 https 로 시작하는 주소만 넣을 수 있어요." };
    fields.url = href;
  }
  if (patch.active !== undefined) fields.active = patch.active;
  if (Object.keys(fields).length === 0) return { ok: true };

  const supabase = await createClient();
  /* RLS 가 "내 페이지의 항목만" 을 이미 강제한다(0045). id 만으로 update 해도
     남의 항목은 0행 매치가 된다. */
  const { error } = await supabase.from("link_items").update(fields).eq("id", id);
  if (error) {
    console.error("[links] 항목 수정 실패:", error.message);
    return { ok: false, error: "저장하지 못했어요." };
  }
  revalidatePath("/links");
  return { ok: true };
}

export async function deleteLinkItem(id: string): Promise<Result> {
  if (isDemoMode()) return DEMO;
  const user = await getAuthUser();
  if (!user) return AUTH;

  const supabase = await createClient();
  const { error } = await supabase.from("link_items").delete().eq("id", id);
  if (error) {
    console.error("[links] 항목 삭제 실패:", error.message);
    return { ok: false, error: "삭제하지 못했어요." };
  }
  revalidatePath("/links");
  return { ok: true };
}

/** 위/아래 이동 — 인접 두 항목의 sort_order 를 맞바꾼다 */
export async function moveLinkItem(id: string, dir: "up" | "down"): Promise<Result> {
  if (isDemoMode()) return DEMO;
  const user = await getAuthUser();
  if (!user) return AUTH;

  const supabase = await createClient();
  const { data: page } = await supabase.from("link_pages").select("id, slug").eq("user_id", user.id).maybeSingle();
  if (!page) return { ok: false, error: "프로필 링크가 없어요." };

  /* created_at 을 2차 정렬로 둔다 — 동시 요청으로 sort_order 가 겹쳤을 때
     순서가 매 조회마다 흔들리는 걸 막는다(화면·공개 페이지·여기가 같은 순서를
     봐야 이동이 예측 가능하다). */
  const { data: items } = await supabase
    .from("link_items")
    .select("id, sort_order")
    .eq("page_id", page.id)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  const list = (items ?? []) as Array<{ id: string; sort_order: number }>;
  const i = list.findIndex((x) => x.id === id);
  if (i < 0) return { ok: false, error: "항목을 찾지 못했어요." };
  const j = dir === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= list.length) return { ok: true }; // 끝에서 더 못 간다 — 오류는 아니다

  /* 두 행을 각각 갱신한다(트랜잭션 아님). **둘 다 성공했는지 반드시 확인한다** —
     첫 UPDATE 만 통과하면 두 항목이 같은 sort_order 를 갖게 되어 순서가 그 자리에서
     깨지는데, 앞서는 오류를 안 보고 무조건 ok:true 를 돌려줘 화면에는 성공으로
     보였다. 두 번째가 실패하면 첫 번째를 되돌린다. */
  const a = list[i];
  const b = list[j];
  const first = await supabase.from("link_items").update({ sort_order: b.sort_order }).eq("id", a.id);
  if (first.error) {
    console.error("[links] 순서 이동 실패:", first.error.message);
    return { ok: false, error: "순서를 바꾸지 못했어요." };
  }
  const second = await supabase.from("link_items").update({ sort_order: a.sort_order }).eq("id", b.id);
  if (second.error) {
    console.error("[links] 순서 이동 실패(복구 시도):", second.error.message);
    await supabase.from("link_items").update({ sort_order: a.sort_order }).eq("id", a.id);
    return { ok: false, error: "순서를 바꾸지 못했어요." };
  }

  revalidatePath("/links");
  revalidatePath(`/p/${page.slug}`);
  return { ok: true };
}
