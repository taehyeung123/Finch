"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isDemoMode } from "@/lib/supabase/config";

/*
  페이지 신고 접수(2026-08-28) — 마이그레이션 0071_page_reports.sql 위에서 동작.

  로그인 없이 받는다(리틀리 Report 류 — 신고자는 대개 우리 회원이 아니다).
  무기명 드롭박스라 이 앱에는 읽는 경로가 없다: 접수함은 Supabase 대시보드에서만 본다.
  남용 방어는 세 겹 — 허니팟(웹사이트 칸), 인스턴스당 분당 상한, DB check(길이·enum).
*/

import { REPORT_REASONS } from "./reasons";

/*
  상한은 **DB 가 센다** — JS 카운터는 인스턴스마다 따로 살고 콜드스타트마다 0 으로 돌아가서,
  요청을 흩뿌리면 상한이 사실상 사라진다(쏘넷 점검, 저장소 원칙 «상한은 DB 함수, JS 카운터 금지»).
  아래 인메모리 카운터는 같은 인스턴스에 몰리는 연타를 DB 조회 없이 먼저 끊는 **1차 문**일 뿐이다.
*/
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;
let windowStart = 0;
let windowCount = 0;
function burstLimited(): boolean {
  const now = Date.now();
  if (now - windowStart > WINDOW_MS) {
    windowStart = now;
    windowCount = 0;
  }
  windowCount += 1;
  return windowCount > MAX_PER_WINDOW;
}

/** 전역 10분 상한 — 신고는 원래 드문 행동이다. 넘으면 스팸으로 보고 잠시 닫는다 */
const GLOBAL_WINDOW_MIN = 10;
const GLOBAL_MAX = 60;
/** 한 페이지 24시간 상한 — 같은 페이지를 떼로 찍어 누르는 조리돌림 방어. 몇 건이면 이미 충분히 전달됐다 */
const PER_SLUG_WINDOW_MIN = 60 * 24;
const PER_SLUG_MAX = 10;

/**
 * DB 실측 상한. RLS 는 익명에게 select 를 주지 않으므로(신고는 무기명 드롭박스)
 * 세는 것은 service_role 로만 한다 — 서버 안에서만 도는 조회다.
 * 관리자 키가 없는 환경(로컬 등)에서는 세지 못하니 **막지 않는다** — 접수가 우선이다.
 */
async function dbLimited(admin: NonNullable<ReturnType<typeof createAdminClient>>, slug: string): Promise<boolean> {
  const since = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
  const [g, s] = await Promise.all([
    admin.from("page_reports").select("id", { count: "exact", head: true }).gte("created_at", since(GLOBAL_WINDOW_MIN)),
    admin.from("page_reports").select("id", { count: "exact", head: true }).eq("slug", slug).gte("created_at", since(PER_SLUG_WINDOW_MIN)),
  ]);
  /* 조회 자체가 실패하면(컬럼 부재 등) 접수를 막지 않는다 — 실패는 «없음»이 아니지만,
     여기서는 문을 닫는 쪽이 더 큰 손해다(진짜 신고가 막힌다) */
  if (g.error || s.error) return false;
  return (g.count ?? 0) >= GLOBAL_MAX || (s.count ?? 0) >= PER_SLUG_MAX;
}

/** 입력이 주소여도 slug 여도 받는다 — finch.ai.kr/{slug}(/{sub}) 에서 경로만 남긴다 */
function toSlugPath(raw: string): string | null {
  let v = raw.trim();
  if (!v) return null;
  try {
    const u = new URL(/^[a-z]+:\/\//i.test(v) ? v : `https://${v}`);
    if (/(^|\.)finch\.ai\.kr$/i.test(u.hostname) || u.hostname === "localhost") v = u.pathname;
    else if (v.includes("/") && !v.startsWith("/")) v = raw.trim(); // 도메인이 아니면 입력 그대로
  } catch {
    /* 주소 형식이 아니면 slug 로 취급 */
  }
  v = v.replace(/^\/+|\/+$/g, "").replace(/^p\//, "");
  if (!v || v.length > 120) return null;
  /* slug 형식(소문자·숫자·하이픈, 서브는 / 하나) 밖이면 받지 않는다 — 쓰레기 값 차단 */
  return /^[a-z0-9-]{1,80}(\/[a-z0-9-]{1,40})?$/.test(v) ? v : null;
}

export type ReportResult = { ok: true } | { ok: false; error: string };

export async function submitPageReport(input: {
  page: string;
  reason: string;
  detail?: string;
  contact?: string;
  /** 허니팟 — 사람 눈에 안 보이는 칸. 값이 있으면 봇이다 */
  website?: string;
}): Promise<ReportResult> {
  if (input.website) return { ok: true }; // 봇에게는 성공한 척이 가장 조용한 방어다
  if (isDemoMode()) return { ok: false, error: "지금은 신고를 받을 수 없어요. 잠시 후 다시 시도해 주세요." };

  const slug = toSlugPath(input.page ?? "");
  if (!slug) return { ok: false, error: "신고할 페이지 주소를 확인해 주세요. (예: finch.ai.kr/아이디)" };
  if (!(REPORT_REASONS as readonly string[]).includes(input.reason)) {
    return { ok: false, error: "신고 사유를 선택해 주세요." };
  }
  const detail = (input.detail ?? "").trim().slice(0, 2000);
  const contact = (input.contact ?? "").trim().slice(0, 160);
  const busy = { ok: false as const, error: "접수가 몰리고 있어요. 잠시 후 다시 시도해 주세요." };
  if (burstLimited()) return busy;

  const admin = createAdminClient();
  if (admin) {
    /* 실재하지 않는 slug 로 무한히 쓰레기 행을 만드는 것부터 막는다 — 서브 페이지는 부모로 판정 */
    const parent = slug.split("/")[0];
    const { data: page, error: pageErr } = await admin.from("link_pages").select("id").eq("slug", parent).maybeSingle();
    if (!pageErr && !page) return { ok: false, error: "그 주소의 페이지를 찾지 못했어요. 주소를 다시 확인해 주세요." };
    if (await dbLimited(admin, slug)) return busy;
  }

  const supabase = await createClient();
  const { error } = await supabase.from("page_reports").insert({
    slug,
    reason: input.reason,
    detail: detail || null,
    contact: contact || null,
  });
  if (error) {
    /* 원인(마이그레이션 미적용 등)은 **서버 로그에만** — 고객 화면에 내부 운영 상태를 쓰지 않는다(쏘넷 점검) */
    const missing = error.message.includes("does not exist") || error.message.includes("Could not find the table");
    console.error(`[report] 신고 접수 실패${missing ? "(page_reports 테이블 없음 — 마이그레이션 0071 확인)" : ""}:`, error.message);
    return { ok: false, error: "접수하지 못했어요. 잠시 후 다시 시도해 주세요." };
  }
  return { ok: true };
}
