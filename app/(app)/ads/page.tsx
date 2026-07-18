import Image from "next/image";
import { Megaphone, SlidersHorizontal, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/ui/section-header";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge, DataSourceBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { DataSourceNote } from "@/components/ui/data-source-note";
import { InfoTip } from "@/components/ui/info-tip";
import { ButtonLink } from "@/components/ui/button";
import { formatCompact, formatKRW, formatPercent } from "@/lib/format";
import { campaigns, dashboardSummaries, IS_SAMPLE_DATA } from "@/lib/data";
import { aggregateCampaigns } from "@/lib/ads/metrics";
import type { AdCampaign } from "@/lib/types";

const STATUS_BADGE: Record<AdCampaign["status"], { tone: "positive" | "warning" | "neutral"; label: string }> = {
  active: { tone: "positive", label: "진행 중" },
  paused: { tone: "warning", label: "일시정지" },
  ended: { tone: "neutral", label: "종료" },
};

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

export default function AdsPage() {
  // 전체 캠페인 누적 기준 — 가중 평균(공통 유틸)으로 계산해 대시보드와 기준을 공유한다
  const totals = aggregateCampaigns(campaigns);
  const organicWeeklyViews = dashboardSummaries.all.weeklyViews;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="광고 관리"
        description="Meta 광고 계정 성과 리포트"
        action={
          <ButtonLink href="/ads/campaigns" size="sm" variant="secondary">
            <SlidersHorizontal className="size-4" aria-hidden />
            캠페인 관리
          </ButtonLink>
        }
      />

      {/* 요약 지표 (PART 4.7) — 전체 캠페인 누적, 가중 평균 */}
      <section aria-label="광고 요약 지표" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="누적 집행 금액" value={formatKRW(totals.spend)} />
        <StatCard label="누적 노출수" value={formatCompact(totals.impressions)} />
        <StatCard
          label={
            <>
              평균 CTR
              <InfoTip>총 클릭 ÷ 총 노출의 가중 평균입니다. 규모가 다른 캠페인을 동일하게 취급하는 단순 평균과 달리 계정 실제 성과를 반영해요.</InfoTip>
            </>
          }
          value={formatPercent(totals.ctr)}
        />
        <StatCard
          label={
            <>
              평균 ROAS
              <InfoTip>지출 가중 평균(전환가치 합 ÷ 지출 합)입니다.</InfoTip>
            </>
          }
          value={`${totals.roas.toFixed(1)}배`}
        />
      </section>

      {/* 캠페인 성과 테이블 */}
      <Card>
        <CardHeader
          title="캠페인 성과"
          description="캠페인별 집행 현황과 핵심 지표"
          action={<DataSourceBadge source="official" />}
        />
        <CardBody className="overflow-x-auto">
          {campaigns.length === 0 ? (
            <EmptyState
              icon={Megaphone}
              title="연동된 캠페인이 없습니다"
              description="광고 계정을 연동하면 캠페인 성과가 표시됩니다"
            />
          ) : (
            <>
              <table className="w-full min-w-[960px] text-[14px]">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-fg-faint">
                    <th className="pb-2 font-medium">캠페인</th>
                    <th className="pb-2 font-medium">목표</th>
                    <th className="pb-2 font-medium">상태</th>
                    <th className="pb-2 text-right font-medium">일 예산</th>
                    <th className="pb-2 text-right font-medium">집행액</th>
                    <th className="pb-2 text-right font-medium">노출</th>
                    <th className="pb-2 text-right font-medium">클릭</th>
                    <th className="pb-2 text-right font-medium">CTR</th>
                    <th className="pb-2 text-right font-medium">CPC</th>
                    <th className="pb-2 text-right font-medium">전환</th>
                    <th className="pb-2 text-right font-medium">ROAS</th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map((c) => {
                    const status = STATUS_BADGE[c.status];
                    return (
                      <tr key={c.id} className="border-b border-line last:border-0">
                        <td className="min-w-[240px] max-w-[280px] py-3 pr-3">
                          <div className="flex items-center gap-3">
                            {/* 소재 미리보기 — 이름만으로 캠페인 식별이 어렵다는 피드백 반영. SVG 샘플이라 최적화 제외 */}
                            <Image
                              src={c.creative.imageUrl}
                              alt={c.creative.headline}
                              width={44}
                              height={44}
                              unoptimized
                              className="size-11 shrink-0 rounded-card border border-line object-cover"
                            />
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <p className="truncate font-medium">{c.name}</p>
                                {c.creative.format === "video" ? (
                                  <Badge className="shrink-0 px-1.5 py-0 text-[10px] leading-4">
                                    영상
                                  </Badge>
                                ) : null}
                              </div>
                              <p className="mt-0.5 truncate text-xs text-fg-faint">
                                {c.creative.headline}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 pr-3 text-fg-sub">{c.objective}</td>
                        <td className="py-3 pr-3">
                          <Badge tone={status.tone}>
                            <span className="size-1.5 rounded-full bg-current" aria-hidden />
                            {status.label}
                          </Badge>
                        </td>
                        <td className="tnum py-3 text-right">{formatKRW(c.dailyBudget)}</td>
                        <td className="tnum py-3 text-right">{formatKRW(c.spend)}</td>
                        <td className="tnum py-3 text-right">{formatCompact(c.impressions)}</td>
                        <td className="tnum py-3 text-right">{formatCompact(c.clicks)}</td>
                        <td className="tnum py-3 text-right">{formatPercent(c.ctr)}</td>
                        <td className="tnum py-3 text-right">{formatKRW(c.cpc)}</td>
                        <td className="tnum py-3 text-right">{c.conversions.toLocaleString("ko-KR")}</td>
                        <td className="tnum py-3 text-right font-semibold">{c.roas.toFixed(1)}배</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="mt-4">
                <DataSourceNote source="Meta Marketing API" />
              </div>
            </>
          )}
        </CardBody>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* AI 추천 — 규칙 기반 알림 (PART 4.7) */}
        <Card>
          <CardHeader
            title={
              <span className="inline-flex items-center gap-2">
                AI 추천
                <InfoTip>
                  캠페인 지표를 계정 평균과 비교하는 규칙 기반 자동 알림이며, 광고 성과를 보장하지
                  않습니다. 플랫폼 공식 데이터가 아닌 핀치 자체 추정치입니다.
                </InfoTip>
              </span>
            }
            description="지표 이상 감지 시 자동으로 제안합니다"
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
                  <p className="mt-1.5 text-[14px] leading-relaxed text-fg-sub">{alert.text}</p>
                </div>
              </div>
            ))}
            {!IS_SAMPLE_DATA ? (
              <p className="text-[13px] text-fg-faint">
                광고 계정을 연동하고 캠페인 데이터가 쌓이면 지표 이상 감지 알림이 여기에 표시됩니다.
              </p>
            ) : null}
          </CardBody>
        </Card>

        {/* 오가닉 vs 광고 나란히 보기 (PART 4.7) */}
        <Card>
          <CardHeader
            title="오가닉 vs 광고"
            description="오가닉(이번 주)과 광고(누적) 규모를 나란히 봅니다 — 집계 기간이 서로 달라요"
          />
          <CardBody>
            <div className="grid grid-cols-2 divide-x divide-line rounded-card border border-line">
              <div className="p-5">
                <p className="text-[13px] text-fg-sub">오가닉 조회수</p>
                <p className="tnum mt-1.5 text-2xl font-bold leading-none">
                  {formatCompact(organicWeeklyViews)}
                </p>
                <p className="mt-2 text-xs text-fg-faint">이번 주 · 연동 채널 합산</p>
              </div>
              <div className="p-5">
                <p className="text-[13px] text-fg-sub">광고 노출수</p>
                <p className="tnum mt-1.5 text-2xl font-bold leading-none">
                  {formatCompact(totals.impressions)}
                </p>
                <p className="mt-2 text-xs text-fg-faint">캠페인 전체 합산</p>
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
