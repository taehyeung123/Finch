"use server";

import { revalidatePath } from "next/cache";
import { isDemoMode } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { applyAdDisclosure } from "@/lib/ads/ad-disclosure";
import { RULE_COLUMNS, ruleFromRow, ruleToWriteRow, type AutoDmRuleRow } from "@/lib/auto-dm/db";
import type { AutoDmRule, AutoDmStatus } from "@/lib/types";

/*
  자동 DM 규칙 서버 액션.

  - 데모 모드: DB 없이 성공 응답 (UI가 로컬 상태로 즉시 동작)
  - 실제 모드: getUser()로 재인증(레이아웃 가드에만 의존하지 않음) 후 auto_dm_rules CRUD.
    RLS(auth.uid() = user_id)가 소유권을 강제하고, 쿼리에도 user_id를 명시해 이중 방어한다.
  - 광고성 규칙은 서버에서 (광고)·수신거부 안내를 강제한 본문을 "저장" — 발송 경로(웹훅)도
    한 번 더 적용하지만, 저장 시점에 이미 고지된 상태가 원본이 되게 한다.

  Instagram 전용 기능이므로 채널 개념은 두지 않는다.
*/

export type RuleActionResult = { ok: boolean; error?: string; rule?: AutoDmRule };

/** 규칙 입력 — 클라이언트 에디터가 보내는 직렬화 가능한 필드 */
export type RuleInput = Omit<
  AutoDmRule,
  "sentTotal" | "sentToday" | "failedTotal" | "lastSentAt" | "createdAt"
> & { createdAt?: string };

/** 서버측 최소 검증 — 잘못된 입력은 여기서 차단 */
function validate(input: RuleInput): string | null {
  if (!input.postId) return "대상 게시물이 필요합니다.";
  if (!input.dmMessage.trim()) return "DM 내용이 비어 있습니다.";
  if (input.trigger === "keyword" && input.keywords.length === 0)
    return "키워드 트리거에는 키워드가 1개 이상 필요합니다.";
  if (input.dailyCap < 1) return "하루 발송 상한은 1건 이상이어야 합니다.";
  return null;
}

/**
 * 인증 가드. 데모 모드면 통과(userId null), 실제 모드면 getUser()로 재확인.
 * 플랜 게이팅(유료 전용)은 발송 시 월 한도(reserve_dm_send)로 강제된다 — Free는 한도 0.
 */
async function authorize(): Promise<{ ok: true; userId: string | null } | { ok: false; error: string }> {
  if (isDemoMode()) return { ok: true, userId: null };
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "로그인이 필요합니다." };
    return { ok: true, userId: user.id };
  } catch {
    return { ok: false, error: "인증 확인에 실패했습니다." };
  }
}

export async function createRule(input: RuleInput): Promise<RuleActionResult> {
  const invalid = validate(input);
  if (invalid) return { ok: false, error: invalid };

  const auth = await authorize();
  if (!auth.ok) return { ok: false, error: auth.error };

  // 광고성이면 (광고) 표기·수신거부가 포함된 본문을 저장한다 (발송 경로에서도 재적용 — 이중 방어)
  const dmMessage = applyAdDisclosure(input.dmMessage.trim(), input.isAdvertising);

  if (isDemoMode() || !auth.userId) return { ok: true };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("auto_dm_rules")
    .insert({ ...ruleToWriteRow({ ...input, dmMessage }), user_id: auth.userId })
    .select(RULE_COLUMNS)
    .single();
  if (error || !data) {
    console.error("[auto-dm] 규칙 생성 실패:", error?.message);
    return { ok: false, error: "규칙 저장에 실패했습니다. 잠시 후 다시 시도해 주세요." };
  }

  revalidatePath("/auto-dm");
  return { ok: true, rule: ruleFromRow(data as unknown as AutoDmRuleRow) };
}

export async function updateRule(input: RuleInput): Promise<RuleActionResult> {
  const invalid = validate(input);
  if (invalid) return { ok: false, error: invalid };

  const auth = await authorize();
  if (!auth.ok) return { ok: false, error: auth.error };

  const dmMessage = applyAdDisclosure(input.dmMessage.trim(), input.isAdvertising);

  if (isDemoMode() || !auth.userId) return { ok: true };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("auto_dm_rules")
    .update(ruleToWriteRow({ ...input, dmMessage }))
    .eq("id", input.id)
    .eq("user_id", auth.userId) // RLS와 별개로 소유권 명시 (이중 방어)
    .select(RULE_COLUMNS)
    .single();
  if (error || !data) {
    console.error("[auto-dm] 규칙 수정 실패:", error?.message);
    return { ok: false, error: "규칙 수정에 실패했습니다. 잠시 후 다시 시도해 주세요." };
  }

  revalidatePath("/auto-dm");
  return { ok: true, rule: ruleFromRow(data as unknown as AutoDmRuleRow) };
}

export async function toggleRule(id: string, next: AutoDmStatus): Promise<RuleActionResult> {
  const auth = await authorize();
  if (!auth.ok) return { ok: false, error: auth.error };

  if (isDemoMode() || !auth.userId) return { ok: true };

  const supabase = await createClient();
  const { error } = await supabase
    .from("auto_dm_rules")
    .update({ status: next })
    .eq("id", id)
    .eq("user_id", auth.userId);
  if (error) {
    console.error("[auto-dm] 상태 변경 실패:", error.message);
    return { ok: false, error: "상태 변경에 실패했습니다." };
  }

  revalidatePath("/auto-dm");
  return { ok: true };
}

export async function deleteRule(id: string): Promise<RuleActionResult> {
  const auth = await authorize();
  if (!auth.ok) return { ok: false, error: auth.error };

  if (isDemoMode() || !auth.userId) return { ok: true };

  const supabase = await createClient();
  const { error } = await supabase
    .from("auto_dm_rules")
    .delete()
    .eq("id", id)
    .eq("user_id", auth.userId);
  if (error) {
    console.error("[auto-dm] 규칙 삭제 실패:", error.message);
    return { ok: false, error: "규칙 삭제에 실패했습니다." };
  }

  revalidatePath("/auto-dm");
  return { ok: true };
}
