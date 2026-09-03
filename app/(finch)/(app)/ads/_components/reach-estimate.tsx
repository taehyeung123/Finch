"use client";

import { useState } from "react";
import { Users } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import { formatCompact } from "@/lib/format";
import { adsWriteMessage } from "@/lib/ads/campaign-rules";
import type { TargetingInput } from "@/lib/ads/adset-rules";
import { estimateReachAction, type ReachEstimateResult } from "../targeting-actions";

/*
  예상 도달 — «예상 도달 보기» 버튼 **1회**(§13-17 — 자동으로 부르지 않는다, 읽기도 점수를 쓴다).
  숫자는 메타 reachestimate 의 상·하한을 그대로 보여 준다. 실패·미준비면 숫자를 만들지 않는다 — 0 도, «너무 좁음»도 없다.
  타겟이 바뀌면 옛 숫자는 흐리게 남기고 «다시 확인»을 연다.
*/

type State =
  | { key: string; status: "idle" }
  | { key: string; status: "loading" }
  | { key: string; status: "done"; result: ReachEstimateResult };

export function ReachEstimate({ targeting, className }: { targeting: TargetingInput; className?: string }) {
  const key = JSON.stringify(targeting);
  const [state, setState] = useState<State>({ key, status: "idle" });
  const stale = state.status !== "idle" && state.key !== key;

  async function run() {
    const k = key;
    setState({ key: k, status: "loading" });
    const result = await estimateReachAction(targeting);
    setState({ key: k, status: "done", result });
  }

  const label =
    state.status === "loading"
      ? "확인하는 중…"
      : state.status === "done"
        ? stale
          ? "다시 확인"
          : "확인함"
        : "예상 도달 보기";

  return (
    <div className={cn("rounded-card border border-line bg-body p-4", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Users className="size-4 text-fg-faint" aria-hidden />
          <p className="text-[14px] font-semibold text-fg-sub">예상 도달</p>
          <InfoTip>
            메타가 추정한 <b className="font-semibold text-fg">지난달 활성 사용자</b> 범위예요. 이 타겟 조건에 해당하는 사람 수의 상·하한이고,
            실제 도달은 예산·입찰·소재에 따라 달라져요. 핀치가 계산한 값이 아니라 메타가 준 값을 그대로 보여 드려요.
          </InfoTip>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={run}
          disabled={state.status === "loading" || (state.status === "done" && !stale)}
        >
          {label}
        </Button>
      </div>

      {state.status === "done" ? (
        state.result.ok ? (
          <div className="mt-3">
            <p className={cn("tnum text-[20px] font-bold", stale && "text-fg-sub")}>
              {formatCompact(state.result.lower)}~{formatCompact(state.result.upper)}명
            </p>
            <p className="mt-0.5 text-[12px] text-fg-sub">
              {state.result.basis === "nationwide"
                ? "전국 기준 상한이에요 — 고른 시·도만의 추정은 메타가 주지 않았어요."
                : "지난달 활성 사용자 기준"}
              {stale ? " · 타겟이 바뀌었어요. 다시 확인해 주세요." : ""}
            </p>
          </div>
        ) : (
          <p className="mt-3 text-[14px] text-fg-sub">{adsWriteMessage(state.result.code)}</p>
        )
      ) : (
        <p className="mt-2 text-[12px] text-fg-sub">버튼을 누르면 메타에서 이 타겟의 예상 도달 범위를 가져와요.</p>
      )}
    </div>
  );
}
