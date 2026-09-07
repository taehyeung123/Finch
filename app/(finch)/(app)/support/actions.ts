"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/supabase/config";
import { sendNotificationEmail } from "@/lib/email/resend";
import { INQUIRY_TYPES } from "./inquiry-types";

/**
 * 문의 접수 — 마이그레이션 0017_inquiries.sql 위에서 동작.
 *
 * 쓰기는 사용자 세션으로만 한다(service role 아님). RLS가 본인 명의·pending·
 * 답변 없음 상태만 insert를 허용하므로, 남의 이름으로 접수하거나 답변을 스스로
 * 채워 넣는 것이 DB 차원에서 막힌다. 답변 작성은 딥레드 HQ(service role)에서만
 * 이뤄지고 이 앱에는 답변을 쓰는 경로 자체가 없다.
 */

/** 미답변 문의가 이만큼 쌓이면 접수를 막는다 — 중복 접수로 CS가 묻히는 것 방지 */
const MAX_PENDING = 5;

export type SubmitResult = { ok: true } | { ok: false; error: string };

export async function submitInquiry(formData: FormData): Promise<SubmitResult> {
  const type = String(formData.get("type") || "기타");
  const subject = String(formData.get("subject") || "").trim();
  const message = String(formData.get("message") || "").trim();

  if (!(INQUIRY_TYPES as readonly string[]).includes(type)) {
    return { ok: false, error: "문의 유형을 선택해주세요." };
  }
  if (subject.length < 2 || subject.length > 120) {
    return { ok: false, error: "제목은 2자 이상 120자 이하로 입력해주세요." };
  }
  if (message.length < 10 || message.length > 4000) {
    return { ok: false, error: "내용은 10자 이상 4000자 이하로 입력해주세요." };
  }

  if (isDemoMode()) {
    return { ok: false, error: "데모 모드에서는 문의를 접수할 수 없습니다." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  const { count } = await supabase
    .from("inquiries")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("status", "pending");
  if ((count ?? 0) >= MAX_PENDING) {
    return {
      ok: false,
      error: `답변 대기 중인 문의가 ${MAX_PENDING}건입니다. 기존 문의에 답변을 받은 뒤 다시 접수해주세요.`,
    };
  }

  const { error } = await supabase.from("inquiries").insert({
    user_id: user.id,
    type,
    subject,
    message,
  });
  if (error) {
    // 테이블 미적용을 "접수 실패"로 뭉뚱그리지 않고 원인을 그대로 알린다
    const missing =
      error.message.includes("does not exist") || error.message.includes("Could not find the table");
    console.error("[support] 문의 접수 실패:", error.message);
    return {
      ok: false,
      /* 표가 없는 원인(0017 미적용)은 위 console.error 로 운영자에게 — 고객 문구에 마이그레이션 번호를 싣지 않는다 */
      error: missing
        ? "문의 기능이 아직 준비되지 않았어요. 잠시 후 다시 시도해 주세요."
        : "문의 접수에 실패했습니다. 잠시 후 다시 시도해주세요.",
    };
  }

  /* 접수됐다는 사실을 운영자에게 알린다. 예전엔 표에 넣고 끝이라, 운영자가 HQ 를 직접 열어 보기 전까지
     아무도 몰랐다. 미답변이 5건 쌓이면 접수 자체가 막히므로(MAX_PENDING) 답변이 늦을수록 그 고객의
     문의 통로가 좁아지다 닫힌다 — 사용자가 늘기 시작하는 첫 주에 정확히 이 조합이 문제가 된다(2026-09-07 감사).
     발송 실패는 접수를 되돌리지 않는다 — 고객 쪽 결과는 이미 성공이다. */
  const ownerEmail = process.env.OWNER_EMAIL;
  if (ownerEmail) {
    void sendNotificationEmail(
      ownerEmail,
      `[핀치 문의] ${type} · ${subject}`,
      `${user.email ?? "이메일 미상"} 님이 문의를 남겼어요.\n\n${message.slice(0, 500)}`,
    ).catch((e) => console.error("[support] 운영자 알림 메일 실패:", e instanceof Error ? e.message : e));
  } else {
    console.warn("[support] 문의가 접수됐지만 OWNER_EMAIL 미설정 — 운영자에게 알리지 못했습니다");
  }

  revalidatePath("/support");
  return { ok: true };
}
