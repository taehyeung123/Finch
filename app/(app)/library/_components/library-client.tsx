"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Bookmark, FolderPlus, Hourglass, Info, SearchX, Sparkles, X, Zap } from "lucide-react";
import { InstagramGlyph, ThreadsGlyph, TiktokGlyph } from "@/components/icons/brand";
import type { Channel, ChannelFilter, ReferenceItem, ReferenceSource } from "@/lib/types";
import { addReferenceSource, removeReferenceSource } from "@/lib/actions/reference";
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
  isDemo,
}: {
  sources: ReferenceSource[];
  items: ReferenceItem[];
  isDemo: boolean;
}) {
  /* 수집 기준 — 서버 액션 성공/실패에 맞춰 로컬에서 직접 동기화 */
  const [sources, setSources] = useState<ReferenceSource[]>(initialSources);
  const [channel, setChannel] = useState<Channel>("instagram");
  const [kind, setKind] = useState<SourceKind>("keyword");
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formMsg, setFormMsg] = useState<FormMessage | null>(null);

  /* 지금 수집 — 데모는 짧은 시뮬레이션, 실 모드는 정직한 준비중 안내 */
  const [collecting, setCollecting] = useState(false);
  const [collectNotice, setCollectNotice] = useState<string | null>(null);

  /* 필터·즐겨찾기 */
  const [filter, setFilter] = useState<ChannelFilter>("all");
  const [favOnly, setFavOnly] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());

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

  function handleCollect() {
    if (!isDemo) {
      setCollectNotice(
        "수집 엔진은 데이터 공급사 연동 후 열립니다. 지금 기준을 등록해두면 연동 즉시 첫 수집이 시작돼요.",
      );
      return;
    }
    if (collecting) return;
    setCollectNotice(null);
    setCollecting(true);
    // 이벤트 핸들러 안의 타이머 — 데모 수집 시뮬레이션 (약 1.2초)
    setTimeout(() => {
      setCollecting(false);
      setCollectNotice("데모 수집 완료 — 실제 수집은 데이터 연동 후 제공됩니다");
    }, 1200);
  }

  function toggleFavorite(id: string) {
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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
          aria-disabled={!isDemo || collecting}
          aria-busy={collecting}
          title={
            isDemo
              ? "등록한 기준으로 즉시 수집을 실행해요 (데모 시뮬레이션)"
              : "수집 엔진은 데이터 공급사 연동 후 열립니다"
          }
          className={cn((!isDemo || collecting) && "opacity-40")}
        >
          <Zap className="size-4" aria-hidden />
          {collecting ? "수집 중" : "지금 수집"}
        </Button>
      </div>

      {collectNotice ? (
        <p role="status" className="flex items-start gap-1.5 text-[13px] text-fg-sub">
          <Info className="mt-0.5 size-3.5 shrink-0 text-fg-faint" aria-hidden />
          {collectNotice}
        </p>
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

      {/* 데모 수집 시뮬레이션 — 짧은 스켈레톤 행 */}
      {collecting ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-hidden>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-40 animate-pulse rounded-card border border-line bg-overlay" />
          ))}
        </div>
      ) : null}

      {/* 수집 결과 — 사유별 정직한 빈 상태 안내 */}
      {!isDemo ? (
        sources.length === 0 ? (
          <EmptyState
            icon={FolderPlus}
            title="아직 등록한 수집 기준이 없어요"
            description="위에서 키워드나 계정을 등록해두면 수집 엔진 연동 즉시 모으기 시작해요."
          />
        ) : (
          <EmptyState
            icon={Hourglass}
            title="수집 엔진 연동을 준비하고 있어요"
            description={`기준 ${sources.length}개 등록됨 — 연동되면 이 기준으로 첫 수집이 자동 실행됩니다.`}
          />
        )
      ) : filtered.length > 0 ? (
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
      ) : (
        <EmptyState
          icon={SearchX}
          title="이 조건에 맞는 레퍼런스가 없어요"
          description="채널 필터를 '전체'로 바꾸거나 즐겨찾기 필터를 해제해보세요."
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

  return (
    <Card hover className="flex flex-col gap-2.5 p-4">
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
        <span>
          조회수 <span className="tnum font-semibold text-fg">{formatCompact(item.views)}</span>
        </span>
        <span>
          좋아요 <span className="tnum font-semibold text-fg">{formatCompact(item.likes)}</span>
        </span>
        <span className="tnum text-fg-faint">{item.collectedAgoHours}시간 전 수집</span>
      </div>

      <p className="text-[12px] text-fg-faint">
        &lsquo;{item.matchedSource}&rsquo; 기준으로 수집
      </p>

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
    </Card>
  );
}
