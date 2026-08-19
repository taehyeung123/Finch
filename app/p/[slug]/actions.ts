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

/* ── 유입 제한 ──────────────────────────────────────────────────────
   세 경로(방문·클릭·리드)가 전부 인증 없이 service_role 로 INSERT 한다. 0048 이
   익명 INSERT 정책을 안 준 건 "스팸 창구가 된다"는 이유였는데, 서버 액션이 그
   자리를 그대로 대신하고 있었다 — 정책만 없고 창구는 열려 있었다.

   카운터는 반드시 **DB 로** 센다. Vercel 서버리스는 인스턴스가 여러 개라
   메모리 카운터는 공유되지 않는다(있으나 마나다).

   한계를 분명히 해 둔다: 방문자 해시는 쿠키에서 오므로 쿠키를 지우면 새 해시다.
   그래서 리드에는 **페이지 단위 상한**을 함께 건다 — 이쪽이 진짜 방어선이고,
   해시 단위는 실수·연타를 거르는 용도다. IP 는 저장하지 않는 방침이라 안 쓴다. */

/** 같은 방문자의 방문을 이 간격 안에서는 1건으로 본다 */
const VIEW_WINDOW_MS = 30 * 60 * 1000;
/** 리드: 같은 방문자 10분 5건 / 한 페이지 1시간 30건 */
const LEAD_VISITOR_WINDOW_MS = 10 * 60 * 1000;
const LEAD_VISITOR_MAX = 5;
const LEAD_PAGE_WINDOW_MS = 60 * 60 * 1000;
const LEAD_PAGE_MAX = 30;

/** 방문 1건 기록. 실패해도 조용히 넘어간다 — 통계 때문에 페이지가 깨지면 안 된다 */
export async function recordView(slug: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const pageId = await publicPageId(slug);
  if (!pageId) return;

  const admin = createAdminClient();
  if (!admin) return;

  const hash = await visitorHash();

  /* 같은 방문자가 30분 안에 다시 왔으면 안 센다. 새로고침 한 번에 방문 1건씩
     쌓이면 클릭률 분모가 부풀어 지표가 통째로 거짓말이 된다. */
  if (hash) {
    const { data: last } = await admin
      .from("link_views")
      .select("created_at")
      .eq("page_id", pageId)
      .eq("visitor_hash", hash)
      .gte("created_at", new Date(Date.now() - VIEW_WINDOW_MS).toISOString())
      .limit(1)
      .maybeSingle();
    if (last) return;
  }

  const h = await headers();
  const { error } = await admin.from("link_views").insert({
    page_id: pageId,
    visitor_hash: hash,
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

  /* 스팸이 들어오면 진짜 문의가 묻힌다 — 편집 화면은 최근 50건만 보여주고
     지우는 방법도 없다. 페이지 단위 상한이 실질 방어선이다. */
  const { count: pageCount } = await admin
    .from("link_leads")
    .select("id", { count: "exact", head: true })
    .eq("page_id", pageId)
    .gte("created_at", new Date(Date.now() - LEAD_PAGE_WINDOW_MS).toISOString());
  if ((pageCount ?? 0) >= LEAD_PAGE_MAX) {
    return { ok: false, error: "지금은 접수가 몰려 있어요. 잠시 후 다시 시도해 주세요." };
  }

  const hash = await visitorHash();
  if (hash) {
    const { count: mine } = await admin
      .from("link_leads")
      .select("id", { count: "exact", head: true })
      .eq("page_id", pageId)
      .eq("visitor_hash", hash)
      .gte("created_at", new Date(Date.now() - LEAD_VISITOR_WINDOW_MS).toISOString());
    if ((mine ?? 0) >= LEAD_VISITOR_MAX) {
      return { ok: false, error: "너무 자주 보냈어요. 잠시 후 다시 시도해 주세요." };
    }
  }

  const { error } = await admin.from("link_leads").insert({
    visitor_hash: hash,
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
