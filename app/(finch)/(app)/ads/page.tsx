import { AlertTriangle, Megaphone, ShieldAlert, SlidersHorizontal, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/ui/section-header";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { InfoTip } from "@/components/ui/info-tip";
import { ButtonLink } from "@/components/ui/button";
import { formatCompact, formatKRW, formatMoney, formatPercent } from "@/lib/format";
import { accounts, campaignDetails, campaigns, dashboardSummaries, IS_SAMPLE_DATA } from "@/lib/data";
import { getLiveDashboard } from "@/lib/data/live";
import {
  aggregateLiveCampaigns,
  datePresetLabel,
  getLiveAds,
  type LiveAdsState,
} from "@/lib/data/ads";
import { accountStatusWarning } from "@/lib/ads/meta-labels";
import { aggregateCampaigns } from "@/lib/ads/metrics";
import { CampaignTable } from "./_components/campaign-table";
import { LiveCampaignTable } from "./_components/live-campaign-table";

/* 규칙 기반 AI 추천 예시 (PART 4.7) — 데모 모드 전용. 실제 연동 시 캠페인 지표 비교 규칙 엔진으로 대체 */
const SAMPLE_AI_ALERTS = [
  {
    id: "a1",
    label: "소재 점검",
    text: "브랜드 인지도 캠페인의 CTR(0.6%)이 계정 평균(1.2%)보다 낮습니다. 소재 교체를 검토하세요.",
  },
  {
    id: "a2",
    label: "예산 임박",
    text: "7월 신제품 런칭 캠페인의 일 예산이 82% 소진됐습니다.",
  },
];

/**
 * 연동 상태별 안내 — 「아직 연결한 광고 계정이 없어요」 하나로 뭉치지 않는다.
 * 조회에 실패한 사람에게 «연결하세요» 라고 하면 이미 연결한 계정을 또 연결하러 가고,
 * 권한이 없어 영영 안 풀리는 상태에 «잠시 후 새로고침» 이라고 하면 계속 새로고침만 한다.
 */
function AdsNotice({ live }: { live: LiveAdsState }) {
  if (live.state === "ok") return null;

  if (live.state === "unconfigured") {
    return (
      <EmptyState
        icon={Megaphone}
        title="광고 연동을 준비하고 있어요"
        description="곧 메타 광고 계정을 연결해 캠페인 성과를 여기서 볼 수 있게 됩니다."
      />
    );
  }
  if (live.state === "expired") {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="광고 계정 연결이 만료됐어요"
        description="메타 정책상 광고 연결은 약 60일마다 다시 확인이 필요해요. 다시 연결하면 성과가 그대로 이어집니다."
        action={
          <ButtonLink href="/settings/channels" size="sm" variant="secondary">
            다시 연결하기
          </ButtonLink>
        }
      />
    );
  }
  if (live.state === "no_accounts") {
    /* 새로고침으로는 절대 안 풀린다 — 메타에서 사람이 권한을 줘야 한다.
       그래서 «잠시 후 다시»가 아니라 **어디서 무엇을 할지**를 말한다. */
    return (
      <EmptyState
        icon={ShieldAlert}
        title="이 계정으로 볼 수 있는 광고 계정이 없어요"
        description="연결은 됐지만 광고 계정 접근 권한이 없습니다. 메타 비즈니스 설정에서 이 계정에 광고 계정 권한을 준 뒤 다시 연결해 주세요."
        action={
          <ButtonLink href="/settings/channels" size="sm" variant="secondary">
            다시 연결하기
          </ButtonLink>
        }
      />
    );
  }
  return (
    live.state === "error" ? (
      <EmptyState
        icon={AlertTriangle}
        title="지금은 광고 성과를 불러오지 못했어요"
        description="일시적인 문제일 수 있어요. 잠시 후 새로고침해 주세요. 계속되면 설정에서 광고 계정 연결 상태를 확인해 주세요."
        action={
          <ButtonLink href="/settings/channels" size="sm" variant="secondary">
            연결 상태 확인
          </ButtonLink>
        }
      />
    ) : (
      <EmptyState
        icon={Megaphone}
        title="아직 연결한 광고 계정이 없어요"
        description="메타 광고 계정을 연결하면 캠페인별 집행 금액·노출·CTR·ROAS 가 여기에 쌓여요."
        action={
          <ButtonLink href="/settings/channels" size="sm" variant="secondary">
            광고 계정 연결하기
          </ButtonLink>
        }
      />
    )
  );
}

/** 광고 칸 아래 한 줄 — 상태마다 다른 사실을 말한다(전부 «연결 전»으로 뭉개지 않는다) */
function adsFootnote(live: LiveAdsState | null, periodLabel: string): string {
  if (!live) return "캠페인 전체 합산";
  switch (live.state) {
    case "ok":
      return `${periodLabel} · 캠페인 합산`;
    case "expired":
      return "연결 만료 — 다시 연결 필요";
    case "no_accounts":
      return "광고 계정 권한 없음";
    case "error":
      return "지금은 불러오지 못했어요";
    default:
      return "광고 계정 연결 전";
  }
}

export default async function AdsPage() {
  /* 데모 모드에서는 샘플을, 실제 모드에서는 연동 데이터를 본다.
     ⚠️ 예전엔 campaigns.length 하나로 «연동 여부»를 판정해서
     조회 실패·토큰 만료·미연동이 전부 같은 빈 화면으로 나왔다. */
  const live = IS_SAMPLE_DATA ? null : await getLiveAds();
  const liveOk = live?.state === "ok" ? live : null;

  // 샘플 합계(데모 전용) — 가중 평균 공통 유틸로 대시보드와 기준을 공유한다
  const sampleTotals = aggregateCampaigns(campaigns);
  const liveTotals = liveOk ? aggregateLiveCampaigns(liveOk.campaigns) : null;
  const currency = liveOk?.selected.currency ?? null;
  /* ⚠️ 라벨을 «누적»이라고 쓰면 거짓이다 — 실제로 부르는 건 기간 조회다(기본 최근 30일).
     기간은 데이터를 만든 쪽이 정하므로 라벨도 거기서 받아 온다. */
  const periodLabel = liveOk ? datePresetLabel(liveOk.datePreset) : "최근 30일";

  /* 오가닉 칸은 **라이브 값**을 본다. 예전엔 lib/data 정적 export 만 읽어서,
     인스타를 연동하고 홈에서 «이번 주 조회수 12,340» 을 본 사람이 여기로 넘어오면
     같은 지표가 «—/채널 연결 전» 으로 나왔다 — 한 화면은 연동됐다 하고 다른 화면은 아니라고 한다.
     조회 실패(insightsOk=false)면 «—» 로 둔다(홈과 같은 규칙). */
  const dash = await getLiveDashboard();
  const liveAll = dash?.summaries.all;
  const organicWeeklyViews = liveAll?.weeklyViews ?? dashboardSummaries.all.weeklyViews;
  const channelLinked = dash
    ? dash.accounts.some((a) => a.connected) && liveAll?.insightsOk !== false
    : accounts.some((a) => a.connected);

  /* 요약 지표. 데모는 샘플 합계, 실제는 라이브 합계 — 어느 쪽도 «모름»을 0 으로 채우지 않는다. */
  const summary = IS_SAMPLE_DATA
    ? {
        spend: formatKRW(sampleTotals.spend),
        impressions: formatCompact(sampleTotals.impressions),
        ctr: formatPercent(sampleTotals.ctr),
        roas: `${sampleTotals.roas.toFixed(1)}배`,
      }
    : {
        spend: liveTotals?.spend != null ? formatMoney(liveTotals.spend, currency) : "—",
        impressions: liveTotals?.impressions != null ? formatCompact(liveTotals.impressions) : "—",
        ctr: liveTotals?.ctr != null ? formatPercent(liveTotals.ctr) : "—",
        roas: liveTotals?.roas != null ? `${liveTotals.roas.toFixed(1)}배` : "—",
      };

  /* 두 경고는 사용자가 할 일이 다르다 — 결제는 메타에서, 만료는 핀치에서 재연동이다.
     ⚠️ 예전엔 `accountWarning ?? expiryWarning` 한 줄이라 둘 다 걸리면 만료 경고가 사라졌다.
     하필 그 조합(미납 + 만료 임박)이 가장 위험한데 재연동 안내만 조용히 없어졌다. */
  const warnings = [
    liveOk ? accountStatusWarning(liveOk.selected.accountStatus) : null,
    liveOk && liveOk.expiresInDays !== null && liveOk.expiresInDays <= 14
      ? `광고 계정 연결이 ${liveOk.expiresInDays}일 뒤 만료돼요. 설정에서 다시 연결해 두면 성과가 끊기지 않아요.`
      : null,
  ].filter((w): w is string => w !== null);

  return (
    <div className="space-y-6">
      <PageHeader
        title="광고 관리"
        description={
          liveOk ? `${liveOk.selected.name ?? "광고 계정"} · ${periodLabel}` : "Meta 광고 계정 성과 리포트"
        }
        action={
          /* 실 모드도 연다 — 캠페인 생성·게재 제어가 실제로 붙었다(2026-09-02) */
          <ButtonLink href="/ads/campaigns" size="sm" variant="secondary">
            <SlidersHorizontal className="size-4" aria-hidden />
            캠페인 관리
          </ButtonLink>
        }
      />

      {warnings.length > 0 ? (
        <div className="space-y-2">
          {warnings.map((w) => (
            <div
              key={w}
              className="flex items-start gap-2.5 rounded-card border border-line bg-warning-weak p-3 text-[14px] text-warning-strong"
            >
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
              <p>{w}</p>
            </div>
          ))}
        </div>
      ) : null}

      {/* 요약 지표 (PART 4.7) — 가중 평균 */}
      <section aria-label="광고 요약 지표" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={`집행 금액 (${periodLabel})`} value={summary.spend} />
        <StatCard label={`노출수 (${periodLabel})`} value={summary.impressions} />
        <StatCard
          label={
            <>
              평균 CTR
              <InfoTip>
                링크 클릭 ÷ 노출의 가중 평균입니다. 규모가 다른 캠페인을 동일하게 취급하는 단순 평균과 달리 계정
                실제 성과를 반영해요.
              </InfoTip>
            </>
          }
          value={summary.ctr}
        />
        <StatCard
          label={
            <>
              평균 ROAS
              <InfoTip>
                지출 가중 평균(전환가치 합 ÷ 지출 합)입니다. 전환 추적이 설정된 캠페인만 계산에 넣어요.
              </InfoTip>
            </>
          }
          value={summary.roas}
        />
      </section>

      {/* 캠페인 성과 테이블 */}
      <Card>
        <CardHeader
          title="캠페인 성과"
          description={
            IS_SAMPLE_DATA
              ? "캠페인별 집행 현황과 핵심 지표 — 캠페인을 클릭하면 상세 성과를 볼 수 있어요"
              : `캠페인별 집행 현황과 핵심 지표 (${periodLabel})`
          }
        />
        <CardBody className="overflow-x-auto">
          {IS_SAMPLE_DATA ? (
            campaigns.length === 0 ? (
              <EmptyState
                icon={Megaphone}
                title="아직 연결한 광고 계정이 없어요"
                description="Meta 광고 계정을 연결하면 캠페인별 집행 금액·노출·CTR·ROAS 가 여기에 쌓여요."
                action={
                  <ButtonLink href="/settings/channels" size="sm" variant="secondary">
                    광고 계정 연결하기
                  </ButtonLink>
                }
              />
            ) : (
              <CampaignTable campaigns={campaigns} details={campaignDetails} />
            )
          ) : liveOk ? (
            liveOk.campaigns.length === 0 ? (
              <EmptyState
                icon={Megaphone}
                title="아직 만든 캠페인이 없어요"
                description="메타 광고 관리자에서 캠페인을 만들면 성과가 여기에 표시됩니다."
              />
            ) : (
              <>
                {/* 캠페인은 읽었는데 성과만 못 읽은 경우 — 숫자를 0 으로 채우지 않고 이유를 말한다 */}
                {!liveOk.insightsOk ? (
                  <p className="mb-3 text-[14px] text-fg-sub">
                    캠페인 목록은 불러왔지만 성과 수치를 가져오지 못했어요. 잠시 후 새로고침해 주세요.
                  </p>
                ) : null}
                <LiveCampaignTable campaigns={liveOk.campaigns} currency={currency} />
              </>
            )
          ) : live ? (
            <AdsNotice live={live} />
          ) : null}
        </CardBody>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* AI 추천 — 규칙 기반 알림 (PART 4.7) */}
        <Card>
          <CardHeader
            title={
              <span className="inline-flex items-center gap-2">
                AI 추천
                {IS_SAMPLE_DATA ? (
                  <InfoTip>
                    캠페인 지표를 계정 평균과 비교하는 규칙 기반 자동 알림이며, 광고 성과를 보장하지 않습니다.
                    플랫폼 공식 데이터가 아닌 핀치 자체 추정치입니다.
                  </InfoTip>
                ) : (
                  <Badge tone="neutral">준비 중</Badge>
                )}
              </span>
            }
            /* ⚠️ 실 모드에서 «자동으로 제안합니다» 라고 하면 안 된다 — 규칙 엔진이 아직 없다.
               「며칠 쌓이면 표시됩니다」도 시점을 약속하는 말이라 지킬 수 없다. */
            description={
              IS_SAMPLE_DATA ? "지표 이상 감지 시 자동으로 제안합니다" : "지표 이상 감지 알림을 준비하고 있어요"
            }
          />
          <CardBody className="space-y-3">
            {/* 실 모드에서는 연동 캠페인이 생기기 전까지 예시 알림을 노출하지 않는다 (가짜 데이터 금지) */}
            {(IS_SAMPLE_DATA ? SAMPLE_AI_ALERTS : []).map((alert) => (
              <div key={alert.id} className="flex items-start gap-3 rounded-card border border-line p-3">
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-card bg-warning-weak text-warning">
                  <Sparkles className="size-4" aria-hidden />
                </span>
                <div className="min-w-0">
                  <Badge tone="warning">{alert.label}</Badge>
                  <p className="mt-1.5 text-[15px] leading-relaxed text-fg-sub">{alert.text}</p>
                </div>
              </div>
            ))}
            {!IS_SAMPLE_DATA ? (
              <p className="text-[14px] text-fg-sub">
                캠페인 지표를 계정 평균과 비교해 이상을 짚어 주는 기능을 만들고 있어요. 열리면 알려드릴게요.
              </p>
            ) : null}
          </CardBody>
        </Card>

        {/* 오가닉 vs 광고 나란히 보기 (PART 4.7) */}
        <Card>
          <CardHeader
            title="오가닉 vs 광고"
            description={`오가닉(이번 주)과 광고(${periodLabel}) 규모를 나란히 봅니다 — 집계 기간이 서로 달라요`}
          />
          <CardBody>
            <div className="grid grid-cols-2 divide-x divide-line rounded-card border border-line">
              <div className="p-5">
                <p className="text-[14px] text-fg-sub">오가닉 조회수</p>
                <p className="tnum mt-1.5 text-2xl font-bold leading-none">
                  {channelLinked ? formatCompact(organicWeeklyViews) : "—"}
                </p>
                <p className="mt-2 text-xs text-fg-faint">
                  {channelLinked ? "이번 주 · 연동 채널 합산" : "채널 연결 전"}
                </p>
              </div>
              <div className="p-5">
                <p className="text-[14px] text-fg-sub">광고 노출수</p>
                <p className="tnum mt-1.5 text-2xl font-bold leading-none">{summary.impressions}</p>
                {/* 상태마다 다른 사실을 말한다 — 만료·권한없음·조회실패를 «연결 전»으로 뭉개지 않는다 */}
                <p className="mt-2 text-xs text-fg-faint">{adsFootnote(live, periodLabel)}</p>
              </div>
            </div>
            <p className="mt-3 text-xs text-fg-faint">
              오가닉 성과와 광고 성과를 함께 보면 예산을 늘릴 시점을 판단하기 쉬워집니다.
            </p>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
