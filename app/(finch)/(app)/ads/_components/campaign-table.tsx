"use client";

import { useState } from "react";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { formatCompact, formatKRW, formatPercent } from "@/lib/format";
import type { AdCampaign, AdCampaignDetail } from "@/lib/types";
import { CampaignDetailModal, STATUS_BADGE } from "./campaign-detail";

/*
  캠페인 성과 테이블 — 행 클릭으로 상세 모달(소재·퍼널·게재위치·연령성별)을 연다.
  상세 데이터가 없는 캠페인(실 모드 insights 미연동)은 클릭 대상에서 제외해
  빈 모달이 뜨지 않게 한다.
*/

export function CampaignTable({
  campaigns,
  details,
}: {
  campaigns: AdCampaign[];
  details: Record<string, AdCampaignDetail>;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = campaigns.find((c) => c.id === selectedId) ?? null;
  const selectedDetail = selected ? (details[selected.id] ?? null) : null;

  return (
    <>
      {/* 390px 에서 표 폭 992 vs 화면 356 — 숫자 8열이 전부 화면 밖인데 스크롤바 자리도 없어서
          «옆으로 밀 수 있다»는 걸 알 길이 없었다(실측: scrollWidth 992 / clientWidth 356).
          좁은 화면에서만 한 줄로 알린다 — 넓은 화면에는 다 보이므로 군더더기다. */}
      <p className="mb-2 text-[12px] text-fg-faint sm:hidden">← 옆으로 밀면 예산·노출·CTR·ROAS 를 볼 수 있어요</p>
      <table className="w-full min-w-[960px] text-[15px]">
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
            const clickable = Boolean(details[c.id]);
            return (
              <tr
                key={c.id}
                className={
                  clickable
                    ? "cursor-pointer border-b border-line trans-state last:border-0 hover:bg-tint-hover focus-visible:bg-tint-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
                    : "border-b border-line last:border-0"
                }
                tabIndex={clickable ? 0 : undefined}
                role={clickable ? "button" : undefined}
                aria-label={clickable ? `${c.name} 상세 성과 보기` : undefined}
                onClick={clickable ? () => setSelectedId(c.id) : undefined}
                onKeyDown={
                  clickable
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelectedId(c.id);
                        }
                      }
                    : undefined
                }
              >
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
                          <Badge className="shrink-0 px-1.5 py-0 text-[11px] leading-4">영상</Badge>
                        ) : null}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-fg-faint">{c.creative.headline}</p>
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
      {selected && selectedDetail ? (
        <CampaignDetailModal
          campaign={selected}
          detail={selectedDetail}
          onClose={() => setSelectedId(null)}
        />
      ) : null}
    </>
  );
}
