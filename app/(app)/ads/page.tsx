import { SlidersHorizontal, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/ui/section-header";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge, DataSourceBadge } from "@/components/ui/badge";
import { DataSourceNote } from "@/components/ui/data-source-note";
import { InfoTip } from "@/components/ui/info-tip";
import { ButtonLink } from "@/components/ui/button";
import { formatCompact, formatKRW, formatPercent } from "@/lib/format";
import { campaigns, dashboardSummaries } from "@/lib/mock/data";
import type { AdCampaign } from "@/lib/types";

const STATUS_BADGE: Record<AdCampaign["status"], { tone: "positive" | "warning" | "neutral"; label: string }> = {
  active: { tone: "positive", label: "진행 중" },
  paused: { tone: "warning", label: "일시정지" },
  ended: { tone: "neutral", label: "종료" },
};

/* 규칙 기반 AI 추천 예시 (PART 4.7) — 실제 연동 시 캠페인 지표 비교 규칙 엔진으로 대체 */
const AI_ALERTS = [
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
  const totalSpend = campaigns.reduce((s, c) => s + c.spend, 0);
  const totalImpressions = campaigns.reduce((s, c) => s + c.impressions, 0);
  const avgCtr = campaigns.reduce((s, c) => s + c.ctr, 0) / campaigns.length;
  const avgRoas = campaigns.reduce((s, c) => s + c.roas, 0) / campaigns.length;
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

      {/* 요약 지표 (PART 4.7) */}
      <section aria-label="광고 요약 지표" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="이번 달 집행 금액" value={formatKRW(totalSpend)} />
        <StatCard label="노출수" value={formatCompact(totalImpressions)} />
        <StatCard label="평균 CTR" value={formatPercent(avgCtr)} />
        <StatCard label="평균 ROAS" value={`${avgRoas.toFixed(1)}배`} />
      </section>

      {/* 캠페인 성과 테이블 */}
      <Card>
        <CardHeader
          title="캠페인 성과"
          description="캠페인별 집행 현황과 핵심 지표"
          action={<DataSourceBadge source="official" />}
        />
        <CardBody className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-[14px]">
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
                    <td className="max-w-[220px] py-3 pr-3">
                      <p className="truncate font-medium">{c.name}</p>
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
            {AI_ALERTS.map((alert) => (
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
          </CardBody>
        </Card>

        {/* 오가닉 vs 광고 나란히 보기 (PART 4.7) */}
        <Card>
          <CardHeader
            title="오가닉 vs 광고"
            description="이번 주 오가닉 조회수와 광고 노출수를 나란히 봅니다"
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
                  {formatCompact(totalImpressions)}
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
