"use client";

import { useRef, useState } from "react";
import { PageHeader } from "@/components/ui/section-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/cn";
import { SettingsNav } from "../../_components/settings-nav";
import { saveNotificationSettings } from "../actions";

/*
  알림 설정 (PRD PART 4.13)
  - 알림 유형 5종 x 수신 경로(인앱/이메일) 토글 매트릭스 — 토글은 공용 Switch(components/ui/switch.tsx)
  - 토글 즉시 낙관적 반영 + 짧은 디바운스 후 서버 저장 (notification_settings upsert)
  - 저장 실패 시: 화면을 서버가 확인한 마지막 값으로 롤백 + '다시 시도' 버튼 제공
    (2026-08-14 감사 — 낙관적 상태와 서버 상태가 어긋난 채 방치되던 문제 수리)
*/

export const NOTIFICATION_ROWS = [
  { key: "competitor_ad", label: "경쟁사 신규 광고", description: "등록한 경쟁사의 새 광고가 감지되면 알림" },
  { key: "trend", label: "트렌드 급상승", description: "관심 카테고리에서 급상승 콘텐츠가 나오면 알림" },
  { key: "account", label: "내 계정 급성장·하락", description: "팔로워·조회수가 평소 대비 크게 변하면 알림" },
  { key: "token_expiry", label: "연동 토큰 만료", description: "채널 연동 토큰 만료가 임박하면 알림" },
  { key: "budget", label: "광고 예산 소진", description: "캠페인 일 예산이 임계치에 도달하면 알림" },
  { key: "billing", label: "정기결제 안내", description: "결제 예정·실패·구독 만료 등 결제 관련 알림" },
  { key: "studio", label: "예약 발행 결과", description: "예약한 카드뉴스가 발행되거나 실패하면 알림" },
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
  billing: { inapp: true, email: true },
  studio: { inapp: true, email: false },
};

export function NotificationSettingsClient({ initial }: { initial: NotificationSettingsState }) {
  const [settings, setSettings] = useState(initial);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 서버가 확인한 마지막 값 — 저장 실패 시 여기로 롤백한다 */
  const lastSavedRef = useRef(initial);
  /** 마지막으로 저장을 시도한 값 — '다시 시도'가 이 값을 재전송한다 */
  const pendingRef = useRef(initial);
  /** 저장 세대 — 진행 중이던 낡은 저장 결과가 새 변경을 덮어쓰지 않게 한다 */
  const saveSeq = useRef(0);

  const flush = async () => {
    const seq = ++saveSeq.current;
    const attempted = pendingRef.current;
    setSaveState("saving");
    const res = await saveNotificationSettings(attempted);
    if (seq !== saveSeq.current) return; // 이후 새 변경이 생겼음 — 낡은 결과 무시
    if (res.ok) {
      lastSavedRef.current = attempted;
      setSaveState("saved");
    } else {
      // 롤백 — 화면이 서버에 없는 값을 계속 보여주지 않도록 마지막 저장값으로 되돌린다
      setSettings(lastSavedRef.current);
      setSaveState("error");
    }
  };

  const retry = () => {
    // 실패했던 값을 다시 화면에 반영한 뒤 재전송
    setSettings(pendingRef.current);
    void flush();
  };

  const toggle = (row: RowKey, channel: ChannelKey) => {
    const next = {
      ...settings,
      [row]: { ...settings[row], [channel]: !settings[row][channel] },
    };
    setSettings(next);
    pendingRef.current = next;
    saveSeq.current++; // 진행 중이던 저장 결과는 무시되도록 세대 갱신
    // 짧은 디바운스 — 연타 토글을 한 번의 저장으로 합친다
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaveState("saving");
    saveTimer.current = setTimeout(() => void flush(), 500);
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
            <div className="flex shrink-0 items-center gap-2">
              {/* 상시 마운트 live region — 조건부 마운트는 스크린리더가 낭독을 놓친다 */}
              <span
                role="status"
                aria-live={saveState === "error" ? "assertive" : "polite"}
                className={cn(
                  "text-xs",
                  saveState === "saving" && "text-fg-sub",
                  saveState === "saved" && "text-positive",
                  saveState === "error" && "text-negative",
                )}
              >
                {saveState === "saving"
                  ? "저장 중…"
                  : saveState === "saved"
                    ? "저장됨"
                    : saveState === "error"
                      ? "저장 실패 — 변경이 저장 전 상태로 되돌아갔어요"
                      : null}
              </span>
              {saveState === "error" ? (
                <button
                  type="button"
                  onClick={retry}
                  className="relative cursor-pointer rounded-card text-xs font-semibold text-negative underline underline-offset-2 after:absolute after:-inset-1.5 after:content-[''] focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
                >
                  다시 시도
                </button>
              ) : null}
            </div>
          }
        />
        <CardBody>
          <div>
            {/* 헤더 행 */}
            <div className="grid grid-cols-[1fr_56px_56px] gap-x-6 pb-3 text-xs font-medium text-fg-sub">
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
                  <p className="text-[15px] font-semibold">{row.label}</p>
                  <p className="mt-0.5 text-[14px] text-fg-sub">{row.description}</p>
                </div>
                <div className="flex justify-center">
                  <Switch
                    checked={settings[row.key].inapp}
                    onChange={() => toggle(row.key, "inapp")}
                    label={`${row.label} 인앱 알림`}
                  />
                </div>
                <div className="flex justify-center">
                  <Switch
                    checked={settings[row.key].email}
                    onChange={() => toggle(row.key, "email")}
                    label={`${row.label} 이메일 알림`}
                  />
                </div>
              </div>
            ))}
          </div>
          <p className="mt-4 text-[14px] text-fg-sub">
            이메일 발송은 알림 발송 인프라 오픈과 함께 순차 적용됩니다. 설정은 지금 저장돼요.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
