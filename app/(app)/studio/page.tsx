"use client";

import { useState } from "react";
import {
  CalendarClock,
  Clapperboard,
  Flame,
  ImageDown,
  Info,
  LayoutTemplate,
  Lightbulb,
  Search,
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
import { formatCompact } from "@/lib/format";
import { ideaSuggestions, trendItems, TREND_CATEGORIES } from "@/lib/data";
import type { Channel, IdeaSuggestion, TrendItem } from "@/lib/types";
import { generateCardNews, generateIdeas } from "./actions";

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

/* ---- 아이디어 파인더 (Phase 1 목 처리 — 키워드 문자열 기반 결정적 생성) ---- */

/** 키워드 기반 결정적 해시 — 같은 검색어는 항상 같은 결과를 낸다 (Math.random 대체) */
function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return h;
}

type IdeaFormat = "릴스" | "캐러셀" | "스토리";

interface IdeaTemplate {
  build: (keyword: string, category: string) => string;
  /** 이 포맷이 통하는 이유 — 추천 이유 문구 꼬리에 붙는다 */
  angle: string;
  format: IdeaFormat;
  channels: Channel[];
}

/** 콘텐츠 마케터가 바로 집행할 수 있는 검증된 포맷 템플릿 — 키워드 치환으로 아이디어를 만든다 */
const IDEA_TEMPLATES: IdeaTemplate[] = [
  {
    build: (kw, cat) => `${kw} ${cat} 체크리스트 — 저장 유도형`,
    angle: "저장을 부르는 체크리스트 포맷과 잘 맞는 주제예요",
    format: "캐러셀",
    channels: ["instagram"],
  },
  {
    build: (kw) => `3초 후킹: ${kw}에서 절대 하면 안 되는 것 3가지`,
    angle: "금지형 후킹은 초반 이탈을 줄이는 검증된 오프닝이에요",
    format: "릴스",
    channels: ["instagram", "tiktok"],
  },
  {
    build: (kw) => `${kw} 비포·애프터 — 결과부터 보여주는 역순 편집`,
    angle: "결과 선공개 구성은 완주율을 끌어올리기 좋아요",
    format: "릴스",
    channels: ["tiktok"],
  },
  {
    build: (kw) => `${kw} 초보가 가장 많이 하는 실수 TOP 5`,
    angle: "실수 모음은 댓글로 경험담을 끌어내기 쉬워요",
    format: "캐러셀",
    channels: ["instagram", "threads"],
  },
  {
    build: (kw) => `팔로워에게 묻기 — 요즘 ${kw} 최대 고민은?`,
    angle: "질문 스티커로 반응을 모으고 후속 콘텐츠 소재까지 확보해요",
    format: "스토리",
    channels: ["instagram"],
  },
  {
    build: (kw) => `${kw} 하루 루틴 — 타임스탬프 공개 브이로그`,
    angle: "루틴 포맷은 숏폼 평균 완주율이 높은 편이에요",
    format: "릴스",
    channels: ["tiktok", "instagram"],
  },
  {
    build: (kw, cat) => `${kw} ${cat} 가성비 비교 — 표 한 장 정리`,
    angle: "비교표는 공유가 잘 되는 정보성 포맷이에요",
    format: "캐러셀",
    channels: ["instagram", "threads"],
  },
  {
    build: (kw) => `다들 모르는 ${kw}의 반전 사실 — 후킹 숏폼`,
    angle: "반전 구조는 시청 지속 시간을 늘리는 데 효과적이에요",
    format: "릴스",
    channels: ["tiktok"],
  },
];

interface GeneratedIdea {
  id: string;
  title: string;
  reason: string;
  format: IdeaFormat;
  channels: Channel[];
  engagement: "high" | "mid";
}

interface IdeaSearchResult {
  keyword: string;
  category: string;
  related: TrendItem[];
  ideas: GeneratedIdea[];
}

/** 키워드·카테고리로 트렌드 근거 콘텐츠 최대 3개 — 키워드 매칭 우선, 없으면 선택 카테고리 인기순 */
function findRelatedTrends(keyword: string, category: string): TrendItem[] {
  const tokens = keyword.toLowerCase().split(/[\s,]+/).filter(Boolean);
  const inCategory = trendItems.filter((item) => category === "전체" || item.category === category);
  const keywordHits = inCategory.filter((item) =>
    tokens.some(
      (t) => item.title.toLowerCase().includes(t) || item.category.toLowerCase().includes(t),
    ),
  );
  if (keywordHits.length > 0) {
    return keywordHits.sort((a, b) => b.views - a.views).slice(0, 3);
  }
  if (category !== "전체") {
    return inCategory.sort((a, b) => b.views - a.views).slice(0, 3);
  }
  return [];
}

/** 포맷 템플릿 x 키워드 치환으로 아이디어 4~6개 생성 — 해시 기반이라 같은 입력은 같은 결과 */
function buildIdeas(keyword: string, category: string, related: TrendItem[]): GeneratedIdea[] {
  const h = hashString(`${keyword}|${category}`);
  const count = 4 + (h % 3); // 4~6개
  const catLabel = category !== "전체" ? category : (related[0]?.category ?? "라이프스타일");
  return Array.from({ length: count }, (_, i) => {
    const tpl = IDEA_TEMPLATES[(h + i) % IDEA_TEMPLATES.length];
    const evidence = related.length > 0 ? related[i % related.length] : null;
    const reason = evidence
      ? `지금 뜨는 "${evidence.title}"(조회수 ${formatCompact(evidence.views)})와 같은 수요를 겨냥해요 — ${tpl.angle}`
      : `'${keyword}' 키워드 조합 추천 — ${tpl.angle}`;
    const engagement: GeneratedIdea["engagement"] = evidence
      ? evidence.reachScore >= 10
        ? "high"
        : "mid"
      : (h + i * 31) % 5 < 3
        ? "high"
        : "mid";
    return {
      id: `gen-${i}`,
      title: tpl.build(keyword, catLabel),
      reason,
      format: tpl.format,
      channels: tpl.channels,
      engagement,
    };
  });
}

export default function StudioPage() {
  const [tab, setTab] = useState<StudioTab>("cards");
  const [topic, setTopic] = useState("");
  const [tone, setTone] = useState<BrandTone>("friendly");
  const [slides, setSlides] = useState<Slide[] | null>(null);
  const [slidesFromAi, setSlidesFromAi] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [ideaKeyword, setIdeaKeyword] = useState("");
  const [ideaCategory, setIdeaCategory] = useState<string>("전체");
  const [ideaResult, setIdeaResult] = useState<IdeaSearchResult | null>(null);
  const [ideasFromAi, setIdeasFromAi] = useState(false);
  const [finding, setFinding] = useState(false);
  const [ideaError, setIdeaError] = useState<string | null>(null);

  // Claude API 실호출 — 키 미설정/데모 모드면 서버가 fallback 신호를 주고 템플릿 생성으로 동작
  const handleGenerate = async () => {
    if (!topic.trim() || generating) return;
    setGenerating(true);
    setGenError(null);
    try {
      const result = await generateCardNews(topic, tone);
      if (result.ok) {
        setSlides(result.slides.map((s, i) => ({ no: i + 1, head: s.head, sub: s.sub })));
        setSlidesFromAi(true);
      } else if (result.fallback) {
        setSlides(buildSlides(topic, tone));
        setSlidesFromAi(false);
      } else {
        setGenError(result.error);
      }
    } catch {
      // 네트워크 등 예외 — 템플릿으로라도 결과를 보여준다
      setSlides(buildSlides(topic, tone));
      setSlidesFromAi(false);
    } finally {
      setGenerating(false);
    }
  };

  const handleUseIdea = (ideaTopic: string) => {
    setTopic(ideaTopic);
    setSlides(null);
    setGenError(null);
    setTab("cards");
  };

  const handleFindIdeas = async () => {
    const kw = ideaKeyword.trim();
    if (!kw || finding) return;
    setFinding(true);
    setIdeaError(null);
    const related = findRelatedTrends(kw, ideaCategory);
    try {
      const result = await generateIdeas(kw, ideaCategory);
      if (result.ok) {
        setIdeaResult({
          keyword: kw,
          category: ideaCategory,
          related,
          ideas: result.ideas.map((i, idx) => ({
            id: `ai-${idx}`,
            title: i.title,
            reason: i.reason,
            format: i.format,
            channels: i.channels,
            engagement: i.engagement,
          })),
        });
        setIdeasFromAi(true);
      } else if (result.fallback) {
        setIdeaResult({ keyword: kw, category: ideaCategory, related, ideas: buildIdeas(kw, ideaCategory, related) });
        setIdeasFromAi(false);
      } else {
        setIdeaError(result.error);
      }
    } catch {
      setIdeaResult({ keyword: kw, category: ideaCategory, related, ideas: buildIdeas(kw, ideaCategory, related) });
      setIdeasFromAi(false);
    } finally {
      setFinding(false);
    }
  };

  const handleResetIdeas = () => {
    setIdeaKeyword("");
    setIdeaCategory("전체");
    setIdeaResult(null);
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
                  <Button onClick={handleGenerate} disabled={!topic.trim() || generating} className="w-full md:w-auto">
                    <Sparkles className="size-4" aria-hidden />
                    {generating ? "생성 중..." : "생성하기"}
                  </Button>
                </div>
              </div>
              {genError ? (
                <p role="alert" className="rounded-card bg-negative-weak px-3 py-2 text-[13px] text-negative">
                  {genError}
                </p>
              ) : null}
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
                description={`"${topic.trim()}" · ${TONE_OPTIONS.find((o) => o.value === tone)?.label} 톤 · ${slides.length}장 구성`}
                action={<Badge tone={slidesFromAi ? "primary" : "neutral"}>{slidesFromAi ? "AI 생성" : "템플릿 (연동 전)"}</Badge>}
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
        <div className="space-y-6">
          {/* 1. 아이디어 파인더 — 키워드 검색 영역 */}
          <Card>
            <CardHeader
              title="아이디어 파인더"
              description="키워드를 검색하면 최근 트렌드 데이터를 근거로 맞춤 콘텐츠 아이디어를 만들어드립니다."
            />
            <CardBody className="space-y-4">
              <div className="flex flex-col gap-3 md:flex-row">
                <label htmlFor="idea-keyword" className="relative block flex-1">
                  <span className="sr-only">키워드</span>
                  <Search
                    className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-fg-faint"
                    aria-hidden
                  />
                  <input
                    id="idea-keyword"
                    type="search"
                    value={ideaKeyword}
                    onChange={(e) => setIdeaKeyword(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleFindIdeas();
                    }}
                    placeholder="키워드를 입력하세요 — 예: 여름, 루틴, 수납"
                    className="h-10 w-full rounded-card border border-line bg-overlay pl-10 pr-3 text-[15px] text-fg placeholder:text-fg-faint focus-visible:outline-2 focus-visible:outline-primary"
                  />
                </label>
                <Button
                  onClick={handleFindIdeas}
                  disabled={!ideaKeyword.trim() || finding}
                  className="md:shrink-0"
                >
                  <Sparkles className="size-4" aria-hidden />
                  {finding ? "생성 중..." : "아이디어 찾기"}
                </Button>
              </div>
              {ideaError ? (
                <p role="alert" className="rounded-card bg-negative-weak px-3 py-2 text-[13px] text-negative">
                  {ideaError}
                </p>
              ) : null}
              <ChipFilter
                options={TREND_CATEGORIES.map((c) => ({ value: c, label: c }))}
                value={ideaCategory}
                onChange={setIdeaCategory}
              />
            </CardBody>
          </Card>

          {ideaResult ? (
            <>
              {/* 검색 결과 헤더 */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[13px] text-fg-sub">
                  <span className="font-semibold text-fg">
                    &lsquo;{ideaResult.keyword}&rsquo;
                  </span>
                  {ideaResult.category !== "전체" ? ` · ${ideaResult.category}` : ""} 맞춤
                  아이디어{" "}
                  <span className="tnum font-semibold text-primary">
                    {ideaResult.ideas.length}
                  </span>
                  건
                </p>
                <Button variant="ghost" size="sm" onClick={handleResetIdeas}>
                  검색 초기화
                </Button>
              </div>

              {/* 2-1. 근거 섹션 — 매칭된 트렌드가 없으면 생략 */}
              {ideaResult.related.length > 0 ? (
                <section aria-label="지금 뜨는 관련 콘텐츠" className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Flame className="size-4 text-primary" aria-hidden />
                    <h3 className="text-[15px] font-bold">지금 뜨는 관련 콘텐츠</h3>
                    <DataSourceBadge source="thirdparty" />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {ideaResult.related.map((item) => (
                      <Card key={item.id} className="flex flex-col p-4">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <ChannelBadge channel={item.channel} />
                          <span className="text-xs text-fg-faint">{item.category}</span>
                        </div>
                        <p className="mt-2 line-clamp-2 text-[14px] font-semibold leading-snug">
                          {item.title}
                        </p>
                        <p className="mt-1 text-[13px] text-fg-sub">{item.creatorHandle}</p>
                        <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-3 text-[13px] text-fg-sub">
                          <span>
                            조회수{" "}
                            <span className="tnum font-semibold text-fg">
                              {formatCompact(item.views)}
                            </span>
                          </span>
                          <span className="inline-flex items-center gap-1">
                            도달 스코어{" "}
                            <span className="tnum font-semibold text-primary">
                              {item.reachScore}배
                            </span>
                            <InfoTip>
                              조회수 ÷ 팔로워 수. 핀치 자체 추정치이며 플랫폼 공식 지표가
                              아닙니다.
                            </InfoTip>
                          </span>
                        </div>
                      </Card>
                    ))}
                  </div>
                </section>
              ) : null}

              {/* 2-2. 생성된 아이디어 카드 */}
              <section aria-label="생성된 맞춤 아이디어" className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Lightbulb className="size-4 text-primary" aria-hidden />
                  <h3 className="text-[15px] font-bold">맞춤 아이디어</h3>
                  <DataSourceBadge source="internal" />
                  <Badge tone={ideasFromAi ? "primary" : "neutral"}>{ideasFromAi ? "AI 생성" : "템플릿 (연동 전)"}</Badge>
                </div>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {ideaResult.ideas.map((idea) => (
                    <Card key={idea.id} hover className="flex flex-col p-5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge tone="neutral">{idea.format}</Badge>
                        {idea.channels.map((ch) => (
                          <ChannelBadge key={ch} channel={ch} />
                        ))}
                      </div>

                      <h4 className="mt-3 text-[16px] font-semibold leading-snug">
                        {idea.title}
                      </h4>

                      <p className="mt-2 flex items-start gap-1.5 text-[13px] leading-relaxed text-fg-sub">
                        <TrendingUp
                          className="mt-0.5 size-3.5 shrink-0 text-positive"
                          aria-hidden
                        />
                        {idea.reason}
                      </p>

                      <div className="mt-3 flex items-center gap-1.5 text-[13px] text-fg-sub">
                        예상 반응
                        <Badge tone={idea.engagement === "high" ? "positive" : "warning"}>
                          {idea.engagement === "high" ? "높음" : "중간"}
                        </Badge>
                        <InfoTip>
                          트렌드 데이터 기반 핀치 자체 추정치입니다. 플랫폼 공식 데이터가
                          아니에요.
                        </InfoTip>
                      </div>

                      <div className="mt-auto">
                        <div className="mt-4 border-t border-line pt-4">
                          <Button
                            variant="secondary"
                            size="sm"
                            className="w-full"
                            onClick={() => handleUseIdea(idea.title)}
                          >
                            <Lightbulb className="size-4" aria-hidden />
                            이 주제로 카드뉴스 만들기
                          </Button>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </section>
            </>
          ) : (
            <>
              {/* 3. 검색 전 초기 상태 — 오늘의 추천 아이디어 */}
              <p className="flex items-center gap-1.5 text-[13px] text-fg-sub">
                <Lightbulb className="size-4 shrink-0 text-primary" aria-hidden />
                키워드로 검색하면 맞춤 아이디어를 만들어드려요. 그 전에 오늘의 추천 아이디어를
                둘러보세요.
              </p>

              {ideaSuggestions.length > 0 ? (
                <section aria-label="오늘의 추천 아이디어" className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-[15px] font-bold">오늘의 추천 아이디어</h3>
                    <DataSourceBadge source="internal" />
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

                          <h4 className="mt-3 text-[17px] font-semibold leading-snug">
                            {idea.topic}
                          </h4>

                          <p className="mt-2 flex items-start gap-1.5 text-[13px] leading-relaxed text-fg-sub">
                            <TrendingUp
                              className="mt-0.5 size-3.5 shrink-0 text-positive"
                              aria-hidden
                            />
                            {idea.reason}
                          </p>

                          <div className="mt-3 flex items-center gap-1.5 text-[13px] text-fg-sub">
                            예상 반응
                            <Badge tone={engage.tone}>{engage.label}</Badge>
                            <InfoTip>
                              최근 트렌드 데이터 기반 핀치 자체 추정치입니다. 플랫폼 공식
                              데이터가 아니에요.
                            </InfoTip>
                          </div>

                          <div className="mt-auto">
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
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                </section>
              ) : null}
            </>
          )}

          {/* 4. 하단 고지 */}
          <Card className="flex flex-wrap items-start justify-between gap-3 p-4">
            <p className="flex items-start gap-1.5 text-[13px] leading-relaxed text-fg-sub">
              <Info className="mt-0.5 size-4 shrink-0 text-fg-faint" aria-hidden />
              아이디어 추천은 최근 트렌드 데이터를 기반으로 한 핀치 자체 생성 결과입니다. 실제
              반응은 계정 상황에 따라 달라질 수 있어요.
            </p>
            <DataSourceNote source="제휴 데이터 공급사 트렌드 기반" />
          </Card>
        </div>
      ) : null}
    </div>
  );
}
