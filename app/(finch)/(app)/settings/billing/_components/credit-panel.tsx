import { Coins } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadFailed } from "@/components/ui/load-failed";
import { formatDate } from "@/lib/format";
import type { CreditSummary } from "@/lib/data/credits";

/*
  크레딧 사용 내역 (2026-08-15 신설 → 2026-09-03 재설계로 «사용 내역»만 남았다. 잔액·지급량·게이지는 플랜 관리 요약 카드로 갔다).

  화면에 절대 내지 않는 것: 1크레딧=10원 환율 · 잔액의 원화 환산(원가와 마진이 그 자리에서 계산된다).
  대신 «무엇에 얼마나 썼는지»는 전부 보여준다. 실패(entriesFailed)는 «없음»과 가른다.
*/
export function CreditUsageCard({ summary }: { summary: CreditSummary }) {
  const { entries, entriesFailed } = summary;
  return (
    <Card>
      <CardHeader
        title="크레딧 사용 내역"
        description={entriesFailed ? "불러오지 못했어요" : entries.length > 0 ? `최근 ${entries.length}건` : "AI 기능을 쓰면 여기에 쌓여요"}
      />
      <CardBody className="pt-3">
        {entriesFailed ? (
          <LoadFailed dense title="사용 내역을 불러오지 못했어요" description="내역이 없는 게 아니라 잠시 못 읽은 거예요. 다시 시도해 주세요." />
        ) : entries.length === 0 ? (
          <EmptyState dense icon={Coins} title="아직 사용 내역이 없어요" description="AI 기능을 쓰면 무엇에 얼마가 나갔는지 여기에 쌓여요." />
        ) : (
          <ul className="divide-y divide-line">
            {entries.map((e) => (
              <li key={e.id} className="flex items-center gap-3 py-2.5">
                <span className="min-w-0 flex-1 truncate text-[15px]">{e.label}</span>
                <span className="tnum shrink-0 text-[12px] text-fg-sub">{formatDate(e.createdAt)}</span>
                {/* 사용은 음수라 부호가 이미 붙는다. 지급·환불만 + 를 붙여 방향을 맞춘다 */}
                <span className={`tnum w-16 shrink-0 text-right text-[14px] font-semibold ${e.amount < 0 ? "text-fg" : "text-positive-strong"}`}>
                  {e.amount > 0 ? "+" : ""}
                  {e.amount.toLocaleString("ko-KR")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
