import { Badge } from "@/components/ui/badge";
import { formatCompact, formatMoney, formatPercent } from "@/lib/format";
import { objectiveLabel, statusLabel } from "@/lib/ads/meta-labels";
import type { LiveAdCampaign } from "@/lib/data/ads";

/*
  실 연동 캠페인 표 — 샘플용 CampaignTable 과 별개다.

  ⚠️ 두 표를 하나로 합치지 않은 이유: 샘플 타입(AdCampaign)은 모든 숫자가 **필수 number** 이고
  대표 소재 이미지가 있다. 실 데이터는 그 둘 다 없다 —
  전환·ROAS 는 픽셀이 없으면 애초에 존재하지 않고, 소재 썸네일은 별도 호출(ads/creatives)이라
  1단계 범위 밖이다. 없는 값을 0 으로 채워 한 표에 밀어 넣으면 «성과가 0» 이라고 거짓말을 하게 된다.

  상세 모달은 아직 없다 — 행을 클릭 대상으로 만들지 않는다(눌러도 아무 일 없는 행은 고장으로 읽힌다).
*/

/** 값이 없으면 «—» — 0 으로 채우지 않는다 */
function cell(v: number | null, fmt: (n: number) => string): string {
  return v === null ? "—" : fmt(v);
}

export function LiveCampaignTable({
  campaigns,
  currency,
}: {
  campaigns: LiveAdCampaign[];
  currency: string | null;
}) {
  const money = (n: number) => formatMoney(n, currency);

  return (
    <>
      <p className="mb-2 text-[12px] text-fg-faint sm:hidden">
        ← 옆으로 밀면 예산·노출·CTR·ROAS를 볼 수 있어요
      </p>
      <table className="w-full min-w-[880px] text-[15px]">
        <thead>
          <tr className="border-b border-line text-left text-xs text-fg-faint">
            <th className="pb-2 font-medium">캠페인</th>
            <th className="pb-2 font-medium">목표</th>
            <th className="pb-2 font-medium">상태</th>
            <th className="pb-2 text-right font-medium">일 예산</th>
            <th className="pb-2 text-right font-medium">집행액</th>
            <th className="pb-2 text-right font-medium">노출</th>
            <th className="pb-2 text-right font-medium">링크 클릭</th>
            <th className="pb-2 text-right font-medium">CTR</th>
            <th className="pb-2 text-right font-medium">CPC</th>
            <th className="pb-2 text-right font-medium">전환</th>
            <th className="pb-2 text-right font-medium">ROAS</th>
          </tr>
        </thead>
        <tbody>
          {campaigns.map((c) => {
            const status = statusLabel(c.effectiveStatus, c.status);
            return (
              <tr key={c.id} className="border-b border-line last:border-0">
                <td className="min-w-[200px] max-w-[280px] py-3 pr-3">
                  <p className="truncate font-medium">{c.name}</p>
                </td>
                <td className="py-3 pr-3 text-fg-sub">{objectiveLabel(c.objective)}</td>
                <td className="py-3 pr-3">
                  <Badge tone={status.tone}>
                    <span className="size-1.5 rounded-full bg-current" aria-hidden />
                    {status.label}
                  </Badge>
                </td>
                {/* 예산이 «없다»는 건 광고 세트에서 관리한다는 뜻이다 — 0원이 아니다 */}
                <td className="tnum py-3 text-right">
                  {c.dailyBudget === null ? (
                    <span className="text-fg-faint">세트별</span>
                  ) : (
                    money(c.dailyBudget)
                  )}
                </td>
                <td className="tnum py-3 text-right">{cell(c.spend, money)}</td>
                <td className="tnum py-3 text-right">{cell(c.impressions, formatCompact)}</td>
                <td className="tnum py-3 text-right">{cell(c.linkClicks, formatCompact)}</td>
                <td className="tnum py-3 text-right">{cell(c.ctr, formatPercent)}</td>
                <td className="tnum py-3 text-right">{cell(c.cpc, money)}</td>
                {/* 전환·ROAS 가 없는 건 «성과 0»이 아니라 전환 추적을 안 하고 있다는 뜻이다 */}
                <td className="tnum py-3 text-right">
                  {c.conversions === null ? (
                    <span className="text-fg-faint" title="전환 추적이 설정돼 있지 않아요">
                      미추적
                    </span>
                  ) : (
                    c.conversions.toLocaleString("ko-KR")
                  )}
                </td>
                <td className="tnum py-3 text-right font-semibold">
                  {c.roas === null ? (
                    <span className="font-normal text-fg-faint">—</span>
                  ) : (
                    `${c.roas.toFixed(1)}배`
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}
