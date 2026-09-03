import type { Metadata } from "next";
import { KeyRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { AvatarImage } from "@/components/ui/avatar-image";
import { InfoTip } from "@/components/ui/info-tip";
import { ResultBanner } from "@/components/ui/result-banner";
import { GoogleIcon, KakaoIcon } from "@/components/icons/provider-icons";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/supabase/config";
import { formatDate } from "@/lib/format";
import { getUserAvatarUrl } from "@/lib/account/avatar";
import { PROVIDER_LABEL, isProvider } from "@/lib/account/providers";
import { SettingsShell } from "../_components/settings-shell";
import { FieldList, FieldRow } from "../_components/field-row";
import { SummaryCard } from "../_components/summary-card";
import { DangerZone } from "./_components/danger-zone";
import { NameRow } from "./_components/name-row";

export const metadata: Metadata = {
  title: "개인정보",
  robots: { index: false, follow: false },
};

/*
  개인정보 — 2026-08-16 신설 → 2026-09-03 재설계(요약 카드 + 사실 행).
  허브 문법(항목 하나 = 페이지 하나)으로 로그인 방식은 「연결된 로그인 계정」, 테마는 「화면 테마」로 갈라 나갔고,
  여기는 **나에 대한 사실**만 남는다: 이름·이메일·가입일. 회원탈퇴는 설정 항목이 아니라 이 화면 맨 아래 작은 링크다(사장님 지시).
  로더·서버 액션(updateDisplayName/deleteAccount)·searchParams 계약은 재설계 전과 같다.
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
  const err = typeof sp.err === "string" ? (ERRORS[sp.err] ?? null) : null;
  const ok = sp.ok === "name" ? "이름을 변경했어요." : null;
  const demo = isDemoMode();

  let email = "";
  let displayName = "";
  let joinedAt: string | null = null;
  let avatarUrl: string | null = null;
  let providers: string[] = [];
  let profileFailed = false;

  if (!demo) {
    /* getAuthUser 는 요청 단위로 캐시된다 — 레이아웃 가드가 이미 한 번 왕복했다 */
    const user = await getAuthUser();
    if (user) {
      const supabase = await createClient();
      email = user.email ?? "";
      avatarUrl = getUserAvatarUrl(user);
      providers = (user.identities ?? []).map((i) => i.provider).filter(Boolean);
      /* 이 조회의 error 를 버리면 이름 칸이 빈칸으로 뜨고, 다른 항목만 바꿔 저장하는 순간 표시 이름이 지워진다(조용한 손실) */
      const { data: profile, error: profileErr } = await supabase.from("users_profile").select("display_name, created_at").eq("id", user.id).maybeSingle();
      if (profileErr) {
        console.error("[profile] 표시 이름 조회 실패:", profileErr.message);
        profileFailed = true;
      }
      displayName = typeof profile?.display_name === "string" ? profile.display_name : "";
      /* 가입일은 auth 의 created_at 이 정본 — users_profile 행은 트리거가 같은 순간 만들지만 수동 복구 계정은 다를 수 있다 */
      joinedAt = user.created_at ?? (typeof profile?.created_at === "string" ? profile.created_at : null);
    }
  } else {
    displayName = "핀치";
  }

  const initial = (displayName || email || "핀").trim().charAt(0).toUpperCase();

  return (
    <SettingsShell title="개인정보" description="핀치에 표시되는 이름과 가입 정보예요.">
      <ResultBanner error={err} notice={ok} path="/settings/profile" />

      <SummaryCard
        leading={<AvatarImage src={avatarUrl} initial={initial} sizeClass="size-14" textClass="text-[20px]" />}
        title={profileFailed ? <span className="text-fg-sub">이름 확인 못 함</span> : displayName || <span className="text-fg-sub">이름을 설정해 주세요</span>}
        chips={
          providers.length > 0 ? (
            <>
              {providers.filter(isProvider).map((p) => (
                <Badge key={p} tone="neutral">
                  {p === "google" ? <GoogleIcon className="size-3" /> : <KakaoIcon className="size-3 text-fg" />}
                  {PROVIDER_LABEL[p]}
                </Badge>
              ))}
            </>
          ) : undefined
        }
        sub={
          <>
            {demo ? "지금은 예시 화면이에요 — 변경은 저장되지 않아요" : email || "이메일 미제공 계정"}
            <span className="mt-1 block text-[12px] text-fg-sub">
              {avatarUrl ? "사진은 로그인 계정의 것을 그대로 써요" : "사진이 없어 이름 첫 글자로 표시해요"}
              <InfoTip label="프로필 사진 안내" className="ml-1 align-middle">
                Google·카카오 계정에서 사진을 바꾸면 다음 로그인 때 반영돼요. 핀치에서 따로 올리는 기능은 없어요.
              </InfoTip>
            </span>
          </>
        }
        aside={
          demo ? (
            <Badge tone="neutral">예시 화면</Badge>
          ) : (
            <ButtonLink href="/settings/logins" variant="secondary" size="sm">
              <KeyRound className="size-4" aria-hidden />
              연결된 로그인 계정
            </ButtonLink>
          )
        }
      />

      <FieldList id="facts" label="기본 정보">
        {/* key=이름 — 저장에 성공해 이름이 바뀌면 행이 새로 마운트돼 편집 폼이 닫힌다(실패·같은 이름이면 열린 채 남아 다시 시도) */}
        <NameRow key={displayName} displayName={displayName} failed={profileFailed} demo={demo} />
        <FieldRow
          label="이메일"
          value={email || undefined}
          empty={demo ? "예시 계정이라 이메일이 없어요" : "이메일 없음"}
          hint={demo ? undefined : email ? "변경이 필요하면 고객센터로 문의해 주세요" : "로그인 계정이 이메일을 제공하지 않았어요"}
        />
        <FieldRow label="가입일" value={joinedAt ? formatDate(joinedAt) : undefined} tnum />
      </FieldList>

      {/* 탈퇴는 카드 밖, 화면 맨 아래 작은 링크다 — 설정 항목과 같은 무게로 두지 않는다 */}
      {!demo ? <DangerZone email={email} /> : null}
    </SettingsShell>
  );
}
