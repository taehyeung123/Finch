"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Megaphone, Plus, TriangleAlert, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatCompact } from "@/lib/format";
import { applyAdDisclosure } from "@/lib/ads/ad-disclosure";
import type { AutoDmRule, AutoDmTrigger, Post } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { InfoTip } from "@/components/ui/info-tip";
import { EmptyState } from "@/components/ui/empty-state";

/*
  자동 DM 규칙 생성·편집 모달.
  게시물별로 트리거(모든 댓글/키워드)와 발송 DM을 설정한다. 인스타그램 전용.
  광고성 메시지로 지정하면 정보통신망법 대비 (광고) 표기·수신거부 안내를 강제한다.
*/

const DM_MAX = 900;

const POST_TYPE_LABEL: Record<Post["type"], string> = {
  reels: "릴스",
  feed: "피드",
  story: "스토리",
  video: "동영상",
  carousel: "캐러셀",
  text: "텍스트",
};

export type RuleDraft = Omit<
  AutoDmRule,
  "sentTotal" | "sentToday" | "failedTotal" | "lastSentAt" | "createdAt"
> & { createdAt?: string };

function makeId() {
  return `dm-${Date.now().toString(36)}`;
}

export function RuleEditor({
  initial,
  posts,
  existingRules,
  onSave,
  onClose,
}: {
  initial: AutoDmRule | null;
  posts: Post[];
  existingRules: AutoDmRule[];
  onSave: (draft: RuleDraft) => void;
  onClose: () => void;
}) {
  const [postId, setPostId] = useState(initial?.postId ?? posts[0]?.id ?? "");
  const [trigger, setTrigger] = useState<AutoDmTrigger>(initial?.trigger ?? "keyword");
  const [keywords, setKeywords] = useState<string[]>(initial?.keywords ?? []);
  const [keywordInput, setKeywordInput] = useState("");
  const [dmMessage, setDmMessage] = useState(initial?.dmMessage ?? "");
  const [publicReply, setPublicReply] = useState(initial?.publicReply ?? "");
  const [buttonLabel, setButtonLabel] = useState(initial?.buttonLabel ?? "");
  const [buttonUrl, setButtonUrl] = useState(initial?.buttonUrl ?? "");
  const [isAdvertising, setIsAdvertising] = useState(initial?.isAdvertising ?? false);
  const [minorConfirmed, setMinorConfirmed] = useState(initial?.isAdvertising ?? false);
  const [dailyCap, setDailyCap] = useState(initial?.dailyCap ?? 300);
  const [attempted, setAttempted] = useState(false);

  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // 편집 중인 규칙의 대상 게시물이 현재 목록에 없을 수 있다(최근 목록에서 밀려나거나 데이터 소스가 다른 경우).
  // 규칙에 비정규화 저장된 게시물 정보로 합성 항목을 만들어, 항상 선택 표시·저장이 가능하게 한다.
  const effectivePosts = useMemo<Post[]>(() => {
    if (initial && !posts.some((p) => p.id === initial.postId)) {
      const synthetic: Post = {
        id: initial.postId,
        channel: "instagram",
        type: initial.postType,
        caption: initial.postCaption,
        publishedAt: "",
        views: initial.postViews,
        likes: 0,
        comments: 0,
        shares: 0,
        trend: [],
      };
      return [synthetic, ...posts];
    }
    return posts;
  }, [initial, posts]);

  const selectedPost = effectivePosts.find((p) => p.id === postId) ?? null;

  // 같은 게시물의 다른 (일시중지 아닌) 규칙과 트리거가 겹치면 한 사람이 DM을 두 번 받을 수 있어 경고
  const overlaps = useMemo(
    () =>
      existingRules.filter((r) => {
        if (r.id === initial?.id || r.postId !== postId || r.status === "paused") return false;
        if (trigger === "all" || r.trigger === "all") return true;
        return r.keywords.some((k) => keywords.includes(k));
      }),
    [existingRules, initial, postId, trigger, keywords],
  );

  const urlValid = useMemo(() => {
    if (!buttonUrl.trim()) return true;
    try {
      const u = new URL(buttonUrl.trim());
      return u.protocol === "https:" || u.protocol === "http:";
    } catch {
      return false;
    }
  }, [buttonUrl]);

  const issues = useMemo(() => {
    const list: string[] = [];
    if (!postId) list.push("대상 게시물을 선택해 주세요.");
    else if (!selectedPost) list.push("연결된 게시물을 찾을 수 없어요. 게시물을 다시 선택해 주세요.");
    if (trigger === "keyword" && keywords.length === 0)
      list.push("키워드를 1개 이상 추가하거나 모든 댓글로 바꿔 주세요.");
    if (!dmMessage.trim()) list.push("발송할 DM 내용을 입력해 주세요.");
    if (buttonLabel.trim() && !buttonUrl.trim()) list.push("버튼 라벨을 넣었다면 링크 URL도 입력해 주세요.");
    if (!urlValid) list.push("버튼 링크는 http(s) 형식의 URL이어야 합니다.");
    if (dailyCap < 1) list.push("하루 발송 상한은 1건 이상이어야 합니다.");
    if (isAdvertising && !minorConfirmed)
      list.push("광고성 규칙은 '만 14세 이상 대상' 확인이 필요합니다.");
    return list;
  }, [postId, selectedPost, trigger, keywords, dmMessage, buttonLabel, buttonUrl, urlValid, dailyCap, isAdvertising, minorConfirmed]);

  const canSave = issues.length === 0;

  function addKeyword() {
    const v = keywordInput.trim();
    if (!v) return;
    if (!keywords.includes(v)) setKeywords((k) => [...k, v]);
    setKeywordInput("");
  }

  function submit() {
    setAttempted(true);
    if (!canSave || !selectedPost) return;
    onSave({
      id: initial?.id ?? makeId(),
      postId: selectedPost.id,
      postCaption: selectedPost.caption,
      postType: selectedPost.type,
      postViews: selectedPost.views,
      trigger,
      keywords: trigger === "keyword" ? keywords : [],
      publicReply: publicReply.trim() ? publicReply.trim() : null,
      dmMessage: dmMessage.trim(),
      buttonLabel: buttonLabel.trim() ? buttonLabel.trim() : null,
      buttonUrl: buttonUrl.trim() ? buttonUrl.trim() : null,
      status: initial?.status ?? "active",
      isAdvertising,
      dailyCap,
      createdAt: initial?.createdAt,
    });
  }

  const previewMessage = applyAdDisclosure(dmMessage, isAdvertising);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={initial ? "자동 DM 규칙 편집" : "새 자동 DM 규칙"}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="shadow-pop flex max-h-[92vh] w-full max-w-2xl flex-col rounded-card border border-line bg-overlay sm:max-h-[88vh]"
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-[17px] font-bold">{initial ? "자동 DM 규칙 편집" : "새 자동 DM 규칙"}</h2>
          <button
            type="button"
            aria-label="닫기"
            onClick={onClose}
            className="rounded-card p-1.5 text-fg-faint hover:bg-body hover:text-fg"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
          {/* 대상 게시물 */}
          <div>
            <label className="text-[14px] font-semibold">대상 게시물</label>
            <p className="mt-0.5 text-[13px] text-fg-faint">이 게시물에 달리는 댓글에만 규칙이 적용됩니다.</p>
            {effectivePosts.length === 0 ? (
              <div className="mt-3">
                <EmptyState
                  title="연동된 인스타그램 게시물이 없어요"
                  description="인스타그램 계정을 연동하면 게시물을 선택할 수 있습니다."
                />
              </div>
            ) : (
              <div className="mt-3 grid max-h-52 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
                {effectivePosts.map((p) => {
                  const active = p.id === postId;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setPostId(p.id)}
                      aria-pressed={active}
                      className={cn(
                        "flex items-start gap-3 rounded-card border p-3 text-left transition-colors",
                        active ? "border-primary bg-primary-weak" : "border-line bg-body hover:border-line-strong",
                      )}
                    >
                      <span
                        className={cn(
                          "mt-0.5 inline-flex shrink-0 items-center rounded-chip px-2 py-0.5 text-[11px] font-semibold",
                          active ? "bg-primary text-on-primary" : "bg-overlay text-fg-sub border border-line",
                        )}
                      >
                        {POST_TYPE_LABEL[p.type]}
                      </span>
                      <span className="min-w-0">
                        <span className="line-clamp-2 text-[13px] font-medium">{p.caption}</span>
                        <span className="tnum mt-1 block text-[12px] text-fg-faint">
                          조회 {formatCompact(p.views)} · 댓글 {formatCompact(p.comments)}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* 트리거 */}
          <div>
            <span className="text-[14px] font-semibold">언제 DM을 보낼까요?</span>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              {(
                [
                  { v: "keyword" as const, label: "특정 키워드 댓글", desc: "지정한 단어가 포함된 댓글에만" },
                  { v: "all" as const, label: "모든 댓글", desc: "이 게시물의 모든 새 댓글에" },
                ] as const
              ).map((opt) => {
                const active = trigger === opt.v;
                return (
                  <button
                    key={opt.v}
                    type="button"
                    onClick={() => setTrigger(opt.v)}
                    aria-pressed={active}
                    className={cn(
                      "flex-1 rounded-card border p-3 text-left transition-colors",
                      active ? "border-primary bg-primary-weak" : "border-line bg-body hover:border-line-strong",
                    )}
                  >
                    <span className="block text-[14px] font-semibold">{opt.label}</span>
                    <span className="mt-0.5 block text-[12px] text-fg-faint">{opt.desc}</span>
                  </button>
                );
              })}
            </div>

            {trigger === "keyword" ? (
              <div className="mt-3">
                <div className="flex gap-2">
                  <input
                    value={keywordInput}
                    onChange={(e) => setKeywordInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addKeyword();
                      }
                    }}
                    placeholder="예: 정보, 구매, 링크"
                    className="h-9 flex-1 rounded-card border border-line bg-body px-3 text-[14px] placeholder:text-fg-faint focus:border-primary focus:outline-none"
                  />
                  <Button type="button" variant="secondary" size="sm" onClick={addKeyword}>
                    <Plus className="size-4" aria-hidden /> 추가
                  </Button>
                </div>
                {keywords.length > 0 ? (
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {keywords.map((k) => (
                      <span
                        key={k}
                        className="inline-flex items-center gap-1 rounded-chip border border-line bg-overlay px-2.5 py-1 text-[13px] font-medium"
                      >
                        {k}
                        <button
                          type="button"
                          aria-label={`${k} 삭제`}
                          onClick={() => setKeywords((prev) => prev.filter((x) => x !== k))}
                          className="text-fg-faint hover:text-fg"
                        >
                          <X className="size-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          {/* 같은 게시물 규칙 중복 경고 */}
          {overlaps.length > 0 ? (
            <div className="flex items-start gap-2 rounded-card border border-warning/40 bg-warning-weak p-3 text-[13px] leading-relaxed text-fg-sub">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
              <span>
                이 게시물에는 트리거가 겹치는 규칙이 {overlaps.length}개 있어요. 한 사람이 DM을 여러 번 받을 수 있으니
                키워드가 겹치지 않게 조정하는 것을 권장합니다.
              </span>
            </div>
          ) : null}

          {/* DM 메시지 */}
          <div>
            <div className="flex items-center justify-between">
              <label htmlFor="dm-msg" className="text-[14px] font-semibold">
                발송할 DM 내용
              </label>
              <span className={cn("tnum text-[12px]", dmMessage.length > DM_MAX ? "text-negative" : "text-fg-faint")}>
                {dmMessage.length}/{DM_MAX}
              </span>
            </div>
            <textarea
              id="dm-msg"
              value={dmMessage}
              maxLength={DM_MAX}
              onChange={(e) => setDmMessage(e.target.value)}
              rows={4}
              placeholder="안녕하세요! 문의 감사합니다. 아래 링크에서 자세한 내용을 확인하실 수 있어요."
              className="mt-2 w-full resize-y rounded-card border border-line bg-body px-3 py-2.5 text-[14px] leading-relaxed placeholder:text-fg-faint focus:border-primary focus:outline-none"
            />
          </div>

          {/* 버튼(선택) */}
          <div>
            <span className="text-[14px] font-semibold">버튼 링크 (선택)</span>
            <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_1.4fr]">
              <input
                value={buttonLabel}
                onChange={(e) => setButtonLabel(e.target.value)}
                placeholder="버튼 이름 (예: 구매하기)"
                className="h-9 rounded-card border border-line bg-body px-3 text-[14px] placeholder:text-fg-faint focus:border-primary focus:outline-none"
              />
              <input
                value={buttonUrl}
                onChange={(e) => setButtonUrl(e.target.value)}
                placeholder="https://example.com/shop"
                className={cn(
                  "h-9 rounded-card border bg-body px-3 text-[14px] placeholder:text-fg-faint focus:outline-none",
                  urlValid ? "border-line focus:border-primary" : "border-negative",
                )}
              />
            </div>
          </div>

          {/* 공개 답글(선택) */}
          <div>
            <label htmlFor="pub-reply" className="text-[14px] font-semibold">
              댓글 공개 답글 (선택)
            </label>
            <p className="mt-0.5 text-[13px] text-fg-faint">
              DM과 함께 댓글에 공개로 답글을 남깁니다. 자동 DM은 댓글 1건당 1회만 보낼 수 있어, 공개 답글로 안내를
              보완할 수 있습니다.
            </p>
            <input
              id="pub-reply"
              value={publicReply}
              onChange={(e) => setPublicReply(e.target.value)}
              placeholder="DM 보내드렸어요! 확인 부탁드립니다."
              className="mt-2 h-9 w-full rounded-card border border-line bg-body px-3 text-[14px] placeholder:text-fg-faint focus:border-primary focus:outline-none"
            />
          </div>

          {/* 광고성 표기 + 하루 상한 */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-card border border-line bg-body p-3.5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <Megaphone className="size-4 text-fg-sub" aria-hidden />
                  <span className="text-[14px] font-semibold">광고성 메시지</span>
                  <InfoTip>
                    상품·이벤트 홍보 목적의 DM은 정보통신망법상 광고성 정보에 해당할 수 있습니다. 켜면 (광고)
                    표기가 본문 맨 앞에, 수신거부 안내가 맨 끝에 자동으로 추가됩니다.
                  </InfoTip>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={isAdvertising}
                  onClick={() => setIsAdvertising((v) => !v)}
                  className={cn(
                    "relative h-5 w-9 shrink-0 rounded-chip transition-colors",
                    isAdvertising ? "bg-primary" : "bg-line-strong",
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-0.5 size-4 rounded-full bg-body transition-all",
                      isAdvertising ? "left-[18px]" : "left-0.5",
                    )}
                    aria-hidden
                  />
                </button>
              </div>
              <p className="mt-2 text-[12px] leading-relaxed text-fg-faint">
                홍보·판매 목적이면 반드시 켜 주세요. 수신거부 안내 없는 광고성 발송은 법 위반이 될 수 있습니다.
              </p>
              {isAdvertising ? (
                <label className="mt-2.5 flex cursor-pointer items-start gap-2 text-[12px] leading-relaxed text-fg-sub">
                  <input
                    type="checkbox"
                    checked={minorConfirmed}
                    onChange={(e) => setMinorConfirmed(e.target.checked)}
                    className="mt-0.5 size-3.5 shrink-0 accent-primary"
                  />
                  이 광고는 만 14세 이상을 대상으로 하며, 미성년자에게 광고성 DM을 보내지 않음을 확인합니다.
                </label>
              ) : null}
            </div>

            <div className="rounded-card border border-line bg-body p-3.5">
              <div className="flex items-center gap-1.5">
                <span className="text-[14px] font-semibold">하루 발송 상한</span>
                <InfoTip>
                  무차별 대량 발송은 인스타그램 스팸 정책 위반·계정 제재로 이어질 수 있습니다. 하루 상한을 넘으면
                  발송을 멈추고 다음 날 재개합니다.
                </InfoTip>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={10000}
                  value={dailyCap}
                  onChange={(e) => setDailyCap(Number(e.target.value) || 0)}
                  className="tnum h-9 w-28 rounded-card border border-line bg-overlay px-3 text-[14px] focus:border-primary focus:outline-none"
                />
                <span className="text-[13px] text-fg-faint">건 / 일</span>
              </div>
            </div>
          </div>

          {/* 미리보기 */}
          {dmMessage.trim() ? (
            <div>
              <span className="text-[13px] font-semibold text-fg-sub">DM 미리보기</span>
              <div className="mt-2 rounded-card border border-line bg-body p-3.5">
                <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-fg">{previewMessage}</p>
                {buttonLabel.trim() ? (
                  <span className="mt-2.5 inline-flex items-center rounded-card border border-line bg-overlay px-3 py-1.5 text-[13px] font-semibold text-primary">
                    {buttonLabel}
                  </span>
                ) : null}
                {isAdvertising ? (
                  <Badge tone="warning" className="mt-2.5">
                    광고 표기·수신거부 포함
                  </Badge>
                ) : null}
              </div>
            </div>
          ) : null}

          {/* 검증 안내 */}
          {attempted && issues.length > 0 ? (
            <ul className="space-y-1 rounded-card border border-negative/40 bg-negative-weak p-3 text-[13px] text-negative">
              {issues.map((msg) => (
                <li key={msg}>· {msg}</li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-4">
          <Button type="button" variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button type="button" onClick={submit} disabled={attempted && !canSave}>
            {initial ? "변경 저장" : "규칙 만들기"}
          </Button>
        </div>
      </div>
    </div>
  );
}
