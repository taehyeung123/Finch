import type { Metadata } from "next";
import { KeyRound, Mail } from "lucide-react";
import { PageHeader } from "@/components/ui/section-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/supabase/config";
import { SettingsNav } from "../_components/settings-nav";
import { ThemeChoice } from "./_components/theme-choice";
import { DangerZone } from "./_components/danger-zone";
import { updateDisplayName } from "./actions";

export const metadata: Metadata = {
  title: "프로필",
  robots: { index: false, follow: false },
};

/*
  프로필 — 2026-08-16 신설.

  앞서 설정은 「계정 연동 / 팀 / 요금제·결제 / 알림」 넷이었다. 즉 **내가 누구인지**를
  보는 자리가 없었다: 이름도 못 바꾸고, 어떤 방식으로 로그인했는지도 알 수 없고,
  탈퇴 경로는 아예 존재하지 않았다(개인정보처리방침은 "회원 탈퇴로 동의를 철회할 수
  있다"고 적고 있는데 화면에 그 수단이 없었다).

  테마도 여기다. 상단 바 토글은 "지금 바꾸기"고 이 화면은 "내 기본값"이다.

  회원탈퇴는 설정 **탭이 아니라** 이 화면 맨 아래 작은 링크다(사장님 지시).
*/
const ERRORS: Record<string, string> = {
  demo: "데모 모드에서는 변경할 수 없어요.",
  save: "저장하지 못했어요. 잠시 후 다시 시도해 주세요.",
  confirm: "확인 문구가 일치하지 않아 탈퇴를 진행하지 않았어요.",
  unconfigured: "탈퇴 처리를 위한 서버 설정이 준비되지 않았어요. 고객센터로 문의해 주세요.",
  delete: "탈퇴 처리에 실패했어요. 고객센터로 문의해 주세요.",
};

/** Supabase identity provider → 사람이 읽는 이름. 모르는 값은 원문을 그대로 보여준다 */
const PROVIDER_LABEL: Record<string, string> = {
  google: "Google",
  kakao: "카카오",
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
  let providers: string[] = [];
  let profileFailed = false;

  if (!isDemoMode()) {
    /* getAuthUser 는 요청 단위로 캐시된다 — 레이아웃 가드가 이미 한 번 왕복했다.
       여기서 createClient().auth.getUser() 를 또 부르면 Auth 서버를 두 번 친다
       (lib/supabase/server.ts: 내비게이션 지연의 주범으로 실측된 패턴). */
    const user = await getAuthUser();
    if (user) {
      const supabase = await createClient();
      email = user.email ?? "";
      /* identities 가 로그인 **방식**의 단일 출처다. app_metadata.provider 는 마지막
         로그인 하나만 담아서, 구글과 카카오를 모두 연결한 사람에게 거짓말을 한다. */
      providers = (user.identities ?? []).map((i) => i.provider).filter(Boolean);
      /* 이 조회의 error 는 예전에 버려졌다 — 실패하면 이름 칸이 **빈칸**으로 뜨고,
         사용자가 다른 항목만 바꿔 저장하는 순간 표시 이름이 지워진다(조용한 손실). */
      const { data: profile, error: profileErr } = await supabase
        .from("users_profile")
        .select("display_name")
        .eq("id", user.id)
        .maybeSingle();
      if (profileErr) {
        console.error("[profile] 표시 이름 조회 실패:", profileErr.message);
        profileFailed = true;
      }
      displayName = typeof profile?.display_name === "string" ? profile.display_name : "";
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="설정" description="내 정보와 화면 설정을 관리하세요." />
      <SettingsNav />

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

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start">
      <Card>
        <CardHeader title="내 정보" description="화면과 리포트에 표시되는 이름이에요" />
        <CardBody className="space-y-5">
          {/* flex-1 을 빼서 저장 버튼이 입력창 바로 옆에 붙는다.
              앞서는 래퍼가 남은 폭을 전부 먹어, 넓은 화면에서 입력창(max-w-sm)과
              버튼이 1000px 넘게 벌어졌다 — 한 벌로 안 읽힌다. */}
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

          {/* 이메일·로그인 방식을 나란히. 각각 값이 한 줄뿐인데 전폭을 쓰면
              카드 오른쪽 2/3 가 통째로 빈다. */}
          <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <p className="text-[12px] font-medium text-fg-sub">이메일</p>
            <p className="mt-1.5 flex items-center gap-2 text-[15px]">
              <Mail className="size-4 shrink-0 text-fg-sub" aria-hidden />
              {email || "—"}
            </p>
            {/* 이메일 변경은 아직 경로가 없다. "변경" 버튼을 그려 놓고 아무 일도
                안 일어나게 두느니, 지금 사실을 적는다. */}
            <p className="mt-1 text-[12px] text-fg-sub">가입에 사용한 이메일이에요. 변경이 필요하면 고객센터로 문의해 주세요.</p>
          </div>

          <div>
            <p className="text-[12px] font-medium text-fg-sub">로그인 방식</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <KeyRound className="size-4 shrink-0 text-fg-sub" aria-hidden />
              {providers.length > 0 ? (
                providers.map((p) => (
                  <span key={p} className="rounded-chip border border-line px-2.5 py-0.5 text-[12px] font-medium">
                    {PROVIDER_LABEL[p] ?? p}
                  </span>
                ))
              ) : (
                <span className="text-[15px] text-fg-sub">—</span>
              )}
            </div>
          </div>
          </div>
        </CardBody>
      </Card>

      {/* 화면 설정 — 테마 버튼 2개를 담자고 카드 한 장이 전폭을 쓰던 것을
          내 정보 카드 옆으로 붙였다(2단). 넓은 화면에서 두 카드가 한 눈에 들어온다. */}
      <Card>
        <CardHeader title="화면" description="라이트와 다크 중에 고르세요" />
        <CardBody>
          <ThemeChoice />
        </CardBody>
      </Card>
      </div>

      {/* 탈퇴는 카드 밖, 화면 맨 아래 작은 링크다 — 설정 항목과 같은 무게로 두지 않는다 */}
      {!isDemoMode() ? <DangerZone email={email} /> : null}
    </div>
  );
}
