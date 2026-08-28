"use server";

import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/supabase/config";

/*
  페이지 신고 접수(2026-08-28) — 마이그레이션 0071_page_reports.sql 위에서 동작.

  로그인 없이 받는다(리틀리 Report 류 — 신고자는 대개 우리 회원이 아니다).
  무기명 드롭박스라 이 앱에는 읽는 경로가 없다: 접수함은 Supabase 대시보드에서만 본다.
  남용 방어는 세 겹 — 허니팟(웹사이트 칸), 인스턴스당 분당 상한, DB check(길이·enum).
*/

import { REPORT_REASONS } from "./reasons";

/** 서버리스 인스턴스 메모리 — 최선의 노력. 분당 이 수를 넘으면 잠시 받지 않는다 */
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;
let windowStart = 0;
let windowCount = 0;
function rateLimited(): boolean {
  const now = Date.now();
  if (now - windowStart > WINDOW_MS) {
    windowStart = now;
    windowCount = 0;
  }
  windowCount += 1;
  return windowCount > MAX_PER_WINDOW;
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
  if (rateLimited()) return { ok: false, error: "접수가 몰리고 있어요. 잠시 후 다시 시도해 주세요." };

  const supabase = await createClient();
  const { error } = await supabase.from("page_reports").insert({
    slug,
    reason: input.reason,
    detail: detail || null,
    contact: contact || null,
  });
  if (error) {
    const missing = error.message.includes("does not exist") || error.message.includes("Could not find the table");
    console.error("[report] 신고 접수 실패:", error.message);
    return {
      ok: false,
      error: missing
        ? "신고함이 아직 준비되지 않았어요(마이그레이션 0071 미적용). 잠시 후 다시 시도해 주세요."
        : "접수하지 못했어요. 잠시 후 다시 시도해 주세요.",
    };
  }
  return { ok: true };
}
