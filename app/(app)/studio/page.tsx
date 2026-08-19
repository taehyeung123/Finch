"use client";

import Link from "next/link";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  Flame,
  ImageDown,
  Info,
  LayoutTemplate,
  Lightbulb,
  Pencil,
  Search,
  Sparkles,
  TrendingUp,
  Video,
} from "lucide-react";
import { PageHeader } from "@/components/ui/section-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge, ChannelBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChipFilter } from "@/components/ui/chip-filter";
import { InfoTip } from "@/components/ui/info-tip";
import { cn } from "@/lib/cn";
import { formatCompact } from "@/lib/format";
import { ideaSuggestions, referenceItems, TREND_CATEGORIES } from "@/lib/data";
import type { Channel, IdeaSuggestion, ReferenceItem } from "@/lib/types";
import { generateCardNews, generateIdeas } from "./actions";
import { exportSlidesAsPng, renderSlidesToDataUrls, type ExportSlide, type LoadedLogo } from "@/lib/studio/export-slides";
import { renderImagesToVideo, downloadVideo, isVideoSupported } from "@/lib/studio/video";
import type { EditorScene } from "@/lib/studio/editor-model";
import { TEMPLATES, DEFAULT_TEMPLATE, getTemplate, customTemplate, type CardTemplate } from "@/lib/studio/templates";
import { getBrandKit, type BrandKit } from "./brand-kit-actions";
import { SchedulePublish } from "./_components/schedule-publish";

// Konva 편집기는 canvas/window에 의존해 서버 렌더 불가 — 클라이언트에서만 마운트
const CardEditor = dynamic(() => import("./_components/card-editor"), { ssr: false });

/* 숏폼 영상 생성은 **추후 도입**으로 뺐다 (2026-08-15 사장님 결정).
   외부 생성형 영상 API(Sora·Kling 등) 연동 전까지는 화면에 아무것도 두지 않는다 —
   "준비 중" 자리표시 탭은 팔 수 없는 기능을 파는 것처럼 보이게 하고,
   빈 탭을 눌러 본 사람에게 제품이 미완성이라는 인상만 남긴다. */
type StudioTab = "cards" | "ideas";

const STUDIO_TABS: { value: StudioTab; label: string }[] = [
  { value: "cards", label: "카드뉴스 생성" },
  { value: "ideas", label: "아이디어 추천" },
];

type BrandTone = "friendly" | "professional" | "witty";

const TONE_OPTIONS: { value: BrandTone; label: string }[] = [
  { value: "friendly", label: "친근한" },
  { value: "professional", label: "전문적인" },
  { value: "witty", label: "위트있는" },
];

type Slide = ExportSlide;

/**
 * AI 미연동/키 미설정 시 폴백 템플릿 5장 (cover/content×3/closing).
 * 실제 AI 결과와 같은 role 구조를 만들어 렌더러가 동일하게 그린다.
 */
function buildSlides(topic: string, tone: BrandTone): Slide[] {
  const t = topic.trim();
  const coverHead: Record<BrandTone, string> = {
    friendly: `${t}, 이렇게 시작해보세요`,
    professional: `${t} 핵심만 5장으로 정리`,
    witty: `${t}? 3초만 멈춰보세요`,
  };
  return [
    { role: "cover", no: 1, kicker: "가이드", headline: coverHead[tone], footnote: `${t}를 처음 시작하는 사람을 위한 요약` },
    {
      role: "content",
      no: 2,
      kicker: "왜 지금",
      headline: `지금 ${t}를 시작해야 하는 이유`,
      points: ["관심도가 빠르게 오르는 시점", "초반 진입자가 유리한 구조", "지금 만든 기록이 자산이 됨"],
    },
    {
      role: "content",
      no: 3,
      kicker: "흔한 실수",
      headline: `${t}에서 자주 하는 실수`,
      points: ["순서를 건너뛰고 시작", "대상 없이 막연하게 진행", "결과를 기록하지 않음"],
    },
    {
      role: "content",
      no: 4,
      kicker: "실전 팁",
      headline: "오늘 바로 할 수 있는 첫 단계",
      points: ["10분만 투자해 시작 지점 정하기", "작게 나눠 한 단계씩", "한 것과 결과를 기록"],
      footnote: "완벽하게보다 일단 시작하는 게 먼저다",
    },
    {
      role: "closing",
      no: 5,
      headline: "이 카드, 필요할 때 못 찾습니다",
      body: `${t} 다음 편도 이어서 준비했어요.`,
      cta: { action: "save", text: "저장하고 다음 편 받기" },
    },
  ];
}

/** 템플릿 미리보기 목업 — 순수 CSS(잉크 배경 + 강조 바 + 페이퍼 헤드라인 바). 캔버스 없이 테마 전달 */
function TemplateMock({ t }: { t: (typeof TEMPLATES)[number] }) {
  return (
    <div className="flex size-16 flex-col justify-between rounded-[6px] p-2" style={{ backgroundColor: t.ink }}>
      <div className="h-1.5 w-4 rounded-full" style={{ backgroundColor: t.accent }} />
      <div className="space-y-1">
        <div className="h-1.5 w-full rounded-full" style={{ backgroundColor: t.paper }} />
        <div className="h-1.5 w-3/5 rounded-full" style={{ backgroundColor: t.paper }} />
      </div>
    </div>
  );
}

/** 미리보기 렌더 — try/catch를 컴포넌트 밖으로 빼 React 컴파일러가 자동 메모하게 한다(SSR에선 slides null→[]) */
function safeRenderPreviews(
  slides: Slide[] | null,
  aiGenerated: boolean,
  tpl: CardTemplate,
  logo: LoadedLogo | undefined,
): string[] {
  if (!slides) return [];
  try {
    return renderSlidesToDataUrls(slides, aiGenerated, tpl, logo);
  } catch {
    return [];
  }
}

/** 미리보기 문구 요약 — 결과 카드 아래 보조 텍스트 (실제 이미지는 캔버스 렌더로 보여준다) */
function slideCaption(s: Slide): string {
  if (s.role === "content" && s.points?.length) return s.points.join(" · ");
  return s.footnote ?? s.body ?? s.cta?.text ?? "";
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
  related: ReferenceItem[];
  ideas: GeneratedIdea[];
}

/**
 * 팔로워 대비 조회수(도달 스코어) — 자체 추정치. 팔로워 0이면 0으로 가드.
 * 구 TrendItem.reachScore가 들고 있던 값을 ReferenceItem 필드로 그 자리에서 계산한다.
 */
function reachScoreOf(item: ReferenceItem): number {
  if (!item.followerCount) return 0;
  return Math.round((item.views / item.followerCount) * 10) / 10;
}

/** 키워드·카테고리로 근거 레퍼런스 최대 3개 — 키워드 매칭 우선, 없으면 선택 카테고리 인기순 */
function findRelatedTrends(keyword: string, category: string): ReferenceItem[] {
  const tokens = keyword.toLowerCase().split(/[\s,]+/).filter(Boolean);
  const inCategory = referenceItems.filter((item) => category === "전체" || item.category === category);
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
function buildIdeas(keyword: string, category: string, related: ReferenceItem[]): GeneratedIdea[] {
  const h = hashString(`${keyword}|${category}`);
  const count = 4 + (h % 3); // 4~6개
  const catLabel = category !== "전체" ? category : (related[0]?.category ?? "라이프스타일");
  return Array.from({ length: count }, (_, i) => {
    const tpl = IDEA_TEMPLATES[(h + i) % IDEA_TEMPLATES.length];
    const evidence = related.length > 0 ? related[i % related.length] : null;
    const reason = evidence
      ? `수집된 "${evidence.title}"(조회수 ${formatCompact(evidence.views)})와 같은 수요를 겨냥해요 — ${tpl.angle}`
      : `'${keyword}' 키워드 조합 추천 — ${tpl.angle}`;
    const engagement: GeneratedIdea["engagement"] = evidence
      ? reachScoreOf(evidence) >= 10
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
  // 성장 진단에서 넘어온 '재가공 지침'(있으면 다음 생성에 1회 주입)
  const [pendingNote, setPendingNote] = useState<string | null>(null);
  const [slides, setSlides] = useState<Slide[] | null>(null);
  const [slidesFromAi, setSlidesFromAi] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  // 편집기로 수정한 슬라이드 (인덱스 → { 미리보기/업로드용 png, 이어편집용 scene })
  const [edits, setEdits] = useState<Record<number, { png: string; scene: EditorScene }>>({});
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [restored, setRestored] = useState(false);
  const [videoBusy, setVideoBusy] = useState(false);
  const [videoSupported, setVideoSupported] = useState(false); // 클라이언트 마운트 후 감지
  // 다안 생성 — 한 번에 받은 여러 안 중 현재 보고 있는 안
  const [variants, setVariants] = useState<{ angle: string; slides: Slide[] }[]>([]);
  const [activeVariant, setActiveVariant] = useState(0);
  // 카드 콘텐츠 템플릿(색 테마)
  const [templateId, setTemplateId] = useState<string>(DEFAULT_TEMPLATE.id);
  // 나만의 디자인(브랜드 킷) + 미리 로드한 로고 이미지
  const [brandKit, setBrandKit] = useState<BrandKit | null>(null);
  const [logoImg, setLogoImg] = useState<HTMLImageElement | null>(null);

  // 실제 적용 템플릿 — '내 브랜드' 선택 시 브랜드 킷 색을, 아니면 프리셋.
  // useMemo로 안정화(안 하면 매 렌더 새 객체라 previews memo가 매번 재계산).
  const template = useMemo(
    () => (templateId === "brand" && brandKit ? customTemplate(brandKit) : getTemplate(templateId)),
    [templateId, brandKit],
  );
  // 로고는 '내 브랜드' 템플릿을 쓰고, 로고가 실제로 있고 로드까지 끝났을 때만 적용.
  // useMemo로 안정화 — 안 하면 매 렌더 새 객체라 미리보기 memo가 매번 재계산된다.
  const logo = useMemo<LoadedLogo | undefined>(
    () =>
      templateId === "brand" && brandKit?.logoUrl && logoImg
        ? { img: logoImg, placement: brandKit.logoPlacement }
        : undefined,
    [templateId, brandKit, logoImg],
  );
  const editorLogo =
    templateId === "brand" && brandKit?.logoUrl ? { url: brandKit.logoUrl, placement: brandKit.logoPlacement } : undefined;

  // 템플릿 변경 — 편집본은 이전 테마로 구워져 있어 초기화한다(안내 문구로 고지)
  function chooseTemplate(id: string) {
    if (id === templateId) return;
    setTemplateId(id);
    setEdits({});
  }

  // 브랜드 킷 로드(마운트 1회) + 저장 후 갱신 시 로고 이미지 미리 로드
  useEffect(() => {
    getBrandKit()
      .then((k) => setBrandKit(k))
      .catch(() => {});
  }, []);
  // 영상 지원 여부는 클라이언트에서만 판정(SSR과 다르면 하이드레이션 불일치라 마운트 후 세팅)
  useEffect(() => {
    /* eslint-disable-next-line react-hooks/set-state-in-effect -- 클라이언트 전용 기능 감지 */
    setVideoSupported(isVideoSupported());
  }, []);
  useEffect(() => {
    const url = brandKit?.logoUrl;
    if (!url) return; // 로고 없음 — 파생 logo가 logoUrl로 게이팅되므로 여기서 상태를 건드리지 않는다
    let alive = true;
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => alive && setLogoImg(img);
    img.onerror = () => alive && setLogoImg(null);
    img.src = url;
    return () => {
      alive = false;
    };
  }, [brandKit?.logoUrl]);

  // 다운로드·예약발행이 쓰는 png만 뽑은 맵
  const editPngs = useMemo<Record<number, string>>(
    () => Object.fromEntries(Object.entries(edits).map(([k, v]) => [Number(k), v.png])),
    [edits],
  );
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
    setEdits({}); // 새로 생성하면 이전 편집 결과 초기화
    setRestored(false);
    try {
      const result = await generateCardNews(topic, tone, pendingNote ?? undefined);
      setPendingNote(null); // 재가공 지침은 1회만 적용
      if (result.ok) {
        const vs = result.variants.map((v) => ({
          angle: v.angle,
          slides: v.slides.map((s, i) => ({ ...s, no: i + 1 })),
        }));
        setVariants(vs);
        setActiveVariant(0);
        setSlides(vs[0].slides);
        setSlidesFromAi(true);
      } else if (result.fallback) {
        const fb = buildSlides(topic, tone);
        setVariants([{ angle: "템플릿", slides: fb }]);
        setActiveVariant(0);
        setSlides(fb);
        setSlidesFromAi(false);
      } else {
        setGenError(result.error);
      }
    } catch {
      // 네트워크 등 예외 — 템플릿으로라도 결과를 보여준다
      const fb = buildSlides(topic, tone);
      setVariants([{ angle: "템플릿", slides: fb }]);
      setActiveVariant(0);
      setSlides(fb);
      setSlidesFromAi(false);
    } finally {
      setGenerating(false);
    }
  };

  // 안 전환 — 선택한 안의 슬라이드로 교체하고 편집은 안별로 초기화한다
  function selectVariant(i: number) {
    if (i === activeVariant || !variants[i]) return;
    setActiveVariant(i);
    setSlides(variants[i].slides);
    setEdits({});
  }

  // 모션 카드뉴스 영상(webm) — 화면의 카드 이미지를 슬라이드쇼로. 실시간 녹화라 장수×2.4초 소요.
  async function handleMakeVideo() {
    if (!slides || videoBusy) return;
    const urls = slides.map((s, i) => edits[i]?.png ?? previews[i]).filter(Boolean);
    if (urls.length === 0) return;
    setVideoBusy(true);
    try {
      const blob = await renderImagesToVideo(urls);
      downloadVideo(blob, "finch-cardnews.webm");
    } catch {
      // 브라우저 미지원 등 — 버튼 자체를 지원 브라우저에서만 노출하므로 드물다
    } finally {
      setVideoBusy(false);
    }
  }

  // 실제 카드 이미지를 캔버스로 렌더한 미리보기 (WYSIWYG) — 다운로드 결과물과 100% 동일.
  // useMemo라 slides가 바뀔 때만 재계산되고, slides가 null(초기·SSR)이면 캔버스를 건드리지 않는다.
  // 컴파일러가 인자 기준으로 자동 메모 — 수동 useMemo(try/catch)로는 preserve가 안 돼 헬퍼로 분리
  const previews = safeRenderPreviews(slides, slidesFromAi, template, logo);

  // localStorage 임시저장 — 서버를 쓰지 않아 비용·부담이 없다. 이 브라우저에서만 유지된다.
  const DRAFT_KEY = "finch:studio:cardnews-draft";
  // 마운트 시 1회 복원. 외부 저장소(localStorage)→React 동기화라 effect가 정석이며,
  // SSR HTML은 빈 상태여야 하이드레이션 불일치가 없으므로 lazy init 대신 effect를 쓴다.
  useEffect(() => {
    let draft: {
      topic?: string;
      tone?: BrandTone;
      templateId?: string;
      slides?: Slide[];
      slidesFromAi?: boolean;
      edits?: Record<number, { png: string; scene: EditorScene }>;
    } | null = null;
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      draft = raw ? JSON.parse(raw) : null;
    } catch {
      draft = null;
    }
    if (!draft?.slides?.length) return;
    /* eslint-disable react-hooks/set-state-in-effect -- 마운트 1회 외부저장소 복원(정석 패턴) */
    setTopic(draft.topic ?? "");
    if (draft.tone) setTone(draft.tone);
    if (draft.templateId) setTemplateId(draft.templateId);
    setSlides(draft.slides);
    setSlidesFromAi(Boolean(draft.slidesFromAi));
    setEdits(draft.edits ?? {});
    setRestored(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  // 성장 진단에서 넘어온 픽업 — { topic, note? } JSON. note가 있으면 재가공 지침으로 1회 주입.
  useEffect(() => {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem("finch:studio:pending");
      if (raw) localStorage.removeItem("finch:studio:pending");
    } catch {
      raw = null;
    }
    if (!raw) return;
    let payload: { topic?: string; note?: string } = {};
    try {
      payload = JSON.parse(raw) as { topic?: string; note?: string };
    } catch {
      payload = { topic: raw };
    }
    if (!payload.topic) return;
    /* eslint-disable react-hooks/set-state-in-effect -- 마운트 1회 외부저장소(성장 진단 핸드오프) 픽업 */
    setTopic(payload.topic);
    if (payload.note) setPendingNote(payload.note);
    setTab("cards");
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  // 작업이 바뀔 때마다 임시저장 (생성 중에는 저장하지 않음)
  useEffect(() => {
    if (!slides || generating) return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ topic, tone, templateId, slides, slidesFromAi, edits }));
    } catch {
      /* 용량 초과 시 조용히 스킵 — 임시저장은 부가 기능 */
    }
  }, [topic, tone, templateId, slides, slidesFromAi, edits, generating]);

  function clearDraft() {
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      /* noop */
    }
    setSlides(null);
    setEdits({});
    setVariants([]);
    setActiveVariant(0);
    setTemplateId(DEFAULT_TEMPLATE.id);
    setRestored(false);
    setTopic("");
  }

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
    <div className="space-y-6">
      <PageHeader
        title="AI 스튜디오"
        description="주제만 입력하면 카드뉴스와 콘텐츠 아이디어를 AI가 만들어드립니다."
      />

      <ChipFilter options={STUDIO_TABS} value={tab} onChange={setTab} />

      {tab === "cards" ? (
        <div className="space-y-6">
          {/* 브랜드 톤·킷은 /studio/brand 로 옮겼다(2026-08-15 IA 개편) — 한 번 정하고
              계속 쓰는 설정이 만들러 들어올 때마다 첫 두 블록을 차지하고 있었다.
              여기서는 "지금 무엇이 적용 중인지" 한 줄만 알린다. */}
          <p className="text-[14px] text-fg-sub">
            내 브랜드 톤·색이 결과에 반영됩니다.{" "}
            <Link href="/studio/brand" className="font-semibold text-primary-ink hover:underline">
              브랜드 설정
            </Link>
          </p>

          <Card className="border-primary/30">
            <CardHeader
              title="카드뉴스 만들기"
              description="템플릿과 주제를 고르면 내 톤으로 5장 카드뉴스 2안을 만들어드려요."
            />
            <CardBody className="space-y-4">
              {/* 템플릿 선택 (생성기 안으로 통합) */}
              <div className="space-y-2">
                <p className="text-[14px] font-medium text-fg-sub">템플릿</p>
                <div className="flex flex-wrap gap-2.5">
                  {TEMPLATES.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => chooseTemplate(t.id)}
                      aria-pressed={t.id === templateId}
                      className={cn(
                        "flex flex-col items-center gap-1.5 rounded-card border p-2 transition-all",
                        t.id === templateId ? "border-2 border-primary" : "border border-line trans-state hover:border-line-strong",
                      )}
                    >
                      <TemplateMock t={t} />
                      <span className={cn("text-[11px] font-medium", t.id === templateId ? "text-primary" : "text-fg-sub")}>
                        {t.name}
                      </span>
                    </button>
                  ))}
                  {brandKit ? (
                    <button
                      type="button"
                      onClick={() => chooseTemplate("brand")}
                      aria-pressed={templateId === "brand"}
                      className={cn(
                        "flex flex-col items-center gap-1.5 rounded-card border p-2 transition-all",
                        templateId === "brand" ? "border-2 border-primary" : "border border-line trans-state hover:border-line-strong",
                      )}
                    >
                      <TemplateMock t={customTemplate(brandKit)} />
                      <span className={cn("text-[11px] font-medium", templateId === "brand" ? "text-primary" : "text-fg-sub")}>
                        내 브랜드
                      </span>
                    </button>
                  ) : null}
                </div>
              </div>
              <div className="flex flex-col gap-3 md:flex-row">
                <div className="flex-1">
                  <label htmlFor="studio-topic" className="mb-1.5 flex items-center gap-2 text-[14px] font-medium text-fg-sub">
                    주제
                    {pendingNote ? (
                      <span className="inline-flex items-center gap-1 rounded-chip bg-primary-weak px-2 py-0.5 text-[11px] font-semibold text-primary">
                        성과 게시물 재가공
                      </span>
                    ) : null}
                  </label>
                  <input
                    id="studio-topic"
                    type="text"
                    value={topic}
                    onChange={(e) => {
                      setTopic(e.target.value);
                      if (pendingNote) setPendingNote(null); // 주제를 직접 고치면 재가공 지침 해제
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleGenerate();
                    }}
                    placeholder="예: 장마철 실내 데이트 코스"
                    className="h-10 w-full rounded-card border border-line bg-body px-3 text-[15px] text-fg placeholder:text-fg-faint focus-visible:outline-2 focus-visible:outline-primary"
                  />
                </div>
                <div className="md:w-44">
                  <label htmlFor="studio-tone" className="mb-1.5 block text-[14px] font-medium text-fg-sub">
                    브랜드 톤
                  </label>
                  <select
                    id="studio-tone"
                    value={tone}
                    onChange={(e) => setTone(e.target.value as BrandTone)}
                    className="h-10 w-full rounded-card border border-line bg-body px-3 text-[15px] text-fg focus-visible:outline-2 focus-visible:outline-primary"
                  >
                    {TONE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="md:self-end">
                  <Button
                    size="lg"
                    onClick={handleGenerate}
                    disabled={!topic.trim() || generating}
                    className="w-full md:w-auto"
                  >
                    <Sparkles className="size-4" aria-hidden />
                    {generating ? "생성 중..." : "카드뉴스 생성"}
                  </Button>
                </div>
              </div>
              {genError ? (
                <p role="alert" className="rounded-card bg-negative-weak px-3 py-2 text-[14px] text-negative">
                  {genError}
                </p>
              ) : null}
              {restored ? (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-line bg-body px-3 py-2.5 text-[14px] text-fg-sub">
                  <span>이전에 작업하던 카드뉴스를 불러왔어요. (이 브라우저에 임시저장됨)</span>
                  <button type="button" onClick={clearDraft} className="font-semibold text-primary underline underline-offset-2">
                    새로 시작
                  </button>
                </div>
              ) : (
                <p className="inline-flex items-center gap-1.5 text-xs text-fg-faint">
                  <span className="size-2 rounded-full bg-primary" aria-hidden />
                  작업 내용은 이 브라우저에 자동 임시저장돼요. 페이지를 나갔다 와도 이어서 편집할 수 있습니다.
                </p>
              )}
            </CardBody>
          </Card>

          {generating ? (
            <Card>
              <CardHeader
                title="생성 결과"
                description="AI가 카드뉴스를 만들고 있어요"
                action={
                  <span className="inline-flex items-center gap-2 text-[14px] font-medium text-primary">
                    <span
                      className="size-3.5 animate-spin rounded-full border-2 border-primary border-t-transparent"
                      aria-hidden
                    />
                    생성 중
                  </span>
                }
              />
              <CardBody className="space-y-5">
                {/* 실제 카드 구조를 흉내 낸 스켈레톤 5장 (번호배지 + 헤드라인 + 포인트 행) + shimmer */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div
                      key={i}
                      className="shimmer flex aspect-square flex-col gap-3 rounded-card border border-line bg-body p-4"
                      style={{ animationDelay: `${i * 120}ms` }}
                    >
                      <div className="size-8 rounded-full bg-line" />
                      <div className="mt-1 h-3 w-4/5 rounded-full bg-line" />
                      <div className="h-3 w-3/5 rounded-full bg-line" />
                      <div className="mt-auto space-y-2">
                        <div className="h-2 w-full rounded-full bg-line" />
                        <div className="h-2 w-5/6 rounded-full bg-line" />
                        <div className="h-2 w-2/3 rounded-full bg-line" />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="h-1 w-full overflow-hidden rounded-full bg-overlay">
                  <div className="shimmer h-full w-1/3 rounded-full bg-primary/30" />
                </div>
                <p className="text-center text-[14px] text-fg-sub">
                  보통 <span className="font-semibold text-fg">10~20초</span> 걸려요 · 표지 · 본문 3장 · 마무리를 구성하는 중입니다
                </p>
              </CardBody>
            </Card>
          ) : slides ? (
            <Card>
              <CardHeader
                title="생성 결과"
                description={`"${topic.trim()}" · ${TONE_OPTIONS.find((o) => o.value === tone)?.label} 톤 · ${slides.length}장 구성`}
                action={<Badge tone={slidesFromAi ? "primary" : "neutral"}>{slidesFromAi ? "AI 생성" : "템플릿 (연동 전)"}</Badge>}
              />
              <CardBody className="space-y-5">
                {/* 다안 선택 — 서로 다른 각도의 안을 탭으로 전환 */}
                {variants.length > 1 ? (
                  <div className="flex flex-wrap gap-2">
                    {variants.map((v, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => selectVariant(i)}
                        className={cn(
                          "rounded-card border px-3 py-1.5 text-[14px] font-semibold trans-state",
                          i === activeVariant
                            ? "border-primary bg-primary-weak text-primary"
                            : "border-line text-fg-sub hover:border-line-strong hover:text-fg",
                        )}
                      >
                        {i + 1}안 · {v.angle}
                      </button>
                    ))}
                  </div>
                ) : null}

                {/* WYSIWYG 미리보기 — 다운로드 결과물과 동일한 실제 카드 이미지. 편집본이 있으면 그걸 표시. */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                  {slides.map((s, i) => {
                    const img = edits[i]?.png ?? previews[i];
                    return (
                      <div key={s.no} className="anim-fade-up group relative" style={{ animationDelay: `${i * 70}ms` }}>
                        {img ? (
                          // eslint-disable-next-line @next/next/no-img-element -- 캔버스로 만든 data URL이라 next/image 대상이 아니다
                          <img
                            src={img}
                            alt={`슬라이드 ${s.no} — ${s.headline}`}
                            className="w-full rounded-card border border-line transition-shadow duration-200 group-hover:border-primary/40 group-hover:shadow-lg"
                          />
                        ) : (
                          <div className="flex aspect-square flex-col justify-between rounded-card border border-line bg-body p-3">
                            <span className="tnum text-xs font-semibold text-fg-faint">
                              {String(s.no).padStart(2, "0")} / {String(slides.length).padStart(2, "0")}
                            </span>
                            <p className="text-[14px] font-bold leading-snug">{s.headline}</p>
                            <p className="line-clamp-2 text-[11px] text-fg-sub">{slideCaption(s)}</p>
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => setEditingIndex(i)}
                          /* 항상 보인다. opacity-0 + group-hover 는 터치 기기에 hover 가 없어
                             편집 버튼이 통째로 사라졌다 — 이 화면의 핵심 기능인데.
                             데스크톱은 hover 로 조금 진해지는 정도만 남긴다. bg-black/text-white
                             하드코딩도 scrim 토큰으로. */
                          className="trans-state absolute right-1.5 top-1.5 inline-flex items-center gap-1 rounded-card bg-scrim px-2 py-1 text-[11px] font-semibold text-on-scrim opacity-90 hover:opacity-100 focus-visible:opacity-100"
                        >
                          <Pencil className="size-3" aria-hidden />
                          편집
                        </button>
                        {edits[i] ? (
                          <span className="absolute left-1.5 top-1.5 rounded-chip bg-primary px-1.5 py-0.5 text-[11px] font-bold text-white">
                            편집됨
                          </span>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
                <p className="text-[12px] text-fg-faint">
                  카드에 마우스를 올리면 나타나는 &lsquo;편집&rsquo;으로 문구·색·이미지를 직접 고칠 수 있어요.
                  {videoSupported ? " · ‘영상으로 저장’은 카드가 넘어가는 릴스형 영상(webm)으로 내려받아요." : ""}
                </p>

                <p className="flex items-center gap-1.5 rounded-card border border-line bg-body px-3 py-2.5 text-[14px] text-fg-sub">
                  <Sparkles className="size-4 shrink-0 text-primary" aria-hidden />
                  AI 생성 표시가 자동으로 부착됩니다 (플랫폼 정책 준수)
                </p>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => exportSlidesAsPng(slides, slidesFromAi, editPngs, template, logo)}
                  >
                    <ImageDown className="size-4" aria-hidden />
                    이미지 내보내기 (PNG {slides.length}장)
                  </Button>
                  {videoSupported ? (
                    <Button variant="secondary" onClick={handleMakeVideo} disabled={videoBusy}>
                      <Video className="size-4" aria-hidden />
                      {videoBusy ? "영상 만드는 중…" : "영상으로 저장"}
                    </Button>
                  ) : null}
                  <SchedulePublish
                    slides={slides}
                    aiGenerated={slidesFromAi}
                    edits={editPngs}
                    template={template}
                    logo={logo}
                  />
                </div>
              </CardBody>
            </Card>
          ) : (
            <div className="anim-fade-up rounded-card border border-dashed border-line bg-overlay/40 px-6 py-12 text-center">
              <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-primary-weak text-primary">
                <LayoutTemplate className="size-7" aria-hidden />
              </span>
              <p className="mt-4 text-[17px] font-bold">주제 한 줄이면 카드뉴스가 완성돼요</p>
              <p className="mx-auto mt-1.5 max-w-md text-[14px] leading-relaxed text-fg-sub">
                템플릿을 고르고 주제를 입력해 생성하면, 내 톤으로 서로 다른 각도의 5장 카드뉴스 2안이 만들어집니다.
                마음에 드는 안을 골라 바로 편집·발행하세요.
              </p>
            </div>
          )}


          {slides && editingIndex !== null && slides[editingIndex] ? (
            <CardEditor
              slide={slides[editingIndex]}
              total={slides.length}
              aiGenerated={slidesFromAi}
              initialScene={edits[editingIndex]?.scene}
              template={template}
              logo={editorLogo}
              onClose={() => setEditingIndex(null)}
              onSave={(png, scene) => {
                setEdits((prev) => ({ ...prev, [editingIndex]: { png, scene } }));
                setEditingIndex(null);
              }}
            />
          ) : null}
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
                    className="h-10 w-full rounded-card border border-line bg-body pl-10 pr-3 text-[15px] text-fg placeholder:text-fg-faint focus-visible:outline-2 focus-visible:outline-primary"
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
                <p role="alert" className="rounded-card bg-negative-weak px-3 py-2 text-[14px] text-negative">
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
                <p className="text-[14px] text-fg-sub">
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

              {/* 2-1. 근거 섹션 — 수집된 레퍼런스 중 매칭이 없으면 섹션 자체를 생략 */}
              {ideaResult.related.length > 0 ? (
                <section aria-label="수집된 관련 레퍼런스" className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Flame className="size-4 text-primary" aria-hidden />
                    <h3 className="text-[15px] font-bold">수집된 관련 레퍼런스</h3>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {ideaResult.related.map((item) => (
                      <Card key={item.id} className="flex flex-col p-4">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <ChannelBadge channel={item.channel} />
                          <span className="text-xs text-fg-faint">{item.category}</span>
                        </div>
                        <p className="mt-2 line-clamp-2 text-[15px] font-semibold leading-snug">
                          {item.title}
                        </p>
                        <p className="mt-1 text-[14px] text-fg-sub">{item.creatorHandle}</p>
                        <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-3 text-[14px] text-fg-sub">
                          <span>
                            조회수{" "}
                            <span className="tnum font-semibold text-fg">
                              {formatCompact(item.views)}
                            </span>
                          </span>
                          {reachScoreOf(item) > 0 ? (
                            <span className="inline-flex items-center gap-1">
                              도달 스코어{" "}
                              <span className="tnum font-semibold text-primary">
                                {reachScoreOf(item)}배
                              </span>
                              <InfoTip>
                                조회수 ÷ 팔로워 수. 핀치 자체 추정치이며 플랫폼 공식 지표가
                                아닙니다.
                              </InfoTip>
                            </span>
                          ) : null}
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

                      <h4 className="mt-3 text-[17px] font-semibold leading-snug">
                        {idea.title}
                      </h4>

                      <p className="mt-2 flex items-start gap-1.5 text-[14px] leading-relaxed text-fg-sub">
                        <TrendingUp
                          className="mt-0.5 size-3.5 shrink-0 text-positive"
                          aria-hidden
                        />
                        {idea.reason}
                      </p>

                      <div className="mt-3 flex items-center gap-1.5 text-[14px] text-fg-sub">
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
              <p className="flex items-center gap-1.5 text-[14px] text-fg-sub">
                <Lightbulb className="size-4 shrink-0 text-primary" aria-hidden />
                키워드로 검색하면 맞춤 아이디어를 만들어드려요. 그 전에 오늘의 추천 아이디어를
                둘러보세요.
              </p>

              {ideaSuggestions.length > 0 ? (
                <section aria-label="오늘의 추천 아이디어" className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-[15px] font-bold">오늘의 추천 아이디어</h3>
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

                          <p className="mt-2 flex items-start gap-1.5 text-[14px] leading-relaxed text-fg-sub">
                            <TrendingUp
                              className="mt-0.5 size-3.5 shrink-0 text-positive"
                              aria-hidden
                            />
                            {idea.reason}
                          </p>

                          <div className="mt-3 flex items-center gap-1.5 text-[14px] text-fg-sub">
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
              ) : (
                /* 실 모드는 ideaSuggestions 가 빈 배열이라 위 섹션이 통째로 사라져
                   화면이 거의 비었다 — 검색 카드와 안내 한 줄만 남았다. 검색으로 유도한다. */
                <EmptyState
                  icon={Lightbulb}
                  title="키워드로 아이디어를 찾아보세요"
                  description="위에서 관심 키워드를 검색하면 최근 트렌드를 근거로 맞춤 콘텐츠 아이디어를 만들어드려요."
                />
              )}
            </>
          )}

          {/* 4. 하단 고지 */}
          <Card className="flex flex-wrap items-start justify-between gap-3 p-4">
            <p className="flex items-start gap-1.5 text-[14px] leading-relaxed text-fg-sub">
              <Info className="mt-0.5 size-4 shrink-0 text-fg-faint" aria-hidden />
              아이디어 추천은 최근 트렌드 데이터를 기반으로 한 핀치 자체 생성 결과입니다. 실제
              반응은 계정 상황에 따라 달라질 수 있어요.
            </p>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
