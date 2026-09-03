import type { Metadata } from "next";
import { Check, ChevronDown, ExternalLink, Megaphone, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AvatarImage } from "@/components/ui/avatar-image";
import { AppIconTile, type BrandApp } from "@/components/icons/brand";
import { buttonClasses } from "@/components/ui/button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { InfoTip } from "@/components/ui/info-tip";
import { LoadFailed } from "@/components/ui/load-failed";
import { ResultBanner } from "@/components/ui/result-banner";
import { StateChip } from "@/components/ui/state-chip";
import type { Channel } from "@/lib/types";
import { CHANNEL_LABEL } from "@/lib/channels";
import { accounts as mockAccounts } from "@/lib/data";
import { isDemoMode } from "@/lib/supabase/config";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { isMissingTableError } from "@/lib/supabase/errors";
import { isMissingColumnError } from "@/lib/publish-rules";
import { missingScopes } from "@/lib/meta/granted-scopes";
import { INSTAGRAM_SCOPES, INSTAGRAM_SCOPE_LABELS, isInstagramOAuthConfigured } from "@/lib/meta/instagram-oauth";
import { isTokenEncryptionConfigured } from "@/lib/crypto/tokens";
import { THREADS_SCOPES, THREADS_SCOPE_LABELS, isThreadsOAuthConfigured } from "@/lib/meta/threads-oauth";
import { TIKTOK_SCOPES, TIKTOK_SCOPE_LABELS, isTiktokOAuthConfigured } from "@/lib/tiktok/oauth";
import { META_ADS_SCOPES, META_ADS_SCOPE_LABELS, isMetaAdsOAuthConfigured } from "@/lib/meta/ads-oauth";
import { SettingsShell } from "../_components/settings-shell";
import { SettingsGroup, SettingsRow } from "../_components/settings-row";
import { SummaryCard } from "../_components/summary-card";
import { AdPublisherPicker } from "@/app/(finch)/(app)/ads/_components/ad-publisher-picker";
import { disconnectAccount, disconnectMetaAds } from "./actions";
import { deriveAdsState, deriveChannelState } from "./_lib/derive-state";

export const metadata: Metadata = {
  title: "SNS 계정 연결",
  robots: { index: false, follow: false },
};

/*
  SNS 계정 연결 (PRD PART 4.2) — 2026-09-03 재설계: 2열 카드 → 한 기둥 행 목록(설정 공통 문법).
  맨 위 요약 카드가 «몇 개 연결됐고 손볼 게 있는지»를 말하고, 채널 3행 + 광고 계정 행이 각자 칩·힌트·버튼 하나를 갖는다.
  상태 판정은 _lib/derive-state.ts 한 곳 — 칩·문장·버튼이 같은 답을 낸다.
  - 실 모드: connected_accounts 에서 연결 상태를 읽고, 인스타그램·Threads·TikTok 은 실제 OAuth 로 연결/해제
  - 데모 모드: 목데이터로 화면 미리보기(요약 카드의 «예시 화면» 배지 하나로만 말한다)
  - 실 스펙: docs/REAL_API_SPEC.md 1절(인스타그램)·5절(Threads)·6절(TikTok)
  ⚠️ 로더·액션·OAuth 게이트·콜백 배너 규약은 재설계 전과 같다 — 표현만 바뀌었다.
*/

const CHANNELS: Channel[] = ["instagram", "tiktok", "threads"];
const CONNECT_START_PATH: Partial<Record<Channel, string>> = {
  instagram: "/api/auth/instagram/start",
  threads: "/api/auth/threads/start",
  tiktok: "/api/auth/tiktok/start",
};

interface AccountCard {
  id: string | null;
  channel: Channel;
  handle: string;
  displayName: string | null;
  avatarUrl: string | null;
  connected: boolean;
  tokenExpiresInDays: number | null;
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

/** 채널별 연결 상태 — **null 이면 조회 실패**(«연결 없음»과 다르다) */
async function loadAccountCards(): Promise<AccountCard[] | null> {
  if (isDemoMode()) {
    return CHANNELS.map((channel) => {
      const m = mockAccounts.find((a) => a.channel === channel);
      return {
        // 데모에도 가짜 id를 준다 — 해제 버튼·확인 모달·성공 배너 흐름을 체험 가능하게
        id: m?.connected ? `demo-${channel}` : null,
        channel,
        handle: m?.handle ?? "",
        displayName: m?.displayName ?? null,
        avatarUrl: null,
        connected: m?.connected ?? false,
        // TikTok은 토큰이 매일 자동 갱신되므로 만료 카운트다운을 숨긴다(라이브 분기와 같은 규칙)
        tokenExpiresInDays: channel === "tiktok" ? null : (m?.tokenExpiresInDays ?? null),
      };
    });
  }

  const supabase = await createClient();
  const user = await getAuthUser();
  // select("*"): 마이그레이션 시점 차이로 특정 컬럼(avatar_url 등)이 없어도 조회가 깨지지 않게.
  // user_id 명시 필터: 0012_team.sql 이 팀 멤버에게 소유자의 connected_accounts select 를 열어줬다 —
  // 여기는 «내 연결» 관리 화면이라 본인 행으로 제한해 소유자의 버튼이 멤버에게 노출되지 않게 한다.
  /* 이 조회의 error 는 예전에 버려졌다 — 실패하면 연결된 계정이 전부 «미연결»로 그려진다.
     «연결 안 함»과 «확인 못 함»은 다른 사실이다(lib/data/internal.ts 규칙). */
  const { data: rows, error } = user
    ? await supabase.from("connected_accounts").select("*").eq("user_id", user.id).order("created_at", { ascending: true })
    : { data: [], error: null };
  if (error) {
    console.error("[settings] 연동 계정 조회 실패:", error.message);
    return null;
  }

  return CHANNELS.map((channel) => {
    const row = (rows ?? []).find((r) => r.channel === channel);
    return {
      id: row?.id ?? null,
      channel,
      handle: row?.handle ?? "",
      displayName: row?.display_name ?? null,
      avatarUrl: (row?.avatar_url as string | null | undefined) ?? null,
      connected: Boolean(row?.connected),
      // TikTok은 액세스 토큰이 24시간짜리라 매일 자동 갱신된다 — "N일 후 만료"를 그대로 보여주면
      // 정상 상태에서도 매번 "만료 임박"처럼 보여 오해를 유발하므로 숨긴다(lib/data/live.ts 주석과 동일 근거).
      tokenExpiresInDays: channel === "tiktok" ? null : daysUntil(row?.token_expires_at ?? null),
    };
  });
}

/* OAuth 시작은 **전체 페이지 이동**이어야 한다(외부 인가 화면으로 나간다) — next/link 는 쓰면 안 된다 */
const META_ADS_START_PATH = "/api/auth/meta-ads/start";

/** 메타 광고 연결 — 표가 둘이라 채널 카드와 로더를 공유하지 않는다(0077) */
interface AdsCard {
  connectionId: string | null;
  connected: boolean;
  accountCount: number;
  primaryName: string | null;
  /** ⚠️ 갱신이 불가능한 토큰이라 이 값을 **숨기지 않는다**(틱톡과 반대) */
  expiresInDays: number | null;
  /** 동의 때 못 받은(나중에 늘어난) 스코프 — 비어 있지 않으면 «다시 연결 필요». 확인 불가(null)면 빈 배열 */
  missingScopes: string[];
  /** 광고 게시 주체(기본 계정의 페이지·IG, 0082) — null 이면 아직 안 골랐다 */
  publisher: { pageName: string | null; igUsername: string | null } | null;
}

const ADS_CARD_EMPTY: AdsCard = {
  connectionId: null,
  connected: false,
  accountCount: 0,
  primaryName: null,
  expiresInDays: null,
  missingScopes: [],
  publisher: null,
};

/** null 이면 조회 실패 — «연결 없음»과 다르다 */
async function loadAdsCard(): Promise<AdsCard | null> {
  if (isDemoMode()) {
    return {
      connectionId: "demo-meta-ads",
      connected: true,
      accountCount: 1,
      primaryName: "핀치 마케팅",
      expiresInDays: 52,
      missingScopes: [],
      publisher: { pageName: "핀치 공식", igUsername: "finch.official" },
    };
  }

  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) return ADS_CARD_EMPTY;

  /* 컬럼이 시기별로 다르다 — granted_scopes(0075), 게시 주체(0082). 없는 컬럼은 빼고 다시 읽는다(«확인 불가»·«아직 안 고름»). */
  const selects = [
    "id, connected, token_expires_at, granted_scopes, meta_ad_accounts(account_name, is_default, ad_page_name, ad_ig_username)",
    "id, connected, token_expires_at, granted_scopes, meta_ad_accounts(account_name, is_default)",
    "id, connected, token_expires_at, meta_ad_accounts(account_name, is_default)",
  ];
  let res = await supabase.from("meta_ad_connections").select(selects[0]).eq("user_id", user.id).limit(1).maybeSingle();
  for (let i = 1; i < selects.length && res.error && isMissingColumnError(res.error, /granted_scopes|ad_page_name|ad_ig_username/i); i++) {
    res = await supabase.from("meta_ad_connections").select(selects[i]).eq("user_id", user.id).limit(1).maybeSingle();
  }
  const { data: conn, error } = res;

  if (error) {
    /* 0077 미적용이면 표가 없다 — 그건 «조회 실패»가 아니라 아직 열리지 않은 기능이다 */
    if (isMissingTableError(error)) return ADS_CARD_EMPTY;
    console.error("[settings] 광고 연동 조회 실패:", error.message);
    return null;
  }
  if (!conn) return ADS_CARD_EMPTY;

  /* select 문자열이 배열에서 오므로 PostgREST 타입 추론이 안 된다 — 모양은 우리가 안다 */
  const row = conn as unknown as {
    id: string;
    connected: boolean;
    token_expires_at: string | null;
    granted_scopes?: string[] | null;
    meta_ad_accounts?:
      | { account_name: string | null; is_default: boolean; ad_page_name?: string | null; ad_ig_username?: string | null }[]
      | null;
  };
  const list = row.meta_ad_accounts ?? [];
  const primary = list.find((a) => a.is_default) ?? list[0] ?? null;
  return {
    connectionId: row.id,
    connected: row.connected,
    accountCount: list.length,
    primaryName: primary?.account_name ?? null,
    expiresInDays: daysUntil(row.token_expires_at),
    /* 2026-09-03 페이지 스코프 2종 추가 — 그 전에 연결한 토큰은 소재 단계에서 막힌다. 이유를 여기서 먼저 말한다 */
    missingScopes: missingScopes("meta_ads", row.granted_scopes ?? null),
    publisher:
      primary && (primary.ad_page_name || primary.ad_ig_username)
        ? { pageName: primary.ad_page_name ?? null, igUsername: primary.ad_ig_username ?? null }
        : null,
  };
}

// 채널명을 박지 않은 범용 메시지 — 인스타그램·Threads·TikTok 이 같은 콜백 파라미터 규약을 쓴다.
// 연결 성공은 handle 쿼리로 구체적인 계정을 보여준다. 고객 문구는 «연동»이 아니라 «연결»이다(허브·sections.ts 와 통일).
const CONNECT_MESSAGES: Record<string, { tone: "positive" | "warning" | "negative"; text: string }> = {
  denied: { tone: "warning", text: "연결을 취소했어요." },
  /* «취소»와 구분한다 — 개통 초기에 가장 흔한 원인은 «앱 테스터로 등록되지 않은 계정»이다 */
  not_allowed: { tone: "negative", text: "이 계정에는 아직 연결 권한이 없어요. 계정을 확인하고 다시 시도해 주세요." },
  state: { tone: "negative", text: "보안 검증에 실패했어요. 다시 시도해 주세요." },
  unconfigured: { tone: "warning", text: "지금은 이 채널을 연결할 수 없어요. 곧 열릴 예정이니 조금만 기다려 주세요." },
  /* 운영자가 할 일이 있는 상태 — 사용자에게 설정 이름을 말하지 않는다 */
  no_encryption_key: { tone: "warning", text: "지금은 연결을 마무리할 수 없어요. 준비가 끝나는 대로 안내드릴게요." },
  already_linked: { tone: "warning", text: "이미 다른 핀치 계정에 연결된 계정이에요." },
  /* 토큰은 저장됐는데 광고 계정을 못 읽은 «절반 성공» — 실패로 덮으면 승인한 연결을 처음부터 다시 하게 만든다 */
  ads_accounts_unavailable: { tone: "warning", text: "연결은 됐지만 광고 계정 목록을 불러오지 못했어요. 잠시 후 광고 화면을 다시 열어 주세요." },
  no_ad_account: { tone: "warning", text: "연결은 됐지만 접근할 수 있는 광고 계정이 없어요. 메타에서 이 계정에 광고 계정 권한이 있는지 확인해 주세요." },
  ads_profile: { tone: "negative", text: "계정 정보를 읽지 못했어요. 잠시 후 다시 시도해 주세요." },
  migration_needed: { tone: "warning", text: "지금은 이 연결을 마무리할 수 없어요. 준비가 끝나는 대로 안내드릴게요." },
  /* 예시 화면에서는 연결해도 그 계정이 화면에 안 나온다 — «데모 모드»라는 내부 용어 없이 사실만 */
  demo_mode: { tone: "warning", text: "지금은 예시 화면이라 계정을 연결할 수 없어요." },
  save_failed: { tone: "negative", text: "연결 정보를 저장하는 중 오류가 났어요. 다시 시도해 주세요." },
  exchange: { tone: "negative", text: "연결 승인 뒤 단계에서 오류가 났어요. 다시 시도해 주세요." },
  /* 단계별로 가른다 — 사용자가 할 일이 단계마다 다르다(2026-08-31) */
  exchange_code: { tone: "negative", text: "연결 승인은 받았는데 그다음 단계에서 막혔어요. 잠시 후 다시 시도해 주세요." },
  exchange_longlived: { tone: "negative", text: "장기 접속 권한을 받는 중에 막혔어요. 잠시 후 다시 시도해 주세요." },
  account_info: { tone: "negative", text: "계정 정보를 읽지 못했어요. 인스타그램이 비즈니스 또는 크리에이터 계정인지 확인해 주세요." },
  encrypt_failed: { tone: "negative", text: "연결 정보를 저장하는 중 오류가 났어요. 다시 시도해 주세요." },
  disconnect_failed: { tone: "negative", text: "연결 해제 중 오류가 났어요. 다시 시도해 주세요." },
  /* 연결은 됐지만 댓글 웹훅 구독이 실패 — 성공으로 덮으면 자동 DM 이 한 통도 안 나가는데 화면은 정상으로 보인다 */
  partial_webhook: { tone: "warning", text: "연결은 됐지만 댓글 알림 연결에 실패했어요. 댓글 자동 DM을 쓰시려면 다시 연결해 주세요." },
};

const DOT_TONE: Record<string, string> = {
  ok: "bg-positive",
  warn: "bg-warning",
  bad: "bg-negative",
  off: "bg-fg-faint",
  pending: "bg-fg-faint",
  unknown: "bg-fg-faint",
  todo: "bg-fg-faint",
};

function ScopeList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h3 className="text-[12px] font-semibold text-fg-sub">{title}</h3>
      <ul className="mt-1.5 space-y-1.5">
        {items.map((s) => (
          <li key={s} className="flex items-start gap-2 text-[14px] text-fg-sub">
            <Check className="mt-0.5 size-3.5 shrink-0 text-positive" aria-hidden />
            {s}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default async function ChannelsSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const [cards, adsCard] = await Promise.all([loadAccountCards(), loadAdsCard()]);
  const sp = await searchParams;
  const connectParam = typeof sp.connect === "string" ? sp.connect : null;
  const reasonParam = typeof sp.reason === "string" ? sp.reason : null;
  const handleParam = typeof sp.handle === "string" ? sp.handle : null;
  /* 연결 실패 원문 — **운영자에게만**. 고객에게는 내부 운영 정보라 노출하지 않는다 */
  const detailParam = typeof sp.detail === "string" ? sp.detail : null;
  const viewer = await getAuthUser();
  const ownerEmail = process.env.OWNER_EMAIL?.trim().toLowerCase();
  const isOwner = !!ownerEmail && viewer?.email?.trim().toLowerCase() === ownerEmail;
  /* connect=warn — 연결은 됐지만 부수 작업이 실패한 «절반 성공». 성공으로도 실패로도 덮지 않는다 */
  const banner =
    connectParam === "success"
      ? { tone: "positive" as const, text: `${handleParam ?? "채널"} 계정을 연결했어요.` }
      : connectParam === "disconnected"
        ? { tone: "positive" as const, text: "연결을 해제했어요." }
        : connectParam === "unconfigured" && !reasonParam
          ? CONNECT_MESSAGES.unconfigured
          : (connectParam === "error" || connectParam === "warn") && reasonParam
            ? (CONNECT_MESSAGES[reasonParam] ?? CONNECT_MESSAGES.exchange)
            : null;

  const instagramOAuthConfigured = isInstagramOAuthConfigured();
  const threadsOAuthConfigured = isThreadsOAuthConfigured();
  const tiktokOAuthConfigured = isTiktokOAuthConfigured();
  /* ⚠️ 암호화 키도 **버튼 조건에 포함**한다 — 콜백에서만 확인하면 인스타 로그인·동의를 전부 마친 뒤에야 튕긴다 */
  const tokenEncryptionReady = isTokenEncryptionConfigured();
  /* 광고는 **Facebook 앱** 자격증명이 따로 필요하다(META_APP_ID) — 데모에서는 흐름을 체험하게 켜 두되 start 라우트가 막는다 */
  const metaAdsReady = (isMetaAdsOAuthConfigured() && tokenEncryptionReady) || isDemoMode();
  const OAUTH_READY: Record<Channel, boolean> = {
    instagram: instagramOAuthConfigured && tokenEncryptionReady,
    tiktok: tiktokOAuthConfigured && tokenEncryptionReady,
    threads: threadsOAuthConfigured && tokenEncryptionReady,
  };
  const demo = isDemoMode();

  /* ── 상태 판정(한 곳) ── */
  const channelRows = (cards ?? []).map((card) => ({ card, d: deriveChannelState(card.channel, card, OAUTH_READY[card.channel]) }));
  const adsRow = deriveAdsState(adsCard, metaAdsReady);
  const connectedChannels = channelRows.filter((r) => r.card.connected);
  const adsConnected = adsCard?.connected === true;
  const needsAttention = [...channelRows.map((r) => r.d), adsRow].filter((d) => d.chip.tone === "warn" || d.chip.tone === "bad").length;

  /* ── 요약 카드 ── */
  const tileState: Record<BrandApp, string | null> = {
    instagram: channelRows.find((r) => r.card.channel === "instagram")?.d.chip.tone ?? null,
    tiktok: channelRows.find((r) => r.card.channel === "tiktok")?.d.chip.tone ?? null,
    threads: channelRows.find((r) => r.card.channel === "threads")?.d.chip.tone ?? null,
    meta: adsCard === null ? null : adsRow.chip.tone,
  };
  const summaryTitle =
    cards === null
      ? "연결 상태를 확인하지 못했어요"
      : connectedChannels.length > 0 || adsConnected
        ? `채널 ${connectedChannels.length}개${adsConnected ? " · 광고 계정" : ""} 연결됨`
        : "아직 연결한 계정이 없어요";
  const connectedNames = [...connectedChannels.map((r) => CHANNEL_LABEL[r.card.channel]), ...(adsConnected ? ["Meta 광고"] : [])];
  const summarySub = demo
    ? "지금은 예시 화면이에요 — 연결·해제를 눌러도 실제로 바뀌지 않아요"
    : cards === null
      ? "잠시 후 다시 시도해 주세요"
      : connectedNames.length > 0
        ? `${connectedNames.join(" · ")}${adsCard === null ? " · 광고 계정은 확인 못 함" : ""}`
        : "채널을 연결하면 지표가 실제 데이터로 채워져요";
  const summaryChip =
    cards === null ? (
      <StateChip tone="unknown" />
    ) : needsAttention > 0 ? (
      <StateChip tone="warn">확인 필요 {needsAttention}건</StateChip>
    ) : connectedNames.length > 0 ? (
      <StateChip tone="ok">정상</StateChip>
    ) : (
      <StateChip tone="todo">연결할 채널 있음</StateChip>
    );

  const anyScopes = instagramOAuthConfigured || threadsOAuthConfigured || tiktokOAuthConfigured || isMetaAdsOAuthConfigured();

  return (
    <SettingsShell title="SNS 계정 연결" description="인스타그램·틱톡·스레드 계정과 메타 광고 계정을 연결하고 관리해요.">
      {banner ? (
        <ResultBanner
          notice={banner.tone === "positive" ? banner.text : null}
          warning={banner.tone === "warning" ? banner.text : null}
          error={banner.tone === "negative" ? banner.text : null}
          detail={isOwner ? detailParam : null}
          path="/settings/channels"
        />
      ) : null}

      <SummaryCard
        leading={
          <div className="flex shrink-0 -space-x-2" aria-hidden>
            {(["instagram", "tiktok", "threads", "meta"] as BrandApp[]).map((app) => (
              <span key={app} className="relative">
                <AppIconTile app={app} size={32} className="border-2 border-body" />
                {tileState[app] ? (
                  <span className={`absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-body ${DOT_TONE[tileState[app]!] ?? "bg-fg-faint"}`} />
                ) : null}
              </span>
            ))}
          </div>
        }
        title={summaryTitle}
        sub={summarySub}
        chips={summaryChip}
        aside={demo ? <Badge tone="neutral">예시 화면</Badge> : undefined}
      />

      {/* ── 채널 계정 ── */}
      <SettingsGroup
        id="channels"
        label="채널 계정"
        footer={
          cards === null ? (
            <div className="p-4">
              <LoadFailed dense title="연결 상태를 불러오지 못했어요" description="연결이 끊긴 게 아니라 잠시 못 읽은 거예요. 다시 시도해 주세요." />
            </div>
          ) : undefined
        }
      >
        {channelRows.map(({ card, d }) => {
          const startHref = CONNECT_START_PATH[card.channel];
          const ready = OAUTH_READY[card.channel];
          return (
            <SettingsRow
              key={card.channel}
              leading={
                card.connected && card.avatarUrl ? (
                  <span className="relative shrink-0">
                    <AvatarImage src={card.avatarUrl} initial={(card.handle.replace(/^@/, "") || "?").charAt(0).toUpperCase()} sizeClass="size-10" textClass="text-[15px]" />
                    <AppIconTile app={card.channel} size={16} className="absolute -bottom-1 -right-1 border-2 border-body" />
                  </span>
                ) : (
                  <AppIconTile app={card.channel} size={40} />
                )
              }
              label={CHANNEL_LABEL[card.channel]}
              chip={<StateChip tone={d.chip.tone}>{d.chip.label}</StateChip>}
              hint={
                card.connected ? (
                  <>
                    <span className="text-fg">{card.handle}</span>
                    {card.displayName ? ` · ${card.displayName}` : null}
                  </>
                ) : card.channel === "instagram" && ready ? (
                  <>
                    {d.hint}
                    <a
                      href="https://help.instagram.com/502981923235522"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-1.5 inline-flex items-center gap-0.5 font-medium text-fg underline underline-offset-2"
                    >
                      전환 방법
                      <ExternalLink className="size-3" aria-hidden />
                    </a>
                  </>
                ) : (
                  d.hint
                )
              }
              hintTone={d.hintTone}
              meta={d.meta}
              metaTone={d.metaTone}
              trailing={
                d.action === "manage" && card.id ? (
                  <>
                    {/* 해제는 OAuth 자격증명과 무관하다(저장된 행 삭제) — 게이트 안에 두면 키 회수 후 영영 못 지운다 */}
                    {ready && startHref ? (
                      <a href={startHref} className={buttonClasses("secondary", "sm")}>
                        다시 연결
                      </a>
                    ) : null}
                    <ConfirmSubmit
                      action={disconnectAccount}
                      hiddenFields={{ accountId: card.id }}
                      title="연결을 해제할까요?"
                      description={`${card.handle} 계정의 연결 정보가 삭제되고 지표 수집이 멈춰요. 언제든 다시 연결할 수 있어요.`}
                      confirmLabel="해제하기"
                      pendingLabel="해제 중…"
                      trigger="연결 해제"
                      triggerVariant="ghost"
                    />
                  </>
                ) : d.action === "connect" && startHref ? (
                  <a href={startHref} className={buttonClasses("primary", "sm")}>
                    연결하기
                  </a>
                ) : null
              }
            />
          );
        })}
      </SettingsGroup>

      {/* ── 광고 계정 — 채널 계정과 별도 연결(PART 4.2). 표가 둘이라 행도 따로다(0077) ── */}
      <SettingsGroup id="ads" label="광고 계정">
        <SettingsRow
          leading={<AppIconTile app="meta" size={40} />}
          label="Meta 광고"
          chip={<StateChip tone={adsRow.chip.tone}>{adsRow.chip.label}</StateChip>}
          tip={
            adsCard?.connected && adsCard.accountCount === 0 ? (
              <InfoTip label="광고 계정 권한 안내">메타 비즈니스 설정에서 이 계정에 광고 계정 권한을 준 뒤 「다시 연결」을 눌러 주세요.</InfoTip>
            ) : adsCard?.connected && adsCard.expiresInDays !== null ? (
              <InfoTip label="연결 기간 안내">광고 계정 연결은 자동으로 연장되지 않아요. 만료 전에 다시 연결하면 성과 기록이 끊기지 않아요.</InfoTip>
            ) : undefined
          }
          hint={
            adsCard?.connected && adsCard.accountCount > 0 ? (
              <>
                <span className="text-fg">{adsCard.primaryName ?? "이름 없는 광고 계정"}</span>
                {adsCard.accountCount > 1 ? ` 외 ${adsCard.accountCount - 1}개` : null}
              </>
            ) : (
              adsRow.hint
            )
          }
          hintTone={adsRow.hintTone}
          meta={adsRow.meta}
          metaTone={adsRow.metaTone}
          trailing={
            adsCard?.connected && adsCard.connectionId ? (
              <>
                {metaAdsReady ? (
                  <a href={META_ADS_START_PATH} className={buttonClasses("secondary", "sm")}>
                    다시 연결
                  </a>
                ) : null}
                <ConfirmSubmit
                  action={disconnectMetaAds}
                  hiddenFields={{ connectionId: adsCard.connectionId }}
                  title="광고 계정 연결을 해제할까요?"
                  description="연결 정보가 삭제되고 광고 성과 조회가 멈춰요. 메타의 캠페인은 그대로 남아요."
                  confirmLabel="해제하기"
                  pendingLabel="해제 중…"
                  trigger="연결 해제"
                  triggerVariant="ghost"
                />
              </>
            ) : adsRow.action === "connect" ? (
              <a href={META_ADS_START_PATH} className={buttonClasses("primary", "sm")}>
                연결하기
              </a>
            ) : null
          }
        />
        {adsCard?.connected && adsCard.accountCount > 0 ? (
          /* 광고 게시 주체 — 소재(광고 만들기)에 필요한 페이지·Instagram 계정. 목록은 열 때마다 새로 조회한다(피커 주석) */
          <SettingsRow
            icon={Megaphone}
            label="광고 게시 페이지"
            tip={<InfoTip label="광고 게시 페이지 안내">광고는 Facebook 페이지 이름으로 게시돼요. 페이지에 연결된 Instagram 계정도 함께 골라요.</InfoTip>}
            hint={
              adsCard.publisher ? (
                <>
                  <span className="text-fg">{adsCard.publisher.pageName ?? "페이지"}</span>
                  {adsCard.publisher.igUsername ? ` · @${adsCard.publisher.igUsername}` : null}
                </>
              ) : (
                "아직 고르지 않았어요 — 광고를 만들려면 필요해요"
              )
            }
            hintTone={adsCard.publisher ? "sub" : "warning"}
            trailing={!demo ? <AdPublisherPicker current={adsCard.publisher} triggerLabel="페이지 선택" changeLabel="변경" /> : null}
          />
        ) : null}
      </SettingsGroup>

      {/* ── 권한 고지(PART 4.2) — 목록은 «요청하는 스코프»에서 직접 만든다(라벨 배열을 따로 돌리면 스코프만 늘고 고지에서 빠진다).
          접힌 상태로 시작하되 제목 행이 항상 보여 «어떤 권한을 요청하는지»의 존재는 숨지 않는다. ── */}
      {anyScopes ? (
        <Card className="overflow-hidden">
          <details className="group">
            <summary className="trans-state flex cursor-pointer list-none items-center gap-3 px-4 py-3 hover:bg-tint-hover focus-visible:bg-tint-hover focus-visible:outline-2 focus-visible:outline-primary focus-visible:-outline-offset-2 [&::-webkit-details-marker]:hidden">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-card bg-plate text-fg-sub" aria-hidden>
                <ShieldCheck className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold text-fg">핀치가 요청하는 권한</span>
                <span className="mt-0.5 block text-[14px] text-fg-sub">기능에 필요한 최소 권한만 요청해요</span>
              </span>
              <ChevronDown className="size-4 shrink-0 text-fg-faint trans-state group-open:rotate-180" aria-hidden />
            </summary>
            <div className="grid gap-x-6 gap-y-4 border-t border-line px-4 py-4 sm:grid-cols-2">
              {instagramOAuthConfigured ? <ScopeList title="인스타그램" items={INSTAGRAM_SCOPES.map((s) => INSTAGRAM_SCOPE_LABELS[s])} /> : null}
              {threadsOAuthConfigured ? <ScopeList title="Threads" items={THREADS_SCOPES.map((s) => THREADS_SCOPE_LABELS[s])} /> : null}
              {isMetaAdsOAuthConfigured() ? <ScopeList title="Meta 광고" items={META_ADS_SCOPES.map((s) => META_ADS_SCOPE_LABELS[s])} /> : null}
              {tiktokOAuthConfigured ? <ScopeList title="TikTok" items={TIKTOK_SCOPES.map((s) => TIKTOK_SCOPE_LABELS[s])} /> : null}
            </div>
          </details>
        </Card>
      ) : null}
    </SettingsShell>
  );
}
