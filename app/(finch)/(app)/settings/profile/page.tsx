import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, KeyRound, Mail } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { AvatarImage } from "@/components/ui/avatar-image";
import { SubmitButton } from "@/components/ui/submit-button";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/supabase/config";
import { formatDate } from "@/lib/format";
import { getUserAvatarUrl } from "@/lib/account/avatar";
import { SettingsShell } from "../_components/settings-shell";
import { DangerZone } from "./_components/danger-zone";
import { updateDisplayName } from "./actions";

export const metadata: Metadata = {
  title: "개인정보",
  robots: { index: false, follow: false },
};

/*
  개인정보 — 2026-08-16 신설, 2026-09-03 허브 재구성.

  앞서 이 화면은 «프로필»이라는 이름으로 이름·이메일·로그인 방식·테마를 한 카드에 담았다.
  허브 문법(항목 하나 = 페이지 하나)으로 로그인 방식은 「연결된 로그인 계정」, 테마는
  「화면 테마」로 갈라 나갔고, 여기는 **나에 대한 사실**만 남는다: 이름·이메일·가입일.

  회원탈퇴는 설정 **항목이 아니라** 이 화면 맨 아래 작은 링크다(사장님 지시).
*/
const ERRORS: Record<string, string> = {
  demo: "지금은 예시 화면이라 변경할 수 없어요.",
  save: "저장하지 못했어요. 잠시 후 다시 시도해 주세요.",
  confirm: "확인 문구가 일치하지 않아 탈퇴를 진행하지 않았어요.",
  unconfigured: "탈퇴 처리를 위한 서버 설정이 준비되지 않았어요. 고객센터로 문의해 주세요.",
  delete: "탈퇴 처리에 실패했어요. 고객센터로 문의해 주세요.",
};

export default async function ProfileSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const err = typeof sp.err === "string" ? ERRORS[sp.err] : null;
  const ok = sp.ok === "name" ? "이름을 변경했어요." : null;

  let email = "";
  let displayName = "";
  let joinedAt: string | null = null;
  let avatarUrl: string | null = null;
  let profileFailed = false;

  if (!isDemoMode()) {
    /* getAuthUser 는 요청 단위로 캐시된다 — 레이아웃 가드가 이미 한 번 왕복했다.
       여기서 createClient().auth.getUser() 를 또 부르면 Auth 서버를 두 번 친다
       (lib/supabase/server.ts: 내비게이션 지연의 주범으로 실측된 패턴). */
    const user = await getAuthUser();
    if (user) {
      const supabase = await createClient();
      email = user.email ?? "";
      avatarUrl = getUserAvatarUrl(user);
      /* 이 조회의 error 는 예전에 버려졌다 — 실패하면 이름 칸이 **빈칸**으로 뜨고,
         사용자가 다른 항목만 바꿔 저장하는 순간 표시 이름이 지워진다(조용한 손실). */
      const { data: profile, error: profileErr } = await supabase
        .from("users_profile")
        .select("display_name, created_at")
        .eq("id", user.id)
        .maybeSingle();
      if (profileErr) {
        console.error("[profile] 표시 이름 조회 실패:", profileErr.message);
        profileFailed = true;
      }
      displayName = typeof profile?.display_name === "string" ? profile.display_name : "";
      /* 가입일은 auth 의 created_at 이 정본이다 — users_profile 행은 트리거가 같은 순간 만들지만
         0001 이전 가입자·수동 복구 계정은 다를 수 있다 */
      joinedAt = user.created_at ?? (typeof profile?.created_at === "string" ? profile.created_at : null);
    }
  }

  return (
    <SettingsShell title="개인정보" description="핀치에 표시되는 이름과 가입 정보예요.">
      {err ? (
        <p role="alert" className="rounded-card border border-negative/40 bg-negative-weak p-4 text-[15px] text-negative-strong">
          {err}
        </p>
      ) : null}
      {ok ? (
        <p role="status" className="rounded-card border border-positive/40 bg-positive-weak p-4 text-[15px] text-positive-strong">
          {ok}
        </p>
      ) : null}

      <Card>
        <CardHeader title="내 정보" description="화면과 리포트에 표시되는 이름이에요" />
        <CardBody className="space-y-5">
          {/* 프로필 사진 — 업로드 기능은 없다. 로그인 계정(Google·카카오)의 사진을 그대로 쓰고,
              바꾸는 길이 어디인지만 말한다(«바꾸기» 버튼을 그려 놓고 아무 일도 안 일어나게 두지 않는다). */}
          <div className="flex items-center gap-3">
            <AvatarImage
              src={avatarUrl}
              initial={(displayName || email || "핀").trim().charAt(0).toUpperCase()}
              sizeClass="size-14"
              textClass="text-[20px]"
            />
            <div className="min-w-0">
              <p className="text-[12px] font-medium text-fg-sub">프로필 사진</p>
              <p className="mt-0.5 text-[14px] text-fg-sub">
                {avatarUrl
                  ? "로그인한 Google·카카오 계정의 사진이에요. 그쪽에서 바꾸면 다음 로그인 때 반영돼요."
                  : "로그인 계정에 사진이 없어 이름 첫 글자로 표시해요."}
              </p>
            </div>
          </div>

          {/* flex-1 을 빼서 저장 버튼이 입력창 바로 옆에 붙는다 — 래퍼가 남은 폭을 전부 먹으면
              넓은 화면에서 입력창과 버튼이 한 벌로 안 읽힌다. */}
          <form action={updateDisplayName} className="flex flex-wrap items-end gap-3">
            <div className="min-w-0">
              <label htmlFor="displayName" className="block text-[12px] font-medium text-fg-sub">
                이름
              </label>
              <input
                id="displayName"
                name="displayName"
                defaultValue={displayName}
                maxLength={40}
                placeholder="핀치"
                className="mt-1.5 h-10 w-[min(100%,24rem)] rounded-card border border-line bg-body px-3 text-[15px] text-fg placeholder:text-fg-faint focus:border-primary focus:outline-none"
              />
            </div>
            <SubmitButton
              variant="secondary"
              pendingLabel="저장 중…"
              disabled={isDemoMode() || profileFailed}
              title={profileFailed ? "이름을 불러오지 못해 저장을 잠시 막았어요" : undefined}
            >
              저장
            </SubmitButton>
          </form>

          {/* 이름을 못 읽었으면 «빈 이름»으로 저장되는 길을 막는다 — 나머지 설정은 계속 쓸 수 있게
              카드 전체가 아니라 이 폼만 잠근다. */}
          {profileFailed ? (
            <p role="alert" className="-mt-2 text-[14px] text-warning">
              지금 표시된 이름은 실제 값이 아니에요 — 불러오지 못했습니다. 이대로 저장하면 이름이 지워질 수 있어
              저장을 잠시 막았어요. 새로고침해 주세요.
            </p>
          ) : null}

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <p className="text-[12px] font-medium text-fg-sub">이메일</p>
              <p className="mt-1.5 flex items-center gap-2 text-[15px]">
                <Mail className="size-4 shrink-0 text-fg-sub" aria-hidden />
                <span className="truncate">{email || "—"}</span>
              </p>
              {/* 이메일 변경은 아직 경로가 없다. "변경" 버튼을 그려 놓고 아무 일도
                  안 일어나게 두느니, 지금 사실을 적는다. */}
              <p className="mt-1 text-[12px] text-fg-sub">가입에 사용한 이메일이에요. 변경이 필요하면 고객센터로 문의해 주세요.</p>
            </div>

            <div>
              <p className="text-[12px] font-medium text-fg-sub">가입일</p>
              <p className="mt-1.5 flex items-center gap-2 text-[15px]">
                <CalendarDays className="size-4 shrink-0 text-fg-sub" aria-hidden />
                <span className="tnum">{joinedAt ? formatDate(joinedAt) : "—"}</span>
              </p>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* 로그인 방식은 따로 페이지가 있다 — 여기서 찾는 사람에게 길만 알려 준다 */}
      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <p className="flex items-center gap-2 text-[14px] text-fg-sub">
          <KeyRound className="size-4 shrink-0" aria-hidden />
          Google·카카오 로그인 연결은 「연결된 로그인 계정」에서 관리해요.
        </p>
        <Link href="/settings/logins" className="text-[14px] font-semibold text-primary underline underline-offset-2">
          연결된 로그인 계정
        </Link>
      </Card>

      {/* 탈퇴는 카드 밖, 화면 맨 아래 작은 링크다 — 설정 항목과 같은 무게로 두지 않는다 */}
      {!isDemoMode() ? <DangerZone email={email} /> : null}
    </SettingsShell>
  );
}
