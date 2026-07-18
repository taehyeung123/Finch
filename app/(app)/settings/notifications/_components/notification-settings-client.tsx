"use client";

import { useRef, useState } from "react";
import { PageHeader } from "@/components/ui/section-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { SettingsNav } from "../../_components/settings-nav";
import { saveNotificationSettings } from "../actions";

/*
  알림 설정 (PRD PART 4.13)
  - 알림 유형 5종 x 수신 경로(인앱/이메일) 토글 매트릭스
  - 토글 즉시 낙관적 반영 + 짧은 디바운스 후 서버 저장 (notification_settings upsert)
*/

export const NOTIFICATION_ROWS = [
  { key: "competitor_ad", label: "경쟁사 신규 광고", description: "등록한 경쟁사의 새 광고가 감지되면 알림" },
  { key: "trend", label: "트렌드 급상승", description: "관심 카테고리에서 급상승 콘텐츠가 나오면 알림" },
  { key: "account", label: "내 계정 급성장·하락", description: "팔로워·조회수가 평소 대비 크게 변하면 알림" },
  { key: "token_expiry", label: "연동 토큰 만료", description: "채널 연동 토큰 만료가 임박하면 알림" },
  { key: "budget", label: "광고 예산 소진", description: "캠페인 일 예산이 임계치에 도달하면 알림" },
] as const;

export type RowKey = (typeof NOTIFICATION_ROWS)[number]["key"];
type ChannelKey = "inapp" | "email";
export type NotificationSettingsState = Record<RowKey, Record<ChannelKey, boolean>>;

export const DEFAULT_STATE: NotificationSettingsState = {
  competitor_ad: { inapp: true, email: true },
  trend: { inapp: true, email: false },
  account: { inapp: true, email: false },
  token_expiry: { inapp: true, email: true },
  budget: { inapp: true, email: false },
};

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={cn(
        "relative h-5 w-9 shrink-0 rounded-chip transition-colors",
        checked ? "bg-primary" : "bg-overlay border border-line",
      )}
    >
      <span
        className={cn(
          "absolute top-1/2 size-3.5 -translate-y-1/2 rounded-chip bg-fg transition-transform",
          checked ? "translate-x-[18px]" : "translate-x-[3px]",
        )}
        aria-hidden
      />
    </button>
  );
}

export function NotificationSettingsClient({ initial }: { initial: NotificationSettingsState }) {
  const [settings, setSettings] = useState(initial);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toggle = (row: RowKey, channel: ChannelKey) => {
    const next = {
      ...settings,
      [row]: { ...settings[row], [channel]: !settings[row][channel] },
    };
    setSettings(next);
    // 짧은 디바운스 — 연타 토글을 한 번의 저장으로 합친다
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaveState("saving");
    saveTimer.current = setTimeout(async () => {
      const res = await saveNotificationSettings(next);
      setSaveState(res.ok ? "saved" : "error");
    }, 500);
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="설정"
        description="알림 유형별로 수신 경로를 선택하세요."
      />
      <SettingsNav />

      <Card>
        <CardHeader
          title="알림 수신 설정"
          description="인앱·이메일 경로별로 켜고 끌 수 있어요"
          action={
            saveState === "saving" ? (
              <span className="text-xs text-fg-faint">저장 중…</span>
            ) : saveState === "saved" ? (
              <span className="text-xs text-positive">저장됨</span>
            ) : saveState === "error" ? (
              <span className="text-xs text-negative">저장 실패 — 다시 시도해 주세요</span>
            ) : null
          }
        />
        <CardBody>
          <div>
            {/* 헤더 행 */}
            <div className="grid grid-cols-[1fr_56px_56px] gap-x-6 pb-3 text-xs font-medium text-fg-faint">
              <span>알림 유형</span>
              <span className="text-center">인앱</span>
              <span className="text-center">이메일</span>
            </div>

            {NOTIFICATION_ROWS.map((row) => (
              <div
                key={row.key}
                className="grid grid-cols-[1fr_56px_56px] items-center gap-x-6 border-t border-line py-3.5"
              >
                <div className="min-w-0 pr-3">
                  <p className="text-[14px] font-semibold">{row.label}</p>
                  <p className="mt-0.5 text-[13px] text-fg-faint">{row.description}</p>
                </div>
                <div className="flex justify-center">
                  <Toggle
                    checked={settings[row.key].inapp}
                    onChange={() => toggle(row.key, "inapp")}
                    label={`${row.label} 인앱 알림`}
                  />
                </div>
                <div className="flex justify-center">
                  <Toggle
                    checked={settings[row.key].email}
                    onChange={() => toggle(row.key, "email")}
                    label={`${row.label} 이메일 알림`}
                  />
                </div>
              </div>
            ))}
          </div>
          <p className="mt-4 text-[13px] text-fg-faint">
            이메일 발송은 알림 발송 인프라 오픈과 함께 순차 적용됩니다. 설정은 지금 저장돼요.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
