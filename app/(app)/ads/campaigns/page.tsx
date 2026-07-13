"use client";

import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Bird,
  Check,
  ChevronRight,
  Heart,
  Image as ImageIcon,
  ImagePlus,
  Lock,
  Megaphone,
  MousePointerClick,
  Pause,
  Play,
  Radio,
  ShoppingCart,
  Upload,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { PageHeader } from "@/components/ui/section-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { ChipFilter } from "@/components/ui/chip-filter";
import { InfoTip } from "@/components/ui/info-tip";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCompact, formatDate, formatKRW } from "@/lib/format";
import { campaigns } from "@/lib/data";
import type { AdCampaign } from "@/lib/types";
import { NATIONWIDE, regionWeight, summarizeRegionPicks, type RegionPick } from "@/lib/geo/kr-regions";
import { RegionPicker } from "./_components/region-picker";
import { InterestPicker } from "./_components/interest-picker";

/* ---------------------------------- 상수 ---------------------------------- */

const STEPS = ["캠페인 목표", "타겟팅", "예산·일정", "소재", "검토·게재"];

const OBJECTIVES: { value: string; label: string; description: string; icon: LucideIcon }[] = [
  { value: "sales", label: "판매(전환)", description: "구매·장바구니 등 전환 행동을 유도합니다", icon: ShoppingCart },
  { value: "traffic", label: "트래픽", description: "웹사이트·프로필 방문을 늘립니다", icon: MousePointerClick },
  { value: "awareness", label: "도달·인지도", description: "더 많은 사람에게 브랜드를 노출합니다", icon: Radio },
  { value: "engagement", label: "참여", description: "좋아요·댓글·공유를 확대합니다", icon: Heart },
];

/*
  연령 — Meta와 동일한 연속 범위(최소~최대) 방식.
  Meta API의 targeting은 age_min/age_max 범위 하나만 받으므로 비연속 다중 선택은 표현 불가.
  65는 "65세 이상"을 의미한다 (Meta age_max=65 동일).
*/
const AGE_MIN_FLOOR = 13;
const AGE_MAX_CEIL = 65;
const AGE_OPTIONS = Array.from({ length: AGE_MAX_CEIL - AGE_MIN_FLOOR + 1 }, (_, i) => AGE_MIN_FLOOR + i);

const GENDER_OPTIONS = [
  { value: "전체", label: "전체" },
  { value: "남성", label: "남성" },
  { value: "여성", label: "여성" },
] as const;

/* 지역 데이터·가중치는 lib/geo/kr-regions.ts — 시·도 → 시·군·구 2단계 (Meta 지역 타겟팅과 동일 체계) */

const PLACEMENT_OPTIONS = ["Instagram 피드", "스토리", "릴스", "탐색 탭", "Facebook 피드"];

const CTA_OPTIONS = ["더 알아보기", "구매하기", "가입하기", "문의하기", "다운로드", "예약하기", "메시지 보내기"];

/* Meta 최소 예산 정책 근사치 (KRW) — 실연동 시 계정 통화·과금 방식 기준 값으로 교체 */
const MIN_DAILY_BUDGET = 5000;
const MIN_TOTAL_BUDGET = 50000;

/** 예상 도달 목 계산의 기준 모수 — 국내 SNS 이용자 규모 가정치 */
const BASE_AUDIENCE = 27_000_000;

const STATUS_BADGE: Record<AdCampaign["status"], { tone: "positive" | "warning" | "neutral"; label: string }> = {
  active: { tone: "positive", label: "진행 중" },
  paused: { tone: "warning", label: "일시정지" },
  ended: { tone: "neutral", label: "종료" },
};

const fieldLabel = "block text-[13px] font-medium text-fg-sub";
const fieldInput =
  "mt-1.5 h-10 w-full rounded-card border border-line bg-overlay px-3 text-[14px] text-fg placeholder:text-fg-faint focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 disabled:opacity-40";

/* ------------------------------ 로컬 UI 조각 ------------------------------ */

/** 다중 선택 체크 칩 — 선택 시 코랄 배경 + 다크 텍스트 */
function ToggleChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-chip border px-3.5 py-1.5 text-[13px] font-semibold transition-colors",
        active
          ? "border-transparent bg-primary text-on-primary"
          : "border-line bg-overlay text-fg-sub hover:border-line-strong hover:text-fg",
      )}
    >
      {active ? <Check className="size-3.5" aria-hidden /> : null}
      {children}
    </button>
  );
}

/** 라디오 알약 — 예산 유형·게재 시간대 선택용 */
function RadioPill({
  name,
  checked,
  disabled,
  onChange,
  children,
}: {
  name: string;
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
  children: React.ReactNode;
}) {
  return (
    <label
      className={cn(
        "flex items-center gap-2 rounded-card border px-4 py-2.5 text-[14px] transition-colors",
        checked ? "border-primary bg-primary-weak font-semibold text-primary" : "border-line bg-overlay text-fg-sub",
        disabled ? "pointer-events-none opacity-40" : "cursor-pointer hover:border-line-strong",
      )}
    >
      <input
        type="radio"
        name={name}
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        className="sr-only"
      />
      <span
        className={cn(
          "size-2 rounded-chip",
          checked ? "bg-primary" : "border border-line-strong bg-overlay",
        )}
        aria-hidden
      />
      {children}
    </label>
  );
}

/** 미리보기 스켈레톤 바 — 미입력 필드 자리 표시 */
function SkeletonBar({ className }: { className?: string }) {
  return <span className={cn("block rounded-chip bg-overlay", className)} aria-hidden />;
}

/* --------------------------------- 페이지 --------------------------------- */

export default function CampaignsPage() {
  /* 마법사 이동 */
  const [step, setStep] = useState(0);
  const [maxStep, setMaxStep] = useState(0);

  /* 1단계 — 목표 */
  const [objective, setObjective] = useState("sales");

  /* 2단계 — 타겟팅 */
  const [ageMin, setAgeMin] = useState(18);
  const [ageMax, setAgeMax] = useState(AGE_MAX_CEIL);
  const [gender, setGender] = useState<(typeof GENDER_OPTIONS)[number]["value"]>("전체");
  const [regions, setRegions] = useState<RegionPick[]>([NATIONWIDE]);
  const [interests, setInterests] = useState<string[]>([]);
  const [autoPlacement, setAutoPlacement] = useState(true);
  const [placements, setPlacements] = useState<string[]>([]);

  /* 3단계 — 예산·일정 */
  const [budgetType, setBudgetType] = useState<"daily" | "total">("daily");
  const [amount, setAmount] = useState("50000"); // 숫자만 저장
  const [startDate, setStartDate] = useState("2026-07-15");
  const [endDate, setEndDate] = useState("2026-08-14");
  const [noEndDate, setNoEndDate] = useState(false);
  const [scheduleType, setScheduleType] = useState<"always" | "specific">("always");
  const [scheduleStart, setScheduleStart] = useState(9);
  const [scheduleEnd, setScheduleEnd] = useState(21);

  /* 4단계 — 소재 */
  const [headline, setHeadline] = useState("");
  const [description, setDescription] = useState("");
  const [cta, setCta] = useState(CTA_OPTIONS[0]);
  const [landingUrl, setLandingUrl] = useState("");

  /* 기존 캠페인 목록 상태 토글 (목) */
  const [statuses, setStatuses] = useState<Record<string, AdCampaign["status"]>>(() =>
    Object.fromEntries(campaigns.map((c) => [c.id, c.status])),
  );

  const goToStep = (i: number) => {
    setStep(i);
    setMaxStep((m) => Math.max(m, i));
  };

  const togglePlacement = (label: string) =>
    setPlacements((prev) => (prev.includes(label) ? prev.filter((p) => p !== label) : [...prev, label]));

  const toggleStatus = (id: string) =>
    setStatuses((prev) => ({ ...prev, [id]: prev[id] === "active" ? "paused" : "active" }));

  /*
    18세 미만 포함 시 Meta 정책 제한 — 성별·관심사 타겟팅 불가 (나이+위치만 허용).
    UI 잠금과 별개로 파생 값으로도 강제해 요약·도달 계산이 항상 정책을 따르게 한다.
  */
  const includesMinors = ageMin < 18;
  const effectiveGender = includesMinors ? "전체" : gender;
  const effectiveInterests = includesMinors ? [] : interests;

  /* 예상 도달 목 추정치 — 연령 범위 폭 x 지역 인구 비중(시·군·구 반영) 기반 간단 계산 */
  const ageSpan = (ageMax === AGE_MAX_CEIL ? 70 : ageMax) - ageMin + 1; // 65는 "65세 이상"으로 취급
  const ageFraction = Math.min(ageSpan / (70 - AGE_MIN_FLOOR + 1), 1);
  const selectedRegionWeight = regionWeight(regions);
  const placementFactor = autoPlacement ? 1 : placements.length / PLACEMENT_OPTIONS.length;
  const estimatedReach = Math.round(
    BASE_AUDIENCE * ageFraction * selectedRegionWeight * (effectiveGender === "전체" ? 1 : 0.5) * placementFactor,
  );

  const selectedObjective = OBJECTIVES.find((o) => o.value === objective) ?? OBJECTIVES[0];
  const amountNumber = Number(amount) || 0;

  /* 총 예산은 종료일 필수 (Meta: 무기한 게재는 일 예산에서만 가능) — 파생 값으로 강제 */
  const effectiveNoEndDate = budgetType === "daily" && noEndDate;
  const minBudget = budgetType === "daily" ? MIN_DAILY_BUDGET : MIN_TOTAL_BUDGET;

  /* 단계별 필수값 검증 — 부족하면 다음 버튼을 잠그고 인라인으로 안내 (감사 1차 반영) */
  const stepIssues: string[] = (() => {
    if (step === 1) {
      const issues: string[] = [];
      if (regions.length === 0) issues.push("지역을 선택하세요");
      if (!autoPlacement && placements.length === 0) issues.push("노출 위치를 선택하거나 자동 배치를 켜세요");
      return issues;
    }
    if (step === 2) {
      const issues: string[] = [];
      if (amountNumber < minBudget)
        issues.push(`${budgetType === "daily" ? "일" : "총"} 예산은 최소 ${formatKRW(minBudget)} 이상이어야 해요`);
      if (!startDate) issues.push("시작일을 선택하세요");
      if (!effectiveNoEndDate) {
        if (!endDate) issues.push("종료일을 선택하세요");
        else if (startDate && endDate < startDate) issues.push("종료일이 시작일보다 빠를 수 없어요");
      }
      if (budgetType === "total" && scheduleType === "specific" && scheduleEnd <= scheduleStart)
        issues.push("게재 종료 시각은 시작 시각보다 늦어야 해요");
      return issues;
    }
    if (step === 3) {
      const issues: string[] = [];
      if (headline.trim() === "") issues.push("광고 제목을 입력하세요");
      if (landingUrl.trim() !== "" && !/^https?:\/\/.+\..+/.test(landingUrl.trim()))
        issues.push("랜딩 URL 형식이 올바르지 않아요 (https://로 시작)");
      if (landingUrl.trim() === "") issues.push("랜딩 URL을 입력하세요");
      return issues;
    }
    return [];
  })();
  const canProceed = stepIssues.length === 0;
  const agesLabel = `${ageMin}세 ~ ${ageMax === AGE_MAX_CEIL ? "65세 이상" : `${ageMax}세`}`;
  const regionsLabel = summarizeRegionPicks(regions);
  const placementsLabel = autoPlacement
    ? "자동 배치"
    : placements.length > 0
      ? PLACEMENT_OPTIONS.filter((p) => placements.includes(p)).join(" · ")
      : "미선택";
  const scheduleLabel =
    budgetType === "daily" || scheduleType === "always"
      ? "항상 게재"
      : `${scheduleStart}시 ~ ${scheduleEnd}시`;

  /* 5단계 요약 — 각 항목의 수정 버튼이 해당 단계로 이동 */
  const summarySections: { title: string; step: number; lines: string[] }[] = [
    { title: "캠페인 목표", step: 0, lines: [selectedObjective.label] },
    {
      title: "타겟",
      step: 1,
      lines: [
        `연령 ${agesLabel}`,
        `성별 ${effectiveGender}${includesMinors ? " (18세 미만 포함 — 고정)" : ""}`,
        `지역 ${regionsLabel}`,
        `관심사 ${includesMinors ? "사용 불가 (18세 미만 포함)" : effectiveInterests.length > 0 ? effectiveInterests.join(" · ") : "없음"}`,
        `노출 위치 ${placementsLabel}`,
      ],
    },
    {
      title: "예산·일정",
      step: 2,
      lines: [
        `${budgetType === "daily" ? "일" : "총"} 예산 ${formatKRW(amountNumber)}`,
        `${startDate ? formatDate(startDate) : "시작일 미정"} ~ ${
          effectiveNoEndDate ? "종료일 없이 계속 게재" : endDate ? formatDate(endDate) : "종료일 미정"
        }`,
        `게재 시간 ${scheduleLabel}`,
      ],
    },
    {
      title: "소재",
      step: 3,
      lines: [
        `제목 ${headline || "미입력"}`,
        `본문 ${description ? (description.length > 40 ? `${description.slice(0, 40)}…` : description) : "미입력"}`,
        `CTA ${cta}`,
        `랜딩 ${landingUrl || "미입력"}`,
      ],
    },
  ];

  const previewBody = description.length > 125 ? description.slice(0, 125) : description;

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

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* ---------------- 구성 1 — 캠페인 생성 마법사 ---------------- */}
        <Card>
          <CardHeader title="새 캠페인 만들기" description="5단계로 캠페인을 구성합니다" />
          <CardBody className="space-y-6">
            {/* 스텝퍼 — 완료(방문)한 단계는 클릭으로 되돌아가기 */}
            <ol className="flex flex-wrap items-center gap-2" aria-label="캠페인 생성 단계">
              {STEPS.map((label, i) => {
                const visited = i <= maxStep;
                return (
                  <li key={label} className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={!visited}
                      onClick={() => visited && setStep(i)}
                      aria-current={i === step ? "step" : undefined}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-chip px-3 py-1.5 text-[13px] font-semibold transition-colors",
                        i === step
                          ? "bg-primary text-on-primary"
                          : visited
                            ? "bg-primary-weak text-primary hover:bg-primary-weak"
                            : "border border-line bg-overlay text-fg-faint",
                      )}
                    >
                      {visited && i < step ? (
                        <Check className="size-3.5" aria-hidden />
                      ) : (
                        <span className="tnum">{i + 1}</span>
                      )}
                      {label}
                    </button>
                    {i < STEPS.length - 1 ? <span className="h-px w-3 bg-line" aria-hidden /> : null}
                  </li>
                );
              })}
            </ol>

            {/* ---------- 1단계 캠페인 목표 ---------- */}
            {step === 0 ? (
              <fieldset>
                <legend className={fieldLabel}>캠페인 목표를 선택하세요</legend>
                <div role="radiogroup" aria-label="캠페인 목표" className="mt-2 grid gap-3 sm:grid-cols-2">
                  {OBJECTIVES.map((o) => {
                    const active = o.value === objective;
                    const Icon = o.icon;
                    return (
                      <button
                        key={o.value}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => setObjective(o.value)}
                        className={cn(
                          "rounded-card border p-4 text-left transition-colors",
                          active ? "border-primary bg-primary-weak" : "border-line bg-overlay hover:border-line-strong",
                        )}
                      >
                        <span
                          className={cn(
                            "flex size-9 items-center justify-center rounded-card",
                            active ? "bg-primary text-on-primary" : "bg-body text-fg-sub",
                          )}
                        >
                          <Icon className="size-4.5" aria-hidden />
                        </span>
                        <p className={cn("mt-3 text-[15px] font-semibold", active ? "text-primary" : "text-fg")}>
                          {o.label}
                        </p>
                        <p className="mt-1 text-[13px] text-fg-sub">{o.description}</p>
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            ) : null}

            {/* ---------- 2단계 타겟팅 ---------- */}
            {step === 1 ? (
              <div className="space-y-5">
                <div>
                  <p className={fieldLabel}>연령</p>
                  <div className="mt-2 flex items-center gap-2">
                    <select
                      aria-label="최소 연령"
                      value={ageMin}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setAgeMin(v);
                        if (v > ageMax) setAgeMax(v);
                      }}
                      className="tnum h-10 rounded-card border border-line bg-overlay px-3 text-[14px] font-medium text-fg outline-none transition-colors hover:border-line-strong focus-visible:outline-2 focus-visible:outline-primary"
                    >
                      {AGE_OPTIONS.map((a) => (
                        <option key={a} value={a}>
                          {a}세
                        </option>
                      ))}
                    </select>
                    <span className="text-fg-faint">~</span>
                    <select
                      aria-label="최대 연령"
                      value={ageMax}
                      onChange={(e) => setAgeMax(Number(e.target.value))}
                      className="tnum h-10 rounded-card border border-line bg-overlay px-3 text-[14px] font-medium text-fg outline-none transition-colors hover:border-line-strong focus-visible:outline-2 focus-visible:outline-primary"
                    >
                      {AGE_OPTIONS.filter((a) => a >= ageMin).map((a) => (
                        <option key={a} value={a}>
                          {a === AGE_MAX_CEIL ? "65세 이상" : `${a}세`}
                        </option>
                      ))}
                    </select>
                  </div>
                  <p className="mt-1.5 text-xs text-fg-faint">
                    Meta와 동일한 연속 범위 방식이에요 — 입력한 그대로 광고세트에 적용됩니다.
                  </p>
                  {includesMinors ? (
                    <p className="mt-2 rounded-card bg-warning-weak p-3 text-[13px] leading-relaxed text-warning">
                      18세 미만이 포함되면 Meta 정책에 따라 성별·관심사 타겟팅이 잠기고 나이와
                      위치로만 타겟팅됩니다.
                    </p>
                  ) : null}
                </div>

                <div>
                  <p className={fieldLabel}>성별</p>
                  {includesMinors ? (
                    <p className="mt-2 inline-flex items-center gap-2 rounded-card border border-line bg-overlay px-3.5 py-2 text-[14px] text-fg-faint">
                      <Lock className="size-3.5" aria-hidden />
                      전체 — 18세 미만 포함 시 고정 (Meta 정책)
                    </p>
                  ) : (
                    <ChipFilter
                      className="mt-2"
                      options={GENDER_OPTIONS.map((g) => ({ value: g.value, label: g.label }))}
                      value={gender}
                      onChange={setGender}
                    />
                  )}
                </div>

                <div>
                  <p className={fieldLabel}>지역 (시·군·구까지 다중 선택)</p>
                  <div className="mt-2">
                    <RegionPicker value={regions} onChange={setRegions} />
                  </div>
                </div>

                <div>
                  <p className={fieldLabel}>상세 타겟팅 (관심사)</p>
                  {includesMinors ? (
                    <p className="mt-2 inline-flex items-center gap-2 rounded-card border border-line bg-overlay px-3.5 py-2 text-[14px] text-fg-faint">
                      <Lock className="size-3.5" aria-hidden />
                      18세 미만 포함 시 사용할 수 없어요 (Meta 정책 — 나이·위치만 허용)
                    </p>
                  ) : (
                    <div className="mt-2">
                      <InterestPicker value={interests} onChange={setInterests} />
                    </div>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className={fieldLabel}>노출 위치</p>
                      <p className="mt-0.5 text-xs text-fg-faint">
                        자동 배치(권장) — Meta가 성과 좋은 위치에 자동으로 노출합니다
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={autoPlacement}
                      aria-label="자동 배치"
                      onClick={() => setAutoPlacement((v) => !v)}
                      className={cn(
                        "relative h-6 w-11 shrink-0 rounded-chip border transition-colors",
                        autoPlacement ? "border-transparent bg-primary" : "border-line bg-overlay",
                      )}
                    >
                      <span
                        className={cn(
                          "absolute top-1/2 size-4 -translate-y-1/2 rounded-chip border border-line bg-body transition-all",
                          autoPlacement ? "left-6" : "left-1",
                        )}
                        aria-hidden
                      />
                    </button>
                  </div>
                  {!autoPlacement ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {PLACEMENT_OPTIONS.map((p) => (
                        <ToggleChip key={p} active={placements.includes(p)} onClick={() => togglePlacement(p)}>
                          {p}
                        </ToggleChip>
                      ))}
                    </div>
                  ) : null}
                </div>

                {/* 예상 도달 — 목 추정치 */}
                <div className="flex items-start gap-3 rounded-card border border-line bg-overlay p-4">
                  <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-card bg-primary-weak text-primary">
                    <Users className="size-4.5" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-[13px] font-medium text-fg-sub">
                      예상 도달 규모
                      <InfoTip>
                        선택한 타겟 조건 기반 핀치 자체 추정치이며 실제 도달과 다를 수 있습니다.
                      </InfoTip>
                    </p>
                    {estimatedReach > 0 ? (
                      <p className="tnum mt-0.5 text-lg font-bold">
                        약 {formatCompact(Math.round(estimatedReach * 0.75))}~
                        {formatCompact(Math.round(estimatedReach * 1.25))}명
                      </p>
                    ) : (
                      <p className="mt-0.5 text-[14px] text-fg-faint">
                        연령대·지역·노출 위치를 선택하면 예상 도달이 표시됩니다.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ) : null}

            {/* ---------- 3단계 예산·일정 ---------- */}
            {step === 2 ? (
              <div className="space-y-5">
                <fieldset>
                  <legend className={fieldLabel}>예산 유형</legend>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <RadioPill name="budget-type" checked={budgetType === "daily"} onChange={() => setBudgetType("daily")}>
                      일 예산
                    </RadioPill>
                    <RadioPill name="budget-type" checked={budgetType === "total"} onChange={() => setBudgetType("total")}>
                      총 예산
                    </RadioPill>
                  </div>
                </fieldset>

                <div className="max-w-sm">
                  <label htmlFor="budget-amount" className={fieldLabel}>
                    {budgetType === "daily" ? "일 예산 금액" : "총 예산 금액"}
                  </label>
                  <div className="relative">
                    <input
                      id="budget-amount"
                      type="text"
                      inputMode="numeric"
                      value={amountNumber > 0 ? amountNumber.toLocaleString("ko-KR") : ""}
                      onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))}
                      placeholder="50,000"
                      className={cn(fieldInput, "tnum pr-10")}
                    />
                    <span className="absolute right-3 top-1/2 mt-0.5 -translate-y-1/2 text-[13px] text-fg-faint">
                      원
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs text-fg-faint">
                    실제 집행액은 게재 상황에 따라 달라질 수 있습니다.
                  </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="start-date" className={fieldLabel}>
                      시작일
                    </label>
                    <input
                      id="start-date"
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className={cn(fieldInput, "tnum")}
                    />
                  </div>
                  <div>
                    <label htmlFor="end-date" className={fieldLabel}>
                      종료일
                    </label>
                    <input
                      id="end-date"
                      type="date"
                      value={endDate}
                      min={startDate || undefined}
                      disabled={effectiveNoEndDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className={cn(fieldInput, "tnum")}
                    />
                    <label
                      className={cn(
                        "mt-2 flex items-center gap-2 text-[13px]",
                        budgetType === "total" ? "cursor-not-allowed text-fg-faint" : "cursor-pointer text-fg-sub",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={effectiveNoEndDate}
                        disabled={budgetType === "total"}
                        onChange={(e) => setNoEndDate(e.target.checked)}
                        className="size-4 accent-primary"
                      />
                      종료일 없이 계속 게재
                    </label>
                    {budgetType === "total" ? (
                      <p className="mt-1 text-xs text-fg-faint">총 예산 캠페인은 종료일이 필수예요 (Meta 정책)</p>
                    ) : null}
                  </div>
                </div>

                <fieldset>
                  <legend className={fieldLabel}>게재 시간대</legend>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <RadioPill
                      name="schedule-type"
                      checked={budgetType === "daily" || scheduleType === "always"}
                      disabled={budgetType === "daily"}
                      onChange={() => setScheduleType("always")}
                    >
                      항상 게재
                    </RadioPill>
                    <RadioPill
                      name="schedule-type"
                      checked={budgetType === "total" && scheduleType === "specific"}
                      disabled={budgetType === "daily"}
                      onChange={() => setScheduleType("specific")}
                    >
                      특정 시간대만
                    </RadioPill>
                  </div>
                  {budgetType === "daily" ? (
                    <p className="mt-1.5 text-xs text-fg-faint">
                      시간대 지정 게재는 총 예산 캠페인에서만 지원됩니다 (Meta 정책).
                    </p>
                  ) : null}
                  {budgetType === "total" && scheduleType === "specific" ? (
                    <div className="mt-3 flex max-w-sm items-center gap-2">
                      <label htmlFor="schedule-start" className="sr-only">
                        시작 시간
                      </label>
                      <select
                        id="schedule-start"
                        value={scheduleStart}
                        onChange={(e) => setScheduleStart(Number(e.target.value))}
                        className={cn(fieldInput, "tnum mt-0")}
                      >
                        {Array.from({ length: 24 }, (_, h) => (
                          <option key={h} value={h}>
                            {h}시
                          </option>
                        ))}
                      </select>
                      <span className="shrink-0 text-[13px] text-fg-faint">부터</span>
                      <label htmlFor="schedule-end" className="sr-only">
                        종료 시간
                      </label>
                      <select
                        id="schedule-end"
                        value={scheduleEnd}
                        onChange={(e) => setScheduleEnd(Number(e.target.value))}
                        className={cn(fieldInput, "tnum mt-0")}
                      >
                        {Array.from({ length: 24 }, (_, h) => (
                          <option key={h} value={h}>
                            {h}시
                          </option>
                        ))}
                      </select>
                      <span className="shrink-0 text-[13px] text-fg-faint">까지</span>
                    </div>
                  ) : null}
                </fieldset>
              </div>
            ) : null}

            {/* ---------- 4단계 소재 ---------- */}
            {step === 3 ? (
              <div className="space-y-5">
                <div>
                  <div className="flex flex-col items-center justify-center gap-2 rounded-card border border-dashed border-line px-6 py-10 text-center">
                    <Upload className="size-8 text-fg-faint" aria-hidden />
                    <p className="text-[15px] font-semibold text-fg-sub">이미지 또는 영상을 끌어다 놓으세요</p>
                    <p className="text-[13px] text-fg-faint">1:1 또는 4:5 비율 · JPG · PNG · MP4 · 최대 30MB</p>
                    <Button variant="secondary" size="sm" className="mt-2">
                      파일 선택
                    </Button>
                  </div>
                  <div className="mt-3 flex items-center gap-3 rounded-card border border-dashed border-line px-4 py-3">
                    <ImagePlus className="size-5 shrink-0 text-fg-faint" aria-hidden />
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-fg-sub">영상 썸네일 업로드</p>
                      <p className="text-xs text-fg-faint">영상 소재는 썸네일을 함께 올려주세요 (JPG · PNG)</p>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="flex items-baseline justify-between">
                    <label htmlFor="ad-headline" className={fieldLabel}>
                      광고 제목
                    </label>
                    <span className="tnum text-xs text-fg-faint">{headline.length}/40</span>
                  </div>
                  <input
                    id="ad-headline"
                    type="text"
                    maxLength={40}
                    value={headline}
                    onChange={(e) => setHeadline(e.target.value)}
                    placeholder="예: 여름 한정 세럼 — 첫 구매 30%"
                    className={fieldInput}
                  />
                </div>

                <div>
                  <div className="flex items-baseline justify-between">
                    <label htmlFor="ad-description" className={fieldLabel}>
                      본문 설명
                    </label>
                    <span className={cn("tnum text-xs", description.length > 125 ? "text-warning" : "text-fg-faint")}>
                      {description.length}/300
                    </span>
                  </div>
                  <textarea
                    id="ad-description"
                    rows={3}
                    maxLength={300}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="제품·혜택을 소개하는 본문을 입력하세요"
                    className={cn(fieldInput, "h-auto py-2.5 leading-relaxed")}
                  />
                  <p className="mt-1 text-xs text-fg-faint">125자 이내 권장 — 이후는 더보기로 접힘</p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="ad-cta" className={fieldLabel}>
                      CTA 버튼
                    </label>
                    <select id="ad-cta" value={cta} onChange={(e) => setCta(e.target.value)} className={fieldInput}>
                      {CTA_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="ad-landing" className={fieldLabel}>
                      랜딩 URL
                    </label>
                    <input
                      id="ad-landing"
                      type="url"
                      value={landingUrl}
                      onChange={(e) => setLandingUrl(e.target.value)}
                      placeholder="https://"
                      className={fieldInput}
                    />
                  </div>
                </div>
              </div>
            ) : null}

            {/* ---------- 5단계 검토·게재 ---------- */}
            {step === 4 ? (
              <div className="space-y-4">
                <div className="divide-y divide-line rounded-card border border-line">
                  {summarySections.map((section) => (
                    <div key={section.title} className="flex items-start justify-between gap-3 p-4">
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-fg-faint">{section.title}</p>
                        {section.lines.map((line) => (
                          <p key={line} className="mt-1 break-words text-[14px] text-fg">
                            {line}
                          </p>
                        ))}
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => setStep(section.step)}>
                        수정
                      </Button>
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap items-start gap-3 rounded-card border border-line bg-overlay p-4">
                  <Lock className="mt-0.5 size-4 shrink-0 text-fg-faint" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="primary">Phase 3 예정</Badge>
                      <p className="text-[14px] font-semibold">게재는 아직 준비 중입니다</p>
                    </div>
                    <p className="mt-1 text-[13px] leading-relaxed text-fg-sub">
                      캠페인 생성·수정은 Meta Advanced Access 심사 완료 후 활성화됩니다.
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-disabled="true"
                    className="inline-flex h-10 cursor-not-allowed items-center justify-center rounded-card bg-primary px-4 text-[15px] font-semibold text-on-primary opacity-40"
                  >
                    게재 시작
                  </button>
                </div>
              </div>
            ) : null}

            {/* 필수값 인라인 안내 — 다음 버튼이 잠긴 이유를 그 자리에서 보여준다 */}
            {stepIssues.length > 0 ? (
              <ul className="space-y-1 rounded-card bg-warning-weak p-3 text-[13px] text-warning" role="alert">
                {stepIssues.map((issue) => (
                  <li key={issue}>· {issue}</li>
                ))}
              </ul>
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
                <Button
                  size="sm"
                  disabled={!canProceed}
                  onClick={() => canProceed && goToStep(Math.min(STEPS.length - 1, step + 1))}
                >
                  다음
                  <ArrowRight className="size-4" aria-hidden />
                </Button>
              ) : null}
            </div>
          </CardBody>
        </Card>

        {/* ---------------- 구성 2 — 라이브 광고 미리보기 ---------------- */}
        <div className="lg:sticky lg:top-6">
          <Card>
            <CardHeader title="광고 미리보기" description="Instagram 피드 기준" />
            <CardBody>
              <div className="overflow-hidden rounded-card border border-line bg-surface">
                {/* 상단 — 프로필 */}
                <div className="flex items-center gap-2.5 p-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-chip bg-primary-weak text-primary">
                    <Bird className="size-4" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold">핀치 공식</p>
                    <p className="text-xs text-fg-faint">광고</p>
                  </div>
                </div>

                {/* 소재 영역 */}
                <div className="flex aspect-square items-center justify-center bg-overlay">
                  <div className="flex flex-col items-center gap-1.5 text-fg-faint">
                    <ImageIcon className="size-8" aria-hidden />
                    <p className="text-xs">소재를 업로드하면 여기에 표시됩니다</p>
                  </div>
                </div>

                {/* CTA 버튼 — 4단계 선택값 실시간 반영 */}
                <div className="flex items-center justify-between border-y border-line px-3 py-2.5">
                  <span className="text-[13px] font-semibold text-primary">{cta}</span>
                  <ChevronRight className="size-4 text-primary" aria-hidden />
                </div>

                {/* 하단 — 제목·본문 실시간 반영, 미입력 시 스켈레톤 */}
                <div className="space-y-1.5 p-3">
                  {headline ? (
                    <p className="break-words text-[14px] font-semibold">{headline}</p>
                  ) : (
                    <SkeletonBar className="h-3.5 w-2/3" />
                  )}
                  {description ? (
                    <p className="break-words text-[13px] leading-relaxed text-fg-sub">
                      {previewBody}
                      {description.length > 125 ? <span className="text-fg-faint">… 더보기</span> : null}
                    </p>
                  ) : (
                    <>
                      <SkeletonBar className="h-3 w-full" />
                      <SkeletonBar className="h-3 w-4/5" />
                    </>
                  )}
                </div>
              </div>
              <p className="mt-3 text-xs text-fg-faint">
                4단계에서 입력한 제목·본문·CTA가 실시간으로 반영됩니다.
              </p>
            </CardBody>
          </Card>
        </div>
      </div>

      {/* ---------------- 구성 3 — 기존 캠페인 목록 ---------------- */}
      <Card>
        <CardHeader title="기존 캠페인" description="상태 변경은 목 동작이며 저장되지 않습니다" />
        <CardBody className="space-y-3">
          {campaigns.length > 0 ? (
            campaigns.map((c) => {
              const current = statuses[c.id] ?? c.status;
              const status = STATUS_BADGE[current];
              return (
                <div
                  key={c.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line p-4"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element -- 목 소재 썸네일(로컬 SVG) */}
                    <img
                      src={c.creative.imageUrl}
                      alt={c.creative.headline}
                      width={40}
                      height={40}
                      className="size-10 shrink-0 rounded-card border border-line object-cover"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-semibold">{c.name}</p>
                      <p className="mt-0.5 truncate text-xs text-fg-faint">{c.creative.headline}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="tnum text-[13px] text-fg-sub">일 예산 {formatKRW(c.dailyBudget)}</span>
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
            })
          ) : (
            <EmptyState
              icon={Megaphone}
              title="캠페인이 없습니다"
              description="Meta 광고 계정을 연동하면 캠페인이 여기에 표시됩니다."
            />
          )}
        </CardBody>
      </Card>
    </div>
  );
}
