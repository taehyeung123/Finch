"use client";

import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { setChildStatusAction } from "@/app/(finch)/(app)/ads/tree-status-actions";

/*
  광고 세트·광고 행의 켜기/끄기 — 캠페인 행 버튼과 같은 결(ConfirmSubmit + hidden 필드).
  켜기는 캠페인이 게재 중이면 **즉시 노출·비용**이라 문구에 그대로 적는다. 끄기는 가볍게.
*/

export function ChildStatusButton({
  kind,
  objectId,
  campaignId,
  name,
  status,
  campaignActive,
}: {
  kind: "adset" | "ad";
  objectId: string;
  campaignId: string;
  name: string;
  status: string | null;
  /** 캠페인이 ACTIVE 면 하위를 켜는 순간 노출이 시작될 수 있다 */
  campaignActive: boolean;
}) {
  const noun = kind === "adset" ? "광고 세트" : "광고";
  const hidden = { kind, objectId, campaignId };
  if (status === "ACTIVE") {
    return (
      <ConfirmSubmit
        action={setChildStatusAction}
        hiddenFields={{ ...hidden, status: "PAUSED" }}
        title={`${noun} 일시중지`}
        description={`«${name}» ${noun}의 게재를 멈춰요. 언제든 다시 켤 수 있어요.`}
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
      <ConfirmSubmit
        action={setChildStatusAction}
        hiddenFields={{ ...hidden, status: "ACTIVE" }}
        title={campaignActive ? `${noun} 켜기 — 비용이 발생해요` : `${noun} 켜기`}
        description={
          campaignActive
            ? `«${name}» ${noun}를 켜요. 캠페인이 게재 중이라 즉시 노출이 시작되고 비용이 발생해요.`
            : `«${name}» ${noun}를 켜요. 캠페인이 일시중지 상태라 지금은 노출되지 않고, 캠페인 게재를 시작하면 함께 노출돼요.`
        }
        confirmLabel="켜기"
        confirmVariant={campaignActive ? "danger" : "primary"}
        pendingLabel="켜는 중…"
        trigger="켜기"
        triggerVariant="secondary"
      />
    );
  }
  return null;
}
