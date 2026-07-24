import Link from "next/link";
import { Check, ExternalLink, ShieldCheck, AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/ui/section-header";
import { Card } from "@/components/ui/card";
import { Badge, ChannelBadge } from "@/components/ui/badge";
import { AppIconTile } from "@/components/icons/brand";
import { Button, buttonClasses } from "@/components/ui/button";
import type { Channel } from "@/lib/types";
import { accounts as mockAccounts } from "@/lib/data";
import { isDemoMode } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { INSTAGRAM_SCOPE_LABELS, isInstagramOAuthConfigured } from "@/lib/meta/instagram-oauth";
import { THREADS_SCOPE_LABELS, isThreadsOAuthConfigured } from "@/lib/meta/threads-oauth";
import { TIKTOK_SCOPE_LABELS, isTiktokOAuthConfigured } from "@/lib/tiktok/oauth";
import { SettingsNav } from "./_components/settings-nav";
import { disconnectAccount } from "./actions";

/*
  계정 연동 관리 (PRD PART 4.2)
  - 실 모드: Supabase connected_accounts에서 연동 상태를 읽고, 인스타그램·Threads·TikTok은 실제 OAuth로 연동/해제
  - 데모 모드: 목데이터로 화면 미리보기
  - TikTok은 심사 없이 확인된 범위가 기본 프로필(팔로워·좋아요·영상 수)뿐이라 카드에 별도 고지한다
  - 실 스펙: docs/REAL_API_SPEC.md 1절(인스타그램)·5절(Threads)·6절(TikTok)
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

/** 채널별 연동 카드 데이터 — 실 모드는 DB, 데모는 목데이터 */
async function loadAccountCards(): Promise<AccountCard[]> {
  if (isDemoMode()) {
    return CHANNELS.map((channel) => {
      const m = mockAccounts.find((a) => a.channel === channel);
      return {
        id: null,
        channel,
        handle: m?.handle ?? "",
        displayName: m?.displayName ?? null,
        avatarUrl: null,
        connected: m?.connected ?? false,
        tokenExpiresInDays: m?.tokenExpiresInDays ?? null,
      };
    });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // select("*"): 마이그레이션 시점 차이로 특정 컬럼(avatar_url 등)이 없어도 조회가 깨지지 않게
  // user_id를 명시 필터링하는 이유: 0012_team.sql이 팀 멤버에게 소유자의 connected_accounts
  // select를 RLS로 열어줬다 — 여기(계정 연동/해제 화면)는 팀 대시보드가 아니라 "내 연동"
  // 관리 화면이므로, RLS만 믿지 않고 본인 행으로 명시 제한해 소유자의 연동 카드(재연동·해제
  // 버튼 포함)가 멤버에게 노출되지 않게 한다.
  const { data: rows } = user
    ? await supabase
        .from("connected_accounts")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
    : { data: [] };

  return CHANNELS.map((channel) => {
    const row = (rows ?? []).find((r) => r.channel === channel);
    return {
      id: row?.id ?? null,
      channel,
      handle: row?.handle ?? "",
      displayName: row?.display_name ?? null,
      avatarUrl: (row?.avatar_url as string | null | undefined) ?? null,
      connected: Boolean(row?.connected),
      // TikTok은 액세스 토큰이 24시간짜리라 매일 자동 갱신된다 — "N일 후 만료" 카운트다운을
      // 그대로 보여주면 정상 상태에서도 매번 "만료 임박"처럼 보여 오해를 유발하므로 숨긴다
      // (lib/data/live.ts의 getConnectedTiktokAccount 주석과 동일 근거).
      tokenExpiresInDays: channel === "tiktok" ? null : daysUntil(row?.token_expires_at ?? null),
    };
  });
}

// 채널명을 박지 않은 범용 메시지 — 인스타그램·Threads가 같은 콜백 파라미터 규약을 쓴다.
// 연동 성공은 handle 쿼리파라미터로 구체적인 계정을 보여준다(아래 SettingsPage에서 조합).
const CONNECT_MESSAGES: Record<string, { tone: "positive" | "warning" | "negative"; text: string }> = {
  denied: { tone: "warning", text: "연동이 취소되었습니다." },
  state: { tone: "negative", text: "보안 검증에 실패했어요. 다시 시도해 주세요." },
  unconfigured: {
    tone: "warning",
    text: "채널 앱 자격증명이 아직 설정되지 않았습니다. (앱 심사·키 발급 대기 단계)",
  },
  no_encryption_key: {
    tone: "negative",
    text: "토큰 암호화 키가 설정되지 않아 연동을 중단했어요. 관리자 설정이 필요합니다.",
  },
  already_linked: { tone: "warning", text: "이미 다른 핀치 계정에 연동된 계정이에요." },
  save_failed: { tone: "negative", text: "연동 정보 저장 중 오류가 발생했어요. 다시 시도해 주세요." },
  exchange: { tone: "negative", text: "토큰 교환 중 오류가 발생했어요. 다시 시도해 주세요." },
  encrypt_failed: { tone: "negative", text: "토큰 암호화 중 오류가 발생했어요. 다시 시도해 주세요." },
};

function ConnectActions({ card, oauthReady }: { card: AccountCard; oauthReady: boolean }) {
  if (!oauthReady) {
    return <Badge tone="neutral">연동 준비중</Badge>;
  }
  const startHref = CONNECT_START_PATH[card.channel];
  if (!startHref) {
    return <Badge tone="neutral">연동 준비중</Badge>;
  }
  if (card.connected && card.id) {
    return (
      <div className="flex items-center gap-2">
        <a href={startHref} className={buttonClasses("secondary", "sm")}>
          재연동
        </a>
        <form action={disconnectAccount}>
          <input type="hidden" name="accountId" value={card.id} />
          <Button size="sm" variant="danger" type="submit">
            해제
          </Button>
        </form>
      </div>
    );
  }
  return (
    <a href={startHref} className={buttonClasses("primary", "sm")}>
      연동하기
    </a>
  );
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const cards = await loadAccountCards();
  const sp = await searchParams;
  const connectParam = typeof sp.connect === "string" ? sp.connect : null;
  const reasonParam = typeof sp.reason === "string" ? sp.reason : null;
  const handleParam = typeof sp.handle === "string" ? sp.handle : null;
  const banner =
    connectParam === "success"
      ? { tone: "positive" as const, text: `${handleParam ?? "채널"} 연동이 완료되었어요.` }
      : connectParam === "error" && reasonParam
        ? (CONNECT_MESSAGES[reasonParam] ?? CONNECT_MESSAGES.exchange)
        : null;

  const instagramOAuthConfigured = isInstagramOAuthConfigured();
  const threadsOAuthConfigured = isThreadsOAuthConfigured();
  const tiktokOAuthConfigured = isTiktokOAuthConfigured();
  // 인스타그램은 항상 노출(자격증명 미설정 시 별도 배너로 안내), Threads·TikTok은 자격증명 존재 여부로 버튼 자체를 켠다.
  const OAUTH_READY: Record<Channel, boolean> = {
    instagram: true,
    tiktok: tiktokOAuthConfigured,
    threads: threadsOAuthConfigured,
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader title="설정" description="채널 계정과 Meta 광고 계정의 연동 상태를 관리하세요." />
      <SettingsNav />

      {banner ? (
        <div
          className={
            banner.tone === "positive"
              ? "rounded-card border border-positive/40 bg-positive-weak p-4 text-[14px] text-positive"
              : banner.tone === "negative"
                ? "rounded-card border border-negative/40 bg-negative-weak p-4 text-[14px] text-negative"
                : "rounded-card border border-warning/40 bg-warning-weak p-4 text-[14px] text-warning"
          }
          role="status"
        >
          {banner.text}
        </div>
      ) : null}

      {/* 인스타 OAuth 자격증명 미설정 안내 (실 모드에서만) */}
      {!isDemoMode() && !instagramOAuthConfigured ? (
        <div className="flex items-start gap-2.5 rounded-card border border-warning/40 bg-warning-weak p-4 text-[13px] leading-relaxed text-fg-sub">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          <p>
            인스타그램 연동에 필요한 앱 자격증명(INSTAGRAM_APP_ID / INSTAGRAM_APP_SECRET)이 아직
            설정되지 않았습니다. Meta 앱 심사·비즈니스 인증 완료 후 활성화됩니다.
          </p>
        </div>
      ) : null}

      {/* Threads OAuth 자격증명 미설정 안내 (실 모드에서만) */}
      {!isDemoMode() && !threadsOAuthConfigured ? (
        <div className="flex items-start gap-2.5 rounded-card border border-warning/40 bg-warning-weak p-4 text-[13px] leading-relaxed text-fg-sub">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          <p>
            Threads 연동에 필요한 앱 자격증명(THREADS_APP_ID / THREADS_APP_SECRET)이 아직
            설정되지 않았습니다. 개발자 모드 테스터 계정으로 등록하면 심사 없이 바로 연동할 수 있어요.
          </p>
        </div>
      ) : null}

      {/* TikTok OAuth 자격증명 미설정 안내 (실 모드에서만) */}
      {!isDemoMode() && !tiktokOAuthConfigured ? (
        <div className="flex items-start gap-2.5 rounded-card border border-warning/40 bg-warning-weak p-4 text-[13px] leading-relaxed text-fg-sub">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          <p>
            TikTok 연동에 필요한 앱 자격증명(TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET)이 아직
            설정되지 않았습니다. Sandbox에 테스터 계정(target user)으로 등록하면 심사 없이 바로 연동할 수 있어요.
          </p>
        </div>
      ) : null}

      {/* 채널별 연동 카드 */}
      <section aria-label="계정 연동 상태" className="space-y-3">
        {cards.map((card) => (
          <Card key={card.channel} className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3.5">
                {card.avatarUrl ? (
                  <span className="relative mt-0.5 shrink-0" aria-hidden>
                    {/* eslint-disable-next-line @next/next/no-img-element -- 서명 만료되는 IG CDN URL이라 이미지 최적화 프록시를 거치지 않는다 */}
                    <img
                      src={card.avatarUrl}
                      alt=""
                      referrerPolicy="no-referrer"
                      className="size-11 rounded-chip object-cover"
                    />
                    <AppIconTile app={card.channel} size={18} className="absolute -bottom-1 -right-1" />
                  </span>
                ) : (
                  <AppIconTile app={card.channel} size={44} className="mt-0.5" />
                )}
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <ChannelBadge channel={card.channel} />
                    {card.connected ? <Badge tone="positive">연동됨</Badge> : <Badge tone="neutral">미연동</Badge>}
                  </div>
                  {card.connected ? (
                    <p className="mt-2 text-[14px] text-fg-sub">
                      {card.handle}
                      {card.displayName ? <span className="ml-2 text-fg-faint">{card.displayName}</span> : null}
                    </p>
                  ) : (
                    <p className="mt-2 text-[14px] text-fg-faint">
                      {OAUTH_READY[card.channel] ? "연동하면 분석 데이터를 불러옵니다." : "공식 연동 준비중입니다."}
                    </p>
                  )}
                  {card.tokenExpiresInDays !== null ? (
                    card.tokenExpiresInDays <= 14 ? (
                      <p className="mt-1 text-[13px] font-semibold text-warning">
                        토큰 <span className="tnum">{card.tokenExpiresInDays}</span>일 후 만료 — 재연동 필요
                      </p>
                    ) : (
                      <p className="mt-1 text-[13px] text-fg-faint">
                        토큰 <span className="tnum">{card.tokenExpiresInDays}</span>일 후 만료
                      </p>
                    )
                  ) : null}
                </div>
              </div>
              <ConnectActions card={card} oauthReady={OAUTH_READY[card.channel]} />
            </div>

            {card.channel === "instagram" ? (
              <div className="mt-4 rounded-card bg-warning-weak p-3 text-[13px] leading-relaxed text-warning">
                개인 계정은 연동할 수 없어요. 비즈니스/크리에이터 계정 전환이 필요합니다.
                <a
                  href="https://help.instagram.com/502981923235522"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-1.5 inline-flex items-center gap-1 font-semibold underline underline-offset-2"
                >
                  전환 방법 안내
                  <ExternalLink className="size-3" aria-hidden />
                </a>
              </div>
            ) : null}

            {card.channel === "tiktok" ? (
              <div className="mt-4 rounded-card bg-warning-weak p-3 text-[13px] leading-relaxed text-warning">
                팔로워·좋아요·영상 수 등 기본 정보만 표시돼요 — 조회수·참여율 등 상세 분석은
                TikTok 앱 심사 완료 후 제공됩니다.
              </div>
            ) : null}
          </Card>
        ))}

        {/* Meta 광고 계정 — 채널 계정과 별도 연동 (PART 4.2). Marketing API 연동은 후속. */}
        <Card className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3.5">
              <AppIconTile app="meta" size={44} className="mt-0.5" />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-chip border border-line bg-overlay px-2.5 py-0.5 text-xs font-semibold leading-5 whitespace-nowrap text-fg-sub">
                    <span className="size-1.5 rounded-full bg-meta" aria-hidden />
                    Meta 광고
                  </span>
                  <Badge tone="neutral">{isDemoMode() ? "연동됨" : "연동 준비중"}</Badge>
                </div>
                <p className="mt-2 text-[14px] text-fg-faint">
                  {isDemoMode() ? "핀치 마케팅 · 광고 계정 act-2048" : "Marketing API 연동 준비중입니다."}
                </p>
              </div>
            </div>
            {isDemoMode() ? <Badge tone="positive">연동됨</Badge> : <Badge tone="neutral">연동 준비중</Badge>}
          </div>
        </Card>
      </section>

      {/* 권한(scope) 투명성 (PART 4.2) */}
      <Card className="p-5">
        <h3 className="flex items-center gap-2 text-[19px] font-bold leading-snug">
          <ShieldCheck className="size-5 text-fg-sub" aria-hidden />
          핀치가 접근하는 권한
        </h3>
        <div className="mt-3 space-y-4">
          <div>
            <p className="text-[13px] font-semibold text-fg-faint">인스타그램</p>
            <ul className="mt-1.5 space-y-2">
              {INSTAGRAM_SCOPE_LABELS.map((scope) => (
                <li key={scope} className="flex items-center gap-2 text-[14px] text-fg-sub">
                  <Check className="size-4 text-positive" aria-hidden />
                  {scope}
                </li>
              ))}
            </ul>
          </div>
          {threadsOAuthConfigured ? (
            <div>
              <p className="text-[13px] font-semibold text-fg-faint">Threads</p>
              <ul className="mt-1.5 space-y-2">
                {THREADS_SCOPE_LABELS.map((scope) => (
                  <li key={scope} className="flex items-center gap-2 text-[14px] text-fg-sub">
                    <Check className="size-4 text-positive" aria-hidden />
                    {scope}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {tiktokOAuthConfigured ? (
            <div>
              <p className="text-[13px] font-semibold text-fg-faint">TikTok</p>
              <ul className="mt-1.5 space-y-2">
                {TIKTOK_SCOPE_LABELS.map((scope) => (
                  <li key={scope} className="flex items-center gap-2 text-[14px] text-fg-sub">
                    <Check className="size-4 text-positive" aria-hidden />
                    {scope}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
        <p className="mt-3 text-[13px] text-fg-faint">핀치는 기능에 필요한 최소 권한만 요청합니다.</p>
      </Card>

      {isDemoMode() ? (
        <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
          <p className="text-[14px] text-fg-sub">
            지금은 예시 데이터로 화면을 미리 보고 있어요. 로그인 후 실제 계정을 연동하면 내 데이터가 표시됩니다.
          </p>
          <Link href="/login" className="text-[14px] font-semibold text-primary underline underline-offset-2">
            로그인
          </Link>
        </Card>
      ) : null}
    </div>
  );
}
