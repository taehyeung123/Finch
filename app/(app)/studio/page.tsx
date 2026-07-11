"use client";

import { useState } from "react";
import {
  CalendarClock,
  Clapperboard,
  ImageDown,
  LayoutTemplate,
  Lightbulb,
  Sparkles,
  TrendingUp,
  Video,
} from "lucide-react";
import { PageHeader } from "@/components/ui/section-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge, ChannelBadge, DataSourceBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChipFilter } from "@/components/ui/chip-filter";
import { InfoTip } from "@/components/ui/info-tip";
import { EmptyState } from "@/components/ui/empty-state";
import { DataSourceNote } from "@/components/ui/data-source-note";
import { ideaSuggestions } from "@/lib/data";
import type { IdeaSuggestion } from "@/lib/types";

type StudioTab = "cards" | "video" | "ideas";

const STUDIO_TABS: { value: StudioTab; label: string }[] = [
  { value: "cards", label: "카드뉴스 생성" },
  { value: "video", label: "숏폼 영상" },
  { value: "ideas", label: "아이디어 추천" },
];

type BrandTone = "friendly" | "professional" | "witty";

const TONE_OPTIONS: { value: BrandTone; label: string }[] = [
  { value: "friendly", label: "친근한" },
  { value: "professional", label: "전문적인" },
  { value: "witty", label: "위트있는" },
];

interface Slide {
  no: number;
  head: string;
  sub: string;
}

/** 주제 문자열을 섞어 그럴듯한 목 카피 5장을 생성한다 (Phase 1 목 처리) */
function buildSlides(topic: string, tone: BrandTone): Slide[] {
  const t = topic.trim();
  const cover: Record<BrandTone, { head: string; sub: string }> = {
    friendly: { head: `${t}, 요즘 고민이셨죠?`, sub: `저장해두고 하나씩 따라 하기 좋은 ${t} 가이드예요` },
    professional: { head: `${t} 핵심 정리`, sub: `실무에 바로 적용할 수 있도록 ${t}의 요점만 담았습니다` },
    witty: { head: `${t}? 3초만 멈춰보세요`, sub: `이 카드 넘기다 보면 ${t}이(가) 만만해집니다` },
  };
  const closing: Record<BrandTone, { head: string; sub: string }> = {
    friendly: { head: "도움이 됐다면 저장해주세요", sub: `다음 편에서 ${t} 심화 버전으로 다시 만나요` },
    professional: { head: "요약 및 다음 단계", sub: `${t} 체크리스트를 저장하고 팀과 공유해보세요` },
    witty: { head: "여기까지 온 당신, 이미 절반 성공", sub: `${t} 실전 편이 궁금하다면 팔로우가 국룰` },
  };
  return [
    { no: 1, ...cover[tone] },
    {
      no: 2,
      head: `왜 지금 ${t}인가`,
      sub: `최근 관심도가 빠르게 오르는 주제라, 지금 다루면 초반 도달에 유리해요`,
    },
    {
      no: 3,
      head: `${t}에서 가장 많이 하는 실수 3가지`,
      sub: "순서를 건너뛰거나, 대상 없이 시작하거나, 결과를 기록하지 않는 것",
    },
    {
      no: 4,
      head: `바로 써먹는 ${t} 실전 팁`,
      sub: "오늘 10분만 투자해서 첫 단계를 끝내는 것부터 시작해보세요",
    },
    { no: 5, ...closing[tone] },
  ];
}

const ENGAGE_META: Record<IdeaSuggestion["expectedEngagement"], { label: string; tone: "positive" | "warning" | "neutral" }> = {
  high: { label: "높음", tone: "positive" },
  mid: { label: "중간", tone: "warning" },
  low: { label: "낮음", tone: "neutral" },
};

export default function StudioPage() {
  const [tab, setTab] = useState<StudioTab>("cards");
  const [topic, setTopic] = useState("");
  const [tone, setTone] = useState<BrandTone>("friendly");
  const [slides, setSlides] = useState<Slide[] | null>(null);

  const handleGenerate = () => {
    if (!topic.trim()) return;
    setSlides(buildSlides(topic, tone));
  };

  const handleUseIdea = (ideaTopic: string) => {
    setTopic(ideaTopic);
    setSlides(null);
    setTab("cards");
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="AI 스튜디오"
        description="주제만 입력하면 카드뉴스와 콘텐츠 아이디어를 AI가 만들어드립니다."
      />

      <ChipFilter options={STUDIO_TABS} value={tab} onChange={setTab} />

      {tab === "cards" ? (
        <div className="space-y-6">
          <Card>
            <CardHeader
              title="카드뉴스 생성기"
              description="주제와 브랜드 톤을 고르면 5장 구성의 카드뉴스 카피를 생성합니다."
            />
            <CardBody className="space-y-4">
              <div className="flex flex-col gap-3 md:flex-row">
                <div className="flex-1">
                  <label htmlFor="studio-topic" className="mb-1.5 block text-[13px] font-medium text-fg-sub">
                    주제
                  </label>
                  <input
                    id="studio-topic"
                    type="text"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleGenerate();
                    }}
                    placeholder="예: 장마철 실내 데이트 코스"
                    className="h-10 w-full rounded-card border border-line bg-overlay px-3 text-[15px] text-fg placeholder:text-fg-faint focus-visible:outline-2 focus-visible:outline-primary"
                  />
                </div>
                <div className="md:w-44">
                  <label htmlFor="studio-tone" className="mb-1.5 block text-[13px] font-medium text-fg-sub">
                    브랜드 톤
                  </label>
                  <select
                    id="studio-tone"
                    value={tone}
                    onChange={(e) => setTone(e.target.value as BrandTone)}
                    className="h-10 w-full rounded-card border border-line bg-overlay px-3 text-[15px] text-fg focus-visible:outline-2 focus-visible:outline-primary"
                  >
                    {TONE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="md:self-end">
                  <Button onClick={handleGenerate} disabled={!topic.trim()} className="w-full md:w-auto">
                    <Sparkles className="size-4" aria-hidden />
                    생성하기
                  </Button>
                </div>
              </div>
              <p className="inline-flex items-center gap-1.5 text-xs text-fg-faint">
                <span className="size-2 rounded-full bg-primary" aria-hidden />
                템플릿 색상은 브랜드 코랄로 고정되어 있어요. 커스텀 팔레트는 이후 단계에서 제공됩니다.
              </p>
            </CardBody>
          </Card>

          {slides ? (
            <Card>
              <CardHeader
                title="생성 결과"
                description={`"${topic.trim()}" · ${TONE_OPTIONS.find((o) => o.value === tone)?.label} 톤 · 5장 구성`}
              />
              <CardBody className="space-y-5">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                  {slides.map((s) => (
                    <div
                      key={s.no}
                      className="flex aspect-square flex-col rounded-card border border-line bg-overlay p-4"
                    >
                      <span className="tnum text-xs font-semibold text-fg-faint">
                        {String(s.no).padStart(2, "0")} / 05
                      </span>
                      <p className="mt-2 text-[15px] font-bold leading-snug">{s.head}</p>
                      <p className="mt-auto pt-2 text-xs leading-relaxed text-fg-sub">{s.sub}</p>
                    </div>
                  ))}
                </div>

                <p className="flex items-center gap-1.5 rounded-card border border-line bg-overlay px-3 py-2.5 text-[13px] text-fg-sub">
                  <Sparkles className="size-4 shrink-0 text-primary" aria-hidden />
                  AI 생성 표시가 자동으로 부착됩니다 (플랫폼 정책 준수)
                </p>

                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="secondary">
                    <ImageDown className="size-4" aria-hidden />
                    이미지 내보내기
                  </Button>
                  <Button variant="secondary">
                    <CalendarClock className="size-4" aria-hidden />
                    예약 발행으로 보내기
                  </Button>
                  <Badge tone="primary">예정</Badge>
                </div>
              </CardBody>
            </Card>
          ) : (
            <EmptyState
              icon={LayoutTemplate}
              title="아직 생성한 카드뉴스가 없어요"
              description="주제를 입력하고 생성하기를 누르면 5장 구성의 카드뉴스 카피가 만들어집니다."
            />
          )}
        </div>
      ) : null}

      {tab === "video" ? (
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader
                title={
                  <span className="inline-flex items-center gap-2">
                    <LayoutTemplate className="size-5 text-fg-sub" aria-hidden />
                    템플릿 기반 모션그래픽
                  </span>
                }
                description="제품 사진과 카피를 검증된 템플릿에 자동 합성합니다."
                action={<Badge tone="neutral">Phase 3 예정</Badge>}
              />
              <CardBody>
                <ul className="space-y-1.5 text-[13px] text-fg-sub">
                  <li className="flex items-center gap-2">
                    <span className="size-1 rounded-full bg-current opacity-60" aria-hidden />
                    브랜드 일관성이 높아 계정 톤을 유지하기 좋아요
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="size-1 rounded-full bg-current opacity-60" aria-hidden />
                    템플릿 단가 기준이라 비용 예측이 가능해요
                  </li>
                </ul>
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title={
                  <span className="inline-flex items-center gap-2">
                    <Clapperboard className="size-5 text-fg-sub" aria-hidden />
                    생성형 AI 영상
                  </span>
                }
                description="텍스트나 이미지를 입력해 영상을 생성합니다."
                action={<Badge tone="neutral">Phase 3 예정</Badge>}
              />
              <CardBody>
                <ul className="space-y-1.5 text-[13px] text-fg-sub">
                  <li className="flex items-center gap-2">
                    <span className="size-1 rounded-full bg-current opacity-60" aria-hidden />
                    연출 자유도가 높아 새로운 포맷 실험에 적합해요
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="size-1 rounded-full bg-current opacity-60" aria-hidden />
                    생성 결과에 변동이 있어 검수 과정이 필요해요
                  </li>
                </ul>
              </CardBody>
            </Card>
          </div>

          <EmptyState
            icon={Video}
            title="숏폼 영상 생성은 준비 중이에요"
            description="외부 생성형 AI 영상 API 연동 후 제공됩니다."
          />
        </div>
      ) : null}

      {tab === "ideas" ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <DataSourceBadge source="internal" />
              <span className="text-[13px] text-fg-sub">
                트렌드·계정 데이터를 바탕으로 핀치 AI가 추천한 콘텐츠 주제입니다.
              </span>
            </div>
            <DataSourceNote source="제휴 데이터 공급사 트렌드 기반" />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {ideaSuggestions.map((idea) => {
              const engage = ENGAGE_META[idea.expectedEngagement];
              return (
                <Card key={idea.id} hover className="flex flex-col p-5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge tone="neutral">{idea.category}</Badge>
                    {idea.channels.map((ch) => (
                      <ChannelBadge key={ch} channel={ch} />
                    ))}
                  </div>

                  <h3 className="mt-3 text-[17px] font-semibold leading-snug">{idea.topic}</h3>

                  <p className="mt-2 flex items-start gap-1.5 text-[13px] leading-relaxed text-fg-sub">
                    <TrendingUp className="mt-0.5 size-3.5 shrink-0 text-positive" aria-hidden />
                    {idea.reason}
                  </p>

                  <div className="mt-3 flex items-center gap-1.5 text-[13px] text-fg-sub">
                    예상 반응
                    <Badge tone={engage.tone}>{engage.label}</Badge>
                    <InfoTip>
                      최근 트렌드 데이터 기반 핀치 자체 추정치입니다. 플랫폼 공식 데이터가 아니에요.
                    </InfoTip>
                  </div>

                  <div className="mt-4 border-t border-line pt-4">
                    <Button
                      variant="secondary"
                      size="sm"
                      className="w-full"
                      onClick={() => handleUseIdea(idea.topic)}
                    >
                      <Lightbulb className="size-4" aria-hidden />
                      이 주제로 카드뉴스 만들기
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
