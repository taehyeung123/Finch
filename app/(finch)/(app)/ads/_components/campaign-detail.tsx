"use client";

import { useEffect } from "react";
import Image from "next/image";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatCompact, formatDate, formatDelta, formatKRW, formatPercent } from "@/lib/format";
import type { AdCampaign, AdCampaignDetail } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import { DonutChart, DualLineChart, RatioBar, Sparkline } from "@/components/ui/charts";

/*
  캠페인 상세 모달 — 목록에서 캠페인 클릭 시 노출 (PART 4.7 확장).
  소재 미리보기 / 핵심 성과 요약 / 성과 추이 / 전환 퍼널 / 게재위치 / 세부 성과 / 연령·성별.
  모든 수치는 campaigns·campaignDetails 데이터에서 파생 계산한다 — 화면에서 재가공하는 값은
  CPA(지출÷구매)·빈도(노출÷도달)·퍼널 전환율뿐이라 연동 시 그대로 재사용된다.
*/

export const STATUS_BADGE: Record<AdCampaign["status"], { tone: "positive" | "warning" | "neutral"; label: string }> = {
  active: { tone: "positive", label: "진행 중" },
  paused: { tone: "warning", label: "일시정지" },
  ended: { tone: "neutral", label: "종료" },
};

/* 게재위치 도넛 세그먼트 색 — 전부 토큰 참조 (인덱스 순서 배정) */
const PLACEMENT_COLORS = [
  "var(--color-ig)",
  "var(--color-meta)",
  "var(--color-primary)",
  "var(--color-tiktok-cyan)",
  "var(--color-fg-faint)",
];

const GENDER_COLORS = { male: "var(--color-meta)", female: "var(--color-ig)" };

/**
 * 증감 표기 — 광고 지표는 방향의 의미가 지표마다 다르다:
 * good-down(CPA·CPC)은 내려가면 초록, neutral(빈도)은 색 없이 표기.
 */
function MetricDelta({ value, direction = "up" }: { value: number; direction?: "up" | "down" | "neutral" }) {
  const improved = direction === "neutral" ? null : direction === "up" ? value > 0 : value < 0;
  const tone =
    value === 0 || improved === null ? "text-fg-faint" : improved ? "text-positive" : "text-negative";
  return <span className={cn("tnum font-semibold", tone)}>{formatDelta(value)}</span>;
}

function SectionTitle({ title, hint, right }: { title: string; hint?: string; right?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h3 className="inline-flex items-center gap-1.5 text-[15px] font-bold">
        {title}
        {hint ? <InfoTip>{hint}</InfoTip> : null}
      </h3>
      {right}
    </div>
  );
}

export function CampaignDetailModal({
  campaign,
  detail,
  onClose,
}: {
  campaign: AdCampaign;
  detail: AdCampaignDetail;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const status = STATUS_BADGE[campaign.status];
  const cpa = campaign.conversions > 0 ? Math.round(campaign.spend / campaign.conversions) : null;
  const reach = detail.funnel.find((f) => f.label === "도달")?.value ?? null;
  const frequency = reach ? campaign.impressions / reach : null;
  const funnelBase = detail.funnel[0]?.value ?? 0;

  /* 핵심 성과 요약 타일 — 스크린샷 구성(ROAS·CPA·CTR·CPC·전환·지출) */
  const stats: {
    label: string;
    value: string;
    delta: number;
    direction: "up" | "down" | "neutral";
    trend?: number[];
    hint?: string;
  }[] = [
    { label: "ROAS (구매)", value: `${campaign.roas.toFixed(2)}배`, delta: detail.deltas.roas, direction: "up", trend: detail.roasTrend, hint: "전환가치 ÷ 지출. 1배 미만이면 지출보다 매출이 적다는 뜻이에요." },
    { label: "CPA (구매)", value: cpa === null ? "-" : formatKRW(cpa), delta: detail.deltas.cpa, direction: "down", trend: detail.cpaTrend, hint: "구매 1건당 비용 (총 지출 ÷ 구매 전환수). 낮을수록 좋아요." },
    { label: "CTR (링크 클릭률)", value: formatPercent(campaign.ctr), delta: detail.deltas.ctr, direction: "up" },
    { label: "CPC (링크 클릭)", value: formatKRW(campaign.cpc), delta: detail.deltas.cpc, direction: "down" },
    { label: "구매 전환수", value: campaign.conversions.toLocaleString("ko-KR"), delta: detail.deltas.purchases, direction: "up" },
    { label: "지출 금액", value: formatKRW(campaign.spend), delta: detail.deltas.spend, direction: "up" },
  ];

  /* 세부 성과 표 — 값·단위당 비용은 파생 계산 */
  const breakdown: {
    label: string;
    value: string;
    delta: number;
    direction: "up" | "down" | "neutral";
    unitCost: string | null;
    hint?: string;
  }[] = [
    { label: "노출", value: formatCompact(campaign.impressions), delta: detail.deltas.impressions, direction: "up", unitCost: `CPM ${formatKRW(Math.round((campaign.spend / campaign.impressions) * 1000))}` },
    { label: "도달", value: reach === null ? "-" : formatCompact(reach), delta: detail.deltas.reach, direction: "up", unitCost: reach ? `1천명 도달당 ${formatKRW(Math.round((campaign.spend / reach) * 1000))}` : null },
    { label: "빈도", value: frequency === null ? "-" : frequency.toFixed(2), delta: detail.deltas.frequency, direction: "neutral", unitCost: null, hint: "한 사람이 이 광고를 본 평균 횟수 (노출 ÷ 도달)." },
    { label: "링크 클릭", value: formatCompact(campaign.clicks), delta: detail.deltas.linkClicks, direction: "up", unitCost: `클릭당 ${formatKRW(campaign.cpc)}` },
    { label: "CTR (링크 클릭률)", value: formatPercent(campaign.ctr), delta: detail.deltas.ctr, direction: "up", unitCost: null },
    { label: "구매", value: campaign.conversions.toLocaleString("ko-KR"), delta: detail.deltas.purchases, direction: "up", unitCost: cpa === null ? null : `구매당 ${formatKRW(cpa)}` },
    { label: "ROAS (구매)", value: `${campaign.roas.toFixed(2)}배`, delta: detail.deltas.roas, direction: "up", unitCost: null },
  ];

  const maxBandTotal = Math.max(...detail.ageBands.map((b) => b.male + b.female), 1);

  return (
    <div
      className="modal-scrim-in fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`${campaign.name} 상세 성과`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-card-in shadow-pop flex max-h-[94dvh] w-full max-w-5xl flex-col rounded-card border border-line bg-body">
        {/* 헤더 */}
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="flex min-w-0 items-center gap-3.5">
            <Image
              src={campaign.creative.imageUrl}
              alt=""
              width={44}
              height={44}
              unoptimized
              className="size-11 shrink-0 rounded-card border border-line object-cover"
            />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-[17px] font-bold">{campaign.name}</h2>
                <Badge tone={status.tone}>
                  <span className="size-1.5 rounded-full bg-current" aria-hidden />
                  {status.label}
                </Badge>
                <Badge>{campaign.objective}</Badge>
              </div>
              <p className="tnum mt-0.5 text-xs text-fg-faint">
                광고 ID {detail.adId} · 생성 {formatDate(detail.createdAt)} · 마지막 수정{" "}
                {formatDate(detail.updatedAt)}
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="닫기"
            onClick={onClose}
            className="relative after:absolute after:-inset-1 after:content-[''] rounded-card p-1.5 text-fg-faint hover:bg-tint-hover hover:text-fg"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* 본문 */}
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
            {/* 광고 소재 미리보기 */}
            <section className="rounded-card border border-line p-4">
              <SectionTitle
                title="광고 소재 미리보기"
                right={<Badge>{campaign.creative.format === "video" ? "영상 소재" : "이미지 소재"}</Badge>}
              />
              <div className="mt-3 overflow-hidden rounded-card border border-line bg-body">
                <div className="flex items-center gap-2.5 px-3.5 py-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-chip bg-primary-weak text-[15px] font-bold text-primary">
                    {detail.adCopy.brandName.slice(0, 1)}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-semibold">{detail.adCopy.brandName}</p>
                    <p className="text-[11px] text-fg-faint">Sponsored</p>
                  </div>
                </div>
                <p className="px-3.5 pb-3 text-[14px] leading-relaxed text-fg-sub">{detail.adCopy.body}</p>
                <Image
                  src={campaign.creative.imageUrl}
                  alt={campaign.creative.headline}
                  width={640}
                  height={640}
                  unoptimized
                  className="aspect-square w-full border-y border-line object-cover"
                />
                <div className="flex items-center justify-between gap-3 px-3.5 py-3">
                  <div className="min-w-0">
                    <p className="text-[11px] uppercase tracking-wide text-fg-faint">{detail.adCopy.linkLabel}</p>
                    <p className="truncate text-[14px] font-semibold">{campaign.creative.headline}</p>
                  </div>
                  {/* 미리보기 목업 — 실제 동작 버튼 아님 */}
                  <span
                    aria-hidden
                    className="shrink-0 rounded-card border border-line bg-body px-3 py-1.5 text-[14px] font-semibold"
                  >
                    {detail.adCopy.cta}
                  </span>
                </div>
              </div>
            </section>

            <div className="space-y-4">
              {/* 핵심 성과 요약 */}
              <section className="rounded-card border border-line p-4">
                <SectionTitle
                  title="핵심 성과 요약"
                  right={<span className="text-xs text-fg-faint">{detail.periodLabel} · 이전 기간 대비</span>}
                />
                <div className="mt-3 grid grid-cols-2 gap-2.5 xl:grid-cols-3">
                  {stats.map((s) => (
                    <div key={s.label} className="rounded-card border border-line p-3">
                      <p className="flex items-center gap-1 text-xs text-fg-sub">
                        {s.label}
                        {s.hint ? <InfoTip>{s.hint}</InfoTip> : null}
                      </p>
                      <p className="tnum mt-1 text-lg font-bold leading-none">{s.value}</p>
                      <div className="mt-1.5 flex items-end justify-between gap-2 text-xs">
                        <MetricDelta value={s.delta} direction={s.direction} />
                        {s.trend ? <Sparkline data={s.trend} width={64} height={20} stroke="var(--color-fg-faint)" /> : null}
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* 성과 추이 */}
              <section className="rounded-card border border-line p-4">
                <SectionTitle
                  title="성과 추이"
                  right={
                    <span className="flex items-center gap-4 text-[14px] text-fg-sub">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="size-1.5 rounded-full" style={{ background: "var(--color-positive)" }} aria-hidden />
                        ROAS
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="size-1.5 rounded-full" style={{ background: "var(--color-primary)" }} aria-hidden />
                        CPA
                      </span>
                    </span>
                  }
                />
                <DualLineChart
                  className="mt-3"
                  height={170}
                  series={[
                    { data: detail.roasTrend, stroke: "var(--color-positive)" },
                    { data: detail.cpaTrend, stroke: "var(--color-primary)" },
                  ]}
                />
                {/* 읽으라고 쓴 문장은 본문이다 — fg-faint(4.0:1)는 본문 금지, 플레이스홀더·아이콘 전용 */}
                <p className="mt-2 text-xs text-fg-sub">
                  {detail.periodLabel} 일별 추이 · 두 지표를 각자 범위로 정규화한 추세 비교입니다
                </p>
              </section>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* 전환 퍼널 */}
            <section className="rounded-card border border-line p-4">
              <SectionTitle title="전환 퍼널" hint="각 단계 비율은 노출수 대비입니다." />
              <div className="mt-3 space-y-3">
                {detail.funnel.map((f) => {
                  const pct = funnelBase > 0 ? (f.value / funnelBase) * 100 : 0;
                  return (
                    <div key={f.label}>
                      <div className="flex items-baseline justify-between text-[14px]">
                        <span className="text-fg-sub">{f.label}</span>
                        <span className="tnum">
                          <span className="font-semibold">{formatCompact(f.value)}</span>
                          <span className="ml-1.5 text-fg-faint">
                            {pct >= 10 ? pct.toFixed(0) : pct >= 1 ? pct.toFixed(1) : pct.toFixed(2)}%
                          </span>
                        </span>
                      </div>
                      <div className="mt-1 h-2.5 w-full overflow-hidden rounded-chip bg-plate">
                        <div
                          className="h-full rounded-chip bg-primary"
                          style={{ width: `${Math.max(pct, 1.5)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* 기기 및 게재위치 */}
            <section className="rounded-card border border-line p-4">
              <SectionTitle title="기기 및 게재위치" right={<span className="text-xs text-fg-faint">지출 비중 기준</span>} />
              <div className="mt-3 flex flex-wrap items-center gap-5">
                <div className="relative shrink-0">
                  <DonutChart
                    segments={detail.placements.map((p, i) => ({
                      label: p.label,
                      pct: p.pct,
                      color: PLACEMENT_COLORS[i % PLACEMENT_COLORS.length],
                    }))}
                  />
                  <span className="absolute inset-0 flex items-center justify-center text-xs font-semibold text-fg-sub">
                    지출 비중
                  </span>
                </div>
                <ul className="min-w-0 flex-1 space-y-1.5">
                  {detail.placements.map((p, i) => (
                    <li key={p.label} className="flex items-center justify-between gap-2 text-[14px]">
                      <span className="inline-flex min-w-0 items-center gap-1.5 text-fg-sub">
                        <span
                          className="size-1.5 shrink-0 rounded-full"
                          style={{ background: PLACEMENT_COLORS[i % PLACEMENT_COLORS.length] }}
                          aria-hidden
                        />
                        <span className="truncate">{p.label}</span>
                      </span>
                      <span className="tnum font-semibold">{p.pct}%</span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* 세부 성과 */}
            <section className="rounded-card border border-line p-4">
              <SectionTitle title="세부 성과" right={<span className="text-xs text-fg-faint">{detail.periodLabel}</span>} />
              <div className="mt-2 overflow-x-auto">
                <table className="w-full min-w-[380px] text-[14px]">
                  <thead>
                    <tr className="border-b border-line text-left text-xs text-fg-faint">
                      <th className="py-2 font-medium">지표</th>
                      <th className="py-2 text-right font-medium">결과</th>
                      <th className="py-2 text-right font-medium">변화</th>
                      <th className="py-2 text-right font-medium">단위당 비용</th>
                    </tr>
                  </thead>
                  <tbody>
                    {breakdown.map((row) => (
                      <tr key={row.label} className="border-b border-line last:border-0">
                        <td className="py-2 pr-2 text-fg-sub">
                          <span className="inline-flex items-center gap-1">
                            {row.label}
                            {row.hint ? <InfoTip>{row.hint}</InfoTip> : null}
                          </span>
                        </td>
                        <td className="tnum py-2 text-right font-semibold">{row.value}</td>
                        <td className="py-2 text-right">
                          <MetricDelta value={row.delta} direction={row.direction} />
                        </td>
                        <td className="tnum py-2 pl-2 text-right text-fg-faint">{row.unitCost ?? "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* 연령 및 성별 */}
            <section className="rounded-card border border-line p-4">
              <SectionTitle title="연령 및 성별" right={<span className="text-xs text-fg-faint">도달 기준</span>} />
              <RatioBar
                className="mt-3"
                segments={[
                  { label: "남성", ratio: detail.gender.male, color: GENDER_COLORS.male },
                  { label: "여성", ratio: detail.gender.female, color: GENDER_COLORS.female },
                ]}
              />
              <div className="mt-4 space-y-2.5">
                {detail.ageBands.map((b) => {
                  const total = b.male + b.female;
                  return (
                    <div key={b.range} className="flex items-center gap-3">
                      <span className="tnum w-12 shrink-0 text-xs text-fg-sub">{b.range}</span>
                      <div className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-chip bg-plate">
                        <div
                          className="flex h-full overflow-hidden rounded-chip"
                          style={{ width: `${Math.max((total / maxBandTotal) * 100, 2)}%` }}
                        >
                          <div style={{ width: `${(b.male / total) * 100}%`, background: GENDER_COLORS.male }} />
                          <div style={{ width: `${(b.female / total) * 100}%`, background: GENDER_COLORS.female }} />
                        </div>
                      </div>
                      <span className="tnum w-10 shrink-0 text-right text-xs font-semibold">{total}%</span>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        </div>

        {/* 푸터 */}
        <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-3.5">
          <p className="tnum text-xs text-fg-faint">광고 ID {detail.adId}</p>
          <Button variant="secondary" size="sm" onClick={onClose}>
            닫기
          </Button>
        </div>
      </div>
    </div>
  );
}
