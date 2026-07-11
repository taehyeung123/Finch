"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, Lock, Pause, Play, Upload } from "lucide-react";
import { cn } from "@/lib/cn";
import { PageHeader } from "@/components/ui/section-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { formatKRW } from "@/lib/format";
import { campaigns } from "@/lib/data";
import type { AdCampaign } from "@/lib/types";

const STEPS = ["목표 선택", "타겟팅", "예산", "소재 업로드", "게재"];

const OBJECTIVES = [
  { value: "conversion", label: "전환", description: "구매·가입 등 전환 행동을 유도합니다" },
  { value: "reach", label: "도달", description: "더 많은 사람에게 브랜드를 노출합니다" },
  { value: "traffic", label: "트래픽", description: "웹사이트·프로필 방문을 늘립니다" },
  { value: "engagement", label: "참여", description: "좋아요·댓글·공유를 확대합니다" },
];

const AGE_OPTIONS = ["전체 연령", "18~24세", "25~34세", "35~44세", "45세 이상"];
const REGION_OPTIONS = ["대한민국 전체", "서울", "수도권(서울·경기·인천)", "부산·경남", "대구·경북", "그 외 지역"];

const STATUS_BADGE: Record<AdCampaign["status"], { tone: "positive" | "warning" | "neutral"; label: string }> = {
  active: { tone: "positive", label: "진행 중" },
  paused: { tone: "warning", label: "일시정지" },
  ended: { tone: "neutral", label: "종료" },
};

const fieldLabel = "block text-[13px] font-medium text-fg-sub";
const fieldInput =
  "mt-1.5 h-10 w-full rounded-card border border-line bg-overlay px-3 text-[14px] text-fg focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2";

export default function CampaignsPage() {
  const [step, setStep] = useState(0);
  const [objective, setObjective] = useState("conversion");
  const [age, setAge] = useState(AGE_OPTIONS[0]);
  const [region, setRegion] = useState(REGION_OPTIONS[0]);
  const [budget, setBudget] = useState("100000");
  const [statuses, setStatuses] = useState<Record<string, AdCampaign["status"]>>(() =>
    Object.fromEntries(campaigns.map((c) => [c.id, c.status])),
  );

  const toggleStatus = (id: string) => {
    setStatuses((prev) => ({
      ...prev,
      [id]: prev[id] === "active" ? "paused" : "active",
    }));
  };

  const selectedObjective = OBJECTIVES.find((o) => o.value === objective);
  const budgetNumber = Number(budget) || 0;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="캠페인 관리"
        description="새 캠페인을 만들고 기존 캠페인을 관리하세요."
        action={
          <ButtonLink href="/ads" size="sm" variant="ghost">
            <ArrowLeft className="size-4" aria-hidden />
            광고 관리로
          </ButtonLink>
        }
      />

      {/* 캠페인 생성 마법사 목업 (PART 4.7) */}
      <Card>
        <CardHeader title="새 캠페인 만들기" description="5단계로 캠페인을 구성합니다" />
        <CardBody className="space-y-6">
          {/* 스텝퍼 */}
          <ol className="flex flex-wrap items-center gap-2" aria-label="캠페인 생성 단계">
            {STEPS.map((label, i) => (
              <li key={label} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setStep(i)}
                  aria-current={i === step ? "step" : undefined}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-chip px-3 py-1.5 text-[13px] font-semibold transition-colors",
                    i === step
                      ? "bg-primary text-on-primary"
                      : i < step
                        ? "bg-primary-weak text-primary"
                        : "bg-overlay text-fg-faint border border-line hover:border-line-strong hover:text-fg-sub",
                  )}
                >
                  <span className="tnum">{i + 1}</span>
                  {label}
                </button>
                {i < STEPS.length - 1 ? (
                  <span className="h-px w-4 bg-line" aria-hidden />
                ) : null}
              </li>
            ))}
          </ol>

          {/* 단계별 목 폼 */}
          {step === 0 ? (
            <fieldset>
              <legend className={fieldLabel}>캠페인 목표를 선택하세요</legend>
              <div role="radiogroup" aria-label="캠페인 목표" className="mt-2 grid gap-3 sm:grid-cols-2">
                {OBJECTIVES.map((o) => {
                  const active = o.value === objective;
                  return (
                    <button
                      key={o.value}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setObjective(o.value)}
                      className={cn(
                        "rounded-card border p-4 text-left transition-colors",
                        active
                          ? "border-primary bg-primary-weak"
                          : "border-line bg-overlay hover:border-line-strong",
                      )}
                    >
                      <p className={cn("text-[15px] font-semibold", active ? "text-primary" : "text-fg")}>
                        {o.label}
                      </p>
                      <p className="mt-1 text-[13px] text-fg-sub">{o.description}</p>
                    </button>
                  );
                })}
              </div>
            </fieldset>
          ) : null}

          {step === 1 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="target-age" className={fieldLabel}>
                  연령
                </label>
                <select
                  id="target-age"
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  className={fieldInput}
                >
                  {AGE_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="target-region" className={fieldLabel}>
                  지역
                </label>
                <select
                  id="target-region"
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                  className={fieldInput}
                >
                  {REGION_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
              <p className="text-xs text-fg-faint sm:col-span-2">
                상세 타겟팅(관심사·행동 기반)은 Meta 연동 후 제공됩니다.
              </p>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="max-w-sm">
              <label htmlFor="daily-budget" className={fieldLabel}>
                일 예산
              </label>
              <div className="relative">
                <input
                  id="daily-budget"
                  type="number"
                  inputMode="numeric"
                  min={10000}
                  step={10000}
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  className={cn(fieldInput, "tnum pr-10")}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-fg-faint">
                  원
                </span>
              </div>
              <p className="mt-2 text-xs text-fg-faint">
                일 예산 기준이며 실제 집행액은 게재 상황에 따라 달라질 수 있습니다.
              </p>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-card border border-dashed border-line px-6 py-14 text-center">
              <Upload className="size-8 text-fg-faint" aria-hidden />
              <p className="text-[15px] font-semibold text-fg-sub">
                이미지 또는 영상을 끌어다 놓으세요
              </p>
              <p className="text-[13px] text-fg-faint">지원 형식: JPG · PNG · MP4</p>
              <Button variant="secondary" size="sm" className="mt-3">
                파일 선택
              </Button>
            </div>
          ) : null}

          {step === 4 ? (
            <div className="space-y-4">
              <div className="grid gap-3 rounded-card border border-line p-4 text-[14px] sm:grid-cols-3">
                <div>
                  <p className="text-xs text-fg-faint">목표</p>
                  <p className="mt-0.5 font-semibold">{selectedObjective?.label}</p>
                </div>
                <div>
                  <p className="text-xs text-fg-faint">타겟</p>
                  <p className="mt-0.5 font-semibold">
                    {age} · {region}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-fg-faint">일 예산</p>
                  <p className="tnum mt-0.5 font-semibold">{formatKRW(budgetNumber)}</p>
                </div>
              </div>

              <div className="flex flex-wrap items-start gap-3 rounded-card border border-line bg-overlay p-4">
                <Lock className="mt-0.5 size-4 shrink-0 text-fg-faint" aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="primary">예정</Badge>
                    <p className="text-[14px] font-semibold">게재는 아직 준비 중입니다</p>
                  </div>
                  <p className="mt-1 text-[13px] leading-relaxed text-fg-sub">
                    캠페인 생성·수정은 Meta Advanced Access 심사 완료 후 활성화됩니다 (Phase 3 예정).
                  </p>
                </div>
                <Button disabled aria-disabled>
                  게재하기
                </Button>
              </div>
            </div>
          ) : null}

          {/* 이전/다음 */}
          <div className="flex items-center justify-between border-t border-line pt-4">
            <Button
              variant="secondary"
              size="sm"
              disabled={step === 0}
              onClick={() => setStep((s) => Math.max(0, s - 1))}
            >
              <ArrowLeft className="size-4" aria-hidden />
              이전
            </Button>
            {step < STEPS.length - 1 ? (
              <Button size="sm" onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}>
                다음
                <ArrowRight className="size-4" aria-hidden />
              </Button>
            ) : null}
          </div>
        </CardBody>
      </Card>

      {/* 기존 캠페인 목록 — 일시정지/재개 토글 (목) */}
      <Card>
        <CardHeader title="기존 캠페인" description="상태 변경은 목 동작이며 저장되지 않습니다" />
        <CardBody className="space-y-3">
          {campaigns.map((c) => {
            const current = statuses[c.id];
            const status = STATUS_BADGE[current];
            return (
              <div
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line p-4"
              >
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-semibold">{c.name}</p>
                  <p className="tnum mt-0.5 text-[13px] text-fg-sub">
                    일 예산 {formatKRW(c.dailyBudget)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge tone={status.tone}>
                    <span className="size-1.5 rounded-full bg-current" aria-hidden />
                    {status.label}
                  </Badge>
                  {current !== "ended" ? (
                    <Button variant="secondary" size="sm" onClick={() => toggleStatus(c.id)}>
                      {current === "active" ? (
                        <>
                          <Pause className="size-4" aria-hidden />
                          일시정지
                        </>
                      ) : (
                        <>
                          <Play className="size-4" aria-hidden />
                          재개
                        </>
                      )}
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </CardBody>
      </Card>
    </div>
  );
}
