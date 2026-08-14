"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ImageOff, Lock, Megaphone, Plus, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { applyAdDisclosure } from "@/lib/ads/ad-disclosure";
import type { AutoDmRule, AutoDmTrigger, DmButton, Post } from "@/lib/types";
import { InfoTip } from "@/components/ui/info-tip";
import { EmptyState } from "@/components/ui/empty-state";

/*
  자동화 만들기 위저드 — 리틀리 실측(2026-08-14) 기반 5단계 플로우 재구현.
  1) 게시물 선택(3열 썸네일 그리드) → 2) 트리거(모든 댓글/키워드) →
  3) DM 메시지(실시간 미리보기 + 버튼 개수) → 4) 버튼별 링크 설정(URL 검증) →
  5) 자동 답글 → 저장. 버튼 0개면 4단계를 건너뛴다.

  모션은 전부 기존 토큰 재사용: 모달 등장 modal-card-in, 단계 전환 anim-swap(key 교체),
  진행바 width transition. 광고성 표기(정보통신망법)는 3단계에 유지한다.
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

function isValidHttpUrl(v: string): boolean {
  try {
    const u = new URL(v);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

type StepKey = "post" | "trigger" | "message" | "links" | "reply";

export function RuleWizard({
  initial,
  posts,
  existingRules,
  contentLimit,
  accountHandle,
  onSave,
  onClose,
}: {
  initial: AutoDmRule | null;
  posts: Post[];
  existingRules: AutoDmRule[];
  /** 플랜별 자동화 콘텐츠(게시물) 한도 — 초과 시 새 게시물 선택을 막는다 */
  contentLimit: number;
  /** 미리보기 아바타에 쓸 계정 핸들(연동 전이면 null) */
  accountHandle: string | null;
  onSave: (draft: RuleDraft) => void | Promise<void>;
  onClose: () => void;
}) {
  const [postId, setPostId] = useState(initial?.postId ?? "");
  const [trigger, setTrigger] = useState<AutoDmTrigger>(initial?.trigger ?? "all");
  const [keywords, setKeywords] = useState<string[]>(initial?.keywords ?? []);
  const [keywordInput, setKeywordInput] = useState("");
  const [dmMessage, setDmMessage] = useState(initial?.dmMessage ?? "");
  const [buttonCount, setButtonCount] = useState<number>(initial ? initial.buttons.length : 1);
  const [buttons, setButtons] = useState<DmButton[]>(
    initial?.buttons.length ? initial.buttons : [{ label: "", url: "" }],
  );
  const [wantReply, setWantReply] = useState(Boolean(initial?.publicReply));
  const [publicReply, setPublicReply] = useState(initial?.publicReply ?? "");
  const [isAdvertising, setIsAdvertising] = useState(initial?.isAdvertising ?? false);
  const [minorConfirmed, setMinorConfirmed] = useState(initial?.isAdvertising ?? false);
  const [saving, setSaving] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const requestCloseRef = useRef<() => void>(() => {});

  // 포커스 관리 — 열릴 때 모달로 이동, 닫힐 때 원래 위치로 복원 (aria-modal 선언에 맞는 실동작)
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    containerRef.current?.focus();
    return () => prev?.focus?.();
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // IME 조합 취소(Escape)와 모달 닫기를 구분한다
      if (e.key === "Escape" && !e.isComposing) requestCloseRef.current();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // 편집 중 규칙의 게시물이 최근 목록에서 밀려났을 수 있다 — 비정규화 저장값으로 합성해 항상 표시
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
        thumb: initial.postThumb,
      };
      return [synthetic, ...posts];
    }
    return posts;
  }, [initial, posts]);

  const selectedPost = effectivePosts.find((p) => p.id === postId) ?? null;

  /* 콘텐츠 한도 판정 — 서버(checkContentLimit)와 정확히 같은 논리로 계산한다:
     "편집 중인 규칙(자기 자신)을 제외한 나머지 규칙들의 distinct 게시물 집합" 기준.
     (규칙 id가 아니라 postId를 통째로 빼면, 같은 게시물에 다른 규칙이 남아 있는데도
     자리가 빈 것처럼 보여 클라이언트는 허용·서버는 거부하는 불일치가 났다 — 리뷰 확정 수리) */
  const otherRulePosts = useMemo(
    () => new Set(existingRules.filter((r) => r.id !== initial?.id).map((r) => r.postId)),
    [existingRules, initial],
  );
  // 화면 표시용 사용량 — 목록 헤더와 같은 "전체 distinct 게시물 수"
  const contentUsed = useMemo(() => new Set(existingRules.map((r) => r.postId)).size, [existingRules]);
  const atContentLimit = otherRulePosts.size >= contentLimit;

  /** 이 게시물을 고르면 한도에 걸리는가 — 이미 자동화된 게시물은 콘텐츠 수 불변이라 항상 허용 */
  function postLocked(p: Post): boolean {
    return !otherRulePosts.has(p.id) && atContentLimit;
  }

  // buttonCount만큼 항상 패딩한다 — buttons 배열이 짧으면 미입력 버튼이 검증을 그냥
  // 통과해 빈 버튼이 저장되는 구멍이 있었다 (리뷰 확정 수리)
  const activeButtons = useMemo<DmButton[]>(
    () => Array.from({ length: buttonCount }, (_, i) => buttons[i] ?? { label: "", url: "" }),
    [buttons, buttonCount],
  );
  const linksValid = activeButtons.every((b) => b.label.trim() && isValidHttpUrl(b.url.trim()));
  const linksDone = activeButtons.filter((b) => b.label.trim() && isValidHttpUrl(b.url.trim())).length;

  // 닫기 확인 — 작성/수정 내용이 있으면 한 번 묻는다 (5단계 입력을 실수로 날리는 사고 방지)
  const dirty = initial
    ? dmMessage !== initial.dmMessage ||
      trigger !== initial.trigger ||
      postId !== initial.postId ||
      isAdvertising !== initial.isAdvertising ||
      JSON.stringify(keywords) !== JSON.stringify(initial.keywords) ||
      JSON.stringify(activeButtons) !== JSON.stringify(initial.buttons) ||
      (wantReply && publicReply.trim() ? publicReply.trim() : null) !== initial.publicReply
    : Boolean(
        postId ||
          dmMessage.trim() ||
          keywords.length > 0 ||
          activeButtons.some((b) => b.label.trim() || b.url.trim()),
      );

  function requestClose() {
    if (saving) return;
    if (dirty && !window.confirm("작성 중인 내용이 사라져요. 닫을까요?")) return;
    onClose();
  }
  // Escape 리스너(1회 등록)가 항상 최신 상태의 requestClose를 보게 한다 — 렌더 중 ref 쓰기 금지 규칙 준수
  useEffect(() => {
    requestCloseRef.current = requestClose;
  });

  /** 포커스 트랩 — Tab이 모달 밖으로 나가지 않게 순환시킨다 */
  function trapFocus(e: React.KeyboardEvent) {
    if (e.key !== "Tab") return;
    const root = containerRef.current;
    if (!root) return;
    const focusables = [...root.querySelectorAll<HTMLElement>('button, input, textarea, [tabindex]:not([tabindex="-1"])')].filter(
      (el) => !el.hasAttribute("disabled"),
    );
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  // 버튼 0개면 링크 단계를 건너뛴다 — 리틀리도 '없음'이면 4단계가 사라진다
  const steps = useMemo<StepKey[]>(
    () => (buttonCount > 0 ? ["post", "trigger", "message", "links", "reply"] : ["post", "trigger", "message", "reply"]),
    [buttonCount],
  );
  const step = steps[Math.min(stepIdx, steps.length - 1)];

  const canNext: boolean = (() => {
    switch (step) {
      case "post":
        return Boolean(selectedPost) && !(selectedPost && postLocked(selectedPost));
      case "trigger":
        return trigger === "all" || keywords.length > 0;
      case "message":
        return dmMessage.trim().length > 0 && dmMessage.length <= DM_MAX && (!isAdvertising || minorConfirmed);
      case "links":
        return linksValid;
      case "reply":
        return !wantReply || publicReply.trim().length > 0;
    }
  })();

  const isLast = stepIdx >= steps.length - 1;

  async function next() {
    if (!canNext || saving) return;
    if (!isLast) {
      setStepIdx((i) => i + 1);
      return;
    }
    if (!selectedPost) return;
    setSaving(true);
    try {
      await onSave({
        id: initial?.id ?? makeId(),
        postId: selectedPost.id,
        postCaption: selectedPost.caption,
        postType: selectedPost.type,
        postViews: selectedPost.views,
        // 편집에서 다른 게시물로 바꿨는데 이전 게시물 썸네일이 남는 사고 방지 — 폴백은 같은 게시물일 때만
        postThumb:
          selectedPost.thumb ?? (initial && selectedPost.id === initial.postId ? initial.postThumb : null),
        trigger,
        keywords: trigger === "keyword" ? keywords : [],
        publicReply: wantReply && publicReply.trim() ? publicReply.trim() : null,
        dmMessage: dmMessage.trim(),
        buttons: activeButtons.map((b) => ({ label: b.label.trim(), url: b.url.trim() })),
        status: initial?.status ?? "active",
        isAdvertising,
        dailyCap: initial?.dailyCap ?? 300, // 스팸 정책 안전 상한 — 위저드에선 노출하지 않는 기본값
        createdAt: initial?.createdAt,
      });
    } finally {
      setSaving(false);
    }
  }

  function addKeyword() {
    const v = keywordInput.trim();
    if (!v) return;
    if (!keywords.includes(v)) setKeywords((k) => [...k, v]);
    setKeywordInput("");
  }

  function setButton(i: number, patch: Partial<DmButton>) {
    setButtons((prev) => {
      const next = [...prev];
      while (next.length < buttonCount) next.push({ label: "", url: "" });
      next[i] = { ...next[i], ...patch };
      return next;
    });
  }

  const previewMessage = applyAdDisclosure(dmMessage, isAdvertising);

  /* DM 미리보기 — 리틀리 실측(2026-08-14) 구조: 흰 패널 안에 아바타(50px 원형) +
     회색 컨테이너(메시지 텍스트와 흰 버튼 행을 함께 담는다) */
  const preview = (
    <div className="rounded-card bg-overlay p-4">
      <div className="flex items-start gap-3">
        <span className="flex size-[50px] shrink-0 items-center justify-center rounded-full bg-primary text-[15px] font-bold text-on-primary">
          {(accountHandle ?? "핀치").replace(/^@/, "").slice(0, 2)}
        </span>
        <div className="min-w-0 max-w-[75%] space-y-2 rounded-card bg-surface p-[15px]">
          <p className="whitespace-pre-wrap break-words text-[14px] leading-relaxed text-fg">
            {previewMessage.trim() || <span className="text-fg-faint">메시지를 입력해주세요</span>}
          </p>
          {buttonCount > 0
            ? Array.from({ length: buttonCount }, (_, i) => activeButtons[i] ?? { label: "", url: "" }).map((b, i) => (
                <div
                  key={i}
                  className="flex h-[46px] items-center justify-center rounded-card bg-overlay px-3.5 text-[14px] font-medium"
                >
                  {b.label.trim() ? (
                    <span className="text-fg">{b.label}</span>
                  ) : (
                    <span className="text-fg-faint">버튼명을 입력해주세요</span>
                  )}
                </div>
              ))
            : null}
        </div>
      </div>
    </div>
  );

  /* 리틀리식 라디오 행 — 카드가 아니라 원형 dot + 14px 라벨의 평문 행 */
  const radioRow = (opts: {
    key?: string;
    checked: boolean;
    disabled?: boolean;
    label: string;
    hint?: string;
    onClick?: () => void;
  }) => (
    <button
      key={opts.key ?? opts.label}
      type="button"
      disabled={opts.disabled}
      onClick={opts.onClick}
      role="radio"
      aria-checked={opts.checked}
      className={cn(
        "flex w-full items-center gap-2.5 py-1.5 text-left",
        opts.disabled ? "cursor-not-allowed" : "cursor-pointer",
      )}
    >
      <span
        className={cn(
          "flex size-[18px] shrink-0 items-center justify-center rounded-full border-2",
          opts.checked ? "border-fg" : opts.disabled ? "border-line-strong" : "border-line-strong",
        )}
        aria-hidden
      >
        {opts.checked ? <span className="size-2.5 rounded-full bg-fg" /> : null}
      </span>
      <span className={cn("text-[14px] font-medium", opts.disabled ? "text-fg-faint" : "text-fg")}>
        {opts.label}
        {opts.hint ? <span className="ml-1 text-fg-faint">{opts.hint}</span> : null}
      </span>
    </button>
  );

  const stepNo = stepIdx + 1;

  return (
    <div
      className="modal-scrim-in fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={initial ? "자동화 수정" : "자동화 만들기"}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) requestClose();
      }}
    >
      <div
        ref={containerRef}
        tabIndex={-1}
        onKeyDown={trapFocus}
        className="modal-card-in shadow-pop flex h-[min(849px,88vh)] max-h-[92vh] w-full max-w-[550px] flex-col overflow-hidden rounded-card border border-line bg-overlay outline-none sm:max-h-[88vh]"
      >
        {/* 헤더 — 뒤로가기(2단계부터) + 제목 + 닫기 (리틀리: 흰 헤더, 타이틀 18px/600) */}
        <div className="flex items-center gap-2 px-5 pt-4">
          {stepIdx > 0 ? (
            <button
              type="button"
              aria-label="이전 단계"
              onClick={() => setStepIdx((i) => Math.max(0, i - 1))}
              className="-ml-1.5 rounded-card p-1.5 text-fg hover:bg-body"
            >
              <ChevronLeft className="size-5" />
            </button>
          ) : null}
          <h2 className="flex-1 text-[18px] font-semibold">{initial ? "자동화 수정" : "자동화 만들기"}</h2>
          <button
            type="button"
            aria-label="닫기"
            onClick={requestClose}
            className="rounded-card p-1.5 text-fg hover:bg-body"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* 진행바(7px, 채움 검정) + 단계 표시 (리틀리 실측) */}
        <div className="px-5 pt-3">
          <div className="h-[7px] overflow-hidden rounded-chip bg-line-strong/50">
            <div
              className="h-full rounded-chip bg-fg transition-all duration-300 ease-out"
              style={{ width: `${(stepNo / steps.length) * 100}%` }}
            />
          </div>
          <p className="mt-2 text-[14px] font-medium text-fg">
            {steps.length}단계 중 {stepNo}단계
          </p>
        </div>

        {/* 단계 본문 — key 교체로 anim-swap 전환. 리틀리 실측: 본문만 연회색(surface) */}
        <div key={step} className="anim-swap mt-3 min-h-0 flex-1 overflow-y-auto bg-surface px-5 py-4">
          {step === "post" ? (
            <div>
              <p className="text-[14px] font-medium">
                어떤 게시물을 자동화할까요?
                <InfoTip>이 게시물에 달리는 새 댓글에만 자동 DM이 나갑니다.</InfoTip>
              </p>

              {/* 리틀리 1단계 구조 — 원형 라디오 행 2개 (현재 게시물 / 다음 게시물 예약) */}
              <div className="mt-2" role="radiogroup" aria-label="자동화할 게시물 방식">
                {radioRow({ checked: true, label: "현재 게시물에서 선택할게요" })}
                {radioRow({
                  checked: false,
                  disabled: true,
                  label: "다음에 올릴 게시물을 자동화 할게요",
                  hint: "(준비 중)",
                })}
              </div>

              {contentLimit < 1000000 ? (
                <p className="mt-2 text-[12px] text-fg-faint">
                  자동화 콘텐츠 {contentUsed}/{contentLimit}개 사용 중
                  {atContentLimit && !initial ? " — 한도에 도달했어요. 기존 자동화 게시물만 선택할 수 있습니다." : ""}
                </p>
              ) : null}

              {effectivePosts.length === 0 ? (
                <div className="mt-4">
                  {accountHandle ? (
                    <EmptyState
                      title={`${accountHandle} 계정에 게시물이 없어요`}
                      description="연동된 인스타그램 계정에 올라온 게시물이 여기에 표시됩니다. 게시물이 있는 계정으로 연동을 바꾸려면 설정 > 연동 관리에서 변경할 수 있어요."
                    />
                  ) : (
                    <EmptyState
                      title="연동된 인스타그램 게시물이 없어요"
                      description="인스타그램 계정을 연동하면 게시물을 선택할 수 있습니다."
                    />
                  )}
                </div>
              ) : (
                <div className="mt-3 grid grid-cols-3 gap-1.5">
                  {effectivePosts.map((p) => {
                    const active = p.id === postId;
                    const locked = postLocked(p);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        disabled={locked}
                        onClick={() => setPostId(p.id)}
                        aria-pressed={active}
                        className={cn(
                          "group relative aspect-square overflow-hidden rounded-card text-left transition-all duration-150",
                          // 리틀리 실측: 선택 = 4px 실선 보더 (색만 우리 브랜드 토큰)
                          active ? "border-4 border-primary" : "border border-line hover:border-line-strong",
                          locked ? "cursor-not-allowed opacity-45" : "",
                        )}
                      >
                        {p.thumb ? (
                          // eslint-disable-next-line @next/next/no-img-element -- 외부(인스타 CDN) 임시 URL이라 next/image 도메인 고정 불가
                          <img src={p.thumb} alt="" className="absolute inset-0 size-full object-cover" />
                        ) : (
                          <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-body text-fg-faint">
                            <ImageOff className="size-4" aria-hidden />
                          </span>
                        )}
                        <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-1.5 pt-5">
                          <span className="line-clamp-2 text-[10px] leading-tight text-white">{p.caption}</span>
                        </span>
                        <span className="absolute left-1 top-1 rounded-chip bg-black/55 px-1.5 py-0.5 text-[9px] font-semibold text-white">
                          {POST_TYPE_LABEL[p.type]}
                        </span>
                        {otherRulePosts.has(p.id) ? (
                          <span className="absolute right-1 top-1 rounded-chip bg-primary px-1.5 py-0.5 text-[9px] font-semibold text-on-primary">
                            자동화 중
                          </span>
                        ) : locked ? (
                          <span className="absolute right-1 top-1 rounded-chip bg-black/55 p-1 text-white">
                            <Lock className="size-2.5" aria-hidden />
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ) : null}

          {step === "trigger" ? (
            <div>
              <p className="text-[14px] font-medium">어떤 댓글에 DM을 보낼까요?</p>
              <div className="mt-2" role="radiogroup" aria-label="발송 트리거">
                {radioRow({
                  checked: trigger === "all",
                  label: "모든 댓글에 발송할게요",
                  onClick: () => setTrigger("all"),
                })}
                {radioRow({
                  checked: trigger === "keyword",
                  label: "특정 키워드에 발송할게요",
                  hint: "(ex. 수익화, 자동화 등)",
                  onClick: () => setTrigger("keyword"),
                })}
              </div>

              {trigger === "keyword" ? (
                <div className="anim-swap mt-3">
                  <div className="flex gap-2">
                    <input
                      value={keywordInput}
                      aria-label="키워드 입력"
                      onChange={(e) => setKeywordInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                          e.preventDefault();
                          addKeyword();
                        }
                      }}
                      placeholder="키워드 입력 후 Enter (예: 정보, 링크)"
                      className="h-11 flex-1 rounded-card border border-line-strong bg-overlay px-3 text-[15px] placeholder:text-fg-faint focus:border-fg focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={addKeyword}
                      className="flex h-11 items-center gap-1 rounded-card border border-line-strong bg-overlay px-3 text-[14px] font-medium hover:border-fg"
                    >
                      <Plus className="size-4" aria-hidden /> 추가
                    </button>
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
          ) : null}

          {step === "message" ? (
            <div>
              <p className="text-[14px] font-medium">
                DM 메시지를 작성해주세요
                <InfoTip>댓글 작성자에게 1회 발송되는 비공개 메시지입니다. 아래 미리보기로 실제 모습이 보여요.</InfoTip>
              </p>

              <div className="mt-3">{preview}</div>

              <div className="mt-4">
                <div className="flex items-center justify-between">
                  <label htmlFor="wizard-dm-msg" className="text-[14px] font-medium text-fg-faint">
                    메시지 입력 <span className="text-negative">*</span>
                  </label>
                  <span className={cn("tnum text-[12px]", dmMessage.length > DM_MAX ? "text-negative" : "text-fg-faint")}>
                    {dmMessage.length}/{DM_MAX}
                  </span>
                </div>
                <textarea
                  id="wizard-dm-msg"
                  value={dmMessage}
                  maxLength={DM_MAX}
                  onChange={(e) => setDmMessage(e.target.value)}
                  rows={3}
                  placeholder="메시지를 입력해주세요"
                  className="mt-1.5 w-full resize-y rounded-card border border-line-strong bg-overlay px-3 py-2.5 text-[15px] leading-relaxed placeholder:text-fg-faint focus:border-fg focus:outline-none"
                />
              </div>

              <div className="mt-3">
                <span className="text-[14px] font-medium text-fg-faint">
                  메시지 버튼 <span className="text-negative">*</span>
                </span>
                <div className="mt-1.5 grid grid-cols-4 gap-1.5">
                  {[0, 1, 2, 3].map((n) => {
                    const active = buttonCount === n;
                    return (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setButtonCount(n)}
                        aria-pressed={active}
                        className={cn(
                          "h-9 rounded-card border text-[14px] font-medium transition-colors",
                          active
                            ? "border-fg bg-fg text-body"
                            : "border-line-strong bg-transparent text-fg-faint hover:border-fg-faint",
                        )}
                      >
                        {n === 0 ? "없음" : `${n}개`}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 광고성 표기 — 정보통신망법 (리틀리에는 없는 우리 쪽 법적 장치라 이 단계에 유지) */}
              <div className="mt-4 rounded-card bg-overlay p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <Megaphone className="size-4 text-fg-sub" aria-hidden />
                    <span className="text-[13px] font-semibold">광고성 메시지</span>
                    <InfoTip>
                      상품·이벤트 홍보 목적의 DM은 정보통신망법상 광고성 정보에 해당할 수 있습니다. 켜면 (광고) 표기가
                      본문 맨 앞에, 수신거부 안내가 맨 끝에 자동으로 추가됩니다.
                    </InfoTip>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isAdvertising}
                    aria-label="광고성 메시지"
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
                {isAdvertising ? (
                  <label className="anim-swap mt-2.5 flex cursor-pointer items-start gap-2 text-[12px] leading-relaxed text-fg-sub">
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
            </div>
          ) : null}

          {step === "links" ? (
            <div>
              <div className="space-y-4">
                {Array.from({ length: buttonCount }, (_, i) => {
                  const b = buttons[i] ?? { label: "", url: "" };
                  const urlTouched = b.url.trim().length > 0;
                  const urlOk = isValidHttpUrl(b.url.trim());
                  return (
                    <div key={i}>
                      {/* 리틀리 실측: 섹션 제목 "N번째 버튼 링크 설정" 14px/500 */}
                      <p className="text-[14px] font-medium">{i + 1}번째 버튼 링크 설정</p>
                      {i === 0 ? <div className="mt-3">{preview}</div> : null}
                      <div className="mt-3 space-y-3">
                        <div>
                          <label htmlFor={`dm-btn-label-${i}`} className="text-[14px] font-medium text-fg-faint">
                            버튼 입력 <span className="text-negative">*</span>
                          </label>
                          <input
                            id={`dm-btn-label-${i}`}
                            value={b.label}
                            maxLength={20}
                            onChange={(e) => setButton(i, { label: e.target.value })}
                            placeholder="버튼명을 입력해주세요"
                            className="mt-1 h-11 w-full rounded-card border border-line-strong bg-overlay px-3 text-[15px] placeholder:text-fg-faint focus:border-fg focus:outline-none"
                          />
                        </div>
                        <div>
                          <label htmlFor={`dm-btn-url-${i}`} className="text-[14px] font-medium text-fg-faint">
                            URL 입력 <span className="text-negative">*</span>
                          </label>
                          {/* 리틀리 실측: URL 입력 방식 탭 — 직접 입력(활성) / 링크 불러오기(리틀리는 자사
                              리틀리 링크 가져오기 — 우리 대응 기능 준비 전이라 비활성) */}
                          <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                            <button
                              type="button"
                              aria-pressed="true"
                              className="h-9 rounded-card border border-fg bg-fg text-[14px] font-medium text-body"
                            >
                              직접 입력
                            </button>
                            <button
                              type="button"
                              disabled
                              className="h-9 cursor-not-allowed rounded-card border border-line-strong bg-transparent text-[14px] font-medium text-fg-faint"
                            >
                              내 링크 불러오기 (준비 중)
                            </button>
                          </div>
                          <input
                            id={`dm-btn-url-${i}`}
                            value={b.url}
                            inputMode="url"
                            onChange={(e) => setButton(i, { url: e.target.value })}
                            placeholder="https://"
                            className={cn(
                              "mt-1.5 h-11 w-full rounded-card border bg-overlay px-3 text-[15px] placeholder:text-fg-faint focus:outline-none",
                              urlTouched && !urlOk ? "border-negative" : "border-line-strong focus:border-fg",
                            )}
                          />
                          {urlTouched && !urlOk ? (
                            <p className="anim-swap mt-1 flex items-center gap-1 text-[11px] text-negative">
                              주소를 정확히 입력해주세요.
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {step === "reply" ? (
            <div>
              <p className="text-[14px] font-medium">게시물 댓글에 대하여, 자동 답글을 남길까요?</p>
              <div className="mt-2" role="radiogroup" aria-label="자동 답글 여부">
                {radioRow({ checked: !wantReply, label: "아니요, 괜찮아요!", onClick: () => setWantReply(false) })}
                {radioRow({
                  checked: wantReply,
                  label: "네, 답글을 남기고 싶어요",
                  onClick: () => setWantReply(true),
                })}
              </div>
              {wantReply ? (
                <input
                  value={publicReply}
                  aria-label="자동 답글 내용"
                  onChange={(e) => setPublicReply(e.target.value)}
                  placeholder="DM 보내드렸어요! 확인 부탁드립니다."
                  className="anim-swap mt-3 h-11 w-full rounded-card border border-line-strong bg-overlay px-3 text-[15px] placeholder:text-fg-faint focus:border-fg focus:outline-none"
                />
              ) : null}
              <p className="mt-3 text-[12px] text-fg-faint">
                DM은 댓글당 1회만 보낼 수 있어, 공개 답글로 안내를 보완할 수 있어요.
              </p>
            </div>
          ) : null}
        </div>

        {/* CTA — 리틀리 실측: 풀폭 54px, 16px/500, 활성 검정/비활성 회색 */}
        <div className="px-5 pb-5 pt-3">
          <button
            type="button"
            onClick={next}
            disabled={!canNext || saving}
            className={cn(
              "h-[54px] w-full rounded-card text-[16px] font-medium transition-colors",
              canNext && !saving
                ? "bg-fg text-body hover:opacity-90"
                : "cursor-not-allowed bg-line-strong text-body/60",
            )}
          >
            {saving
              ? "저장 중..."
              : step === "links"
                ? `${linksDone}/${buttonCount} 링크 설정 완료`
                : isLast
                  ? initial
                    ? "변경 저장"
                    : "자동화 만들기"
                  : "다음"}
          </button>
        </div>
      </div>
    </div>
  );
}
