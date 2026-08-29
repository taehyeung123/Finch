"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bookmark, Captions, Download, ExternalLink, Eye, Heart, Loader2, MessageCircle, Share2, Sparkles, Trash2, X } from "lucide-react";
import { InstagramGlyph, ThreadsGlyph, TiktokGlyph } from "@/components/icons/brand";
import type { Channel, ReferenceItem } from "@/lib/types";
import {
  deleteReferenceItem,
  extractTranscript,
  saveReferenceNote,
  setReferenceStatus,
} from "@/lib/actions/reference";
import { analyzePoolCreative, extractPoolTranscript, type PoolVideoAnalysis } from "../pool-actions";
import { formatCompact } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Badge, ChannelBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";

/*
  레퍼런스 상세 모달 — 카드 클릭 시. 미리보기 크게 + AI 분석 + 원본 캡션 전문 +
  릴스 대본 추출(인스타 전용, 음성 받아쓰기) + 내 메모 + 확인 상태 + 삭제.

  poolMode: 공용 풀 소재를 볼 때다. 개인 표(reference_items)를 건드리는 기능은
  감춘다 — 남겨두면 누를 수 있지만 대상 행이 없어 조용히 실패한다.
  "눌러도 아무 일도 안 일어나는 버튼"이 에러 메시지보다 나쁘다.
   · 삭제 — 공용 자료라 한 사람이 지울 수 없다(신고는 별도 경로)
   · 메모·확인 상태 — saved_creatives 로 옮겨야 하는데 아직 배선 전이라 감춘다
  대본 추출은 poolMode 에서도 **동작한다** — extractPoolTranscript 가
  creative_transcripts 공용 캐시를 먼저 보고, 이미 추출된 건 무료로 준다.
  이미지 저장·공유는 양쪽 모두 기본 제공(광고 상세와 같은 수준).
*/

const GLYPH: Record<Channel, (props: { className?: string }) => React.ReactNode> = {
  instagram: InstagramGlyph,
  tiktok: TiktokGlyph,
  threads: ThreadsGlyph,
};

const STATUS_OPTIONS: { value: NonNullable<ReferenceItem["status"]>; label: string }[] = [
  { value: "unseen", label: "안 봄" },
  { value: "seen", label: "봤음" },
  { value: "skipped", label: "건너뜀" },
];

/** 오래 걸리는 AI 작업 자리 — 버튼 라벨만 바꾸면 눈에 안 띈다는 지적(2026-08-13)로
    결과가 나타날 자리에 스피너 + 뼈대 줄을 미리 깔아 "일하고 있다"를 보이게 한다. */
function WorkingBlock({ label }: { label: string }) {
  return (
    <div role="status" aria-live="polite" className="anim-swap mt-1.5 space-y-2.5 rounded-card border border-line bg-body px-3 py-3">
      <p className="flex items-center gap-2 text-[14px] font-medium text-fg-sub">
        <Loader2 className="size-4 animate-spin text-primary" aria-hidden />
        {label}
      </p>
      <div className="space-y-1.5" aria-hidden>
        <div className="h-2.5 w-4/5 animate-pulse rounded-chip bg-plate" />
        <div className="h-2.5 w-3/5 animate-pulse rounded-chip bg-plate" />
        <div className="h-2.5 w-2/3 animate-pulse rounded-chip bg-plate" />
      </div>
    </div>
  );
}

export function ReferenceDetailModal({
  item,
  favorite,
  isDemo,
  poolMode = false,
  onToggleFavorite,
  onClose,
  onDeleted,
}: {
  item: ReferenceItem;
  favorite: boolean;
  isDemo: boolean;
  /** 공용 풀 소재인가 — 개인 표를 건드리는 기능을 감춘다 */
  poolMode?: boolean;
  onToggleFavorite: () => void;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const router = useRouter();
  const [note, setNote] = useState(item.note ?? "");
  const [noteMsg, setNoteMsg] = useState<string | null>(null);
  const [noteSaving, setNoteSaving] = useState(false);
  const [status, setStatus] = useState<NonNullable<ReferenceItem["status"]>>(item.status ?? "unseen");
  const [transcript, setTranscript] = useState(item.transcript ?? "");
  const [transcriptMsg, setTranscriptMsg] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<PoolVideoAnalysis | null>(null);
  const [analysisMsg, setAnalysisMsg] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const Glyph = GLYPH[item.channel];
  const empathy = item.views > 0 ? (((item.likes + (item.comments ?? 0)) / item.views) * 100).toFixed(2) : null;

  function pushToStudio() {
    try {
      localStorage.setItem(
        "finch:studio:pending",
        JSON.stringify({
          topic: item.title,
          note: `이 레퍼런스를 참고해 새로 써줘. 요약: ${item.summary} 후킹 기법 '${item.hooks[0] ?? "호기심"}' 각도를 살리되, 베끼지 말고 구조만 참고할 것.`,
        }),
      );
    } catch {
      // localStorage 실패해도 이동은 계속
    }
    router.push("/studio");
  }

  async function handleSaveNote() {
    if (noteSaving) return;
    setNoteSaving(true);
    setNoteMsg(null);
    const result = await saveReferenceNote(item.id, note);
    setNoteSaving(false);
    setNoteMsg(result.ok ? "저장했어요" : (result.error ?? "저장에 실패했습니다."));
  }

  async function handleStatus(next: NonNullable<ReferenceItem["status"]>) {
    setStatus(next); // 낙관적 — 데모는 화면 상태로만
    if (!isDemo) await setReferenceStatus(item.id, next);
  }

  async function handleExtract() {
    if (extracting) return;
    setExtracting(true);
    setTranscriptMsg(null);
    /* 풀 소재는 id 가 creatives 의 것이라 개인용 액션이 행을 못 찾는다 — 경로 분리 */
    const result = poolMode ? await extractPoolTranscript(item.id) : await extractTranscript(item.id);
    setExtracting(false);
    if (result.ok) setTranscript(result.transcript);
    else setTranscriptMsg(result.error);
  }

  async function handleAnalyze() {
    if (analyzing) return;
    setAnalyzing(true);
    setAnalysisMsg(null);
    const result = await analyzePoolCreative(item.id);
    setAnalyzing(false);
    if (result.ok) {
      setAnalysis(result.analysis);
      // 분석 과정에서 대본이 새로 추출됐으면 대본 칸도 같이 채운다 — 두 번 살 필요 없다
      if (result.transcript && !transcript) setTranscript(result.transcript);
    } else {
      setAnalysisMsg(result.error);
    }
  }

  /** 이미지 저장 — Storage 가 교차 출처라 a[download] 만으로는 이동해 버린다. blob 으로 받는다 */
  async function downloadImage() {
    if (!item.thumbnailUrl) {
      setActionMsg("이 게시물은 저장할 이미지가 없어요.");
      return;
    }
    try {
      const res = await fetch(item.thumbnailUrl);
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `finch-${(item.creatorHandle || item.title).replace(/[\\/:*?"<>|@\s]+/g, "_")}.jpg`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setActionMsg("이미지를 저장했어요.");
    } catch {
      setActionMsg("이미지 저장에 실패했어요 — 원본에서 직접 저장해 주세요.");
    }
  }

  /** 공유 — 기기 공유 시트, 없으면 원본 링크 복사 */
  async function share() {
    const url = item.url;
    if (!url) {
      setActionMsg("공유할 원본 링크가 없어요.");
      return;
    }
    try {
      if (navigator.share) {
        await navigator.share({ title: item.title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setActionMsg("링크를 복사했어요.");
    } catch {
      // 공유 시트를 닫은 경우 — 조용히
    }
  }

  async function handleDelete() {
    if (deleting) return;
    if (isDemo) {
      setNoteMsg("데모 모드에서는 삭제할 수 없어요.");
      setConfirmDelete(false);
      return;
    }
    setDeleting(true);
    const result = await deleteReferenceItem(item.id);
    setDeleting(false);
    if (result.ok) onDeleted();
    else setNoteMsg("삭제에 실패했습니다. 잠시 후 다시 시도해주세요.");
  }

  return (
    <div
      className="modal-scrim-in fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`${item.title} 상세`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-card-in shadow-pop flex max-h-[94dvh] w-full max-w-3xl flex-col rounded-card border border-line bg-body">
        {/* 헤더 */}
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <ChannelBadge channel={item.channel} />
            <Badge>{item.category}</Badge>
            {item.matchedSource ? (
              <span className="text-[14px] text-fg-sub">
                &lsquo;{item.matchedSource}&rsquo; 기준 · {item.collectedAgoHours}시간 전 수집
              </span>
            ) : (
              /* 공용 풀 소재에는 개인 "수집 기준"이 없다 — 빈 따옴표만 남기지 않는다 */
              <span className="text-[14px] text-fg-sub">{item.collectedAgoHours}시간 전 수집</span>
            )}
          </div>
          <button
            type="button"
            aria-label="닫기"
            onClick={onClose}
            className="relative after:absolute after:-inset-1 after:content-[''] rounded-card p-1.5 text-fg-faint hover:bg-tint-hover hover:text-fg"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* 본문 */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          <div className="grid gap-5 sm:grid-cols-[minmax(0,260px)_minmax(0,1fr)]">
            {/* 미리보기 */}
            <div className="space-y-2.5">
              {item.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- Storage 캐시 URL
                <img
                  src={item.thumbnailUrl}
                  alt=""
                  className="aspect-[4/5] w-full rounded-card border border-line bg-body object-cover"
                />
              ) : (
                <div
                  className="flex aspect-[4/5] items-center justify-center rounded-card border border-line bg-body"
                  aria-hidden
                >
                  <Glyph className="size-12 text-fg-faint" />
                </div>
              )}
              {item.url ? (
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-9 w-full items-center justify-center gap-1.5 rounded-card border border-line bg-body text-[14px] font-semibold text-fg trans-state hover:border-primary hover:text-primary"
                >
                  원본 새 탭으로 열기
                  <ExternalLink className="size-3.5" aria-hidden />
                </a>
              ) : null}
              {/* 기본 행동 — 광고 상세와 같은 수준으로 맞춘다 */}
              <div className="grid grid-cols-2 gap-2">
                <Button variant="secondary" size="sm" onClick={downloadImage}>
                  <Download className="size-3.5" aria-hidden />
                  이미지 저장
                </Button>
                <Button variant="secondary" size="sm" onClick={share}>
                  <Share2 className="size-3.5" aria-hidden />
                  공유하기
                </Button>
              </div>
              {actionMsg ? (
                <p role="status" className="text-[12px] text-fg-sub">
                  {actionMsg}
                </p>
              ) : null}
            </div>

            {/* 정보 */}
            <div className="min-w-0 space-y-4">
              <div>
                <h2 className="text-[17px] font-bold leading-snug">{item.title}</h2>
                <p className="mt-1 text-[14px] text-fg-sub">{item.creatorHandle}</p>
              </div>

              {/* 지표 */}
              <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 text-[14px]">
                {item.views > 0 ? (
                  <span className="inline-flex items-center gap-1 text-fg-sub">
                    <Eye className="size-3.5 text-fg-faint" aria-hidden />
                    <span className="tnum font-semibold text-fg">{formatCompact(item.views)}</span>
                  </span>
                ) : null}
                <span className="inline-flex items-center gap-1 text-fg-sub">
                  <Heart className="size-3.5 text-fg-faint" aria-hidden />
                  <span className="tnum font-semibold text-fg">{formatCompact(item.likes)}</span>
                </span>
                {(item.comments ?? 0) > 0 ? (
                  <span className="inline-flex items-center gap-1 text-fg-sub">
                    <MessageCircle className="size-3.5 text-fg-faint" aria-hidden />
                    <span className="tnum font-semibold text-fg">{formatCompact(item.comments ?? 0)}</span>
                  </span>
                ) : null}
                {empathy ? (
                  <span className="inline-flex items-center gap-1 rounded-chip bg-positive-weak px-2 py-0.5 text-[11px] font-semibold text-positive">
                    공감률 <span className="tnum">{empathy}%</span>
                    <InfoTip>(좋아요+댓글) ÷ 조회수. 핀치 자체 계산이에요.</InfoTip>
                  </span>
                ) : null}
              </div>

              {/* AI 요약·코멘트 */}
              <div className="space-y-2">
                <p className="text-[14px] leading-relaxed text-fg-sub">{item.summary}</p>
                {item.aiComment ? (
                  <p className="flex items-start gap-1.5 rounded-card bg-body px-3 py-2.5 text-[14px] leading-relaxed text-fg-sub">
                    <Sparkles className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
                    <span>
                      {item.aiComment}
                      <InfoTip>핀치 AI의 반응 요인 분석 — 자체 추정치입니다.</InfoTip>
                    </span>
                  </p>
                ) : null}
              </div>

              {/* 후킹·해시태그 */}
              {item.hooks.length > 0 || (item.hashtags?.length ?? 0) > 0 ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  {item.hooks.map((h) => (
                    <span
                      key={h}
                      className="inline-flex items-center rounded-chip bg-primary-weak px-2 py-0.5 text-[11px] font-semibold text-primary"
                    >
                      {h}
                    </span>
                  ))}
                  {(item.hashtags ?? []).map((t) => (
                    <span key={t} className="text-[12px] text-fg-faint">
                      {t}
                    </span>
                  ))}
                </div>
              ) : null}

              {/* 원본 캡션 전문 */}
              {item.caption ? (
                <div>
                  <p className="text-[14px] font-semibold">원본 캡션</p>
                  <div className="mt-1.5 max-h-36 overflow-y-auto whitespace-pre-wrap rounded-card border border-line bg-body px-3 py-2.5 text-[14px] leading-relaxed text-fg-sub">
                    {item.caption}
                  </div>
                </div>
              ) : null}

              {/* 릴스 대본 — 음성 받아쓰기 (인스타 전용).
                  풀 소재는 extractPoolTranscript(공용 캐시 우선) 경로로 동작한다. */}
              <div>
                <p className="flex items-center gap-1.5 text-[14px] font-semibold">
                  <Captions className="size-3.5 text-fg-faint" aria-hidden />
                  릴스 대본
                  <InfoTip>
                    영상 음성을 받아써서 재생 없이 내용을 읽을 수 있게 합니다. 현재 인스타그램 릴스(2분
                    미만, 말로 설명하는 영상)만 지원돼요.
                    {poolMode ? " 다른 사용자가 이미 추출해 둔 대본은 크레딧 차감 없이 바로 불러와요." : null}
                  </InfoTip>
                </p>
                {transcript ? (
                  <div className="anim-swap mt-1.5 max-h-36 overflow-y-auto whitespace-pre-wrap rounded-card border border-line bg-body px-3 py-2.5 text-[14px] leading-relaxed text-fg-sub">
                    {transcript}
                  </div>
                ) : extracting ? (
                  <WorkingBlock label="영상 음성을 받아쓰고 있어요 — 보통 10~30초 걸려요" />
                ) : (
                  <div className="mt-1.5">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={handleExtract}
                      disabled={item.channel !== "instagram"}
                    >
                      대본 추출
                    </Button>
                    {item.channel !== "instagram" ? (
                      <span className="ml-2 text-[12px] text-fg-faint">인스타그램 릴스만 지원</span>
                    ) : null}
                    {transcriptMsg ? (
                      <p role="alert" className="mt-1.5 text-[14px] text-negative">
                        {transcriptMsg}
                      </p>
                    ) : null}
                  </div>
                )}
              </div>

              {/* AI 영상 분석 — 풀 전용. 대본 기반 후킹 구조 분석, creative_analyses 공용 캐시 */}
              {poolMode ? (
                <div>
                  <p className="flex items-center gap-1.5 text-[14px] font-semibold">
                    <Sparkles className="size-3.5 text-fg-faint" aria-hidden />
                    AI 영상 분석
                    <InfoTip>
                      대본을 바탕으로 첫 3초 훅·전개 구조·타깃을 분석해요. 무료로 제공되고, 다른
                      사용자가 이미 분석한 영상은 결과가 바로 보여요.
                    </InfoTip>
                  </p>
                  {analysis ? (
                    <div className="anim-swap mt-1.5 space-y-2.5 rounded-card border border-line bg-body px-3 py-2.5">
                      {analysis.hookTags.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {analysis.hookTags.map((h) => (
                            <span
                              key={h}
                              className="inline-flex items-center rounded-chip bg-primary-weak px-2 py-0.5 text-[11px] font-semibold text-primary"
                            >
                              {h}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      {analysis.opening ? (
                        <div>
                          <p className="text-[12px] font-semibold text-fg-sub">첫 3초</p>
                          <p className="mt-0.5 text-[14px] leading-relaxed">{analysis.opening}</p>
                        </div>
                      ) : null}
                      {analysis.flow.length > 0 ? (
                        <div>
                          <p className="text-[12px] font-semibold text-fg-sub">전개 구조</p>
                          <ol className="mt-0.5 list-decimal space-y-0.5 pl-4 text-[14px] leading-relaxed">
                            {analysis.flow.map((step, i) => (
                              <li key={i}>{step}</li>
                            ))}
                          </ol>
                        </div>
                      ) : null}
                      {analysis.target ? (
                        <div>
                          <p className="text-[12px] font-semibold text-fg-sub">타깃 추정</p>
                          <p className="mt-0.5 text-[14px] leading-relaxed">{analysis.target}</p>
                        </div>
                      ) : null}
                      {analysis.improvement ? (
                        <div>
                          <p className="text-[12px] font-semibold text-fg-sub">적용 포인트</p>
                          <p className="mt-0.5 text-[14px] leading-relaxed">{analysis.improvement}</p>
                        </div>
                      ) : null}
                    </div>
                  ) : analyzing ? (
                    <WorkingBlock label="영상 구조를 분석하고 있어요 — 보통 10~40초 걸려요" />
                  ) : (
                    <div className="mt-1.5">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleAnalyze}
                        disabled={item.channel !== "instagram"}
                      >
                        영상 분석
                      </Button>
                      {item.channel !== "instagram" ? (
                        <span className="ml-2 text-[12px] text-fg-faint">인스타그램 릴스만 지원</span>
                      ) : null}
                      {analysisMsg ? (
                        <p role="alert" className="mt-1.5 text-[14px] text-negative">
                          {analysisMsg}
                        </p>
                      ) : null}
                    </div>
                  )}
                </div>
              ) : null}

              {/* 내 메모 */}
              <div hidden={poolMode}>
                <p className="text-[14px] font-semibold">내 메모</p>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="이 레퍼런스에서 배울 점, 적용 아이디어…"
                  rows={3}
                  className="mt-1.5 w-full resize-y rounded-card border border-line bg-body px-3 py-2.5 text-[14px] leading-relaxed placeholder:text-fg-faint focus:border-primary focus:outline-none"
                />
                <div className="mt-1.5 flex items-center gap-2">
                  <Button variant="secondary" size="sm" onClick={handleSaveNote} disabled={noteSaving}>
                    메모 저장
                  </Button>
                  {noteMsg ? <span className="text-[14px] text-fg-sub">{noteMsg}</span> : null}
                </div>
              </div>

              {/* 확인 상태 */}
              <label hidden={poolMode} className="flex items-center gap-2 text-[14px] text-fg-sub">
                확인 상태
                <select
                  value={status}
                  onChange={(e) => void handleStatus(e.target.value as NonNullable<ReferenceItem["status"]>)}
                  className="h-8 rounded-card border border-line bg-body px-2.5 text-[14px] font-medium text-fg outline-none trans-state hover:border-line-strong focus-visible:outline-2 focus-visible:outline-primary"
                >
                  {STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        </div>

        {/* 푸터 */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3.5">
          <div className="flex items-center gap-2">
            {poolMode ? null : confirmDelete ? (
              <>
                <Button variant="danger" size="sm" onClick={handleDelete} disabled={deleting}>
                  정말 삭제
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
                  취소
                </Button>
              </>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="size-3.5" aria-hidden />
                삭제
              </Button>
            )}
            {poolMode ? (
              /* 풀에서는 저장이 주 행동이다 — 아이콘이 아니라 광고 상세와 같은 라벨 버튼으로 */
              <Button size="sm" variant={favorite ? "secondary" : "primary"} onClick={onToggleFavorite}>
                <Bookmark className="size-4" fill={favorite ? "currentColor" : "none"} aria-hidden />
                {favorite ? "스크랩 해제" : "스크랩"}
              </Button>
            ) : (
              <button
                type="button"
                aria-pressed={favorite}
                aria-label={favorite ? "스크랩 해제" : "스크랩"}
                onClick={onToggleFavorite}
                className={cn(
                  "rounded-card p-1.5 trans-state",
                  favorite ? "text-primary" : "text-fg-faint hover:bg-tint-hover hover:text-fg-sub",
                )}
              >
                <Bookmark className="size-4" fill={favorite ? "currentColor" : "none"} aria-hidden />
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={onClose}>
              닫기
            </Button>
            <Button size="sm" onClick={pushToStudio}>
              <Sparkles className="size-3.5" aria-hidden />
              이 레퍼런스로 카드뉴스
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
