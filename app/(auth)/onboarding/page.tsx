"use client";

import { useState } from "react";
import Link from "next/link";
import { Briefcase, Info, Megaphone, User } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Channel } from "@/lib/types";
import { FinchMark } from "@/components/logo";
import { Button, ButtonLink } from "@/components/ui/button";
import { ChannelBadge } from "@/components/ui/badge";
import { AppIconTile } from "@/components/icons/brand";

/** 온보딩 3단계 마법사 — 사용 목적 → 채널 연동 → 완료 (PRD PART 5, 2.2) */

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

const CHANNELS: Channel[] = ["instagram", "tiktok", "threads"];

export default function OnboardingPage() {
  const [step, setStep] = useState(1);
  const [purpose, setPurpose] = useState<Purpose | null>(null);

  return (
    <div className="w-full">
      {/* 진행 표시 + 건너뛰기 */}
      <div className="flex items-center justify-between">
        <ol className="flex items-center gap-2" aria-label={`온보딩 진행 단계: 3단계 중 ${step}단계`}>
          {[1, 2, 3].map((n) => (
            <li
              key={n}
              aria-current={n === step ? "step" : undefined}
              className={cn(
                "flex size-7 items-center justify-center rounded-chip text-xs font-semibold transition-colors",
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
        <Link
          href="/dashboard"
          className="text-[13px] text-fg-faint transition-colors hover:text-fg-sub"
        >
          건너뛰기
        </Link>
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
                      "flex w-full items-start gap-3 rounded-card border p-4 text-left transition-colors",
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
                      <span className="mt-0.5 block text-[13px] text-fg-sub">{description}</span>
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
          <section aria-label="채널 연동">
            <h1 className="text-2xl font-bold leading-tight">채널을 연동해주세요</h1>
            <p className="mt-1 text-[15px] text-fg-sub">
              연동한 채널의 지표를 한 화면에서 모아 볼 수 있어요.
            </p>
            <div className="mt-6 space-y-2">
              {CHANNELS.map((channel) => (
                <div
                  key={channel}
                  className="flex items-center justify-between gap-3 rounded-card border border-line bg-overlay p-4"
                >
                  <div className="flex items-center gap-3">
                    <AppIconTile app={channel} size={38} />
                    <ChannelBadge channel={channel} />
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-fg-faint">앱 심사 후 활성화</span>
                    <Button type="button" variant="secondary" size="sm" disabled>
                      연동하기
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            {/* 인스타그램 비즈니스/크리에이터 계정 필수 안내 (PRD 2.2) */}
            <div className="mt-3 flex items-start gap-2.5 rounded-card bg-warning-weak p-3.5">
              <Info className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
              <p className="text-[13px] leading-relaxed text-fg-sub">
                인스타그램은 비즈니스/크리에이터 계정만 연동할 수 있어요. 개인 계정이라면 앱에서 전환 후
                진행해주세요
              </p>
            </div>
            <div className="mt-6 flex justify-between">
              <Button variant="secondary" onClick={() => setStep(1)}>
                이전
              </Button>
              <Button onClick={() => setStep(3)}>다음</Button>
            </div>
          </section>
        ) : null}

        {step === 3 ? (
          <section aria-label="온보딩 완료" className="flex flex-col items-center py-8 text-center">
            <FinchMark className="size-16 text-primary" />
            <h1 className="mt-5 text-2xl font-bold leading-tight">준비 완료!</h1>
            <p className="mt-2 max-w-sm text-[15px] text-fg-sub">
              핀치가 준비됐어요. 지금은 데모 데이터로 대시보드를 둘러볼 수 있어요.
            </p>
            <ButtonLink href="/dashboard" size="lg" className="mt-8">
              대시보드로 가기
            </ButtonLink>
          </section>
        ) : null}
      </div>
    </div>
  );
}
