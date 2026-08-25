import { AlertTriangle, Coins } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/lib/format";
import type { CreditSummary } from "@/lib/data/credits";

/*
  크레딧 잔액·내역 (2026-08-15 신설).

  과금은 원래부터 돌고 있었다(chargeGeneration → deduct_my_credits → credit_transactions).
  **없던 건 화면이다.** 잔액도 내역도 볼 수 없는 상태로 크레딧만 빠져나가고 있었고,
  사이드바에 있던 「0/100회」는 어떤 계산도 하지 않는 하드코딩이었다.

  화면에 절대 내지 않는 것:
   · 1크레딧=10원 환율 — 노출되면 원가와 마진이 그 자리에서 계산된다
   · 잔액을 원화로 환산한 값 — 같은 이유
  대신 "무엇에 얼마나 썼는지"는 전부 보여준다. 그게 사용자가 실제로 궁금해하는 것이고,
  기능별 소모량은 이미 요금제 페이지에 공개돼 있다.

  게이지 분모는 **월 지급량(allowance)** 이다. 잔액이 지급량을 넘을 수 있어서
  (관리자 지급·환불) 100%로 잘라 표시한다 — 넘친 만큼은 막대 대신 숫자가 말한다.
*/
export function CreditPanel({ summary }: { summary: CreditSummary }) {
  const { balance, allowance, spentThisMonth, entries, balanceFailed, entriesFailed } = summary;
  const pct =
    !balanceFailed && allowance && allowance > 0 ? Math.min(100, Math.round((balance / allowance) * 100)) : null;

  return (
    <Card>
      <CardHeader
        title="크레딧"
        description={
          /* 못 읽었으면 어느 쪽도 단정하지 않는다 — allowance 는 조회 실패 때도 null 이라
             그것만 보면 유료 고객에게 「무료 플랜은…」이라고 말하게 된다 */
          balanceFailed
            ? "플랜 정보를 확인하지 못했어요. 새로고침하면 지급량과 잔액이 함께 표시됩니다."
            : allowance !== null
              ? "매달 결제일에 플랜 지급량까지 다시 채워집니다. 남은 크레딧은 이월되지 않습니다."
              : "무료 플랜은 크레딧 대신 기능별 월 횟수로 제공됩니다. 아래 잔액은 지급받은 크레딧입니다."
        }
      />
      <CardBody className="space-y-5">
        {/* 두 숫자를 한 쌍으로 나란히 — 앞서는 justify-between 이라 넓은 화면에서
            "남은 크레딧"과 "이번 달 사용"이 화면 양끝으로 벌어져 비교가 안 됐다.
            2칸 그리드로 묶어 항상 붙여 놓는다(plate 타일로 각각 감싼다). */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-card bg-plate px-4 py-3">
            <p className="text-[12px] text-fg-sub">남은 크레딧</p>
            {/* 잔액을 못 읽었을 때 «0» 을 그리면 "다 썼다"로 읽힌다 — 돈에 해당하는 숫자라
                «모른다»고 말하는 편이 낫다(lib/data/credits.ts 의 balanceFailed). */}
            <p className="tnum mt-1 flex items-baseline gap-1.5 text-[28px] font-bold leading-none">
              <Coins className="size-5 shrink-0 self-center text-primary" strokeWidth={2} aria-hidden />
              {balanceFailed ? (
                <span className="text-[20px] text-fg-sub">확인 못 함</span>
              ) : (
                <>
                  {balance.toLocaleString("ko-KR")}
                  {allowance !== null ? (
                    <span className="tnum text-[15px] font-medium text-fg-sub">
                      / {allowance.toLocaleString("ko-KR")}
                    </span>
                  ) : null}
                </>
              )}
            </p>
          </div>
          <div className="rounded-card bg-plate px-4 py-3">
            <p className="text-[12px] text-fg-sub">이번 달 사용</p>
            <p className="tnum mt-1 text-[20px] font-bold leading-none">
              {entriesFailed ? <span className="text-fg-sub">확인 못 함</span> : spentThisMonth.toLocaleString("ko-KR")}
            </p>
          </div>
        </div>

        {pct !== null ? (
          <div
            className="h-1.5 w-full overflow-hidden rounded-chip bg-plate"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="남은 크레딧 비율"
          >
            <div className="h-full rounded-chip bg-primary" style={{ width: `${pct}%` }} />
          </div>
        ) : null}

        <div>
          <h4 className="text-[14px] font-semibold">최근 사용 내역</h4>
          {entriesFailed ? (
            <div className="mt-3">
              <EmptyState
                icon={AlertTriangle}
                title="사용 내역을 불러오지 못했어요"
                description="내역이 없는 게 아니라 잠시 못 읽은 것입니다. 새로고침해 주세요."
              />
            </div>
          ) : entries.length === 0 ? (
            <div className="mt-3">
              <EmptyState
                icon={Coins}
                title="아직 사용 내역이 없어요"
                description="AI 기능을 쓰면 무엇에 얼마가 나갔는지 여기에 쌓입니다."
              />
            </div>
          ) : (
            <ul className="mt-2 divide-y divide-line">
              {entries.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="min-w-0 flex-1 truncate text-[14px]">{e.label}</span>
                  <span className="tnum shrink-0 text-[12px] text-fg-sub">{formatDate(e.createdAt)}</span>
                  {/* 사용은 음수라 부호가 이미 붙는다. 지급·환불만 + 를 붙여 방향을 맞춘다 */}
                  <span
                    className={`tnum w-16 shrink-0 text-right text-[14px] font-semibold ${
                      e.amount < 0 ? "text-fg" : "text-positive-strong"
                    }`}
                  >
                    {e.amount > 0 ? "+" : ""}
                    {e.amount.toLocaleString("ko-KR")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
