"use client";

import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { formatMoney } from "@/lib/format";
import { setCampaignStatusAction } from "../actions";

/*
  캠페인 행 동작 — 게재 시작(ACTIVE)·일시중지(PAUSED).

  ⚠️ ACTIVE 전환은 이 MVP 에서 돈이 나갈 수 있는 유일한 경로다(소재가 붙은 기존 캠페인).
  그래서 확인 모달 설명에 **캠페인 이름 + 일 예산 + 통화**를 그대로 박는다 —
  ConfirmSubmit 주석의 «무엇이 일어나는지»가 여기서는 «비용이 발생하기 시작한다»이다.
  일시중지는 반대로 가볍게 — 끄는 걸 어렵게 만드는 쪽이 더 위험하다.
*/

export function CampaignRowActions({
  campaignId,
  name,
  status,
  dailyBudget,
  currency,
}: {
  campaignId: string;
  name: string;
  /** Meta 원문 status (ACTIVE·PAUSED·ARCHIVED…) — 전환 버튼은 두 상태에서만 나온다 */
  status: string | null;
  dailyBudget: number | null;
  currency: string | null;
}) {
  if (status === "ACTIVE") {
    return (
      <ConfirmSubmit
        action={setCampaignStatusAction}
        hiddenFields={{ campaignId, status: "PAUSED" }}
        title="캠페인 일시중지"
        description={`«${name}» 캠페인의 게재를 멈춰요. 진행 중이던 광고 노출이 중단되고, 언제든 다시 시작할 수 있어요.`}
        confirmLabel="일시중지"
        confirmVariant="primary"
        pendingLabel="중지 중…"
        trigger="일시중지"
        triggerVariant="secondary"
      />
    );
  }
  if (status === "PAUSED") {
    const budgetLine =
      dailyBudget !== null && currency
        ? ` 일 예산 ${formatMoney(dailyBudget, currency)}이 소진될 때까지 광고가 게재돼요.`
        : "";
    return (
      <ConfirmSubmit
        action={setCampaignStatusAction}
        hiddenFields={{ campaignId, status: "ACTIVE" }}
        title="게재 시작 — 비용이 발생해요"
        description={`«${name}» 캠페인을 켜요. 이 캠페인에 광고 세트·소재가 붙어 있다면 즉시 게재가 시작되고 비용이 발생합니다.${budgetLine}`}
        confirmLabel="게재 시작"
        pendingLabel="시작 중…"
        trigger="게재 시작"
        triggerVariant="primary"
      />
    );
  }
  return null;
}
