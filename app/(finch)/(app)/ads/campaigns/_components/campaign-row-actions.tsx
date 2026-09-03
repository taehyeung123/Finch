"use client";

import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { ButtonLink } from "@/components/ui/button";
import { setCampaignStatusAction } from "../actions";

/*
  캠페인 행 동작 — 일시중지(PAUSED)는 여기서, 게재 시작은 **상세 화면**에서.

  ⚠️ ACTIVE 전환은 돈이 나가는 경로다. 2단계부터 «게재 시작»은 하위(광고 세트·광고)의 실제 상태·심사를
  읽은 뒤 «함께 켜기»를 고르는 데이터 기반 모달이 맡는다(스펙 §1.5) — 그 데이터는 상세 화면이 이미 갖고 있고,
  목록에서 캠페인마다 하위를 읽으면 레이트리밋을 태운다. 그래서 목록의 버튼은 상세로 보내는 링크다.
  일시중지는 반대로 가볍게 — 끄는 걸 어렵게 만드는 쪽이 더 위험하다.
*/

export function CampaignRowActions({
  campaignId,
  name,
  status,
}: {
  campaignId: string;
  name: string;
  /** Meta 원문 status (ACTIVE·PAUSED·ARCHIVED…) — 전환 버튼은 두 상태에서만 나온다 */
  status: string | null;
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
    return (
      <ButtonLink href={`/ads/campaigns/${campaignId}?focus=activate`} size="sm" variant="primary">
        게재 시작
      </ButtonLink>
    );
  }
  return null;
}
