import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LogOut } from "lucide-react";
import { PageHeader } from "@/components/ui/section-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AvatarImage } from "@/components/ui/avatar-image";
import { NoticeBar } from "@/components/ui/notice-bar";
import { RetryLink } from "@/components/ui/retry-link";
import { StateChip } from "@/components/ui/state-chip";
import { InstagramGlyph, MetaGlyph, ThreadsGlyph, TiktokGlyph } from "@/components/icons/brand";
import type { Channel } from "@/lib/types";
import { CHANNEL_LABEL } from "@/lib/channels";
import { accounts as mockAccounts } from "@/lib/data";
import { getCurrentPlan, getSubscription, type PlanKey } from "@/lib/data/internal";
import { PLAN_NAMES, isPaidPlan } from "@/lib/toss/config";
import { isDemoMode } from "@/lib/supabase/config";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { isMissingTableError } from "@/lib/supabase/errors";
import { getUserAvatarUrl } from "@/lib/account/avatar";
import { providerLabel } from "@/lib/account/providers";
import { PRIVACY_VERSION, TERMS_VERSION } from "@/lib/legal/consent";
import { formatDate } from "@/lib/format";
import { SETTINGS_GROUPS } from "@/lib/settings/sections";
import { SETTINGS_COLUMN } from "./_components/settings-shell";
import { SettingsGroup, SettingsRow } from "./_components/settings-row";
import { SummaryCard, type SummaryStatProps } from "./_components/summary-card";

export const metadata: Metadata = {
  title: "계정 및 설정",
  robots: { index: false, follow: false },
};

/*
  계정 및 설정 — 허브 (2026-09-03 재구성 → 같은 날 재설계, 링크팜 계정 화면 문법).

  이 화면은 **목록만** 한다 — 각 행이 페이지 하나로 간다(정본 lib/settings/sections.ts).
  맨 위 요약 카드가 «누구·어떤 플랜·몇 개 연결·다음 결제일»을 첫눈에 말하고, 행마다 실제 상태를 칩·힌트로 덧입힌다.
  조회가 실패한 항목은 «확인 못 함»(속 빈 점)으로 그린다 — 실패를 «없음»으로 그리지 않는다.
  데모(예시 화면)는 요약 카드의 배지 한 개로만 말한다 — 카드 밖 데모 문단·로그인 링크는 두지 않는다.
*/

interface HubState {
  displayName: string;
  /** 표시 이름을 못 읽었다 — 빈 이름과 다르다 */
  profileFailed: boolean;
  email: string | null;
  avatarUrl: string | null;
  /** null = 조회 실패(«무료»와 다르다) */
  plan: PlanKey | null;
  /** null = 조회 실패 */
  connectedChannels: Channel[] | null;
  /** null = 조회 실패 */
  adsConnected: boolean | null;
  /** 연결된 채널·광고 중 가장 빨리 만료되는 날까지(일). TikTok 은 자동 갱신이라 제외. null = 해당 없음 */
  minExpiresInDays: number | null;
  providers: string[];
  cardSummary: string | null;
  nextBillingAt: string | null;
  subscriptionStatus: "active" | "past_due" | "canceled" | null;
  /** 구독 조회 실패 — 카드·결제일 문구를 단정하지 않는다 */
  subscriptionFailed: boolean;
  signedIn: boolean;
}

function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  return Number.isFinite(ms) ? Math.max(0, Math.ceil(ms / 86_400_000)) : null;
}

async function loadHub(): Promise<HubState> {
  if (isDemoMode()) {
    return {
      displayName: "핀치",
      profileFailed: false,
      email: null,
      avatarUrl: null,
      plan: "creator",
      connectedChannels: mockAccounts.filter((a) => a.connected).map((a) => a.channel),
      adsConnected: true,
      minExpiresInDays: null,
      providers: [],
      cardSummary: null,
      nextBillingAt: null,
      subscriptionStatus: null,
      subscriptionFailed: false,
      signedIn: false,
    };
  }

  const user = await getAuthUser();
  if (!user) {
    /* 레이아웃 가드가 먼저 /login 으로 보내므로 실모드에서는 도달하지 않는다 — 값은 예전 그대로 둔다 */
    return {
      displayName: "",
      profileFailed: false,
      email: null,
      avatarUrl: null,
      plan: "free",
      connectedChannels: [],
      adsConnected: false,
      minExpiresInDays: null,
      providers: [],
      cardSummary: null,
      nextBillingAt: null,
      subscriptionStatus: null,
      subscriptionFailed: false,
      signedIn: false,
    };
  }

  const supabase = await createClient();
  const [profileRes, channelsRes, adsRes, plan, subRes] = await Promise.all([
    supabase.from("users_profile").select("display_name").eq("id", user.id).maybeSingle(),
    /* «내 연동»만 — 팀 RLS 가 소유자 행을 멤버에게 열어 준다(channels/page.tsx 와 같은 이유) */
    supabase.from("connected_accounts").select("channel, connected, token_expires_at").eq("user_id", user.id),
    supabase.from("meta_ad_connections").select("connected, token_expires_at").eq("user_id", user.id).limit(1).maybeSingle(),
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

  const channelRows = (channelsRes.data ?? []) as { channel: string; connected: boolean; token_expires_at?: string | null }[];
  const connectedRows = channelRows.filter((r) => r.connected);
  const connectedChannels = channelsRes.error
    ? null
    : connectedRows.map((r) => r.channel as Channel).filter((c): c is Channel => c === "instagram" || c === "tiktok" || c === "threads");
  const adsRow = adsFailed ? null : ((adsRes.data ?? null) as { connected?: boolean; token_expires_at?: string | null } | null);
  const adsConnected = adsFailed ? null : Boolean(adsRow?.connected);

  /* 가장 급한 만료 하나 — TikTok 은 토큰이 매일 갱신되므로 카운트다운 대상이 아니다(채널 화면과 같은 규칙) */
  const expiries = [
    ...connectedRows.filter((r) => r.channel !== "tiktok").map((r) => daysUntil(r.token_expires_at)),
    adsConnected ? daysUntil(adsRow?.token_expires_at) : null,
  ].filter((d): d is number => d !== null);
  const minExpiresInDays = expiries.length > 0 ? Math.min(...expiries) : null;

  return {
    displayName,
    profileFailed: Boolean(profileRes.error),
    email: user.email ?? null,
    avatarUrl: getUserAvatarUrl(user),
    plan,
    connectedChannels,
    adsConnected,
    minExpiresInDays,
    providers: (user.identities ?? []).map((i) => i.provider).filter(Boolean),
    cardSummary: subRes?.sub?.cardSummary ?? null,
    nextBillingAt: subRes?.sub?.nextBillingAt ?? null,
    subscriptionStatus: subRes?.sub?.status ?? null,
    subscriptionFailed: subRes === null,
    signedIn: true,
  };
}

const CHANNEL_GLYPH: Record<Channel | "meta", React.ReactNode> = {
  instagram: <InstagramGlyph className="size-3.5 text-ig" />,
  tiktok: <TiktokGlyph className="size-3.5 text-fg" />,
  threads: <ThreadsGlyph className="size-3.5 text-fg" />,
  meta: <MetaGlyph className="size-3.5 text-meta" />,
};

interface RowLive {
  chip?: React.ReactNode;
  hint?: React.ReactNode;
  hintTone?: "sub" | "warning" | "negative";
  hintLeading?: React.ReactNode;
}

/** 항목별 실제 상태 — 못 읽었으면 칩만 «확인 못 함»으로 두고 힌트는 정적 문구(sections.ts)가 남게 한다 */
function liveRow(href: string, s: HubState): RowLive {
  switch (href) {
    case "/settings/logins": {
      if (s.providers.length === 0) return {};
      return { chip: <StateChip tone="ok">연결됨</StateChip>, hint: s.providers.map(providerLabel).join(" · ") };
    }
    case "/settings/channels": {
      /* 둘 중 하나라도 못 읽었으면 단정하지 않는다 — «연결한 계정 없음»이나 «광고 빠진 목록»을 그리면 연동해 둔 사람이 끊긴 줄 안다 */
      if (s.connectedChannels === null || s.adsConnected === null) return { chip: <StateChip tone="unknown" /> };
      const kinds: (Channel | "meta")[] = [...s.connectedChannels, ...(s.adsConnected ? (["meta"] as const) : [])];
      if (kinds.length === 0) {
        return { chip: <StateChip tone="todo">아직 없음</StateChip>, hint: "인스타그램·틱톡·스레드·메타 광고를 연결해요" };
      }
      const names = kinds.map((k) => (k === "meta" ? "Meta 광고" : CHANNEL_LABEL[k]));
      const glyphs = (
        <span className="flex shrink-0 items-center gap-1" aria-hidden>
          {kinds.map((k) => (
            <span key={k}>{CHANNEL_GLYPH[k]}</span>
          ))}
        </span>
      );
      if (s.minExpiresInDays !== null && s.minExpiresInDays <= 14) {
        return {
          chip: <StateChip tone="warn">다시 연결 필요</StateChip>,
          hint: `${names.join(" · ")} · ${s.minExpiresInDays}일 뒤 만료`,
          hintTone: "warning",
          hintLeading: glyphs,
        };
      }
      return { chip: <StateChip tone="ok">{kinds.length}개 연결됨</StateChip>, hint: names.join(" · "), hintLeading: glyphs };
    }
    case "/settings/billing": {
      if (s.plan === null) return { chip: <StateChip tone="unknown" /> };
      const name = isPaidPlan(s.plan) ? PLAN_NAMES[s.plan] : "Free";
      const planBadge = <Badge tone={isPaidPlan(s.plan) ? "primary" : "neutral"}>{name}</Badge>;
      if (s.subscriptionFailed) return { chip: planBadge };
      if (s.subscriptionStatus === "past_due") {
        return {
          chip: (
            <>
              {planBadge}
              <StateChip tone="warn">결제 재시도 중</StateChip>
            </>
          ),
          hint: "결제수단을 확인해 주세요",
          hintTone: "warning",
        };
      }
      if (s.subscriptionStatus === "canceled") {
        return {
          chip: (
            <>
              {planBadge}
              <StateChip tone="off">해지 예약됨</StateChip>
            </>
          ),
          hint: s.nextBillingAt ? `이용 종료일 ${formatDate(s.nextBillingAt)}` : "종료일까지 지금처럼 이용할 수 있어요",
        };
      }
      if (s.subscriptionStatus === "active" && s.nextBillingAt) return { chip: planBadge, hint: `다음 결제일 ${formatDate(s.nextBillingAt)}` };
      if (isPaidPlan(s.plan)) return { chip: planBadge, hint: "자동결제 없이 이용 중이에요" };
      return { chip: planBadge, hint: "무료로 이용 중이에요" };
    }
    case "/settings/billing/payment": {
      if (s.subscriptionFailed) return { chip: <StateChip tone="unknown" /> };
      if (s.cardSummary) return { chip: <StateChip tone="ok">등록됨</StateChip>, hint: s.cardSummary };
      /* 무료 플랜은 카드가 없는 게 정상이라 경고 톤을 쓰지 않는다 */
      return { chip: <StateChip tone="off">미등록</StateChip>, hint: "구독을 시작할 때 등록해요" };
    }
    case "/settings/legal/terms":
      return { hint: `시행 ${formatDate(TERMS_VERSION)}` };
    case "/settings/legal/privacy":
      return { hint: `시행 ${formatDate(PRIVACY_VERSION)}` };
    default:
      return {};
  }
}

export default async function SettingsHubPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  /* 옛 주소 호환 — OAuth 콜백이 /settings?connect=… 로 돌아오던 시절의 링크. 배너는 채널 화면이 그린다 */
  if (typeof sp.connect === "string") {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (typeof v === "string") q.set(k, v);
    redirect(`/settings/channels?${q.toString()}`);
  }

  const s = await loadHub();
  const demo = isDemoMode();
  const planName = s.plan === null ? null : isPaidPlan(s.plan) ? PLAN_NAMES[s.plan] : "Free";
  const initial = (s.displayName || s.email || "핀").trim().charAt(0).toUpperCase();

  const failed = [
    s.profileFailed ? "프로필" : null,
    s.connectedChannels === null || s.adsConnected === null ? "연결" : null,
    s.plan === null ? "플랜" : null,
    s.subscriptionFailed ? "구독" : null,
  ].filter((v): v is string => v !== null);

  const connectedCount =
    s.connectedChannels === null || s.adsConnected === null ? null : s.connectedChannels.length + (s.adsConnected ? 1 : 0);

  const stats: SummaryStatProps[] = [
    {
      label: "플랜",
      value: planName ?? "확인 못 함",
      href: "/settings/billing",
      tone: planName ? "neutral" : "warn",
    },
    {
      label: "연결된 계정",
      value: connectedCount === null ? "확인 못 함" : connectedCount === 0 ? "아직 없음" : `${connectedCount}개 연결됨`,
      href: "/settings/channels",
      tone: connectedCount === null ? "warn" : "neutral",
      tnum: true,
    },
    {
      label: s.subscriptionStatus === "canceled" ? "이용 종료일" : "다음 결제일",
      value: s.subscriptionFailed ? "확인 못 함" : s.nextBillingAt ? formatDate(s.nextBillingAt) : "없음",
      href: "/settings/billing",
      tone: s.subscriptionFailed || s.subscriptionStatus === "past_due" ? "warn" : "neutral",
      tnum: true,
    },
  ];

  return (
    <div className={SETTINGS_COLUMN}>
      <PageHeader title="계정 및 설정" />

      {failed.length > 0 ? (
        <NoticeBar tone="warning" size="sm" action={<RetryLink />}>
          {failed.join(" · ")} 정보를 불러오지 못했어요 — 표시된 상태가 실제와 다를 수 있어요.
        </NoticeBar>
      ) : null}

      {/* 요약 — 누구로 로그인했고, 어떤 플랜이고, 몇 개를 연결했고, 다음 결제가 언제인지 */}
      <SummaryCard
        leading={<AvatarImage src={s.avatarUrl} initial={initial} sizeClass="size-14" textClass="text-[20px]" />}
        title={
          s.profileFailed
            ? (s.email ?? "이름을 불러오지 못했어요")
            : s.displayName || (s.signedIn ? <span className="text-fg-sub">이름을 설정해 주세요</span> : "핀치")
        }
        sub={
          demo
            ? "지금은 예시 화면이에요 — 설정은 저장되지 않아요"
            : s.profileFailed
              ? "이름을 불러오지 못했어요 — 새로고침해 주세요"
              : (s.email ?? (s.signedIn ? "이메일 미제공 계정" : undefined))
        }
        subTone={s.profileFailed ? "warning" : "sub"}
        aside={demo ? <Badge tone="neutral">예시 화면</Badge> : undefined}
        stats={stats}
        cols={3}
      />

      {SETTINGS_GROUPS.map((group) => (
        <SettingsGroup key={group.key} id={group.key} label={group.label}>
          {group.items.map((item) => {
            const live = liveRow(item.href, s);
            return (
              <SettingsRow
                key={item.href}
                href={item.href}
                icon={item.icon}
                label={item.label}
                chip={live.chip}
                hint={live.hint ?? item.hint ?? null}
                hintTone={live.hintTone}
                hintLeading={live.hintLeading}
              />
            );
          })}
        </SettingsGroup>
      ))}

      {/* 로그아웃 — 상단바 계정 메뉴에도 있지만, 모바일에서는 이 화면이 «계정»의 집이라 여기에도 둔다.
          회원탈퇴는 여기 없다 — 개인정보 화면 맨 아래 작은 링크다(사장님 지시). */}
      {s.signedIn ? (
        <Card className="overflow-hidden">
          <form action="/auth/signout" method="post">
            <ul>
              <SettingsRow asButton type="submit" icon={LogOut} label="로그아웃" hint="이 기기에서 로그아웃해요" trailing={null} />
            </ul>
          </form>
        </Card>
      ) : null}
    </div>
  );
}
