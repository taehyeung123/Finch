import { Megaphone, SlidersHorizontal, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/ui/section-header";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { InfoTip } from "@/components/ui/info-tip";
import { ButtonLink } from "@/components/ui/button";
import { formatCompact, formatKRW, formatPercent } from "@/lib/format";
import { campaignDetails, campaigns, dashboardSummaries, IS_SAMPLE_DATA } from "@/lib/data";
import { aggregateCampaigns } from "@/lib/ads/metrics";
import { CampaignTable } from "./_components/campaign-table";

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
  /* 연동 전에는 «0» 이 아니라 «—» 다. 0원·0.0배는 "안 썼다·성과가 없다"는 **사실 주장**이라,
     아직 광고 계정을 연결하지 않은 사람에게는 거짓이다(2026-08-25 감사에서 통계·리드·방명록에
     같은 함정을 고쳤다 — 실패·미연동을 «없음»으로 단정하지 않는다). */
  const linked = campaigns.length > 0;
  const val = (v: string) => (linked ? v : "—");

  return (
    <div className="space-y-6">
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
        <StatCard label="누적 집행 금액" value={val(formatKRW(totals.spend))} />
        <StatCard label="누적 노출수" value={val(formatCompact(totals.impressions))} />
        <StatCard
          label={
            <>
              평균 CTR
              <InfoTip>총 클릭 ÷ 총 노출의 가중 평균입니다. 규모가 다른 캠페인을 동일하게 취급하는 단순 평균과 달리 계정 실제 성과를 반영해요.</InfoTip>
            </>
          }
          value={val(formatPercent(totals.ctr))}
        />
        <StatCard
          label={
            <>
              평균 ROAS
              <InfoTip>지출 가중 평균(전환가치 합 ÷ 지출 합)입니다.</InfoTip>
            </>
          }
          value={val(`${totals.roas.toFixed(1)}배`)}
        />
      </section>

      {/* 캠페인 성과 테이블 — 행 클릭 시 상세 모달 */}
      <Card>
        <CardHeader
          title="캠페인 성과"
          description="캠페인별 집행 현황과 핵심 지표 — 캠페인을 클릭하면 상세 성과를 볼 수 있어요"
        />
        <CardBody className="overflow-x-auto">
          {campaigns.length === 0 ? (
            <EmptyState
              icon={Megaphone}
              title="아직 연결한 광고 계정이 없어요"
              description="Meta 광고 계정을 연결하면 캠페인별 집행 금액·노출·CTR·ROAS 가 여기에 쌓여요."
              action={
                <ButtonLink href="/settings" size="sm" variant="secondary">
                  광고 계정 연결하기
                </ButtonLink>
              }
            />
          ) : (
            <CampaignTable campaigns={campaigns} details={campaignDetails} />
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
                  <p className="mt-1.5 text-[15px] leading-relaxed text-fg-sub">{alert.text}</p>
                </div>
              </div>
            ))}
            {!IS_SAMPLE_DATA ? (
              <p className="text-[14px] text-fg-sub">
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
                <p className="text-[14px] text-fg-sub">오가닉 조회수</p>
                <p className="tnum mt-1.5 text-2xl font-bold leading-none">
                  {formatCompact(organicWeeklyViews)}
                </p>
                <p className="mt-2 text-xs text-fg-faint">이번 주 · 연동 채널 합산</p>
              </div>
              <div className="p-5">
                <p className="text-[14px] text-fg-sub">광고 노출수</p>
                <p className="tnum mt-1.5 text-2xl font-bold leading-none">
                  {val(formatCompact(totals.impressions))}
                </p>
                <p className="mt-2 text-xs text-fg-faint">{linked ? "캠페인 전체 합산" : "광고 계정 연결 전"}</p>
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
