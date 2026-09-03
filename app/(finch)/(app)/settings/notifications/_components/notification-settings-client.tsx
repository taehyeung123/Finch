"use client";

import { useRef, useState } from "react";
import { Bell, CalendarClock, CreditCard, KeyRound, Megaphone, TrendingUp, Wallet, type LucideIcon, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/cn";
import { SettingsGroup, SettingsRow } from "../../_components/settings-row";
import { SummaryCard } from "../../_components/summary-card";
import { saveNotificationSettings } from "../actions";

/*
  알림 설정 (PRD PART 4.13) — 2026-09-03 재설계: 요약 카드(켜진 개수 + 저장 상태) → 두 그룹의 토글 행.
  - 알림 유형 7종 × 수신 경로(인앱/이메일) — 토글은 공용 Switch. 행은 SettingsRow(trailingFixed) 라 좁은 화면에서도 열이 맞는다.
  - 토글 즉시 낙관적 반영 + 짧은 디바운스 후 서버 저장 (notification_settings upsert)
  - 저장 실패 시: 화면을 서버가 확인한 마지막 값으로 롤백 + '다시 시도' 버튼 제공
    (2026-08-14 감사 — 낙관적 상태와 서버 상태가 어긋난 채 방치되던 문제 수리)
  - status: 'live' 는 지금 코드가 실제로 만드는 알림(lib/notify.ts 호출부 — token_expiry·billing·studio),
    'soon' 은 설정만 저장되고 아직 생성부가 없는 유형. 화면에 «준비 중» 배지로 솔직히 말한다(문구는 코드와 대조 — 기억으로 쓰지 않는다).
  - 이메일은 인앱이 켜진 유형에만 간다(notify.ts: inapp===false 면 이메일 전에 반환). 그 조합은 행 메타로 알려 준다.
*/

type Group = "mine" | "insight";

export const NOTIFICATION_ROWS: ReadonlyArray<{
  key: "competitor_ad" | "trend" | "account" | "token_expiry" | "budget" | "billing" | "studio";
  label: string;
  description: string;
  icon: LucideIcon;
  group: Group;
  status: "live" | "soon";
}> = [
  { key: "token_expiry", label: "채널 연결 만료", description: "채널 연결이 곧 끊길 때 미리 알려 드려요", icon: KeyRound, group: "mine", status: "live" },
  { key: "billing", label: "결제 안내", description: "결제 예정·실패·구독 종료 같은 결제 소식", icon: CreditCard, group: "mine", status: "live" },
  { key: "studio", label: "예약 발행 결과", description: "예약한 게시물이 올라가거나 실패했을 때", icon: CalendarClock, group: "mine", status: "live" },
  { key: "account", label: "내 계정 급성장·하락", description: "팔로워·조회수가 평소보다 크게 움직일 때", icon: Users, group: "mine", status: "soon" },
  { key: "competitor_ad", label: "경쟁사 새 광고", description: "등록한 경쟁사가 새 광고를 시작했을 때", icon: Megaphone, group: "insight", status: "soon" },
  { key: "trend", label: "트렌드 급상승", description: "관심 카테고리에서 급상승 콘텐츠가 나왔을 때", icon: TrendingUp, group: "insight", status: "soon" },
  { key: "budget", label: "광고 예산 소진", description: "캠페인 일 예산이 임계치에 닿았을 때", icon: Wallet, group: "insight", status: "soon" },
];

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

const GROUPS: Array<{ id: Group; label: string }> = [
  { id: "mine", label: "내 계정과 채널" },
  { id: "insight", label: "분석과 광고" },
];

export function NotificationSettingsClient({ initial, demoMode }: { initial: NotificationSettingsState; demoMode: boolean }) {
  const [settings, setSettings] = useState(initial);
  /* demo 는 «실패»와 다르다 — 고장이 아니라 예시 화면이라 안 담기는 것이다.
     빨간 「저장 실패」와 「다시 시도」를 띄우면 몇 번이고 다시 누르게 된다. */
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error" | "demo">("idle");
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
    } else if (res.demo) {
      setSettings(lastSavedRef.current);
      setSaveState("demo");
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

  const total = NOTIFICATION_ROWS.length;
  const inappOn = NOTIFICATION_ROWS.filter((r) => settings[r.key].inapp).length;
  const emailOn = NOTIFICATION_ROWS.filter((r) => settings[r.key].email).length;

  /* 페이지 틀(제목·되돌아가기)은 서버 page.tsx 의 SettingsShell 이 그린다 — 여기는 카드들만 */
  return (
    <>
      <SummaryCard
        leading={
          <span className="flex size-12 shrink-0 items-center justify-center rounded-card bg-plate text-fg-sub" aria-hidden>
            <Bell className="size-5" />
          </span>
        }
        title="받고 있는 알림"
        sub={demoMode ? "지금은 예시 화면이라 바꿔도 저장되지 않아요" : "바꾸면 바로 저장돼요. 이메일은 인앱이 켜진 유형에만 보내요."}
        aside={
          <div className="flex items-center gap-2">
            {demoMode ? <Badge tone="neutral">예시 화면</Badge> : null}
            {/* 상시 마운트 live region — 조건부 마운트는 스크린리더가 낭독을 놓친다 */}
            <span
              role="status"
              aria-live={saveState === "error" ? "assertive" : "polite"}
              className={cn(
                "text-[12px]",
                saveState === "saving" && "text-fg-sub",
                saveState === "saved" && "text-positive-strong",
                saveState === "error" && "text-negative-strong",
                saveState === "demo" && "text-warning-strong",
              )}
            >
              {saveState === "saving"
                ? "저장 중…"
                : saveState === "saved"
                  ? "저장됨"
                  : saveState === "error"
                    ? "저장 실패 — 이전 설정으로 되돌렸어요"
                    : saveState === "demo"
                      ? "예시 화면이라 저장되지 않아요"
                      : null}
            </span>
            {saveState === "error" ? (
              <button
                type="button"
                onClick={retry}
                className="relative cursor-pointer rounded-card text-[12px] font-semibold text-negative-strong underline underline-offset-2 after:absolute after:-inset-2.5 after:content-[''] focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
              >
                다시 시도
              </button>
            ) : null}
          </div>
        }
        stats={[
          { label: "인앱 알림", value: `${inappOn}/${total} 켜짐`, tnum: true },
          { label: "이메일 알림", value: `${emailOn}/${total} 켜짐`, tnum: true },
        ]}
      />

      {GROUPS.map((g) => (
        <SettingsGroup key={g.id} id={`notify-${g.id}`} label={g.label} head={<ColumnHead />}>
          {NOTIFICATION_ROWS.filter((r) => r.group === g.id).map((row) => {
            const s = settings[row.key];
            const emailWithoutInapp = s.email && !s.inapp;
            return (
              <SettingsRow
                key={row.key}
                icon={row.icon}
                label={row.label}
                chip={row.status === "soon" ? <Badge tone="neutral">준비 중</Badge> : null}
                hint={row.description}
                hintWrap
                meta={emailWithoutInapp ? "인앱을 꺼 두면 이메일도 가지 않아요" : undefined}
                metaTone="warning"
                trailingFixed
                trailing={
                  <>
                    <span className="flex w-14 justify-center">
                      <Switch checked={s.inapp} onChange={() => toggle(row.key, "inapp")} label={`${row.label} 인앱 알림`} />
                    </span>
                    <span className="flex w-14 justify-center">
                      <Switch checked={s.email} onChange={() => toggle(row.key, "email")} label={`${row.label} 이메일 알림`} />
                    </span>
                  </>
                }
              />
            );
          })}
        </SettingsGroup>
      ))}
    </>
  );
}

/** 열 머리 — 오른쪽 두 토글 칸(w-14 + gap-1.5)과 같은 폭으로 «인앱 / 이메일» 을 얹는다 */
function ColumnHead() {
  return (
    <div className="flex items-center justify-end gap-1.5 border-b border-line px-4 pb-2 pt-3 text-[12px] font-medium text-fg-sub" aria-hidden>
      <span className="w-14 text-center">인앱</span>
      <span className="w-14 text-center">이메일</span>
    </div>
  );
}
