import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LogOut } from "lucide-react";
import { PageHeader } from "@/components/ui/section-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Channel } from "@/lib/types";
import { CHANNEL_LABEL } from "@/lib/channels";
import { accounts as mockAccounts } from "@/lib/data";
import { getCurrentPlan, getSubscription, type PlanKey } from "@/lib/data/internal";
import { PLAN_NAMES, isPaidPlan } from "@/lib/toss/config";
import { isDemoMode } from "@/lib/supabase/config";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { isMissingTableError } from "@/lib/supabase/errors";
import { SETTINGS_GROUPS } from "@/lib/settings/sections";
import { HubGroup, HubRow, HubRowBody, hubRowClass } from "./_components/hub-row";

export const metadata: Metadata = {
  title: "계정 및 설정",
  robots: { index: false, follow: false },
};

/*
  계정 및 설정 — 허브 (2026-09-03 재구성, 링크팜 계정 화면 문법).

  앞서 /settings 는 곧 «채널 연동» 화면이었고 다른 설정은 칩 탭으로 매달려 있었다.
  사장님 지시: 「개인정보부터 연결된 로그인 계정, SNS 계정 연결, 알림, 플랜, 결제수단,
  약관·사업자 정보까지 페이지별로」. 그래서 이 화면은 **목록만** 한다 — 각 행이 페이지 하나로 간다.
  행의 한 줄 상태(연결된 채널·등록 카드 등)는 실제 값을 읽되, 조회가 실패하면 정적 설명으로
  물러난다(lib/settings/sections.ts 의 hint). 실패를 «없음»으로 그리지 않는다.

  목록 순서·이름의 정본은 lib/settings/sections.ts 다. 여기서는 그 배열을 돌며 상태만 덧입힌다.
*/

const PROVIDER_LABEL: Record<string, string> = { google: "Google", kakao: "카카오" };

interface HubState {
  displayName: string;
  email: string | null;
  /** null = 조회 실패(«무료»와 다르다) */
  plan: PlanKey | null;
  /** null = 조회 실패 */
  connectedChannels: Channel[] | null;
  /** null = 조회 실패 */
  adsConnected: boolean | null;
  providers: string[];
  cardSummary: string | null;
  nextBillingAt: string | null;
  /** 구독 조회 실패 — 카드·결제일 문구를 단정하지 않는다 */
  subscriptionFailed: boolean;
  signedIn: boolean;
}

async function loadHub(): Promise<HubState> {
  if (isDemoMode()) {
    return {
      displayName: "핀치 데모",
      email: null,
      plan: "creator",
      connectedChannels: mockAccounts.filter((a) => a.connected).map((a) => a.channel),
      adsConnected: true,
      providers: [],
      cardSummary: null,
      nextBillingAt: null,
      subscriptionFailed: false,
      signedIn: false,
    };
  }

  const user = await getAuthUser();
  if (!user) {
    return {
      displayName: "",
      email: null,
      plan: "free",
      connectedChannels: [],
      adsConnected: false,
      providers: [],
      cardSummary: null,
      nextBillingAt: null,
      subscriptionFailed: false,
      signedIn: false,
    };
  }

  const supabase = await createClient();
  const [profileRes, channelsRes, adsRes, plan, subRes] = await Promise.all([
    supabase.from("users_profile").select("display_name").eq("id", user.id).maybeSingle(),
    /* «내 연동»만 — 팀 RLS 가 소유자 행을 멤버에게 열어 준다(channels/page.tsx 와 같은 이유) */
    supabase.from("connected_accounts").select("channel, connected").eq("user_id", user.id),
    supabase.from("meta_ad_connections").select("connected").eq("user_id", user.id).limit(1).maybeSingle(),
    getCurrentPlan(),
    getSubscription(),
  ]);

  if (profileRes.error) console.error("[settings] 프로필 조회 실패:", profileRes.error.message);
  if (channelsRes.error) console.error("[settings] 연동 채널 조회 실패:", channelsRes.error.message);
  /* 0077 미적용이면 표가 없다 — 그건 실패가 아니라 «아직 없음» */
  const adsFailed = Boolean(adsRes.error && !isMissingTableError(adsRes.error));
  if (adsFailed) console.error("[settings] 광고 연동 조회 실패:", adsRes.error?.message);

  const displayName =
    typeof profileRes.data?.display_name === "string" && profileRes.data.display_name.trim()
      ? profileRes.data.display_name.trim()
      : "";

  return {
    displayName,
    email: user.email ?? null,
    plan,
    connectedChannels: channelsRes.error
      ? null
      : (channelsRes.data ?? [])
          .filter((r) => r.connected)
          .map((r) => r.channel as Channel)
          .filter((c): c is Channel => c === "instagram" || c === "tiktok" || c === "threads"),
    adsConnected: adsFailed ? null : Boolean(adsRes.data?.connected),
    providers: (user.identities ?? []).map((i) => i.provider).filter(Boolean),
    cardSummary: subRes?.sub?.cardSummary ?? null,
    nextBillingAt: subRes?.sub?.nextBillingAt ?? null,
    subscriptionFailed: subRes === null,
    signedIn: true,
  };
}

/** 항목별 실제 상태 문구 — 못 읽었으면 undefined 를 돌려 정적 hint 가 남게 한다 */
function liveHint(href: string, s: HubState): { text: string; tone?: "warning" } | undefined {
  switch (href) {
    case "/settings/logins": {
      if (s.providers.length === 0) return undefined;
      return { text: `${s.providers.map((p) => PROVIDER_LABEL[p] ?? p).join(" · ")} 연결됨` };
    }
    case "/settings/channels": {
      /* 둘 중 하나라도 못 읽었으면 단정하지 않는다 — 광고 조회만 죽었을 때 «연결한 계정 없음»이나
         «Meta 광고 빠진 목록»을 그리면 연동해 둔 사람이 끊긴 줄 안다(2026-09-03 소넷 점검) */
      if (s.connectedChannels === null || s.adsConnected === null) return undefined;
      const names = s.connectedChannels.map((c) => CHANNEL_LABEL[c]);
      if (s.adsConnected) names.push("Meta 광고");
      if (names.length === 0) return { text: "아직 연결한 계정이 없어요", tone: "warning" };
      return { text: `${names.join(" · ")} 연결됨` };
    }
    case "/settings/billing": {
      if (s.plan === null) return undefined;
      const name = isPaidPlan(s.plan) ? PLAN_NAMES[s.plan] : "Free";
      const next = s.nextBillingAt ? ` · 다음 결제일 ${s.nextBillingAt.slice(0, 10)}` : "";
      return { text: `${name} 플랜${next}` };
    }
    case "/settings/billing/payment": {
      if (s.subscriptionFailed) return undefined;
      if (s.cardSummary) return { text: `등록된 카드 ${s.cardSummary}` };
      /* 무료 플랜은 카드가 없는 게 정상이라 경고 톤을 쓰지 않는다 */
      return { text: "등록된 카드 없음" };
    }
    default:
      return undefined;
  }
}

export default async function SettingsHubPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  /* 옛 주소 호환 — OAuth 콜백이 /settings?connect=… 로 돌아오던 시절의 링크(배포 중 진행 중이던 연동,
     북마크). 배너는 이제 채널 화면이 그린다. */
  if (typeof sp.connect === "string") {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (typeof v === "string") q.set(k, v);
    redirect(`/settings/channels?${q.toString()}`);
  }

  const s = await loadHub();
  const planName = s.plan === null ? null : isPaidPlan(s.plan) ? PLAN_NAMES[s.plan] : "Free";
  const initial = (s.displayName || s.email || "핀").trim().charAt(0).toUpperCase();

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <PageHeader title="계정 및 설정" description="내 정보·연결·결제·약관을 한 곳에서 관리하세요." />

      {/* 계정 요약 — 누구로 로그인했고 어떤 플랜인지. 링크팜 계정 화면 맨 위의 그 카드다 */}
      <Card className="flex flex-wrap items-center gap-4 p-4">
        <span
          className="flex size-12 shrink-0 items-center justify-center rounded-chip bg-primary-weak text-[17px] font-bold text-primary"
          aria-hidden
        >
          {initial}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[17px] font-semibold leading-snug">
            {s.displayName || (s.signedIn ? "이름을 설정해 주세요" : "핀치")}
          </p>
          <p className="truncate text-[14px] text-fg-sub">
            {s.email ??
              (s.signedIn ? "이메일 없음" : "지금은 예시 화면이에요 — 로그인하면 내 계정이 표시됩니다")}
          </p>
        </div>
        {planName ? (
          <Badge tone={s.plan !== "free" ? "primary" : "neutral"}>{planName} 플랜</Badge>
        ) : (
          <Badge tone="warning">플랜 확인 못 함</Badge>
        )}
      </Card>

      {SETTINGS_GROUPS.map((group) => (
        <HubGroup key={group.key} id={group.key} label={group.label}>
          {group.items.map((item) => {
            const live = liveHint(item.href, s);
            return (
              <HubRow
                key={item.href}
                href={item.href}
                icon={item.icon}
                label={item.label}
                hint={live?.text ?? item.hint}
                hintTone={live?.tone}
              />
            );
          })}
        </HubGroup>
      ))}

      {/* 로그아웃 — 상단바 계정 메뉴에도 있지만, 모바일에서는 이 화면이 «계정» 의 집이라 여기에도 둔다.
          회원탈퇴는 여기 없다 — 개인정보 화면 맨 아래 작은 링크다(사장님 지시, profile/_components/danger-zone.tsx). */}
      {s.signedIn ? (
        <Card className="overflow-hidden">
          <form action="/auth/signout" method="post">
            <button type="submit" className={hubRowClass}>
              <HubRowBody icon={LogOut} label="로그아웃" hint="이 기기에서 로그아웃해요" />
            </button>
          </form>
        </Card>
      ) : !isDemoMode() ? null : (
        <p className="px-1 text-[14px] text-fg-sub">
          예시 화면에서는 설정을 저장할 수 없어요.{" "}
          <Link href="/login" className="font-semibold text-primary underline underline-offset-2">
            로그인
          </Link>
        </p>
      )}
    </div>
  );
}
