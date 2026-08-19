"use server";

import { cookies, headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/*
  공개 페이지의 방문자 액션 — 방문 기록 / 리드 제출.

  둘 다 **service_role 로 쓴다.** link_views·link_leads 에 익명 INSERT 정책을 주면
  아무나 통계를 부풀리고 스팸을 넣을 수 있다(0048 에 INSERT 정책이 없는 이유).

  개인 식별 정보를 저장하지 않는다:
   · IP·UA·리퍼러 미저장
   · 재방문 판정은 **서버가 만든 임의 토큰**을 쿠키에 심고 그 해시만 남긴다.
     원문 토큰은 방문자 브라우저에만 있으므로 역추적이 불가능하고, 쿠키를 지우면 리셋된다.
*/

const VISITOR_COOKIE = "finch_lv";

/** 임의 토큰 → SHA-256 해시(앞 32자). 원문은 저장하지 않는다 */
async function hashToken(token: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

/** 쿠키의 방문자 토큰을 읽거나 새로 만든다 */
async function visitorHash(): Promise<string | null> {
  try {
    const jar = await cookies();
    let token = jar.get(VISITOR_COOKIE)?.value;
    if (!token) {
      token = crypto.randomUUID();
      jar.set(VISITOR_COOKIE, token, {
        httpOnly: true,
        sameSite: "lax",
        secure: true,
        maxAge: 60 * 60 * 24 * 180, // 180일
        path: "/",
      });
    }
    return await hashToken(token);
  } catch {
    /* 쿠키를 못 쓰는 컨텍스트여도 방문 자체는 세야 한다 — 재방문 판정만 포기한다 */
    return null;
  }
}

/** 슬러그 → 공개된 페이지 id. RLS 를 타므로 비공개 페이지는 여기서 걸러진다 */
async function publicPageId(slug: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("link_pages")
    .select("id")
    .eq("slug", slug)
    .eq("published", true)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

/** 방문 1건 기록. 실패해도 조용히 넘어간다 — 통계 때문에 페이지가 깨지면 안 된다 */
export async function recordView(slug: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const pageId = await publicPageId(slug);
  if (!pageId) return;

  const admin = createAdminClient();
  if (!admin) return;

  const h = await headers();
  const { error } = await admin.from("link_views").insert({
    page_id: pageId,
    visitor_hash: await visitorHash(),
    /* Vercel 이 주는 국가/도시 코드만 — 좌표·상세주소는 받지 않는다 */
    country: h.get("x-vercel-ip-country") ?? null,
    region: h.get("x-vercel-ip-city") ?? null,
  });
  if (error) console.error("[links] 방문 기록 실패:", error.message);
}

/** 문의·구독 제출 */
export async function submitLead(input: {
  slug: string;
  blockId: string;
  kind: "contact" | "subscribe";
  name?: string;
  email?: string;
  phone?: string;
  message?: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured()) return { ok: false, error: "지금은 접수할 수 없어요." };

  const pageId = await publicPageId(input.slug);
  if (!pageId) return { ok: false, error: "페이지를 찾을 수 없어요." };

  const email = (input.email ?? "").trim().slice(0, 160);
  const name = (input.name ?? "").trim().slice(0, 60);
  const phone = (input.phone ?? "").trim().slice(0, 40);
  const message = (input.message ?? "").trim().slice(0, 2000);

  /* 최소 하나는 연락 가능한 값이어야 한다 — 빈 제출이 쌓이면 목록이 쓸모없어진다 */
  if (!email && !phone) return { ok: false, error: "이메일 또는 연락처를 입력해 주세요." };
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "이메일 형식이 올바르지 않아요." };
  }

  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "지금은 접수할 수 없어요." };

  const { error } = await admin.from("link_leads").insert({
    page_id: pageId,
    block_id: input.blockId,
    kind: input.kind,
    name: name || null,
    email: email || null,
    phone: phone || null,
    message: message || null,
  });
  if (error) {
    console.error("[links] 리드 저장 실패:", error.message);
    return { ok: false, error: "접수하지 못했어요. 잠시 후 다시 시도해 주세요." };
  }
  return { ok: true };
}
