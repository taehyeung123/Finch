"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isDemoMode } from "@/lib/supabase/config";
import { purgeAndDeleteUser } from "@/lib/account/delete";
import { DELETE_PHRASE } from "./constants";

/* 삭제 코어(버킷 정리·주소 무덤·auth 삭제)는 lib/account/delete.ts 로 옮겼다 —
   동의 화면의 «동의하지 않고 탈퇴»(consent/actions.ts)와 같은 루틴을 써야 하기 때문이다.
   두 벌로 두면 한쪽만 고쳐진다(2026-08-17 reference-thumbs 누락이 그런 사고였다). */

/*
  프로필 — 이름 변경 · 회원탈퇴.

  회원탈퇴는 이 제품에서 **가장 되돌릴 수 없는 동작**이라 3중 가드를 건다:
   ① 화면: 무슨 일이 일어나는지 문장으로 말한다
   ② 폼: 확인 문구를 그대로 타이핑해야 제출 버튼이 열린다(오클릭 차단)
   ③ 서버: 여기서 **세션 값과 다시 대조한다** — 클라이언트 검증은 우회 가능하고,
      hidden 필드에 정답을 담아 보내면 그 값을 바꿔치기하는 순간 검증이 무의미해진다

  실제 삭제는 auth.users 한 행을 지우는 것으로 끝난다. 도메인 표가 전부
  `references auth.users(id) on delete cascade` 라 프로필·연동·예약·크레딧 내역이
  함께 사라진다. 표를 하나씩 지우면 순서를 틀리는 순간 고아 행이 남는다.
  예외는 payment_orders 하나 — 0044 에서 `on delete set null` 로 바꿔 거래 기록만
  남기고 개인 식별 연결을 끊는다(전자상거래법 보존 의무).
*/

export async function updateDisplayName(formData: FormData): Promise<void> {
  if (isDemoMode()) redirect("/settings/profile?err=demo");

  const name = String(formData.get("displayName") ?? "")
    .trim()
    .slice(0, 40);

  const user = await getAuthUser();
  if (!user) redirect("/login?next=/settings/profile");

  const supabase = await createClient();
  const { error } = await supabase.from("users_profile").update({ display_name: name }).eq("id", user.id);
  if (error) {
    console.error("[settings] 이름 변경 실패:", error.message);
    redirect("/settings/profile?err=save");
  }
  revalidatePath("/settings/profile");
  redirect("/settings/profile?ok=name");
}

export async function deleteAccount(formData: FormData): Promise<void> {
  if (isDemoMode()) redirect("/settings/profile?err=demo");

  const typed = String(formData.get("confirm") ?? "").trim();

  const user = await getAuthUser();
  if (!user) redirect("/login?next=/settings/profile");

  const mine = (user.email ?? "").trim();
  const expected = mine || DELETE_PHRASE;
  if (typed.toLowerCase() !== expected.toLowerCase()) redirect("/settings/profile?err=confirm");

  const admin = createAdminClient();
  if (!admin) {
    console.error("[settings] 탈퇴 실패: service role 키 미설정");
    redirect("/settings/profile?err=unconfigured");
  }

  const ok = await purgeAndDeleteUser(admin, user.id);
  if (!ok) {
    redirect("/settings/profile?err=delete");
  }

  /* 세션 쿠키를 반드시 함께 정리한다 — 사용자는 지워졌는데 쿠키가 남으면
     다음 요청이 "존재하지 않는 사용자"로 들어가 화면이 이상하게 깨진다.
     auth-js 의 signOut 은 404/401/403 을 무시하고 로컬 세션을 항상 제거한다. */
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/goodbye");
}
