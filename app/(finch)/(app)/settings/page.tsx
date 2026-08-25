import Link from "next/link";
import { Check, ExternalLink, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/ui/section-header";
import { Card } from "@/components/ui/card";
import { Badge, ChannelBadge } from "@/components/ui/badge";
import { AppIconTile, MetaGlyph } from "@/components/icons/brand";
import { buttonClasses } from "@/components/ui/button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import type { Channel } from "@/lib/types";
import { accounts as mockAccounts } from "@/lib/data";
import { isDemoMode } from "@/lib/supabase/config";
import { LoadFailed } from "@/components/ui/load-failed";
import { createClient, getAuthUser } from "@/lib/supabase/server";
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
/** 채널별 연동 카드 — **null 이면 조회 실패**(«연동 없음»과 다르다) */
async function loadAccountCards(): Promise<AccountCard[] | null> {
  if (isDemoMode()) {
    return CHANNELS.map((channel) => {
      const m = mockAccounts.find((a) => a.channel === channel);
      return {
        // 데모에도 가짜 id를 준다 — 해제 버튼·확인 모달·성공 배너 흐름을 체험 가능하게
        // (id: null이면 해제 버튼 자체가 렌더되지 않아 "해제가 안 된다"로 보인다)
        id: m?.connected ? `demo-${channel}` : null,
        channel,
        handle: m?.handle ?? "",
        displayName: m?.displayName ?? null,
        avatarUrl: null,
        connected: m?.connected ?? false,
        // 라이브 분기와 동일 규칙: TikTok은 토큰이 매일 자동 갱신되므로 만료 카운트다운을 숨긴다
        // (아래 라이브 분기 주석 참조 — 데모에서만 "재연동 필요" 경고가 뜨던 모순 방지).
        tokenExpiresInDays: channel === "tiktok" ? null : (m?.tokenExpiresInDays ?? null),
      };
    });
  }

  const supabase = await createClient();
  const user = await getAuthUser();
  // select("*"): 마이그레이션 시점 차이로 특정 컬럼(avatar_url 등)이 없어도 조회가 깨지지 않게
  // user_id를 명시 필터링하는 이유: 0012_team.sql이 팀 멤버에게 소유자의 connected_accounts
  // select를 RLS로 열어줬다 — 여기(계정 연동/해제 화면)는 팀 대시보드가 아니라 "내 연동"
  // 관리 화면이므로, RLS만 믿지 않고 본인 행으로 명시 제한해 소유자의 연동 카드(재연동·해제
  // 버튼 포함)가 멤버에게 노출되지 않게 한다.
  /* 이 조회의 error 는 예전에 버려졌다 — 실패하면 연동된 계정이 전부 «미연동»으로 그려진다.
     그 화면을 본 사람은 연동이 끊긴 줄 알고 다시 연결을 시도하거나, 데이터가 안 들어온다고
     오해한다. «연동 안 함»과 «확인 못 함»은 다른 사실이다(lib/data/internal.ts 규칙). */
  const { data: rows, error } = user
    ? await supabase
        .from("connected_accounts")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
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
    text: "지금은 이 채널을 연동할 수 없어요. 곧 열릴 예정이니 조금만 기다려 주세요.",
  },
  no_encryption_key: {
    tone: "negative",
    text: "토큰 암호화 키가 설정되지 않아 연동을 중단했어요. 관리자 설정이 필요합니다.",
  },
  already_linked: { tone: "warning", text: "이미 다른 핀치 계정에 연동된 계정이에요." },
  save_failed: { tone: "negative", text: "연동 정보 저장 중 오류가 발생했어요. 다시 시도해 주세요." },
  exchange: { tone: "negative", text: "토큰 교환 중 오류가 발생했어요. 다시 시도해 주세요." },
  encrypt_failed: { tone: "negative", text: "토큰 암호화 중 오류가 발생했어요. 다시 시도해 주세요." },
  disconnect_failed: { tone: "negative", text: "연동 해제 중 오류가 발생했어요. 다시 시도해 주세요." },
};

function ConnectActions({ card, oauthReady }: { card: AccountCard; oauthReady: boolean }) {
  const startHref = CONNECT_START_PATH[card.channel];
  // 해제는 OAuth 자격증명과 무관하다(저장된 행 삭제일 뿐) — oauthReady 게이트 안에 두면
  // 자격증명이 없는 환경(데모, 키 회수 후)에서 연동된 계정을 영영 못 지운다.
  if (card.connected && card.id) {
    return (
      <div className="flex items-center gap-2">
        {oauthReady && startHref ? (
          <a href={startHref} className={buttonClasses("secondary", "sm")}>
            재연동
          </a>
        ) : null}
        <ConfirmSubmit
          action={disconnectAccount}
          hiddenFields={{ accountId: card.id }}
          title="연동 해제"
          description={`연동을 해제하면 저장된 토큰이 삭제되고 분석 데이터 수집이 중단됩니다. ${card.handle} 계정을 해제할까요?`}
          confirmLabel="해제"
          pendingLabel="해제 중…"
          trigger="해제"
        />
      </div>
    );
  }
  if (!oauthReady || !startHref) {
    // 이미 '연동됨' 배지가 붙은 카드(데모 목데이터 등)에 '연동 준비중'을 겹치면 상태가 모순된다
    // — 상태 배지는 카드당 1개, 미연동 카드에만 준비중을 보여준다.
    return card.connected ? null : <Badge tone="neutral">연동 준비중</Badge>;
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
      : connectParam === "disconnected"
        ? { tone: "positive" as const, text: "연동이 해제되었습니다." }
        : connectParam === "error" && reasonParam
          ? (CONNECT_MESSAGES[reasonParam] ?? CONNECT_MESSAGES.exchange)
          : null;

  const instagramOAuthConfigured = isInstagramOAuthConfigured();
  const threadsOAuthConfigured = isThreadsOAuthConfigured();
  const tiktokOAuthConfigured = isTiktokOAuthConfigured();
  // 자격증명 존재 여부로 버튼 자체를 켠다 — 미설정이면 사유를 노출하지 않고 "연동 준비중" 배지만 보여준다.
  const OAUTH_READY: Record<Channel, boolean> = {
    instagram: instagramOAuthConfigured,
    tiktok: tiktokOAuthConfigured,
    threads: threadsOAuthConfigured,
  };

  return (
    <div className="space-y-6">
      <PageHeader title="설정" description="채널 계정과 Meta 광고 계정의 연동 상태를 관리하세요." />
      <SettingsNav />

      {banner ? (
        <div
          className={
            banner.tone === "positive"
              ? "rounded-card border border-positive/40 bg-positive-weak p-4 text-[15px] text-positive-strong"
              : banner.tone === "negative"
                ? "rounded-card border border-negative/40 bg-negative-weak p-4 text-[15px] text-negative-strong"
                : "rounded-card border border-warning/40 bg-warning-weak p-4 text-[15px] text-warning-strong"
          }
          role="status"
        >
          {banner.text}
        </div>
      ) : null}

      {/* 채널별 연동 카드 — 세로 1열이라 카드 하나가 배지·핸들 한 줄만 담고 폭 1600px 을
          썼다. 2열로 묶어 넓은 화면에서 4장이 한눈에 들어오게 한다. */}
      {/* 조회 실패를 «전부 미연동»으로 그리지 않는다 — 연동해 둔 사람이 그 화면을 보면
          끊긴 줄 알고 다시 연결하거나, 수집이 멈춘 줄로 오해한다. */}
      {cards === null ? (
        <LoadFailed title="연동 상태를 불러오지 못했어요" />
      ) : (
      <section aria-label="계정 연동 상태" className="grid gap-3 lg:grid-cols-2">
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
                    <p className="mt-2 text-[15px] text-fg-sub">
                      {card.handle}
                      {card.displayName ? <span className="ml-2 text-fg-sub">{card.displayName}</span> : null}
                    </p>
                  ) : (
                    <p className="mt-2 text-[15px] text-fg-sub">
                      {OAUTH_READY[card.channel] ? "연동하면 분석 데이터를 불러옵니다." : "공식 연동 준비중입니다."}
                    </p>
                  )}
                  {card.tokenExpiresInDays !== null ? (
                    card.tokenExpiresInDays <= 14 ? (
                      <p className="mt-1 text-[14px] font-semibold text-warning">
                        토큰 <span className="tnum">{card.tokenExpiresInDays}</span>일 후 만료 — 재연동 필요
                      </p>
                    ) : (
                      <p className="mt-1 text-[14px] text-fg-sub">
                        토큰 <span className="tnum">{card.tokenExpiresInDays}</span>일 후 만료
                      </p>
                    )
                  ) : null}
                </div>
              </div>
              <ConnectActions card={card} oauthReady={OAUTH_READY[card.channel]} />
            </div>

            {card.channel === "instagram" ? (
              <div className="mt-4 rounded-card bg-warning-weak p-3 text-[14px] leading-relaxed text-warning-strong">
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
              <div className="mt-4 rounded-card bg-warning-weak p-3 text-[14px] leading-relaxed text-warning-strong">
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
                  {/* 채널 배지와 동일 문법(브랜드 글리프 + 레이블) — 배지 스타일은 Badge 컴포넌트가 단일 출처 */}
                  <Badge tone="neutral">
                    <span aria-hidden>
                      <MetaGlyph className="size-3 text-meta" />
                    </span>
                    Meta 광고
                  </Badge>
                  {/* 상태 배지는 카드당 1개, 채널 카드와 동일하게 연동됨=positive */}
                  {isDemoMode() ? <Badge tone="positive">연동됨</Badge> : <Badge tone="neutral">연동 준비중</Badge>}
                </div>
                <p className="mt-2 text-[15px] text-fg-sub">
                  {isDemoMode() ? "핀치 마케팅 · 광고 계정 act-2048" : "Marketing API 연동 준비중입니다."}
                </p>
              </div>
            </div>
          </div>
        </Card>
      </section>
      )}

      {/* 권한(scope) 투명성 (PART 4.2) */}
      <Card className="p-5">
        <h3 className="flex items-center gap-2 text-[17px] font-semibold leading-snug">
          <ShieldCheck className="size-5 text-fg-sub" aria-hidden />
          핀치가 접근하는 권한
        </h3>
        <div className="mt-3 space-y-4">
          <div>
            <h4 className="text-[14px] font-semibold text-fg-sub">인스타그램</h4>
            <ul className="mt-1.5 space-y-2">
              {INSTAGRAM_SCOPE_LABELS.map((scope) => (
                <li key={scope} className="flex items-center gap-2 text-[15px] text-fg-sub">
                  <Check className="size-4 text-positive" aria-hidden />
                  {scope}
                </li>
              ))}
            </ul>
          </div>
          {threadsOAuthConfigured ? (
            <div>
              <h4 className="text-[14px] font-semibold text-fg-sub">Threads</h4>
              <ul className="mt-1.5 space-y-2">
                {THREADS_SCOPE_LABELS.map((scope) => (
                  <li key={scope} className="flex items-center gap-2 text-[15px] text-fg-sub">
                    <Check className="size-4 text-positive" aria-hidden />
                    {scope}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {tiktokOAuthConfigured ? (
            <div>
              <h4 className="text-[14px] font-semibold text-fg-sub">TikTok</h4>
              <ul className="mt-1.5 space-y-2">
                {TIKTOK_SCOPE_LABELS.map((scope) => (
                  <li key={scope} className="flex items-center gap-2 text-[15px] text-fg-sub">
                    <Check className="size-4 text-positive" aria-hidden />
                    {scope}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
        <p className="mt-3 text-[14px] text-fg-sub">핀치는 기능에 필요한 최소 권한만 요청합니다.</p>
      </Card>

      {/* 모바일은 하단 탭바가 5개로 고정돼 사이드바의 문의하기가 안 보인다 — 여기서도 갈 수 있게 둔다 */}
      <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
        <p className="text-[15px] text-fg-sub">
          연동이나 결제에 문제가 있나요? 문의를 남기시면 답변을 화면에서 확인할 수 있어요.
        </p>
        <Link href="/support" className="text-[15px] font-semibold text-primary underline underline-offset-2">
          문의하기
        </Link>
      </Card>

      {isDemoMode() ? (
        <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
          <p className="text-[15px] text-fg-sub">
            지금은 예시 데이터로 화면을 미리 보고 있어요. 로그인 후 실제 계정을 연동하면 내 데이터가 표시됩니다.
          </p>
          <Link href="/login" className="text-[15px] font-semibold text-primary underline underline-offset-2">
            로그인
          </Link>
        </Card>
      ) : null}
    </div>
  );
}
