"use client";

import { useActionState, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import {
  CAMPAIGN_NAME_MAX,
  FORM_OBJECTIVES,
  FORM_SPECIAL_AD_CATEGORIES,
  SPECIAL_AD_CATEGORY_LABELS,
} from "@/lib/ads/campaign-rules";
import { createCampaignAction, type CampaignActionState } from "../actions";

/*
  캠페인 생성 폼 — 이름·목표·일 예산·특별 광고 카테고리 4필드.

  생성은 **항상 일시중지 상태**로 만들어진다(서버가 상수로 박아 뒀다) — 이 폼으로는
  돈이 나갈 수 없다. 게재 시작은 목록의 행 버튼에서 확인 모달을 거쳐야 한다.

  특별 카테고리는 기본값을 조용히 «없음»으로 보내지 않는다 — 신용·주택·고용·선거 광고를
  카테고리 없이 집행하면 계정 제재 사유라, 사용자가 «해당 없음»을 명시적으로 확인한다.
*/

const INITIAL: CampaignActionState = { error: null, createdId: null, values: null };

export function CampaignForm({ currency, minDailyBudget }: { currency: string; minDailyBudget: number | null }) {
  const [state, formAction, pending] = useActionState(createCampaignAction, INITIAL);
  const [objective, setObjective] = useState<string>("OUTCOME_SALES");
  const [hasSpecial, setHasSpecial] = useState<null | boolean>(null);
  /* 이름·예산은 제어 입력이다 — React 19 는 액션 제출 순간 비제어 폼을 리셋해서,
     서버 오류 한 번에 쓰던 값이 통째로 날아갔다(감사 지적). 서버가 돌려준 values 로 되살린다. */
  const [name, setName] = useState("");
  const [budget, setBudget] = useState("");
  /* 렌더 중 상태 조정 패턴(공식 권장) — effect 로 하면 한 프레임 늦게 값이 돌아온다 */
  const [lastState, setLastState] = useState(state);
  if (state !== lastState) {
    setLastState(state);
    if (state.values) {
      setName(state.values.name);
      setBudget(state.values.dailyBudget);
    }
    if (state.createdId) {
      setName("");
      setBudget("");
    }
  }

  const currencyLabel = currency === "KRW" ? "원" : ` ${currency}`;
  /* 자릿수 예시는 통화마다 다르다 — «10000» 을 박으면 KRW 스케일 가정이다(감사 지적) */
  const budgetPlaceholder = currency === "KRW" ? "10000" : currency === "JPY" ? "1000" : "10";

  return (
    <form action={formAction} className="space-y-5">
      {state.createdId ? (
        <p role="status" className="flex items-center gap-2 rounded-card bg-positive-weak p-3 text-[14px] text-positive-strong">
          <CheckCircle2 className="size-4 shrink-0" aria-hidden />
          캠페인이 일시중지 상태로 만들어졌어요. 광고 세트·소재를 붙인 뒤 게재를 시작할 수 있어요.
        </p>
      ) : null}
      {state.error ? (
        <p role="alert" className="rounded-card bg-negative-weak p-3 text-[14px] text-negative-strong">
          {state.error}
        </p>
      ) : null}

      <div>
        <label htmlFor="campaign-name" className="text-[14px] font-semibold">
          캠페인 이름
        </label>
        <input
          id="campaign-name"
          name="name"
          required
          maxLength={CAMPAIGN_NAME_MAX}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="예: 9월 신제품 판매"
          className="mt-1.5 h-11 w-full rounded-card border border-line bg-body px-3 text-[16px] outline-none trans-state focus:border-primary"
        />
      </div>

      <fieldset>
        <legend className="text-[14px] font-semibold">캠페인 목표</legend>
        <div className="mt-1.5 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="캠페인 목표">
          {FORM_OBJECTIVES.map((o) => {
            const selected = objective === o.value;
            return (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setObjective(o.value)}
                className={cn(
                  "rounded-card border p-3.5 text-left trans-state",
                  selected ? "border-primary bg-primary-weak" : "border-line bg-overlay hover:border-line-strong",
                )}
              >
                <span className="block text-[15px] font-semibold">{o.label}</span>
                <span className="mt-0.5 block text-[12px] text-fg-sub">{o.description}</span>
              </button>
            );
          })}
        </div>
        <input type="hidden" name="objective" value={objective} />
      </fieldset>

      <div>
        <label htmlFor="campaign-budget" className="text-[14px] font-semibold">
          일 예산
        </label>
        <div className="mt-1.5 flex items-center gap-2">
          <input
            id="campaign-budget"
            name="dailyBudget"
            type="number"
            inputMode="numeric"
            required
            min={minDailyBudget ?? 1}
            step="any"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            placeholder={minDailyBudget !== null ? String(minDailyBudget) : budgetPlaceholder}
            className="tnum h-11 w-40 rounded-card border border-line bg-body px-3 text-[16px] outline-none trans-state focus:border-primary"
          />
          {/* 통화는 계정에서 읽은 값 그대로 — «원» 가정 금지 */}
          <span className="text-[15px] text-fg-sub">{currencyLabel}</span>
        </div>
        {minDailyBudget !== null ? (
          <p className="mt-1 text-[12px] text-fg-sub">
            이 광고 계정의 최소 일 예산: <span className="tnum">{minDailyBudget.toLocaleString("ko-KR")}</span>
            {currencyLabel}
          </p>
        ) : null}
      </div>

      <fieldset>
        <legend className="text-[14px] font-semibold">특별 광고 카테고리</legend>
        <p className="mt-0.5 text-[12px] text-fg-sub">
          신용·주택·고용·정치 등 특별 카테고리 광고는 반드시 표시해야 해요 — 표시 없이 집행하면 광고
          계정이 제한될 수 있어요.
        </p>
        <label className="mt-2 flex cursor-pointer items-center gap-2.5 rounded-card border border-line bg-overlay px-3.5 py-2.5">
          <input
            type="checkbox"
            name="noSpecialCategory"
            checked={hasSpecial === false}
            onChange={(e) => setHasSpecial(e.target.checked ? false : null)}
            className="size-5 shrink-0 accent-primary"
          />
          <span className="text-[14px]">해당 없음 — 아래 카테고리와 관련 없는 광고예요</span>
        </label>
        <div className={cn("mt-2 space-y-1", hasSpecial === false && "opacity-50")}>
          {/* CREDIT 은 목록에 없다 — 금융 상품·서비스가 대체했다(campaign-rules FORM_SPECIAL_AD_CATEGORIES) */}
          {FORM_SPECIAL_AD_CATEGORIES.map((c) => (
            <label key={c} className="flex cursor-pointer items-center gap-2.5 rounded-card px-3.5 py-2 trans-state hover:bg-tint-hover">
              <input
                type="checkbox"
                name={`cat_${c}`}
                disabled={hasSpecial === false}
                onChange={(e) => {
                  if (e.target.checked) setHasSpecial(true);
                }}
                className="size-5 shrink-0 accent-primary"
              />
              <span className="text-[14px] text-fg-sub">{SPECIAL_AD_CATEGORY_LABELS[c]}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex items-center justify-between gap-3 border-t border-line pt-4">
        <p className="text-[12px] text-fg-sub">
          일시중지 상태로 만들어져요 — 이 단계에서는 비용이 발생하지 않아요.
        </p>
        <Button type="submit" disabled={pending}>
          {pending ? "만드는 중…" : "캠페인 만들기"}
        </Button>
      </div>
    </form>
  );
}
