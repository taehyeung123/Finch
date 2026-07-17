"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/supabase/config";

/**
 * 채널 연동 해제 — 저장된 계정 행(암호화 토큰 포함)을 삭제한다.
 * RLS로 auth.uid()=user_id 행만 삭제되므로 타인 계정은 건드릴 수 없다.
 * 데모 모드에서는 실 DB가 없으므로 no-op.
 */
export async function disconnectAccount(formData: FormData): Promise<void> {
  const accountId = formData.get("accountId");
  if (typeof accountId !== "string" || !accountId) return;
  if (isDemoMode()) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { error } = await supabase.from("connected_accounts").delete().eq("id", accountId);
  if (error) {
    console.error("[settings] 연동 해제 실패:", error.message);
    return;
  }
  revalidatePath("/settings");
}
