"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/supabase/config";

/**
 * 채널 연동 해제 — 저장된 계정 행(암호화 토큰 포함)을 삭제한다.
 * RLS(auth.uid()=user_id) + user_id 명시 필터 이중 방어로 타인 계정은 건드릴 수 없다.
 * 데모 모드는 지울 DB가 없으므로 성공 배너만 재현한다(버튼이 조용히 무반응이면 고장으로 보인다).
 * 성공/실패는 OAuth 콜백과 같은 배너 파이프라인(page.tsx의 connect 쿼리)으로 피드백한다.
 */
export async function disconnectAccount(formData: FormData): Promise<void> {
  const accountId = formData.get("accountId");
  if (typeof accountId !== "string" || !accountId) {
    redirect("/settings?connect=error&reason=disconnect_failed");
  }
  if (isDemoMode()) {
    redirect("/settings?connect=disconnected");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/settings?connect=error&reason=disconnect_failed");
  }

  // .select("id")로 삭제 행 수를 확인한다 — RLS 등으로 0행이 지워졌는데
  // 성공 배너가 뜨면 "해제했는데 그대로예요"라는 최악의 혼란이 된다.
  const { data: deleted, error } = await supabase
    .from("connected_accounts")
    .delete()
    .eq("id", accountId)
    .eq("user_id", user.id)
    .select("id");
  if (error || !deleted || deleted.length === 0) {
    console.error("[settings] 연동 해제 실패:", error?.message ?? "0행 삭제(권한 또는 이미 삭제됨)");
    redirect("/settings?connect=error&reason=disconnect_failed");
  }
  revalidatePath("/settings");
  redirect("/settings?connect=disconnected");
}

/**
 * 메타 광고 연동 해제 — meta_ad_connections 행을 지운다.
 * meta_ad_accounts 는 connection_id 외래키의 on delete cascade 로 함께 사라진다(0077).
 *
 * 채널 해제와 표가 달라 함수를 따로 둔다 — 하나로 합치면 «어느 표를 지울지»를
 * 폼 값으로 받아야 하고, 그건 사용자가 보내는 값으로 지울 표를 고르는 것과 같다.
 */
export async function disconnectMetaAds(formData: FormData): Promise<void> {
  const connectionId = formData.get("connectionId");
  if (typeof connectionId !== "string" || !connectionId) {
    redirect("/settings?connect=error&reason=disconnect_failed");
  }
  if (isDemoMode()) {
    redirect("/settings?connect=disconnected");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/settings?connect=error&reason=disconnect_failed");
  }

  // 0행 삭제를 성공으로 덮지 않는다 — «해제했는데 그대로예요»가 된다(위와 같은 규칙)
  const { data: deleted, error } = await supabase
    .from("meta_ad_connections")
    .delete()
    .eq("id", connectionId)
    .eq("user_id", user.id)
    .select("id");
  if (error || !deleted || deleted.length === 0) {
    console.error(
      "[settings] 광고 연동 해제 실패:",
      error?.message ?? "0행 삭제(권한 또는 이미 삭제됨)",
    );
    redirect("/settings?connect=error&reason=disconnect_failed");
  }
  revalidatePath("/settings");
  revalidatePath("/ads");
  redirect("/settings?connect=disconnected");
}
