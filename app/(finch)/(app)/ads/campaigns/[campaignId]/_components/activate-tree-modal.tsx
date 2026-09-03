"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ModalShell } from "@/components/ui/modal-shell";
import { formatMoney } from "@/lib/format";
import { adsWriteMessage } from "@/lib/ads/campaign-rules";
import { activateCampaignTreeAction } from "@/app/(finch)/(app)/ads/tree-status-actions";

/*
  게재 시작 모달(데이터 기반) — 스펙 §1.5 표.
  서버가 먼저 읽은 하위 상태를 받아 «함께 켜기» 체크박스를 그린다. 기본 체크는 핀치가 만든 것만(§13-3).
  광고 0개 → 허용(비용 없음) · 전부 거부 → 차단 · 심사 중 → 경고 · 조회 실패는 부모가 이 컴포넌트를 그리지 않는다(fail-closed).
  실제로 켜는 것은 서버 액션이고, 서버는 여기서 보낸 id 를 **다시 읽은 목록과 교집합**으로만 쓴다.
  껍데기는 ModalShell(포커스 트랩·Escape·복원). 제출은 useTransition 으로 — 진행 중엔 busy 로 잠가 «취소»가 거짓말이 되지 않게(소넷 점검).
  목록의 «게재 시작» 링크(?focus=activate)로 들어오면 열린 채로 시작한다.
*/

export interface ActivateChild {
  id: string;
  name: string;
  status: string | null;
  effectiveStatus: string | null;
}

export function ActivateTreeModal({
  campaignId,
  campaignName,
  dailyBudget,
  currency,
  adsets,
  ads,
  finchAdsetIds,
  finchAdIds,
  defaultOpen = false,
}: {
  campaignId: string;
  campaignName: string;
  dailyBudget: number | null;
  currency: string | null;
  /** 광고가 0개인 세트는 부모가 이미 뺐다 */
  adsets: ActivateChild[];
  ads: (ActivateChild & { adsetId: string | null })[];
  finchAdsetIds: string[];
  finchAdIds: string[];
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const pausedAdsets = adsets.filter((a) => a.status === "PAUSED");
  const pausedAds = ads.filter((a) => a.status === "PAUSED" && a.effectiveStatus !== "DISAPPROVED");
  const [checkedAdsets, setCheckedAdsets] = useState<Set<string>>(() => new Set(pausedAdsets.filter((a) => finchAdsetIds.includes(a.id)).map((a) => a.id)));
  const [checkedAds, setCheckedAds] = useState<Set<string>>(() => new Set(pausedAds.filter((a) => finchAdIds.includes(a.id)).map((a) => a.id)));

  const total = ads.length;
  const pendingReview = ads.filter((a) => a.effectiveStatus === "PENDING_REVIEW").length;
  const disapproved = ads.filter((a) => a.effectiveStatus === "DISAPPROVED").length;
  const allDisapproved = total > 0 && disapproved === total;

  const budgetLine = dailyBudget !== null && currency ? ` 하루 최대 ${formatMoney(dailyBudget, currency)}까지 매일 지출될 수 있어요.` : "";

  function toggle(set: Set<string>, id: string, on: boolean, save: (s: Set<string>) => void) {
    const next = new Set(set);
    if (on) next.add(id);
    else next.delete(id);
    save(next);
  }

  function close() {
    if (pending) return;
    setOpen(false);
  }

  function submit() {
    const form = new FormData();
    form.set("campaignId", campaignId);
    for (const id of checkedAdsets) form.append("adset", id);
    for (const id of checkedAds) form.append("ad", id);
    setError(null);
    startTransition(async () => {
      try {
        /* 성공·실패 모두 서버가 redirect 로 상세 화면에 결과를 붙인다 — 여기까지 돌아오면 전송 자체가 안 된 것 */
        await activateCampaignTreeAction(form);
      } catch (e) {
        /* Next 의 redirect 는 예외로 전달된다 — 그건 실패가 아니다 */
        if (e && typeof e === "object" && "digest" in e && String((e as { digest?: unknown }).digest).startsWith("NEXT_REDIRECT")) throw e;
        setError(adsWriteMessage("failed"));
      }
    });
  }

  return (
    <>
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        게재 시작
      </Button>

      {open ? (
        <ModalShell
          label="게재 시작 — 비용이 발생해요"
          title="게재 시작 — 비용이 발생해요"
          onClose={close}
          busy={pending}
          size="md"
          footer={
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={close} disabled={pending}>
                {allDisapproved ? "닫기" : "취소"}
              </Button>
              {!allDisapproved ? (
                <Button type="button" variant="danger" size="sm" onClick={submit} disabled={pending}>
                  {pending ? "시작 중…" : "게재 시작"}
                </Button>
              ) : null}
            </div>
          }
        >
          <p className="text-[15px] leading-relaxed text-fg-sub">
            «{campaignName}» 캠페인을 켜요.
            {total === 0
              ? " 이 캠페인에는 아직 광고가 없어 켜도 노출되지 않고 비용도 발생하지 않아요."
              : ` 켜진 광고 세트·광고가 있으면 즉시 게재가 시작되고 비용이 발생해요.${budgetLine}`}
          </p>

          {allDisapproved ? (
            <p role="alert" className="mt-3 rounded-card bg-negative-weak p-3 text-[14px] text-negative-strong">
              {adsWriteMessage("children_disapproved")}
            </p>
          ) : (
            <div className="mt-4">
              {pausedAdsets.length + pausedAds.length > 0 ? (
                <fieldset className="space-y-2" disabled={pending}>
                  <legend className="text-[14px] font-semibold">
                    일시중지된 광고 세트 {pausedAdsets.length}개 · 광고 {pausedAds.length}개도 함께 켜기
                  </legend>
                  <p className="text-[12px] text-fg-sub">핀치에서 만든 것은 미리 체크돼 있어요. 체크하지 않은 것은 일시중지 상태로 남아요.</p>
                  <div className="max-h-56 space-y-1 overflow-y-auto rounded-card border border-line bg-body p-2">
                    {pausedAdsets.map((a) => (
                      <label key={a.id} className="flex cursor-pointer items-center gap-2.5 rounded-card px-2 py-1.5 trans-state hover:bg-tint-hover">
                        <input type="checkbox" checked={checkedAdsets.has(a.id)} onChange={(e) => toggle(checkedAdsets, a.id, e.target.checked, setCheckedAdsets)} className="size-5 shrink-0 accent-primary" />
                        <span className="min-w-0 truncate text-[14px]">
                          <span className="text-fg-sub">광고 세트 · </span>
                          {a.name}
                        </span>
                      </label>
                    ))}
                    {pausedAds.map((a) => (
                      <label key={a.id} className="flex cursor-pointer items-center gap-2.5 rounded-card px-2 py-1.5 trans-state hover:bg-tint-hover">
                        <input type="checkbox" checked={checkedAds.has(a.id)} onChange={(e) => toggle(checkedAds, a.id, e.target.checked, setCheckedAds)} className="size-5 shrink-0 accent-primary" />
                        <span className="min-w-0 truncate text-[14px]">
                          <span className="text-fg-sub">광고 · </span>
                          {a.name}
                          {a.effectiveStatus === "PENDING_REVIEW" ? <span className="ml-1 text-[12px] text-fg-sub">(심사 중)</span> : null}
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              ) : null}

              {pendingReview > 0 ? <p className="mt-3 rounded-card bg-warning-weak p-3 text-[14px] text-warning-strong">심사 중인 광고 {pendingReview}개는 승인 전까지 노출되지 않아요.</p> : null}
              {disapproved > 0 ? (
                <p className="mt-3 rounded-card bg-warning-weak p-3 text-[14px] text-warning-strong">거부된 광고 {disapproved}개는 켜지지 않아요 — 사유는 메타 광고 관리자에서 확인할 수 있어요.</p>
              ) : null}
              {error ? (
                <p role="alert" className="mt-3 rounded-card bg-negative-weak p-3 text-[14px] text-negative-strong">
                  {error}
                </p>
              ) : null}
            </div>
          )}
        </ModalShell>
      ) : null}
    </>
  );
}
