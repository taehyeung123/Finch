"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Bookmark, ExternalLink, FolderPlus, Info, SearchX, Sparkles, X, Zap } from "lucide-react";
import { InstagramGlyph, ThreadsGlyph, TiktokGlyph } from "@/components/icons/brand";
import { FinchMark } from "@/components/logo";
import type { Channel, ChannelFilter, CollectSettings, ReferenceItem, ReferenceSource } from "@/lib/types";
import {
  addReferenceSource,
  removeReferenceSource,
  runCollection,
  saveCollectSettings,
  toggleReferenceFavorite,
} from "@/lib/actions/reference";
import { formatCompact } from "@/lib/format";
import { cn } from "@/lib/cn";
import { PageHeader } from "@/components/ui/section-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge, ChannelBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChipFilter } from "@/components/ui/chip-filter";
import { InfoTip } from "@/components/ui/info-tip";
import { EmptyState } from "@/components/ui/empty-state";

type SourceKind = ReferenceSource["kind"];

const CHANNEL_OPTIONS: { value: Channel; label: string }[] = [
  { value: "instagram", label: "인스타그램" },
  { value: "tiktok", label: "틱톡" },
  { value: "threads", label: "스레드" },
];

const KIND_OPTIONS: { value: SourceKind; label: string }[] = [
  { value: "keyword", label: "키워드" },
  { value: "account", label: "계정" },
  { value: "hashtag", label: "해시태그" },
];

const KIND_LABEL: Record<SourceKind, string> = {
  keyword: "키워드",
  account: "계정",
  hashtag: "해시태그",
};

const KIND_PLACEHOLDER: Record<SourceKind, string> = {
  keyword: "예: 여름 스킨케어",
  account: "@handle 또는 프로필 주소",
  hashtag: "#해시태그 (예: #단백질간식)",
};

/* 채널 필터 — 이 화면은 한국어 레이블 사용 */
const CHANNEL_FILTER_OPTIONS: { value: ChannelFilter; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "instagram", label: "인스타그램" },
  { value: "tiktok", label: "틱톡" },
  { value: "threads", label: "스레드" },
];

/* 수집 필터 옵션 — runCollection이 서버·후처리로 적용 */
const PERIOD_OPTIONS: { value: CollectSettings["period"]; label: string }[] = [
  { value: "all", label: "전체 기간" },
  { value: "1d", label: "최근 1일" },
  { value: "7d", label: "최근 7일" },
  { value: "30d", label: "최근 30일" },
];

const FORMAT_OPTIONS: { value: CollectSettings["mediaFormat"]; label: string }[] = [
  { value: "all", label: "전체 형식" },
  { value: "video", label: "영상·릴스만" },
  { value: "photo", label: "사진만" },
  { value: "carousel", label: "카드뉴스(캐러셀)만" },
];

/* 칩·카드 장식용 채널 글리프 — 배지와 동일한 색 규칙 (Instagram만 브랜드색) */
const CHANNEL_GLYPH: Record<Channel, React.ReactNode> = {
  instagram: <InstagramGlyph className="size-3.5 text-ig" />,
  tiktok: <TiktokGlyph className="size-3.5 text-fg" />,
  threads: <ThreadsGlyph className="size-3.5 text-fg" />,
};

type FormMessage = { tone: "error" | "notice"; text: string };

export function LibraryClient({
  sources: initialSources,
  items,
  settings: initialSettings,
  isDemo,
}: {
  sources: ReferenceSource[];
  items: ReferenceItem[];
  settings: CollectSettings;
  isDemo: boolean;
}) {
  const router = useRouter();

  /* 수집 필터 — 변경 즉시 저장(실 모드). 데모는 화면 상태로만 */
  const [settings, setSettings] = useState<CollectSettings>(initialSettings);
  const [excludeInput, setExcludeInput] = useState("");
  const [settingsMsg, setSettingsMsg] = useState<string | null>(null);

  async function updateSettings(next: CollectSettings) {
    setSettings(next);
    setSettingsMsg(null);
    if (isDemo) return;
    const result = await saveCollectSettings(next);
    if (!result.ok) setSettingsMsg(result.error ?? "설정 저장에 실패했습니다.");
  }

  function addExcludeKeyword() {
    const k = excludeInput.trim();
    if (!k) return;
    if (settings.excludeKeywords.includes(k)) {
      setExcludeInput("");
      return;
    }
    if (settings.excludeKeywords.length >= 10) {
      setSettingsMsg("제외 키워드는 최대 10개까지예요.");
      return;
    }
    setExcludeInput("");
    void updateSettings({ ...settings, excludeKeywords: [...settings.excludeKeywords, k] });
  }

  /* 수집 기준 — 서버 액션 성공/실패에 맞춰 로컬에서 직접 동기화 */
  const [sources, setSources] = useState<ReferenceSource[]>(initialSources);
  const [channel, setChannel] = useState<Channel>("instagram");
  const [kind, setKind] = useState<SourceKind>("keyword");
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formMsg, setFormMsg] = useState<FormMessage | null>(null);

  /* 지금 수집 — 데모는 짧은 시뮬레이션, 실 모드는 runCollection 실행 */
  const [collecting, setCollecting] = useState(false);
  const [collectNotice, setCollectNotice] = useState<FormMessage | null>(null);

  /* 필터·즐겨찾기 — 즐겨찾기 초기값은 실 모드 DB의 favorite 컬럼에서 온다 */
  const [filter, setFilter] = useState<ChannelFilter>("all");
  const [favOnly, setFavOnly] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(
    () => new Set(items.filter((i) => i.favorite).map((i) => i.id)),
  );

  const filtered = useMemo(
    () =>
      items.filter(
        (item) =>
          (filter === "all" || item.channel === filter) &&
          (!favOnly || favoriteIds.has(item.id)),
      ),
    [items, filter, favOnly, favoriteIds],
  );

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setFormMsg(null);
    setSubmitting(true);
    const result = await addReferenceSource({ channel, kind, value });
    setSubmitting(false);
    if (result.ok) {
      setSources((prev) => [...prev, result.source]);
      setValue("");
      return;
    }
    // 데모 거부는 오류가 아니라 안내로 — 형식 검증 오류는 그대로 노출
    if (isDemo && result.error.startsWith("데모")) {
      setFormMsg({
        tone: "notice",
        text: "데모 모드에서는 등록할 수 없어요 — 실제 계정으로 로그인하면 저장됩니다",
      });
    } else {
      setFormMsg({ tone: "error", text: result.error });
    }
  }

  async function handleRemove(id: string) {
    const before = sources;
    setSources((prev) => prev.filter((s) => s.id !== id)); // 낙관적 제거
    const result = await removeReferenceSource(id);
    if (!result.ok) {
      setSources(before); // 실패 시 원복
      setFormMsg(
        isDemo
          ? {
              tone: "notice",
              text: "데모 모드에서는 삭제할 수 없어요 — 실제 계정으로 로그인하면 반영됩니다",
            }
          : { tone: "error", text: "삭제에 실패했습니다. 잠시 후 다시 시도해주세요." },
      );
    }
  }

  async function handleCollect() {
    if (collecting) return;
    setCollectNotice(null);

    if (isDemo) {
      setCollecting(true);
      // 이벤트 핸들러 안의 타이머 — 데모 수집 시뮬레이션 (약 1.2초)
      setTimeout(() => {
        setCollecting(false);
        setCollectNotice({ tone: "notice", text: "데모 수집 완료 — 실제 계정에서는 등록한 기준으로 실수집이 실행됩니다" });
      }, 1200);
      return;
    }

    // 실 모드 — 서버 액션이 공급사 호출 → AI 요약 → 저장까지 수행 (수십 초 걸릴 수 있음)
    setCollecting(true);
    try {
      const result = await runCollection();
      if (result.ok) {
        const parts = [`새 레퍼런스 ${result.added}건 수집 완료`];
        if (result.duplicates > 0) parts.push(`이미 수집된 ${result.duplicates}건 제외`);
        if (result.excludedByFilter > 0) parts.push(`수집 필터로 ${result.excludedByFilter}건 제외`);
        if (result.excludedLowQuality > 0) parts.push(`반응 낮은 ${result.excludedLowQuality}건 제외`);
        if (result.failedSources.length > 0) {
          parts.push(`기준 ${result.failedSources.map((v) => `'${v}'`).join(", ")}은 수집에 실패했어요`);
        }
        if (result.usedSources < result.totalSources) {
          parts.push(`기준 ${result.totalSources}개 중 ${result.usedSources}개 사용 — 다음 수집에서 나머지 기준이 돌아가요`);
        }
        setCollectNotice({ tone: "notice", text: parts.join(" · ") });
        router.refresh(); // 서버 데이터 다시 로드 — 새 아이템 반영
      } else {
        setCollectNotice({ tone: result.reason === "no_sources" ? "notice" : "error", text: result.error });
      }
    } catch {
      setCollectNotice({ tone: "error", text: "수집 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요." });
    } finally {
      setCollecting(false);
    }
  }

  async function toggleFavorite(id: string) {
    const wasFavorite = favoriteIds.has(id);
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      if (wasFavorite) next.delete(id);
      else next.add(id);
      return next;
    });
    if (isDemo) return; // 데모는 화면 상태로만
    const result = await toggleReferenceFavorite(id, !wasFavorite);
    if (!result.ok) {
      // 실패 시 원복
      setFavoriteIds((prev) => {
        const next = new Set(prev);
        if (wasFavorite) next.add(id);
        else next.delete(id);
        return next;
      });
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="레퍼런스"
        description="키워드·계정·해시태그를 등록해두면 잘되는 콘텐츠를 모아 AI가 요약과 후킹 태그를 붙여줍니다."
      />

      {/* 수집 기준 관리 */}
      <Card>
        <CardHeader
          title="수집 기준 관리"
          description="등록한 기준에 걸리는 콘텐츠를 모아드려요. 채널당 키워드·계정·해시태그를 섞어 등록할 수 있습니다."
        />
        <CardBody className="space-y-4">
          <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-2">
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value as Channel)}
              aria-label="채널"
              className="h-10 rounded-card border border-line bg-overlay px-2.5 text-[13px] font-medium text-fg outline-none transition-colors hover:border-line-strong focus-visible:outline-2 focus-visible:outline-primary"
            >
              {CHANNEL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as SourceKind)}
              aria-label="기준 종류"
              className="h-10 rounded-card border border-line bg-overlay px-2.5 text-[13px] font-medium text-fg outline-none transition-colors hover:border-line-strong focus-visible:outline-2 focus-visible:outline-primary"
            >
              {KIND_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={KIND_PLACEHOLDER[kind]}
              aria-label="수집 값"
              className="h-10 min-w-52 flex-1 rounded-card border border-line bg-body px-3 text-[14px] placeholder:text-fg-faint focus:border-primary focus:outline-none"
            />
            <Button type="submit" size="md" disabled={submitting}>
              등록
            </Button>
          </form>

          {formMsg ? (
            formMsg.tone === "error" ? (
              <p role="alert" className="text-[13px] text-negative">
                {formMsg.text}
              </p>
            ) : (
              <p role="status" className="flex items-start gap-1.5 text-[13px] text-fg-sub">
                <Info className="mt-0.5 size-3.5 shrink-0 text-fg-faint" aria-hidden />
                {formMsg.text}
              </p>
            )
          ) : null}

          {sources.length > 0 ? (
            <ul className="flex flex-wrap gap-2" aria-label="등록된 수집 기준">
              {sources.map((s) => (
                <li
                  key={s.id}
                  className="inline-flex items-center gap-1.5 rounded-chip border border-line bg-overlay px-3 py-1.5 text-[13px]"
                >
                  <span aria-hidden>{CHANNEL_GLYPH[s.channel]}</span>
                  <span className="text-[11px] font-semibold text-fg-faint">
                    {KIND_LABEL[s.kind]}
                  </span>
                  <span className="font-medium text-fg">{s.value}</span>
                  <button
                    type="button"
                    aria-label={`${s.value} 기준 삭제`}
                    onClick={() => handleRemove(s.id)}
                    className="text-fg-faint transition-colors hover:text-negative"
                  >
                    <X className="size-3.5" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-fg-faint">
              아직 등록한 기준이 없어요 — 위에서 첫 기준을 추가해보세요.
            </p>
          )}
        </CardBody>
      </Card>

      {/* 수집 필터 — 기간·한국·형식·제외 키워드 (수집 실행에 적용) */}
      <Card>
        <CardHeader
          title="수집 필터"
          description="다음 수집부터 적용돼요. 이미 수집된 카드에는 영향을 주지 않습니다."
        />
        <CardBody className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={settings.period}
              onChange={(e) => void updateSettings({ ...settings, period: e.target.value as CollectSettings["period"] })}
              aria-label="발행 기간"
              className="h-9 rounded-card border border-line bg-overlay px-2.5 text-[13px] font-medium text-fg outline-none transition-colors hover:border-line-strong focus-visible:outline-2 focus-visible:outline-primary"
            >
              {PERIOD_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <select
              value={settings.mediaFormat}
              onChange={(e) =>
                void updateSettings({ ...settings, mediaFormat: e.target.value as CollectSettings["mediaFormat"] })
              }
              aria-label="콘텐츠 형식"
              className="h-9 rounded-card border border-line bg-overlay px-2.5 text-[13px] font-medium text-fg outline-none transition-colors hover:border-line-strong focus-visible:outline-2 focus-visible:outline-primary"
            >
              {FORMAT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              aria-pressed={settings.krOnly}
              onClick={() => void updateSettings({ ...settings, krOnly: !settings.krOnly })}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-chip px-3.5 py-1.5 text-[13px] font-semibold transition-colors",
                settings.krOnly
                  ? "bg-primary text-on-primary"
                  : "border border-line bg-overlay text-fg-sub hover:border-line-strong hover:text-fg",
              )}
            >
              한국 콘텐츠만
            </button>
            <InfoTip>
              틱톡은 게시물의 국가 정보로, 인스타그램·스레드는 국가 정보가 제공되지 않아 한글 포함
              여부로 판단합니다. 형식 필터는 채널 특성상 틱톡은 전부 영상, 카드뉴스(캐러셀)는
              인스타그램에서만 걸러져요.
            </InfoTip>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={excludeInput}
              onChange={(e) => setExcludeInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addExcludeKeyword();
                }
              }}
              placeholder="제외 키워드 (예: 광고, 협찬)"
              aria-label="제외 키워드"
              className="h-9 w-56 rounded-card border border-line bg-body px-3 text-[13px] placeholder:text-fg-faint focus:border-primary focus:outline-none"
            />
            <Button type="button" variant="secondary" size="sm" onClick={addExcludeKeyword}>
              추가
            </Button>
            {settings.excludeKeywords.map((k) => (
              <span
                key={k}
                className="inline-flex items-center gap-1.5 rounded-chip border border-line bg-overlay px-3 py-1 text-[13px]"
              >
                {k}
                <button
                  type="button"
                  aria-label={`제외 키워드 ${k} 삭제`}
                  onClick={() =>
                    void updateSettings({
                      ...settings,
                      excludeKeywords: settings.excludeKeywords.filter((x) => x !== k),
                    })
                  }
                  className="text-fg-faint transition-colors hover:text-negative"
                >
                  <X className="size-3" aria-hidden />
                </button>
              </span>
            ))}
          </div>

          {settingsMsg ? (
            <p role="alert" className="text-[13px] text-negative">
              {settingsMsg}
            </p>
          ) : null}
          {isDemo ? (
            <p className="text-[12px] text-fg-faint">
              데모 모드에서는 필터가 저장되지 않아요 — 실제 계정에서는 자동 저장됩니다.
            </p>
          ) : null}
        </CardBody>
      </Card>

      {/* 수집 결과 헤더 + 지금 수집 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-baseline gap-2 text-[19px] font-bold leading-snug">
          수집된 레퍼런스
          {items.length > 0 ? (
            <span className="tnum text-[14px] font-semibold text-fg-sub">{filtered.length}건</span>
          ) : null}
        </h3>
        <Button
          size="sm"
          onClick={handleCollect}
          disabled={collecting}
          aria-busy={collecting}
          title="등록한 기준으로 즉시 수집을 실행해요"
        >
          <Zap className="size-4" aria-hidden />
          {collecting ? "수집 중" : "지금 수집"}
        </Button>
      </div>

      {collectNotice ? (
        collectNotice.tone === "error" ? (
          <p role="alert" className="text-[13px] text-negative">
            {collectNotice.text}
          </p>
        ) : (
          <p role="status" className="flex items-start gap-1.5 text-[13px] text-fg-sub">
            <Info className="mt-0.5 size-3.5 shrink-0 text-fg-faint" aria-hidden />
            {collectNotice.text}
          </p>
        )
      ) : null}

      {/* 필터 — 수집 결과가 있을 때만 의미가 있다 */}
      {items.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <ChipFilter options={CHANNEL_FILTER_OPTIONS} value={filter} onChange={setFilter} />
          <button
            type="button"
            aria-pressed={favOnly}
            onClick={() => setFavOnly((v) => !v)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-chip px-3.5 py-1.5 text-[13px] font-semibold transition-colors",
              favOnly
                ? "bg-primary text-on-primary"
                : "border border-line bg-overlay text-fg-sub hover:border-line-strong hover:text-fg",
            )}
          >
            <Bookmark className="size-3.5" fill={favOnly ? "currentColor" : "none"} aria-hidden />
            즐겨찾기만
          </button>
        </div>
      ) : null}

      {/* 수집 로딩 오버레이 — 핀치 로고 둘레를 빛이 도는 오빗 링 */}
      {collecting ? (
        <div
          role="status"
          aria-live="polite"
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-surface/85 backdrop-blur-sm"
        >
          <div className="collect-orbit">
            <FinchMark className="size-12 text-primary" />
          </div>
          <div className="text-center">
            <p className="text-[17px] font-bold">레퍼런스를 모으는 중이에요</p>
            <p className="mt-1.5 text-[14px] text-fg-sub">
              {isDemo
                ? "데모 수집을 실행하고 있어요"
                : "등록한 기준으로 콘텐츠를 수집하고 AI가 요약과 후킹 태그를 붙입니다 — 수십 초 걸릴 수 있어요"}
            </p>
          </div>
        </div>
      ) : null}

      {/* 수집 결과 — 사유별 정직한 빈 상태 안내 */}
      {filtered.length > 0 ? (
        <section
          aria-label="수집된 레퍼런스 목록"
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
        >
          {filtered.map((item) => (
            <ReferenceCard
              key={item.id}
              item={item}
              favorite={favoriteIds.has(item.id)}
              onToggleFavorite={() => toggleFavorite(item.id)}
            />
          ))}
        </section>
      ) : items.length > 0 ? (
        <EmptyState
          icon={SearchX}
          title="이 조건에 맞는 레퍼런스가 없어요"
          description="채널 필터를 '전체'로 바꾸거나 즐겨찾기 필터를 해제해보세요."
        />
      ) : sources.length === 0 ? (
        <EmptyState
          icon={FolderPlus}
          title="아직 등록한 수집 기준이 없어요"
          description="위에서 키워드나 계정을 등록하고 '지금 수집'을 누르면 바로 모으기 시작해요."
        />
      ) : (
        <EmptyState
          icon={Zap}
          title="이제 수집할 준비가 됐어요"
          description={`기준 ${sources.length}개 등록됨 — '지금 수집'을 누르면 이 기준으로 첫 수집이 시작됩니다.`}
        />
      )}

      {/* 하단 안내 — 스튜디오 연결 */}
      <Card className="flex items-start gap-3 p-4">
        <Info className="mt-0.5 size-4 shrink-0 text-fg-faint" aria-hidden />
        <p className="text-[13px] leading-relaxed text-fg-sub">
          수집된 레퍼런스는 AI 스튜디오와 연결됩니다 — 카드에서 바로 카드뉴스 제작으로 넘어갈 수
          있어요.
        </p>
      </Card>
    </div>
  );
}

function ReferenceCard({
  item,
  favorite,
  onToggleFavorite,
}: {
  item: ReferenceItem;
  favorite: boolean;
  onToggleFavorite: () => void;
}) {
  const router = useRouter();

  /* 레퍼런스 → 스튜디오 원클릭 핸드오프 — 트렌드 탐색과 같은 localStorage 채널 사용 */
  function makeCardNews() {
    try {
      localStorage.setItem(
        "finch:studio:pending",
        JSON.stringify({
          topic: item.title,
          note: `이 레퍼런스를 참고해 새로 써줘. 요약: ${item.summary} 후킹 기법 '${item.hooks[0] ?? "호기심"}' 각도를 살리되, 베끼지 말고 구조만 참고할 것.`,
        }),
      );
    } catch {
      // localStorage 실패해도 이동은 계속 — 스튜디오에서 주제만 비어있을 뿐
    }
    router.push("/studio");
  }

  const PlaceholderGlyph =
    item.channel === "instagram" ? InstagramGlyph : item.channel === "tiktok" ? TiktokGlyph : ThreadsGlyph;

  return (
    <Card hover className="flex flex-col overflow-hidden">
      {/* 썸네일 미리보기 — Storage 캐시본. 없으면(텍스트 글·캐시 실패·과거 수집분) 채널 글리프 */}
      {item.thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- Storage 캐시 URL이라 최적화 프록시를 거치지 않는다
        <img
          src={item.thumbnailUrl}
          alt=""
          loading="lazy"
          className="aspect-video w-full border-b border-line bg-overlay object-cover"
        />
      ) : (
        <div className="flex aspect-video items-center justify-center border-b border-line bg-overlay" aria-hidden>
          <PlaceholderGlyph className="size-9 text-fg-faint" />
        </div>
      )}

      <div className="flex flex-1 flex-col gap-2.5 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <ChannelBadge channel={item.channel} />
          <Badge>{item.category}</Badge>
        </div>
        <button
          type="button"
          aria-pressed={favorite}
          aria-label={favorite ? "즐겨찾기 해제" : "즐겨찾기"}
          onClick={onToggleFavorite}
          className={cn(
            "shrink-0 rounded-card p-1.5 transition-colors",
            favorite ? "text-primary" : "text-fg-faint hover:bg-overlay hover:text-fg-sub",
          )}
        >
          <Bookmark className="size-4" fill={favorite ? "currentColor" : "none"} aria-hidden />
        </button>
      </div>

      <div className="min-w-0">
        <p className="line-clamp-2 text-[15px] font-semibold leading-snug">{item.title}</p>
        <p className="mt-1 text-[13px] text-fg-sub">{item.creatorHandle}</p>
      </div>

      {/* AI 요약 — 영상을 재생하지 않아도 내용이 파악되게 */}
      <p className="line-clamp-3 text-[13px] leading-relaxed text-fg-sub">{item.summary}</p>

      {/* 후킹 기법 태그 — 자체 분석, 고지 필수 */}
      {item.hooks.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {item.hooks.map((h) => (
            <span
              key={h}
              className="inline-flex items-center rounded-chip bg-primary-weak px-2 py-0.5 text-[11px] font-semibold text-primary"
            >
              {h}
            </span>
          ))}
          <InfoTip>
            핀치 AI가 분석한 후킹 기법 태그로, 플랫폼 공식 데이터가 아닌 자체 추정치입니다.
          </InfoTip>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-fg-sub">
        {item.views > 0 ? (
          <span>
            조회수 <span className="tnum font-semibold text-fg">{formatCompact(item.views)}</span>
          </span>
        ) : null}
        <span>
          좋아요 <span className="tnum font-semibold text-fg">{formatCompact(item.likes)}</span>
        </span>
        <span className="tnum text-fg-faint">{item.collectedAgoHours}시간 전 수집</span>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-fg-faint">
        <span>&lsquo;{item.matchedSource}&rsquo; 기준으로 수집</span>
        {item.url ? (
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-semibold text-fg-sub transition-colors hover:text-primary"
          >
            원본 보기
            <ExternalLink className="size-3" aria-hidden />
          </a>
        ) : null}
      </div>

      <div className="mt-auto border-t border-line pt-3">
        <Button
          variant="secondary"
          size="sm"
          onClick={makeCardNews}
          title="이 레퍼런스의 주제와 후킹 각도를 AI 스튜디오로 가져가요"
          className="w-full"
        >
          <Sparkles className="size-3.5" aria-hidden />
          이 레퍼런스로 카드뉴스
        </Button>
      </div>
      </div>
    </Card>
  );
}
