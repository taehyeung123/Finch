"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, ChevronDown, Lock } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ModalShell } from "@/components/ui/modal-shell";
import { formatMoney } from "@/lib/format";
import { adsWriteMessage, type CreatableObjective } from "@/lib/ads/campaign-rules";
import {
  ADVANTAGE_AGE_MIN_RANGE,
  AGE_MAX_CEIL,
  AGE_MIN_FLOOR,
  adsetAutoName,
  describeTargeting,
  validateAdSetInput,
  type AdSetInput,
  type GenderInput,
  type GeoInput,
  type Interest,
  type PlacementInput,
  type TargetingInput,
} from "@/lib/ads/adset-rules";
import {
  CTA_LABELS,
  DEFAULT_CTA,
  DESCRIPTION_MAX,
  HEADLINE_MAX,
  HEADLINE_RECOMMENDED,
  MESSAGE_MAX,
  MESSAGE_RECOMMENDED,
  creativeAutoName,
  ctaOptionsFor,
  displayHost,
  validateCreativeInput,
  type CreativeInput,
  type CtaType,
} from "@/lib/ads/creative-rules";
import { objectiveLabel } from "@/lib/ads/meta-labels";
import { RegionSearchPicker } from "@/app/(finch)/(app)/ads/_components/region-search-picker";
import { InterestSearchPicker } from "@/app/(finch)/(app)/ads/_components/interest-search-picker";
import { ReachEstimate } from "@/app/(finch)/(app)/ads/_components/reach-estimate";
import { AdImageUploader, type UploadedAdImage } from "@/app/(finch)/(app)/ads/_components/ad-image-uploader";
import { AdPublisherPicker } from "@/app/(finch)/(app)/ads/_components/ad-publisher-picker";
import { AdPreview } from "@/app/(finch)/(app)/ads/_components/ad-preview";
import { AdPreviewTabs } from "@/app/(finch)/(app)/ads/_components/ad-preview-tabs";
import { createAdTreeAction, type CreateAdTreeInput } from "@/app/(finch)/(app)/ads/ad-tree-actions";

/*
  광고 만들기 마법사 — ① 광고 세트(타겟·일정) ② 소재(이미지·문구·링크·CTA) ③ 미리보기·확인.
  상태는 여기 모으고 서버 제출은 ③ 에서 한 번(createAdTreeAction). 규칙 함수(adset-rules·creative-rules)는 서버와 같은 것을 쓴다.
  만들어지는 것은 전부 일시중지 — 이 화면에 켜기 토글이 없다(돈은 캠페인 목록의 «게재 시작»에서만).
*/

const STEPS = ["광고 세트", "소재", "미리보기·확인"] as const;

const fieldLabel = "text-[14px] font-semibold";
const inputBase =
  "h-11 w-full rounded-card border border-line bg-body px-3 text-[16px] outline-none trans-state focus:border-primary disabled:opacity-60";
const chipBase = "inline-flex items-center gap-1.5 rounded-chip border px-3.5 py-1.5 text-[14px] font-semibold trans-state";
const chipOff = "border-line bg-overlay text-fg-sub hover:border-line-strong hover:text-fg";
const chipOn = "border-primary bg-primary text-on-primary";

const AGE_OPTIONS = Array.from({ length: AGE_MAX_CEIL - AGE_MIN_FLOOR + 1 }, (_, i) => AGE_MIN_FLOOR + i);

export interface AdWizardProps {
  campaign: {
    id: string;
    name: string;
    objective: CreatableObjective;
    specialCategories: string[];
    /** 고용·주택·금융 — 연령 18~65+, 성별 전체, 관심사 없음 고정 */
    restricted: boolean;
    dailyBudget: number | null;
    lifetimeBudget: number | null;
    currency: string;
  };
  publisher: { pageName: string | null; igUsername: string | null } | null;
  defaultLink: string;
  adsetCount: number;
  /** 입찰가 상한 캠페인(광고 세트 0개) — 서버가 자동 입찰로 바꾸고 계속한다(§13-7). 화면은 미리 말한다 */
  bidFix: boolean;
}

/** datetime-local 문자열 → UNIX 초(기기 시간대). 비었거나 못 읽으면 null */
function localToUnix(v: string): number | null {
  if (!v) return null;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? Math.floor(t / 1000) : null;
}
/** date 문자열 → 그날 23:59:59(기기 시간대) UNIX 초 */
function dateEndToUnix(v: string): number | null {
  if (!v) return null;
  const t = new Date(`${v}T23:59:59`).getTime();
  return Number.isFinite(t) ? Math.floor(t / 1000) : null;
}

export function AdWizard({ campaign, publisher: initialPublisher, defaultLink, adsetCount, bidFix }: AdWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [issue, setIssue] = useState<{ step: 1 | 2 | 3; message: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);

  /* ── ① 광고 세트 ── */
  const [adsetName, setAdsetName] = useState(adsetAutoName(campaign.name, adsetCount + 1));
  const [renameOpen, setRenameOpen] = useState(false);
  const [geo, setGeo] = useState<GeoInput>({ mode: "country" });
  const [ageMin, setAgeMinRaw] = useState(18);
  const [ageMax, setAgeMax] = useState(AGE_MAX_CEIL);
  const [gender, setGender] = useState<GenderInput>("all");
  const [interests, setInterests] = useState<Interest[]>([]);
  const [advantage, setAdvantageRaw] = useState(true);
  const [placement, setPlacement] = useState<PlacementInput>("auto");
  const [startMode, setStartMode] = useState<"now" | "at">("now");
  const [startAt, setStartAt] = useState("");
  const [endMode, setEndMode] = useState<"none" | "at">("none");
  const [endAt, setEndAt] = useState("");

  const restricted = campaign.restricted;
  const includesMinors = ageMin < 18;

  function setAgeMin(v: number) {
    setAgeMinRaw(v);
    if (v > ageMax) setAgeMax(v);
    if (v < 18) {
      /* 청소년 포함 — 성별·관심사·자동 확장 잠금(정책) */
      setGender("all");
      setInterests([]);
      setAdvantageRaw(false);
    }
  }
  function setAdvantage(on: boolean) {
    setAdvantageRaw(on);
    if (on) {
      const [lo, hi] = ADVANTAGE_AGE_MIN_RANGE;
      if (ageMin < lo) setAgeMinRaw(lo);
      if (ageMin > hi) setAgeMinRaw(hi);
      setAgeMax(AGE_MAX_CEIL);
    }
  }

  const targeting: TargetingInput = {
    geo,
    ageMin: restricted ? 18 : ageMin,
    ageMax: restricted || advantage ? AGE_MAX_CEIL : ageMax,
    gender: restricted || includesMinors ? "all" : gender,
    interests: restricted || includesMinors ? [] : interests,
    advantageAudience: includesMinors ? false : advantage,
    placement,
  };

  /* ── ② 소재 ── */
  const [publisher, setPublisher] = useState(initialPublisher);
  const [image, setImage] = useState<UploadedAdImage | null>(null);
  /* 로컬 미리보기 URL 의 소유자는 마법사다 — ② 를 벗어나 업로더가 언마운트돼도 살아 있어야 ③에서 돌아와도 그림이 남는다.
     교체·제거 때 이전 URL 을 여기서 해제한다(탭을 닫으면 어차피 사라진다). */
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  function replacePreview(next: string | null) {
    if (localPreview && localPreview !== next) URL.revokeObjectURL(localPreview);
    setLocalPreview(next);
  }
  const [message, setMessage] = useState("");
  const [headline, setHeadline] = useState("");
  const [description, setDescription] = useState("");
  const [link, setLink] = useState(defaultLink);
  const ctaOptions = ctaOptionsFor(campaign.objective);
  const [cta, setCta] = useState<CtaType>(ctaOptions.includes(DEFAULT_CTA) ? DEFAULT_CTA : ctaOptions[0]);
  const [adName, setAdName] = useState(creativeAutoName(campaign.name, 1));
  const [adRenameOpen, setAdRenameOpen] = useState(false);

  const creative: CreativeInput = {
    message,
    headline,
    description,
    link,
    cta,
    imageHash: image?.hash ?? "",
    adName,
  };

  function adsetInputNow(): AdSetInput | { error: string } {
    const now = Math.floor(Date.now() / 1000);
    const startTime = startMode === "now" ? now : localToUnix(startAt);
    if (startTime === null) return { error: "시작 시각을 골라 주세요." };
    if (startMode === "at" && startTime < now - 60) return { error: "시작 시각이 이미 지났어요. «지금»을 고르거나 시각을 다시 골라 주세요." };
    const endTime = endMode === "none" ? null : dateEndToUnix(endAt);
    if (endMode === "at" && endTime === null) return { error: "종료일을 골라 주세요." };
    return { name: adsetName, ...targeting, startTime, endTime };
  }

  function goNextFrom1() {
    const input = adsetInputNow();
    if ("error" in input) return setIssue({ step: 1, message: input.error });
    const err = validateAdSetInput(input, { specialCategories: campaign.specialCategories });
    if (err) return setIssue({ step: 1, message: err });
    setIssue(null);
    setStep(2);
  }

  function goNextFrom2() {
    if (!publisher) return setIssue({ step: 2, message: adsWriteMessage("page_required") });
    if (!image) return setIssue({ step: 2, message: "이미지를 먼저 올려 주세요." });
    const err = validateCreativeInput(creative, campaign.objective);
    if (err) return setIssue({ step: 2, message: err });
    setIssue(null);
    setStep(3);
  }

  function submit() {
    const input = adsetInputNow();
    if ("error" in input) {
      setConfirmOpen(false);
      setIssue({ step: 1, message: input.error });
      setStep(1);
      return;
    }
    const payload: CreateAdTreeInput = {
      campaignId: campaign.id,
      adset: { name: input.name, targeting, startTime: input.startTime, endTime: input.endTime },
      creative,
    };
    startTransition(async () => {
      let res: Awaited<ReturnType<typeof createAdTreeAction>>;
      try {
        res = await createAdTreeAction(payload);
      } catch {
        res = { ok: false, code: "failed", step: 3 };
      }
      if (res.ok) {
        router.push(`/ads/campaigns/${campaign.id}?created=ad`);
        return;
      }
      setConfirmOpen(false);
      if (res.code === "partial_created" || res.code === "create_unverified") {
        router.push(`/ads/campaigns/${campaign.id}?created=${res.code}`);
        return;
      }
      setIssue({ step: res.step, message: res.message ?? adsWriteMessage(res.code) });
      setStep(res.step);
    });
  }

  const budgetText =
    campaign.dailyBudget !== null
      ? `이 캠페인의 일 예산 ${formatMoney(campaign.dailyBudget, campaign.currency)} 안에서 자동 배분돼요(캠페인 예산).`
      : campaign.lifetimeBudget !== null
        ? `이 캠페인의 총 예산 ${formatMoney(campaign.lifetimeBudget, campaign.currency)} 안에서 자동 배분돼요(캠페인 예산).`
        : "예산은 캠페인이 갖고 있어요 — 광고 세트에는 따로 넣지 않아요.";

  const summarySchedule = `${startMode === "now" ? "지금 시작" : startAt ? startAt.replace("T", " ") + " 시작" : "시작 미정"} · ${endMode === "none" ? "종료 없음" : endAt ? `${endAt} 종료` : "종료일 미정"}`;

  return (
    <div className="space-y-6">
      {/* 단계 표시 */}
      <ol className="flex flex-wrap items-center gap-2" aria-label="진행 단계">
        {STEPS.map((label, i) => {
          const n = (i + 1) as 1 | 2 | 3;
          const done = n < step;
          const on = n === step;
          return (
            <li key={label} className="flex items-center gap-2">
              <span
                aria-current={on ? "step" : undefined}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-chip border px-3 py-1 text-[14px] font-semibold",
                  on ? "border-primary bg-primary-weak text-primary" : done ? "border-line bg-body text-fg" : "border-line bg-body text-fg-sub",
                )}
              >
                {done ? <Check className="size-3.5" aria-hidden /> : <span className="tnum">{n}</span>}
                {label}
              </span>
              {i < STEPS.length - 1 ? <span className="h-px w-4 bg-line" aria-hidden /> : null}
            </li>
          );
        })}
      </ol>

      {issue && issue.step === step ? (
        <p role="alert" className="rounded-card bg-negative-weak p-3 text-[14px] text-negative-strong">
          {issue.message}
        </p>
      ) : null}

      {/* ── ① 광고 세트 ── */}
      {step === 1 ? (
        <Card>
          <CardHeader title="광고 세트 — 타겟 · 일정 · 노출 위치" description="누구에게 언제 보여줄지 정해요. 예산은 캠페인 것을 나눠 써요." />
          <CardBody className="space-y-6">
            {bidFix ? (
              <p className="rounded-card bg-warning-weak p-3 text-[14px] text-warning-strong">
                이 캠페인은 입찰가 상한이 설정돼 있어요. 광고를 만들 때 캠페인 입찰 전략을 자동 입찰로 바꾸고 계속해요.
              </p>
            ) : null}

            <div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className={fieldLabel}>
                  광고 세트 이름 <span className="font-normal text-fg-sub">— {adsetName}</span>
                </p>
                <button type="button" onClick={() => setRenameOpen((v) => !v)} className="inline-flex items-center gap-1 text-[14px] text-fg-sub trans-state hover:text-fg">
                  이름 바꾸기
                  <ChevronDown className={cn("size-3.5 transition-transform", renameOpen && "rotate-180")} aria-hidden />
                </button>
              </div>
              {renameOpen ? (
                <input value={adsetName} onChange={(e) => setAdsetName(e.target.value)} aria-label="광고 세트 이름" className={cn(inputBase, "mt-2")} />
              ) : null}
            </div>

            <div>
              <p className={fieldLabel}>지역</p>
              <div className="mt-2">
                <RegionSearchPicker value={geo} onChange={setGeo} />
              </div>
            </div>

            <div>
              <p className={fieldLabel}>연령</p>
              {restricted ? (
                <p className="mt-2 inline-flex items-center gap-2 rounded-card border border-line bg-body px-3.5 py-2 text-[15px] text-fg-sub">
                  <Lock className="size-3.5" aria-hidden />
                  18~65+ — 특별 광고 카테고리 캠페인은 연령을 나눌 수 없어요
                </p>
              ) : (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <select value={targeting.ageMin} onChange={(e) => setAgeMin(Number(e.target.value))} aria-label="최소 연령" className={cn(inputBase, "w-28")}>
                    {AGE_OPTIONS.filter((a) => !advantage || (a >= ADVANTAGE_AGE_MIN_RANGE[0] && a <= ADVANTAGE_AGE_MIN_RANGE[1])).map((a) => (
                      <option key={a} value={a}>
                        {a}세
                      </option>
                    ))}
                  </select>
                  <span className="text-[15px] text-fg-sub">~</span>
                  {advantage ? (
                    <span className="inline-flex h-11 items-center rounded-card border border-line bg-plate px-3 text-[15px] text-fg-sub">65+ (자동 확장 시 고정)</span>
                  ) : (
                    <select value={ageMax} onChange={(e) => setAgeMax(Number(e.target.value))} aria-label="최대 연령" className={cn(inputBase, "w-28")}>
                      {AGE_OPTIONS.filter((a) => a >= ageMin).map((a) => (
                        <option key={a} value={a}>
                          {a === AGE_MAX_CEIL ? "65+" : `${a}세`}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}
              {includesMinors ? <p className="mt-1.5 text-[12px] text-fg-sub">18세 미만을 포함하면 성별·관심사·타겟 자동 확장을 쓸 수 없어요.</p> : null}
            </div>

            <div>
              <p className={fieldLabel}>성별</p>
              {restricted || includesMinors ? (
                <p className="mt-2 inline-flex items-center gap-2 rounded-card border border-line bg-body px-3.5 py-2 text-[15px] text-fg-sub">
                  <Lock className="size-3.5" aria-hidden />
                  전체 — {restricted ? "특별 광고 카테고리 캠페인은 성별을 나눌 수 없어요" : "18세 미만 포함 시 고정"}
                </p>
              ) : (
                <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="성별">
                  {(
                    [
                      ["all", "전체"],
                      ["male", "남성"],
                      ["female", "여성"],
                    ] as const
                  ).map(([v, label]) => (
                    <button key={v} type="button" role="radio" aria-checked={gender === v} onClick={() => setGender(v)} className={cn(chipBase, gender === v ? chipOn : chipOff)}>
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <p className={fieldLabel}>상세 타겟 (관심사)</p>
              {restricted || includesMinors ? (
                <p className="mt-2 inline-flex items-center gap-2 rounded-card border border-line bg-body px-3.5 py-2 text-[15px] text-fg-sub">
                  <Lock className="size-3.5" aria-hidden />
                  {restricted ? "특별 광고 카테고리 캠페인은 관심사 타겟을 쓸 수 없어요" : "18세 미만 포함 시 사용할 수 없어요"}
                </p>
              ) : (
                <div className="mt-2">
                  <InterestSearchPicker value={interests} onChange={setInterests} />
                </div>
              )}
            </div>

            <div>
              <label className="flex cursor-pointer items-start gap-3 rounded-card border border-line bg-body px-3.5 py-3">
                <input type="checkbox" checked={targeting.advantageAudience} disabled={includesMinors} onChange={(e) => setAdvantage(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-primary" />
                <span>
                  <span className="block text-[15px] font-semibold">타겟 자동 확장 (권장)</span>
                  <span className="mt-0.5 block text-[12px] text-fg-sub">
                    메타가 위 조건 밖에서도 성과가 날 만한 사람에게 넓혀 보여줘요. 켜면 최소 연령은 {ADVANTAGE_AGE_MIN_RANGE[0]}~{ADVANTAGE_AGE_MIN_RANGE[1]}세, 최대는 65+로 고정돼요.
                  </span>
                </span>
              </label>
            </div>

            <div>
              <p className={fieldLabel}>노출 위치</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="노출 위치">
                {(
                  [
                    ["auto", "자동 (권장)", "Instagram·Facebook 등 성과가 좋은 곳에 메타가 배분해요"],
                    ["instagram", "Instagram만", "피드·스토리·릴스 등 Instagram 안에서만 보여요"],
                  ] as const
                ).map(([v, label, desc]) => (
                  <button key={v} type="button" role="radio" aria-checked={placement === v} onClick={() => setPlacement(v)} className={cn("rounded-card border p-3.5 text-left trans-state", placement === v ? "border-primary bg-primary-weak" : "border-line bg-overlay hover:border-line-strong")}>
                    <span className="block text-[15px] font-semibold">{label}</span>
                    <span className="mt-0.5 block text-[12px] text-fg-sub">{desc}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className={fieldLabel}>시작</p>
                <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="시작 시각">
                  <button type="button" role="radio" aria-checked={startMode === "now"} onClick={() => setStartMode("now")} className={cn(chipBase, startMode === "now" ? chipOn : chipOff)}>
                    지금
                  </button>
                  <button type="button" role="radio" aria-checked={startMode === "at"} onClick={() => setStartMode("at")} className={cn(chipBase, startMode === "at" ? chipOn : chipOff)}>
                    날짜·시각 지정
                  </button>
                </div>
                {startMode === "at" ? <input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} aria-label="시작 시각" className={cn(inputBase, "mt-2")} /> : null}
              </div>
              <div>
                <p className={fieldLabel}>종료</p>
                <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="종료">
                  <button type="button" role="radio" aria-checked={endMode === "none"} onClick={() => setEndMode("none")} className={cn(chipBase, endMode === "none" ? chipOn : chipOff)}>
                    종료 없음
                  </button>
                  <button type="button" role="radio" aria-checked={endMode === "at"} onClick={() => setEndMode("at")} className={cn(chipBase, endMode === "at" ? chipOn : chipOff)}>
                    종료일 지정
                  </button>
                </div>
                {endMode === "at" ? <input type="date" value={endAt} onChange={(e) => setEndAt(e.target.value)} aria-label="종료일" className={cn(inputBase, "mt-2")} /> : null}
              </div>
            </div>
            <p className="text-[12px] text-fg-sub">시각은 지금 쓰는 기기의 시간대 기준이에요. 게재 시작은 만든 뒤 캠페인 목록에서 따로 눌러야 해요.</p>

            <div className="rounded-card bg-plate px-3.5 py-3 text-[14px] text-fg-sub">
              <span className="font-semibold text-fg">예산</span> — {budgetText}
            </div>

            <ReachEstimate targeting={targeting} />

            <div className="flex items-center justify-end gap-2 border-t border-line pt-4">
              <Button type="button" onClick={goNextFrom1}>
                다음 — 소재
                <ArrowRight className="size-4" aria-hidden />
              </Button>
            </div>
          </CardBody>
        </Card>
      ) : null}

      {/* ── ② 소재 ── */}
      {step === 2 ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Card>
            <CardHeader title="소재 — 이미지 · 문구 · 링크" description="광고 한 장을 만들어요. 캐러셀·영상은 다음에 열려요." />
            <CardBody className="space-y-6">
              <div>
                <p className={fieldLabel}>게시 주체</p>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-card bg-plate px-3.5 py-2.5">
                  <p className="text-[14px] text-fg-sub">
                    {publisher ? (
                      <>
                        <span className="font-semibold text-fg">{publisher.pageName ?? "페이지"}</span>
                        {publisher.igUsername ? <> · @{publisher.igUsername}</> : null}
                      </>
                    ) : (
                      "광고를 게시할 Facebook 페이지·Instagram 계정을 먼저 골라 주세요"
                    )}
                  </p>
                  <AdPublisherPicker current={publisher} onSaved={(v) => setPublisher(v)} />
                </div>
              </div>

              <div>
                <p className={fieldLabel}>이미지</p>
                <div className="mt-2">
                  <AdImageUploader value={image} preview={localPreview} onChange={setImage} onPreview={replacePreview} />
                </div>
              </div>

              <div>
                <label htmlFor="ad-message" className={fieldLabel}>
                  본문
                </label>
                <textarea id="ad-message" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={MESSAGE_MAX} rows={4} placeholder="이 광고에서 하고 싶은 말을 적어 주세요" className={cn(inputBase, "h-auto py-2.5 leading-relaxed")} />
                <p className={cn("tnum mt-1 text-[12px]", message.length > MESSAGE_RECOMMENDED ? "text-warning-strong" : "text-fg-sub")}>
                  {message.length}/{MESSAGE_MAX} · 권장 {MESSAGE_RECOMMENDED}자 — 더 길면 «더보기» 뒤로 접혀요
                </p>
              </div>

              <div>
                <label htmlFor="ad-headline" className={fieldLabel}>
                  제목
                </label>
                <input id="ad-headline" value={headline} onChange={(e) => setHeadline(e.target.value)} maxLength={HEADLINE_MAX} placeholder="예: 9월 신제품 출시" className={cn(inputBase, "mt-1.5")} />
                <p className={cn("tnum mt-1 text-[12px]", headline.length > HEADLINE_RECOMMENDED ? "text-warning-strong" : "text-fg-sub")}>
                  {headline.length}/{HEADLINE_MAX} · 권장 {HEADLINE_RECOMMENDED}자
                </p>
              </div>

              <div>
                <label htmlFor="ad-description" className={fieldLabel}>
                  설명 <span className="font-normal text-fg-sub">(선택 · Facebook 피드에서만 보여요)</span>
                </label>
                <input id="ad-description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={DESCRIPTION_MAX} className={cn(inputBase, "mt-1.5")} />
              </div>

              <div>
                <label htmlFor="ad-link" className={fieldLabel}>
                  웹사이트 주소
                </label>
                <input id="ad-link" type="url" inputMode="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://" className={cn(inputBase, "mt-1.5")} />
                <p className="mt-1 text-[12px] text-fg-sub">https:// 로 시작해야 해요. 버튼을 누르면 이 주소로 이동해요.</p>
              </div>

              <div>
                <p className={fieldLabel}>버튼</p>
                <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="버튼 문구">
                  {ctaOptions.map((c) => (
                    <button key={c} type="button" role="radio" aria-checked={cta === c} onClick={() => setCta(c)} className={cn(chipBase, cta === c ? chipOn : chipOff)}>
                      {CTA_LABELS[c]}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className={fieldLabel}>
                    광고 이름 <span className="font-normal text-fg-sub">— {adName}</span>
                  </p>
                  <button type="button" onClick={() => setAdRenameOpen((v) => !v)} className="inline-flex items-center gap-1 text-[14px] text-fg-sub trans-state hover:text-fg">
                    이름 바꾸기
                    <ChevronDown className={cn("size-3.5 transition-transform", adRenameOpen && "rotate-180")} aria-hidden />
                  </button>
                </div>
                {adRenameOpen ? <input value={adName} onChange={(e) => setAdName(e.target.value)} aria-label="광고 이름" className={cn(inputBase, "mt-2")} /> : null}
              </div>

              <div className="flex items-center justify-between gap-2 border-t border-line pt-4">
                <Button type="button" variant="ghost" onClick={() => setStep(1)}>
                  <ArrowLeft className="size-4" aria-hidden />
                  광고 세트
                </Button>
                <Button type="button" onClick={goNextFrom2}>
                  다음 — 미리보기
                  <ArrowRight className="size-4" aria-hidden />
                </Button>
              </div>
            </CardBody>
          </Card>

          <div className="lg:sticky lg:top-6 lg:self-start">
            <Card>
              <CardHeader title="미리보기" description="Instagram 피드 기준" />
              <CardBody>
                <AdPreview pageName={publisher?.pageName ?? null} imageUrl={localPreview ?? image?.url ?? null} headline={headline} message={message} cta={cta} linkHost={displayHost(link.trim())} />
              </CardBody>
            </Card>
          </div>
        </div>
      ) : null}

      {/* ── ③ 미리보기·확인 ── */}
      {step === 3 ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <Card>
            <CardHeader title="메타 미리보기" description="노출 위치별로 실제 게재 모습을 메타가 그려 줘요" />
            <CardBody>
              <AdPreviewTabs campaignName={campaign.name} objective={campaign.objective} creative={creative} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="확인" description="아래 내용으로 광고 세트 1개와 광고 1개를 만들어요" />
            <CardBody className="space-y-4">
              <dl className="space-y-3 text-[15px]">
                <div>
                  <dt className="text-[12px] font-medium text-fg-sub">캠페인</dt>
                  <dd className="mt-0.5">
                    {campaign.name} · {objectiveLabel(campaign.objective)}
                  </dd>
                </div>
                <div>
                  <dt className="text-[12px] font-medium text-fg-sub">타겟</dt>
                  <dd className="mt-0.5">{describeTargeting({ name: adsetName, ...targeting, startTime: 1, endTime: null })}</dd>
                </div>
                <div>
                  <dt className="text-[12px] font-medium text-fg-sub">일정</dt>
                  <dd className="mt-0.5">{summarySchedule}</dd>
                </div>
                <div>
                  <dt className="text-[12px] font-medium text-fg-sub">예산</dt>
                  <dd className="mt-0.5">{budgetText}</dd>
                </div>
                <div>
                  <dt className="text-[12px] font-medium text-fg-sub">게시 주체</dt>
                  <dd className="mt-0.5">
                    {publisher?.pageName ?? "페이지"}
                    {publisher?.igUsername ? ` · @${publisher.igUsername}` : ""}
                  </dd>
                </div>
                <div>
                  <dt className="text-[12px] font-medium text-fg-sub">링크 · 버튼</dt>
                  <dd className="mt-0.5 break-all">
                    {link.trim()} · {CTA_LABELS[cta]}
                  </dd>
                </div>
                <div>
                  <dt className="text-[12px] font-medium text-fg-sub">이름</dt>
                  <dd className="mt-0.5">
                    {adsetName} / {adName}
                  </dd>
                </div>
              </dl>

              <div className="flex items-center justify-between gap-2 border-t border-line pt-4">
                <Button type="button" variant="ghost" onClick={() => setStep(2)}>
                  <ArrowLeft className="size-4" aria-hidden />
                  소재
                </Button>
                <Button type="button" onClick={() => setConfirmOpen(true)} disabled={pending}>
                  광고 만들기
                </Button>
              </div>
            </CardBody>
          </Card>
        </div>
      ) : null}

      {confirmOpen ? (
        <ModalShell
          label="광고를 만들어요 — 아직 게재되지 않아요"
          title="광고를 만들어요 — 아직 게재되지 않아요"
          onClose={() => {
            if (!pending) setConfirmOpen(false);
          }}
          busy={pending}
          size="sm"
          footer={
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={() => setConfirmOpen(false)}>
                취소
              </Button>
              <Button type="button" size="sm" disabled={pending} onClick={submit}>
                {pending ? "만드는 중…" : "만들기"}
              </Button>
            </div>
          }
        >
          <p className="text-[15px] leading-relaxed text-fg-sub">
            광고 세트와 광고가 일시중지 상태로 만들어져요. 만든 뒤 캠페인 화면에서 게재 시작을 눌러야 노출이 시작되고 비용이 발생해요. 심사는 만들자마자 시작돼요(보통 24시간 안에 끝나요).
          </p>
        </ModalShell>
      ) : null}
    </div>
  );
}
