"use client";

import { useState } from "react";
import { Mail } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { StateChip } from "@/components/ui/state-chip";
import { Switch } from "@/components/ui/switch";
import { formatDate } from "@/lib/format";
import { SettingsGroup, SettingsRow } from "../../_components/settings-row";
import { setMarketingConsent } from "../actions";

/*
  마케팅 정보 수신(선택) — 알림 매트릭스와 따로 둔다. 저 위 표는 «내 계정에 일어난 일»의 알림이고,
  이건 «핀치가 보내는 광고성 정보»라 법적으로 다른 동의다(정보통신망법 §50). 섞어 두면
  «전부 끄기»가 광고 수신 철회까지 했는지 아닌지 사용자도 우리도 말할 수 없게 된다.
  2026-09-03 재설계: 카드 한 장 → 그룹 하나에 행 하나(같은 행 문법). 저장 로직은 그대로.

  상태 네 가지:
   · demo        — 예시 화면. 토글은 그리되 저장 안 됨을 말한다
   · ok          — 행이 있다. 토글 + 동의 시각
   · none        — 동의 행이 없다(0079 이전 가입·게이트 미통과). 만들지 않고 안내만
   · failed      — 조회 실패. 값을 단정하지 않는다(«없음»으로 그리면 동의를 지운 것처럼 보인다)
*/
export type MarketingConsentState =
  | { kind: "demo" }
  | { kind: "ok"; at: string | null }
  | { kind: "none" }
  | { kind: "failed" };

export function MarketingConsentRow({ initial }: { initial: MarketingConsentState }) {
  const [state, setState] = useState<MarketingConsentState>(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "positive" | "negative" | "warning"; text: string } | null>(null);

  const on = state.kind === "ok" && state.at !== null;

  async function toggle(next: boolean) {
    if (busy) return;
    if (state.kind === "demo") {
      setMessage({ tone: "warning", text: "예시 화면이라 설정은 저장되지 않아요." });
      return;
    }
    if (state.kind !== "ok") return;
    const prev = state;
    setBusy(true);
    setMessage(null);
    /* 낙관적 반영 — 실패하면 되돌린다(알림 매트릭스와 같은 규칙) */
    setState({ kind: "ok", at: next ? new Date().toISOString() : null });
    const res = await setMarketingConsent(next);
    if (res.ok) {
      setState({ kind: "ok", at: res.at });
      setMessage({ tone: "positive", text: next ? "마케팅 정보 수신에 동의했어요." : "마케팅 정보 수신을 철회했어요." });
    } else {
      setState(prev);
      setMessage({
        tone: "negative",
        text:
          res.reason === "no_record"
            ? "동의 기록을 찾지 못했어요. 잠시 후 다시 시도해 주세요."
            : "저장하지 못했어요. 잠시 후 다시 시도해 주세요.",
      });
    }
    setBusy(false);
  }

  const hint =
    state.kind === "failed"
      ? "동의 상태를 불러오지 못했어요 — 지금 값을 알 수 없어 토글을 잠시 숨겼어요"
      : state.kind === "none"
        ? "아직 동의 기록이 없어요. 다음 방문에서 동의 화면이 뜨면 그때 고를 수 있어요"
        : state.kind === "ok" && state.at
          ? `${formatDate(state.at)}에 동의했어요. 끄면 그 즉시 광고성 이메일이 멈춰요`
          : "지금은 받지 않고 있어요. 켜면 동의 시각이 기록돼요";

  return (
    <SettingsGroup
      id="marketing"
      label="마케팅 정보 수신"
      footer={
        message ? (
          <p
            role={message.tone === "negative" ? "alert" : "status"}
            className={
              message.tone === "positive"
                ? "border-t border-line px-4 py-2.5 text-[14px] text-positive-strong"
                : message.tone === "negative"
                  ? "border-t border-line px-4 py-2.5 text-[14px] text-negative-strong"
                  : "border-t border-line px-4 py-2.5 text-[14px] text-warning-strong"
            }
          >
            {message.text}
          </p>
        ) : (
          <p className="border-t border-line px-4 py-2.5 text-[12px] text-fg-sub">서비스 이용에 필요한 알림과는 별개예요. 언제든 끌 수 있어요.</p>
        )
      }
    >
      <SettingsRow
        icon={Mail}
        label="새 기능·혜택 안내 이메일"
        chip={
          <>
            <Badge tone="neutral">선택</Badge>
            {state.kind === "failed" ? <StateChip tone="unknown" /> : null}
          </>
        }
        hint={hint}
        hintWrap
        hintTone={state.kind === "failed" ? "warning" : "sub"}
        trailingFixed
        trailing={
          state.kind === "ok" || state.kind === "demo" ? (
            <span className="flex w-14 justify-center">
              <Switch checked={on} onChange={toggle} disabled={busy} label="마케팅 정보 수신 동의" />
            </span>
          ) : null
        }
      />
    </SettingsGroup>
  );
}
