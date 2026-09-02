"use client";

import { useState, useTransition } from "react";
import { Briefcase, Megaphone, User } from "lucide-react";
import { cn } from "@/lib/cn";
import { FinchMark } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { completeOnboarding } from "./actions";

/**
 * 온보딩 2단계 마법사 — 사용 목적 → 완료 (PRD PART 5, 2.2).
 *
 * ⚠️ 채널 연동 단계는 여기서 뺐다(2026-09-02 사장님 지시).
 * 가입 마법사 안에서 외부 OAuth 로 나갔다 돌아오면 마법사 상태가 날아가고,
 * 연동은 «가입 절차»가 아니라 로그인 뒤 언제든 할 수 있는 일이다 —
 * 대시보드의 연동 가이드 모달(components/dashboard/connect-channels-modal.tsx)이 맡는다.
 *
 * 목적 선택은 이제 **저장된다**(0080 users_profile.purpose) — 예전엔 고르게 해 놓고 버렸다.
 * «건너뛰기»도 완료로 기록한다 — 안 찍으면 건너뛴 사람에게 마법사가 영영 다시 뜬다.
 */

type Purpose = "creator" | "advertiser" | "agency";

const PURPOSES: { value: Purpose; label: string; description: string; icon: typeof User }[] = [
  {
    value: "creator",
    label: "개인·브랜드 크리에이터",
    description: "내 채널 성장과 콘텐츠 성과 분석이 필요해요",
    icon: User,
  },
  {
    value: "advertiser",
    label: "메타광고 광고주",
    description: "광고 성과 관리와 경쟁사 광고 모니터링이 필요해요",
    icon: Megaphone,
  },
  {
    value: "agency",
    label: "콘텐츠 마케터·대행사",
    description: "여러 계정을 관리하고 리포트를 만들어야 해요",
    icon: Briefcase,
  },
];

export function OnboardingForm() {
  const [step, setStep] = useState(1);
  const [purpose, setPurpose] = useState<Purpose | null>(null);
  const [pending, startTransition] = useTransition();

  function finish(withPurpose: boolean) {
    const fd = new FormData();
    if (withPurpose && purpose) fd.set("purpose", purpose);
    // 서버 액션이 기록 후 /dashboard 로 보낸다 — 실패해도 사용자는 막지 않는다(actions.ts)
    startTransition(() => void completeOnboarding(fd));
  }

  return (
    <div className="w-full">
      {/* 진행 표시 + 건너뛰기 */}
      <div className="flex items-center justify-between">
        <ol className="flex items-center gap-2" aria-label={`온보딩 진행 단계: 2단계 중 ${step}단계`}>
          {[1, 2].map((n) => (
            <li
              key={n}
              aria-current={n === step ? "step" : undefined}
              className={cn(
                "flex size-7 items-center justify-center rounded-chip text-xs font-semibold trans-state",
                n === step
                  ? "bg-primary text-on-primary"
                  : n < step
                    ? "bg-primary-weak text-primary"
                    : "border border-line bg-overlay text-fg-faint",
              )}
            >
              {n}
            </li>
          ))}
        </ol>
        {/* 링크가 아니라 액션이다 — 건너뛰어도 완료 도장을 찍어야 다시 안 뜬다 */}
        <button
          type="button"
          onClick={() => finish(false)}
          disabled={pending}
          className="-mx-2 -my-1.5 inline-block cursor-pointer px-2 py-2.5 text-[14px] text-fg-sub trans-state hover:text-fg"
        >
          건너뛰기
        </button>
      </div>

      <div className="mt-6 rounded-card border border-line bg-body p-8">
        {step === 1 ? (
          <section aria-label="사용 목적 선택">
            <h1 className="text-2xl font-bold leading-tight">핀치에 오신 걸 환영해요</h1>
            <p className="mt-1 text-[15px] text-fg-sub">
              어떤 목적으로 사용하시나요? 맞는 화면을 먼저 보여드릴게요.
            </p>
            <div className="mt-6 space-y-2">
              {PURPOSES.map(({ value, label, description, icon: Icon }) => {
                const selected = purpose === value;
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setPurpose(value)}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-card border p-4 text-left trans-state",
                      selected
                        ? "border-primary bg-primary-weak"
                        : "border-line bg-overlay hover:border-line-strong",
                    )}
                  >
                    <Icon
                      className={cn("mt-0.5 size-5 shrink-0", selected ? "text-primary" : "text-fg-sub")}
                      aria-hidden
                    />
                    <span className="min-w-0">
                      <span className="block text-[15px] font-semibold">{label}</span>
                      <span className="mt-0.5 block text-[14px] text-fg-sub">{description}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="mt-6 flex justify-end">
              <Button onClick={() => setStep(2)} disabled={!purpose}>
                다음
              </Button>
            </div>
          </section>
        ) : null}

        {step === 2 ? (
          <section aria-label="온보딩 완료" className="flex flex-col items-center py-8 text-center">
            <FinchMark className="size-16 text-primary" />
            <h1 className="mt-5 text-2xl font-bold leading-tight">준비 완료!</h1>
            <p className="mt-2 max-w-sm text-[15px] text-fg-sub">
              대시보드에서 인스타그램·틱톡·스레드 계정을 연동하면 실제 데이터로 바로 시작할 수 있어요.
              연동 방법은 화면에서 차근차근 안내해 드릴게요.
            </p>
            <div className="mt-8 flex items-center gap-3">
              <Button variant="secondary" onClick={() => setStep(1)} disabled={pending}>
                이전
              </Button>
              <Button size="lg" onClick={() => finish(true)} disabled={pending}>
                {pending ? "이동 중…" : "대시보드로 가기"}
              </Button>
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
