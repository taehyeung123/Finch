"use server";

import { revalidatePath } from "next/cache";
import { isDemoMode } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { applyAdDisclosure } from "@/lib/ads/ad-disclosure";
import type { AutoDmRule, AutoDmStatus } from "@/lib/types";

/*
  자동 DM 규칙 서버 액션 — 보안·연동 계약 스텁.

  실제 DB 반영과 Meta 발송은 API-last 단계다. 지금은:
   - 데모 모드: DB 없이 성공 응답 (UI가 로컬 상태로 즉시 동작)
   - 실제 모드: getUser()로 재인증(레이아웃 가드에만 의존하지 않음) 후 TODO 지점
   - 광고성 규칙은 서버에서도 (광고)·수신거부 안내를 강제 (UI 검증과 이중 방어)

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
 * 인증·플랜 가드. 데모 모드면 통과, 실제 모드면 getUser()로 재확인.
 * 플랜 게이팅(유료 전용)·월 발송 한도 검증은 백엔드 연동 시 채운다.
 */
async function authorize(): Promise<{ ok: true; userId: string | null } | { ok: false; error: string }> {
  if (isDemoMode()) return { ok: true, userId: null };
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "로그인이 필요합니다." };
    // TODO(API-last): 플랜 게이팅(Creator 이상) + 월 발송 한도 검증 (PRD 13.4 사용량 카운터)
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

  const dmMessage = applyAdDisclosure(input.dmMessage.trim(), input.isAdvertising);

  if (isDemoMode()) {
    // 데모: DB 없이 성공 (UI 로컬 상태가 원천)
    return { ok: true };
  }

  // TODO(API-last): Supabase auto_dm_rules INSERT (owner=userId) + 반환값 매핑
  void dmMessage;
  revalidatePath("/auto-dm");
  return { ok: true };
}

export async function updateRule(input: RuleInput): Promise<RuleActionResult> {
  const invalid = validate(input);
  if (invalid) return { ok: false, error: invalid };

  const auth = await authorize();
  if (!auth.ok) return { ok: false, error: auth.error };

  const dmMessage = applyAdDisclosure(input.dmMessage.trim(), input.isAdvertising);

  if (isDemoMode()) return { ok: true };

  // TODO(API-last): Supabase auto_dm_rules UPDATE (id=input.id AND owner=userId — 소유권 확인 필수)
  void dmMessage;
  revalidatePath("/auto-dm");
  return { ok: true };
}

export async function toggleRule(id: string, next: AutoDmStatus): Promise<RuleActionResult> {
  const auth = await authorize();
  if (!auth.ok) return { ok: false, error: auth.error };

  if (isDemoMode()) return { ok: true };

  // TODO(API-last): Supabase auto_dm_rules UPDATE status (id AND owner=userId)
  void next;
  revalidatePath("/auto-dm");
  return { ok: true };
}

export async function deleteRule(id: string): Promise<RuleActionResult> {
  const auth = await authorize();
  if (!auth.ok) return { ok: false, error: auth.error };

  if (isDemoMode()) return { ok: true };

  // TODO(API-last): Supabase auto_dm_rules DELETE (id AND owner=userId)
  void id;
  revalidatePath("/auto-dm");
  return { ok: true };
}
