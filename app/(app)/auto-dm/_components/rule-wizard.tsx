"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ImageOff, Lock, Plus, RotateCcw, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { NEXT_POST_SENTINEL, normalizeHttpUrl } from "@/lib/auto-dm/db";
import type { AutoDmRule, AutoDmTrigger, DmButton, Post } from "@/lib/types";
import { InfoTip } from "@/components/ui/info-tip";
import { EmptyState } from "@/components/ui/empty-state";
import { Switch } from "@/components/ui/switch";
import { FinchMark } from "@/components/logo";

/*
  자동화 만들기 위저드 — 리틀리 실측(2026-08-14) 5단계 + 최종 검수(2026-08-19 스딩 실측).
  1) 게시물 선택(3열 썸네일 그리드) → 2) 트리거(모든 댓글/키워드) →
  3) DM 메시지(실시간 미리보기 + 버튼 개수) → 4) 버튼별 링크 설정(URL 검증) →
  5) 자동 답글 → 6) **최종 검수** → 저장. 버튼 0개면 4단계를 건너뛴다.

  최종 검수는 설정 전체를 한 화면에 모아 보여주고, 자동 답글·팔로우 요청 온오프를
  여기서 마지막으로 뒤집을 수 있다(스딩과 동일). 다른 항목은 뒤로 가서 고친다 —
  검수 화면에서 본문까지 고치게 하면 "검수"가 아니라 7번째 편집 화면이 된다.

  모션: 모달 등장 modal-card-in, 단계 전환 wizard-step-in(key 교체, 오른쪽에서 스르륵),
  진행바 width transition, 라디오·선택 상태 trans-state. 미리보기 아바타는 연동
  인스타 프로필 사진(accountAvatar), 없으면 이니셜 폴백. 광고성 토글은 2026-08-14
  사장님 지시로 제거(isAdvertising 필드는 파이프라인 호환용으로만 유지).
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

type StepKey = "post" | "trigger" | "message" | "links" | "reply" | "review";

/**
 * 준비된 자동 답글 풀 — [새로고침]이 여기서 랜덤 3개를 뽑는다 (리틀리 실측 방식).
 * 같은 문구 반복 도배는 인스타 스팸 신호가 되므로 발송 시에도 이 중 랜덤 1개가 달린다.
 */
const REPLY_POOL = [
  "댓글 감사해요! DM 보내드렸어요 💌",
  "DM으로 자세히 안내드렸어요, 확인해 주세요 🙌",
  "보내드린 DM 확인 부탁드려요 🙏",
  "요청하신 내용 DM으로 전달했어요 📩",
  "방금 DM 드렸어요, 편하실 때 봐주세요 📮",
  "자세한 내용은 DM에 남겨뒀어요 💬",
  "DM 발송 완료! 확인 부탁드립니다 ✅",
  "관심 감사해요, 궁금한 건 DM에서 이어가요 💙",
  "DM으로 링크 보내드렸어요 🔗",
  "확인하기 편하게 DM 남겨드렸어요 ☀️",
  "댓글 잘 봤어요! 답변은 DM으로 드렸습니다 😊",
  "DM함 한 번 확인해 주세요, 안내 보내드렸어요 📬",
];

/** 풀에서 겹치지 않게 랜덤 n개 — 직전 세트와 최대한 다르게 뽑는다 */
function pickRandomReplies(n: number, avoid: string[] = []): string[] {
  const fresh = REPLY_POOL.filter((r) => !avoid.includes(r));
  const source = fresh.length >= n ? fresh : REPLY_POOL;
  const shuffled = [...source].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

export function RuleWizard({
  initial,
  posts,
  existingRules,
  contentLimit,
  accountHandle,
  accountAvatar,
  followRequestReady,
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
  /** 연동 인스타 프로필 사진 — 있으면 미리보기 아바타에 실제 사진을 쓴다 */
  accountAvatar: string | null;
  /** 0052(follow_request) 컬럼 존재 여부 — false 면 토글 비활성(조용한 유실 방지) */
  followRequestReady: boolean;
  onSave: (draft: RuleDraft) => void | Promise<void>;
  onClose: () => void;
}) {
  const [postId, setPostId] = useState(initial && initial.postId !== NEXT_POST_SENTINEL ? initial.postId : "");
  const [postMode, setPostMode] = useState<"current" | "next">(
    initial?.postId === NEXT_POST_SENTINEL ? "next" : "current",
  );
  const [trigger, setTrigger] = useState<AutoDmTrigger>(initial?.trigger ?? "all");
  const [keywords, setKeywords] = useState<string[]>(initial?.keywords ?? []);
  const [keywordInput, setKeywordInput] = useState("");
  const [dmMessage, setDmMessage] = useState(initial?.dmMessage ?? "");
  const [buttonCount, setButtonCount] = useState<number>(initial ? initial.buttons.length : 1);
  const [buttons, setButtons] = useState<DmButton[]>(
    initial?.buttons.length ? initial.buttons : [{ label: "", url: "" }],
  );
  const [wantReply, setWantReply] = useState(Boolean(initial?.publicReplies.length));
  const [followRequest, setFollowRequest] = useState(initial?.followRequest ?? false);
  const [publicReplies, setPublicReplies] = useState<string[]>(
    initial?.publicReplies.length ? initial.publicReplies : pickRandomReplies(3),
  );
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

  // "다음 게시물" 예약도 콘텐츠 1개로 센다 — 이미 예약 규칙이 있으면 같은 콘텐츠라 허용
  const nextModeLocked = !otherRulePosts.has(NEXT_POST_SENTINEL) && atContentLimit;

  // buttonCount만큼 항상 패딩한다 — buttons 배열이 짧으면 미입력 버튼이 검증을 그냥
  // 통과해 빈 버튼이 저장되는 구멍이 있었다 (리뷰 확정 수리)
  const activeButtons = useMemo<DmButton[]>(
    () => Array.from({ length: buttonCount }, (_, i) => buttons[i] ?? { label: "", url: "" }),
    [buttons, buttonCount],
  );
  const linksValid = activeButtons.every((b) => b.label.trim() && normalizeHttpUrl(b.url));
  const linksDone = activeButtons.filter((b) => b.label.trim() && normalizeHttpUrl(b.url)).length;

  // 닫기 확인 — 작성/수정 내용이 있으면 한 번 묻는다 (5단계 입력을 실수로 날리는 사고 방지)
  const dirty = initial
    ? dmMessage !== initial.dmMessage ||
      trigger !== initial.trigger ||
      postId !== initial.postId ||
      JSON.stringify(keywords) !== JSON.stringify(initial.keywords) ||
      JSON.stringify(activeButtons) !== JSON.stringify(initial.buttons) ||
      followRequest !== initial.followRequest ||
      JSON.stringify(wantReply ? publicReplies.map((r) => r.trim()).filter(Boolean) : []) !==
        JSON.stringify(initial.publicReplies)
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
    () =>
      buttonCount > 0
        ? ["post", "trigger", "message", "links", "reply", "review"]
        : ["post", "trigger", "message", "reply", "review"],
    [buttonCount],
  );
  const step = steps[Math.min(stepIdx, steps.length - 1)];

  const canNext: boolean = (() => {
    switch (step) {
      case "post":
        if (postMode === "next") return !nextModeLocked;
        return Boolean(selectedPost) && !(selectedPost && postLocked(selectedPost));
      case "trigger":
        return trigger === "all" || keywords.length > 0;
      case "message":
        return dmMessage.trim().length > 0 && dmMessage.length <= DM_MAX;
      case "links":
        return linksValid;
      case "reply":
        return !wantReply || publicReplies.some((r) => r.trim().length > 0);
      case "review":
        /* 검수에서 자동 답글을 다시 켰는데 답글이 전부 비어 있으면 막는다 —
           reply 단계와 같은 규칙(관문이 갈리면 반드시 어긋난다) */
        return !wantReply || publicReplies.some((r) => r.trim().length > 0);
    }
  })();

  const isLast = stepIdx >= steps.length - 1;

  async function next() {
    if (!canNext || saving) return;
    if (!isLast) {
      setStepIdx((i) => i + 1);
      return;
    }
    if (postMode === "current" && !selectedPost) return;
    setSaving(true);
    try {
      const postFields =
        postMode === "next" || !selectedPost
          ? {
              postId: NEXT_POST_SENTINEL,
              postCaption: "다음에 올릴 게시물 (업로드 후 첫 댓글에 자동 연결)",
              postType: "feed" as const,
              postViews: 0,
              postThumb: null,
            }
          : {
              postId: selectedPost.id,
              postCaption: selectedPost.caption,
              postType: selectedPost.type,
              postViews: selectedPost.views,
              // 편집에서 다른 게시물로 바꿨는데 이전 썸네일이 남는 사고 방지 — 폴백은 같은 게시물일 때만
              postThumb:
                selectedPost.thumb ?? (initial && selectedPost.id === initial.postId ? initial.postThumb : null),
            };
      await onSave({
        id: initial?.id ?? makeId(),
        ...postFields,
        trigger,
        keywords: trigger === "keyword" ? keywords : [],
        publicReplies: wantReply ? publicReplies.map((r) => r.trim()).filter(Boolean) : [],
        dmMessage: dmMessage.trim(),
        // URL은 프로토콜 없이 입력해도 https://를 붙여 저장한다 (normalizeHttpUrl)
        buttons: activeButtons.map((b) => ({ label: b.label.trim(), url: normalizeHttpUrl(b.url) ?? b.url.trim() })),
        status: initial?.status ?? "active",
        followRequest,
        // 광고성 토글은 2026-08-14 사장님 지시로 UI에서 제거 — 파이프라인 필드는 유지(편집 시 기존값 보존)
        isAdvertising: initial?.isAdvertising ?? false,
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

  const previewMessage = dmMessage;

  /* DM 미리보기 — 리틀리 실측(2026-08-14) 구조: 흰 패널 안에 아바타(50px 원형) +
     회색 컨테이너(메시지 텍스트와 흰 버튼 행을 함께 담는다) */
  const preview = (
    <div className="rounded-card bg-overlay p-4">
      <div className="flex items-start gap-3">
        {accountAvatar ? (
          // eslint-disable-next-line @next/next/no-img-element -- 인스타 CDN 임시 URL이라 next/image 도메인 고정 불가
          <img
            src={accountAvatar}
            alt={accountHandle ?? "연동 계정 프로필"}
            className="size-[50px] shrink-0 rounded-full border border-line object-cover"
          />
        ) : (
          <span className="flex size-[50px] shrink-0 items-center justify-center rounded-full bg-primary text-[15px] font-bold text-on-primary">
            {(accountHandle ?? "핀치").replace(/^@/, "").slice(0, 2)}
          </span>
        )}
        <div className="min-w-0 max-w-[75%] space-y-2 rounded-card bg-plate p-[15px]">
          <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed text-fg">
            {previewMessage.trim() || <span className="text-fg-faint">메시지를 입력해주세요</span>}
          </p>
          {buttonCount > 0
            ? Array.from({ length: buttonCount }, (_, i) => activeButtons[i] ?? { label: "", url: "" }).map((b, i) => (
                <div
                  key={i}
                  className="flex h-[46px] items-center justify-center rounded-card bg-overlay px-3.5 text-[15px] font-medium"
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
          "flex size-[18px] shrink-0 items-center justify-center rounded-full border-2 transition-colors duration-200",
          opts.checked ? "border-fg" : "border-line-strong",
        )}
        aria-hidden
      >
        <span
          className={cn(
            "size-2.5 rounded-full bg-fg transition-all duration-200",
            opts.checked ? "scale-100 opacity-100" : "scale-0 opacity-0",
          )}
        />
      </span>
      <span className={cn("text-[15px] font-medium", opts.disabled ? "text-fg-sub" : "text-fg")}>
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
        className="modal-card-in shadow-pop flex h-[min(849px,88vh)] max-h-[92vh] w-full max-w-[550px] flex-col overflow-hidden rounded-card border border-line bg-body outline-none sm:max-h-[88vh]"
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
          <h2 className="flex-1 text-[17px] font-semibold">
            {step === "review" ? "최종 검수" : initial ? "자동화 수정" : "자동화 만들기"}
          </h2>
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
          <p className="mt-2 text-[15px] font-medium text-fg">
            {steps.length}단계 중 {stepNo}단계
          </p>
        </div>

        {/* 단계 본문 — key 교체로 오른쪽에서 스르륵 전환. 리틀리 실측: 본문만 연회색(surface) */}
        <div key={step} className="wizard-step-in mt-3 min-h-0 flex-1 overflow-y-auto bg-plate px-5 py-4">
          {step === "post" ? (
            <div>
              <p className="text-[15px] font-medium">
                어떤 게시물을 자동화할까요?
                <InfoTip>이 게시물에 달리는 새 댓글에만 자동 DM이 나갑니다.</InfoTip>
              </p>

              {/* 리틀리 1단계 구조 — 원형 라디오 행 2개 (현재 게시물 / 다음 게시물 예약) */}
              <div className="mt-2" role="radiogroup" aria-label="자동화할 게시물 방식">
                {radioRow({
                  checked: postMode === "current",
                  label: "현재 게시물에서 선택할게요",
                  onClick: () => setPostMode("current"),
                })}
                {radioRow({
                  checked: postMode === "next",
                  label: "다음에 올릴 게시물을 자동화 할게요",
                  onClick: () => setPostMode("next"),
                })}
              </div>

              {postMode === "next" ? (
                <div className="anim-swap mt-3 rounded-card bg-overlay p-4">
                  <span className="mb-2.5 flex size-14 items-center justify-center rounded-card bg-plate" aria-hidden>
                    <FinchMark className="size-7" />
                  </span>
                  <p className="text-[15px] font-medium">다음 게시물에 자동으로 연결돼요</p>
                  <p className="mt-1.5 text-[14px] leading-relaxed text-fg-sub">
                    지금 규칙을 만들어두면, 이 규칙을 만든 뒤 새로 올린 게시물에 첫 댓글이 달리는 순간 자동으로 그
                    게시물에 연결됩니다. 이전에 올린 게시물에는 적용되지 않아요.
                  </p>
                  {nextModeLocked ? (
                    <p className="mt-2 text-[12px] text-negative">
                      자동화 콘텐츠 한도에 도달했어요. 플랜을 업그레이드하면 예약할 수 있습니다.
                    </p>
                  ) : null}
                </div>
              ) : null}

              {contentLimit < 1000000 ? (
                <p className="mt-2 text-[14px] text-fg-sub">
                  자동화 콘텐츠 {contentUsed}/{contentLimit}개 사용 중
                  {atContentLimit && !initial ? " — 한도에 도달했어요. 기존 자동화 게시물만 선택할 수 있습니다." : ""}
                </p>
              ) : null}

              {postMode === "next" ? null : effectivePosts.length === 0 ? (
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
                          <span className="line-clamp-2 text-[11px] leading-tight text-white">{p.caption}</span>
                        </span>
                        <span className="absolute left-1 top-1 rounded-chip bg-black/55 px-1.5 py-0.5 text-[11px] font-semibold text-white">
                          {POST_TYPE_LABEL[p.type]}
                        </span>
                        {otherRulePosts.has(p.id) ? (
                          <span className="absolute right-1 top-1 rounded-chip bg-primary px-1.5 py-0.5 text-[11px] font-semibold text-on-primary">
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
              <p className="text-[15px] font-medium">어떤 댓글에 DM을 보낼까요?</p>
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
                      className="flex h-11 items-center gap-1 rounded-card border border-line-strong bg-overlay px-3 text-[15px] font-medium hover:border-fg"
                    >
                      <Plus className="size-4" aria-hidden /> 추가
                    </button>
                  </div>
                  {keywords.length > 0 ? (
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {keywords.map((k) => (
                        <span
                          key={k}
                          className="inline-flex items-center gap-1 rounded-chip border border-line bg-body px-2.5 py-1 text-[14px] font-medium"
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
              <p className="text-[15px] font-medium">
                DM 메시지를 작성해주세요
                <InfoTip>댓글 작성자에게 1회 발송되는 비공개 메시지입니다. 아래 미리보기로 실제 모습이 보여요.</InfoTip>
              </p>

              <div className="mt-3">{preview}</div>

              <div className="mt-4">
                <div className="flex items-center justify-between">
                  <label htmlFor="wizard-dm-msg" className="text-[15px] font-medium text-fg-sub">
                    메시지 입력 <span className="text-negative">*</span>
                  </label>
                  <span className={cn("tnum text-[12px]", dmMessage.length > DM_MAX ? "text-negative" : "text-fg-sub")}>
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
                <span className="text-[15px] font-medium text-fg-sub">
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
                          "h-9 rounded-card border text-[15px] font-medium trans-state",
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

            </div>
          ) : null}

          {step === "links" ? (
            <div>
              <div className="space-y-4">
                {Array.from({ length: buttonCount }, (_, i) => {
                  const b = buttons[i] ?? { label: "", url: "" };
                  const urlTouched = b.url.trim().length > 0;
                  const urlOk = Boolean(normalizeHttpUrl(b.url));
                  return (
                    <div key={i}>
                      {/* 리틀리 실측: 섹션 제목 "N번째 버튼 링크 설정" 14px/500 */}
                      <p className="text-[15px] font-medium">{i + 1}번째 버튼 링크 설정</p>
                      {i === 0 ? <div className="mt-3">{preview}</div> : null}
                      <div className="mt-3 space-y-3">
                        <div>
                          <label htmlFor={`dm-btn-label-${i}`} className="text-[15px] font-medium text-fg-sub">
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
                          <label htmlFor={`dm-btn-url-${i}`} className="text-[15px] font-medium text-fg-sub">
                            URL 입력 <span className="text-negative">*</span>
                          </label>
                          {/* 리틀리 실측: URL 입력 방식 탭 — 직접 입력(활성) / 링크 불러오기(리틀리는 자사
                              리틀리 링크 가져오기 — 우리 대응 기능 준비 전이라 비활성) */}
                          <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                            <button
                              type="button"
                              aria-pressed="true"
                              className="h-9 rounded-card border border-fg bg-fg text-[15px] font-medium text-body"
                            >
                              직접 입력
                            </button>
                            <button
                              type="button"
                              disabled
                              className="h-9 cursor-not-allowed rounded-card border border-line-strong bg-transparent text-[15px] font-medium text-fg-sub"
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
              <p className="text-[15px] font-medium">게시물 댓글에 대하여, 자동 답글을 남길까요?</p>
              <div className="mt-2" role="radiogroup" aria-label="자동 답글 여부">
                {radioRow({ checked: !wantReply, label: "아니요, 괜찮아요!", onClick: () => setWantReply(false) })}
                {radioRow({
                  checked: wantReply,
                  label: "네, 답글을 남기고 싶어요",
                  onClick: () => setWantReply(true),
                })}
              </div>

              {wantReply ? (
                <div className="anim-swap mt-3">
                  {/* 리틀리 실측 문구 그대로 — 랜덤 발송이 스팸 도배를 피해 계정을 지킨다 */}
                  <p className="text-[14px] text-fg-sub">준비된 답글이 랜덤으로 달리며, 계정을 보호합니다</p>

                  <div className="mt-2 space-y-2">
                    {publicReplies.map((reply, i) => (
                      <div key={i} className="flex items-center gap-1.5">
                        <input
                          value={reply}
                          aria-label={`자동 답글 ${i + 1}`}
                          maxLength={100}
                          onChange={(e) =>
                            setPublicReplies((prev) => prev.map((r, j) => (j === i ? e.target.value : r)))
                          }
                          placeholder="답글 내용을 입력해주세요"
                          className="h-11 min-w-0 flex-1 rounded-card border border-line-strong bg-overlay px-3 text-[15px] placeholder:text-fg-faint focus:border-fg focus:outline-none"
                        />
                        <button
                          type="button"
                          aria-label={`답글 ${i + 1} 삭제`}
                          onClick={() => setPublicReplies((prev) => prev.filter((_, j) => j !== i))}
                          disabled={publicReplies.length <= 1}
                          className="rounded-card p-2 text-fg-faint trans-state hover:bg-overlay hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <X className="size-4" />
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="mt-2.5 flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setPublicReplies((prev) => (prev.length >= 10 ? prev : [...prev, ""]))}
                      disabled={publicReplies.length >= 10}
                      className="flex h-9 items-center gap-1 rounded-card border border-line-strong bg-overlay px-3 text-[15px] font-medium trans-state hover:border-fg disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Plus className="size-4" aria-hidden /> 답글 추가
                    </button>
                    <button
                      type="button"
                      onClick={() => setPublicReplies((prev) => pickRandomReplies(3, prev))}
                      className="flex h-9 items-center gap-1 rounded-card border border-line-strong bg-overlay px-3 text-[15px] font-medium trans-state hover:border-fg"
                    >
                      <RotateCcw className="size-4" aria-hidden /> 새로고침
                    </button>
                  </div>
                </div>
              ) : null}

              <p className="mt-3 text-[14px] text-fg-sub">
                DM은 댓글당 1회만 보낼 수 있어, 공개 답글로 안내를 보완할 수 있어요.
              </p>
            </div>
          ) : null}

          {step === "review" ? (
            <div className="space-y-4">
              {/* 스딩 실측(2026-08-19): 최종 검수 = 선택 게시물 / 감지될 키워드 /
                  보내질 DM / 함께 보낼 링크 / 자동 답글 온오프 / 팔로우 요청 온오프 */}
              <div>
                <p className="text-[15px] font-medium text-fg-sub">선택한 인스타 게시물</p>
                {postMode === "next" ? (
                  <div className="mt-1.5 flex items-center gap-3 rounded-card bg-overlay p-3.5">
                    {/* 게시물을 지정하지 않았다 — 핀치 로고가 그 자리다(사장님 지시) */}
                    <span className="flex size-14 shrink-0 items-center justify-center rounded-card bg-plate" aria-hidden>
                      <FinchMark className="size-7" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[15px] font-medium">다음에 올릴 게시물을 미리 설정</p>
                      <p className="mt-0.5 text-[14px] text-fg-sub">업로드 후 첫 댓글이 달리는 순간 자동 연결돼요.</p>
                    </div>
                  </div>
                ) : selectedPost ? (
                  <div className="mt-1.5 flex items-center gap-3 rounded-card bg-overlay p-3.5">
                    {selectedPost.thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element -- 인스타 CDN 임시 URL
                      <img
                        src={selectedPost.thumb}
                        alt=""
                        className="size-14 shrink-0 rounded-card border border-line object-cover"
                      />
                    ) : (
                      <span className="flex size-14 shrink-0 items-center justify-center rounded-card bg-plate text-fg-faint" aria-hidden>
                        <ImageOff className="size-5" />
                      </span>
                    )}
                    <div className="min-w-0">
                      <p className="line-clamp-2 text-[15px] font-medium">{selectedPost.caption}</p>
                      <p className="mt-0.5 text-[12px] text-fg-sub">{POST_TYPE_LABEL[selectedPost.type]}</p>
                    </div>
                  </div>
                ) : null}
              </div>

              <div>
                <p className="text-[15px] font-medium text-fg-sub">감지될 키워드</p>
                <div className="mt-1.5 rounded-card bg-overlay px-3.5 py-3">
                  {trigger === "all" ? (
                    <p className="text-[15px]">전체 댓글</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {keywords.map((k) => (
                        <span key={k} className="rounded-chip border border-line bg-body px-2.5 py-1 text-[14px] font-medium">
                          {k}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <p className="text-[15px] font-medium text-fg-sub">보내질 DM 메시지</p>
                <div className="mt-1.5">{preview}</div>
              </div>

              <div>
                <p className="text-[15px] font-medium text-fg-sub">DM과 함께 보낼 링크</p>
                <div className="mt-1.5 space-y-1.5">
                  {buttonCount === 0 ? (
                    <p className="rounded-card bg-overlay px-3.5 py-3 text-[15px] text-fg-sub">없음</p>
                  ) : (
                    activeButtons.map((b2, i) => (
                      <div key={i} className="flex items-baseline gap-2 rounded-card bg-overlay px-3.5 py-3">
                        <span className="shrink-0 text-[15px] font-medium">{b2.label || `버튼 ${i + 1}`}</span>
                        <span className="tnum min-w-0 truncate text-[14px] text-fg-sub">{b2.url}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* 온오프 두 줄 — 검수에서 마지막으로 뒤집을 수 있는 유일한 항목(스딩과 동일) */}
              <div className="space-y-2.5 pt-1">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[15px] font-medium">
                    자동으로 답글 달기
                    <InfoTip>켜면 준비된 답글 중 하나가 랜덤으로 댓글에 달립니다. 답글 문구는 이전 단계에서 수정해요.</InfoTip>
                  </span>
                  <Switch checked={wantReply} onChange={setWantReply} label="자동으로 답글 달기" />
                </div>
                {wantReply && !publicReplies.some((r) => r.trim()) ? (
                  <p className="text-[12px] text-negative">답글 문구가 비어 있어요 — 뒤로 이동해 답글을 채워 주세요.</p>
                ) : null}
                <div className="flex items-center justify-between gap-3">
                  <span className={cn("text-[15px] font-medium", !followRequestReady && "text-fg-sub")}>
                    팔로우 요청 후 메시지 보내기
                    <InfoTip>
                      댓글 작성자가 나를 팔로우하지 않았다면, 본 메시지 전에 팔로우 요청을 먼저 보냅니다.
                      팔로워 전환에 도움이 되지만 한 단계가 늘어나요.
                    </InfoTip>
                  </span>
                  {/* 0052 미적용이면 비활성 — 켜고 확인했는데 목록에 OFF 로 나오는
                      "성공처럼 보이는 유실"을 만들지 않는다(links 0051 과 같은 규칙) */}
                  <Switch
                    checked={followRequest}
                    onChange={setFollowRequest}
                    disabled={!followRequestReady}
                    label="팔로우 요청 후 메시지 보내기"
                  />
                </div>
                {!followRequestReady ? (
                  <p className="text-[12px] text-fg-sub">팔로우 요청은 서버 업데이트(0052) 적용 후 쓸 수 있어요.</p>
                ) : null}
              </div>

              <p className="pt-1 text-center text-[14px] text-fg-sub">수정하려면 뒤로 이동해주세요.</p>
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
              "h-[54px] w-full rounded-card text-[17px] font-medium trans-state",
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
                    : "확인"
                  : "다음"}
          </button>
        </div>
      </div>
    </div>
  );
}
