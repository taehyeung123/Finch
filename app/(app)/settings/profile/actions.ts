"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isDemoMode } from "@/lib/supabase/config";
import { DELETE_PHRASE } from "./constants";

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

  /* Storage 는 auth.users 에 FK 가 없어 계정을 지워도 **파일이 그대로 남는다.**
     카드뉴스 원본·브랜드 로고는 이용자가 올린 개인 자료라 파기 대상이다.
     사용자 삭제 **앞에** 지운다 — 뒤로 미루면 계정이 사라진 뒤 실패했을 때
     그 파일들을 다시 찾아갈 주인이 없다(경로가 user.id 프리픽스다).
     실패해도 탈퇴 자체는 진행한다 — 파일이 남는 것보다 탈퇴가 막히는 게 더 나쁘다. */
  for (const bucket of ["cardnews", "brand-logos"]) {
    try {
      const { data: files } = await admin.storage.from(bucket).list(user.id, { limit: 1000 });
      const paths: string[] = [];
      for (const f of files ?? []) {
        /* list 는 한 단계만 본다. cardnews 는 user/batch/01.png 구조라 하위를 한 번 더 판다. */
        const { data: inner } = await admin.storage.from(bucket).list(`${user.id}/${f.name}`, { limit: 1000 });
        if (inner && inner.length > 0) paths.push(...inner.map((c) => `${user.id}/${f.name}/${c.name}`));
        else paths.push(`${user.id}/${f.name}`);
      }
      if (paths.length > 0) await admin.storage.from(bucket).remove(paths);
    } catch (e) {
      console.error(`[settings] 탈퇴 시 ${bucket} 정리 실패:`, e);
    }
  }

  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    console.error("[settings] 회원탈퇴 실패:", error.message);
    redirect("/settings/profile?err=delete");
  }

  /* 세션 쿠키를 반드시 함께 정리한다 — 사용자는 지워졌는데 쿠키가 남으면
     다음 요청이 "존재하지 않는 사용자"로 들어가 화면이 이상하게 깨진다.
     auth-js 의 signOut 은 404/401/403 을 무시하고 로컬 세션을 항상 제거한다. */
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/goodbye");
}
