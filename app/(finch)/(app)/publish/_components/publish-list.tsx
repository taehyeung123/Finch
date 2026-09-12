"use client";

import { useEffect, useEffectEvent, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CalendarClock, CheckCircle2, ChevronLeft, ChevronRight, FileText, Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button, ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import type { PostStatus } from "@/components/ui/status-pill";
import { ResultModal, type ResultModalContent } from "@/components/ui/result-modal";
import { Toast, type ToastContent } from "@/components/ui/toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { WEEKDAYS, earliestPublishAt, earliestPublishDate, kstDayKey, kstToday, monthGrid, shiftMonth } from "@/lib/calendar";
import { SnsIcon } from "@/components/sns-brand-icons";
import { channelLabel } from "@/lib/publish-rules";
import { MEDIA_PURGED_MESSAGE } from "@/lib/meta/publish-errors";
import {
  markPublishing,
  mergeProgress,
  nextWatchAt,
  pinInProgress,
  pollDelayMs,
  settledPosts,
  watchIds,
  type Settled,
} from "@/lib/publish/progress";
import { cancelScheduledPost } from "@/app/(finch)/(app)/studio/actions";
import { deleteDraft, publishNow, scheduleDraft } from "../actions";
import { PostComposer, type ComposerChannel, type ComposerSaved } from "./post-composer";
import { PostRow, type RowActions, type ScheduledPost } from "./post-row";

export type { ScheduledPost };

/* 확인을 받는 세 조작 — 전부 되돌릴 수 없다(취소한 예약을 되살리는 액션도, 올라간 글을 내리는 액션도, 지운 글을 되찾는 액션도 없다) */
type AskKind = "cancel" | "now" | "delete";
/** 확인을 누른 **시점에** 그 글이 아직 이 조작을 받을 수 있는 상태인가 — 확인 모달이 떠 있는 몇 초 사이 목록이 새로 올 수 있다 */
const ASK_ALLOWED: Record<AskKind, readonly PostStatus[]> = {
  /* 처리 중 취소는 서버가 «발행 시도 전»인지 한 번 더 본다(can_cancel·DB 가드 0093) */
  cancel: ["scheduled", "processing"],
  now: ["draft", "scheduled", "failed", "processing"],
  /* 취소된 글도 지울 수 있다 — 안 그러면 사진·영상 파일이 영구히 남는다 */
  delete: ["draft", "failed", "canceled"],
};

/**
 * 시계 — **이벤트 처리·효과·useEffectEvent 안에서만** 부른다(렌더에서 부르지 않는다. 렌더는 상태로 들고 있는 now 를 쓴다).
 * 컴포넌트 안에 Date.now() 를 직접 쓰면 React 컴파일러 검사(react-hooks/purity)가 «렌더 중일 수도 있다»고 막는다 —
 * 확인 모달의 onConfirm 처럼 사용자 정의 prop 으로 넘어가는 처리기는 렌더 밖이라는 걸 컴파일러가 모른다.
 */
const clockMs = (): number => Date.now();

/** 확인 모달·알림에 «어느 글인지»를 붙인다 — 목록에서 누른 줄이 맞는지 한 번 더 보게 */
function captionSnippet(caption: string): string {
  const line = caption.split("\n")[0]?.trim() ?? "";
  if (!line) return "(캡션 없음)";
  return line.length > 24 ? `${line.slice(0, 24)}…` : line;
}

/**
 * 한 줄에서 할 수 있는 조작 — 버튼은 **실제 상태(status)** 로 가른다(보이는 상태 display_status 가 아니라).
 * · 미리 준비 중인 예약 영상(processing 인데 «예약됨»으로 보임): 취소 + 지금 발행(준비물이 있어 곧바로 올라간다)
 * · 처리 중: 취소만 — 그것도 발행을 시도하기 전일 때만(can_cancel). 시도한 뒤엔 이미 올라갔을 수 있다
 * · 파일이 지워진 실패 글: 다시 예약·지금 발행 없이 삭제만
 * · 올리는 중(publishing): 아무것도 — 서버가 지금 올리고 있다
 */
function actionsFor(post: ScheduledPost) {
  const prepared = post.status === "processing" && post.display_status === "scheduled";
  return {
    now: !post.media_purged && (post.status === "draft" || post.status === "scheduled" || post.status === "failed" || prepared),
    cancel: post.can_cancel && (post.status === "scheduled" || post.status === "processing"),
    /* 초안 «예약하기»·실패 글 «다시 예약» — 같은 액션(scheduleDraft)을 탄다 */
    schedule: (post.status === "draft" || post.status === "failed") && !post.media_purged,
    del: post.status === "draft" || post.status === "failed" || post.status === "canceled",
  };
}

/** «올리기 시작했어요» — 어디서 진행 상황을 볼지는 누른 곳마다 다르다(where) */
function startedToast(label: string, hasVideo: boolean, where: string): ToastContent {
  return {
    tone: "positive",
    title: `${label}에 올리기 시작했어요`,
    description: `화면을 나가도 계속 올라가요. 진행 상황은 ${where}에서 볼 수 있고, 끝나면 알림으로 알려 드려요.${
      hasVideo ? " 영상은 처리하는 데 몇 분 걸릴 수 있어요." : ""
    }`,
  };
}

/** 화면에 있는 동안 뒤에서 끝난 글 → 짧은 알림 하나(여러 개면 묶는다) */
function settledToast(list: Settled[], nowMs: number): ToastContent {
  if (list.length === 1) {
    const { post, outcome } = list[0];
    const label = channelLabel(post.channel);
    const lead = `「${captionSnippet(post.caption)}」`;
    if (outcome === "published") return { tone: "positive", title: `${label}에 올라갔어요`, description: `${lead} — 목록에서 게시물을 볼 수 있어요.` };
    if (outcome === "failed") {
      /* 실패 이유는 엔진 문구(마침표 없음, lib/meta/publish-errors.ts)라 문장 끝을 여기서 맞춘다 — 예전엔 «…해 주세요 목록에서…»로 붙었다.
         파일이 지워진 글은 다시 시도할 수 없다(지우기만) — 알림 문구(run.ts)와 같은 갈래 */
      const why = (post.media_purged ? MEDIA_PURGED_MESSAGE : (post.error ?? "잠시 후 다시 시도해 주세요")).replace(/[.\s]+$/, "");
      const next = post.media_purged ? "목록에서 지울 수 있어요." : "목록에서 다시 시도하거나 지울 수 있어요.";
      return { tone: "negative", title: `${label}에 올리지 못했어요`, description: `${lead} — ${why}. ${next}` };
    }
    /* 예약 시각이 아직 미래인 글(예약 글에 「지금 발행」)은 그 시각에 다시 시도한다 — 크론 호출은 «최선을 다함»이라 정확한 분을 약속하지 않는다 */
    const future = Date.parse(post.scheduled_at) > nowMs + 60_000;
    return {
      tone: "warning",
      title: "지금 바로는 올리지 못했어요",
      description: `${lead} — ${future ? "예약한 시각에 자동으로 다시 시도해요." : "몇 분 안에 자동으로 다시 올려요."}`,
    };
  }
  const pub = list.filter((s) => s.outcome === "published").length;
  const failed = list.filter((s) => s.outcome === "failed").length;
  const later = list.length - pub - failed;
  const parts = [pub ? `${pub}개는 올라갔어요` : null, failed ? `${failed}개는 올리지 못했어요` : null, later ? `${later}개는 곧 다시 올려요` : null];
  return {
    tone: failed ? "negative" : later ? "warning" : "positive",
    title: failed ? `게시물 ${failed}개를 올리지 못했어요` : pub === list.length ? `게시물 ${pub}개가 올라갔어요` : "발행 상황이 바뀌었어요",
    description: `${parts.filter(Boolean).join(" · ")} — 목록에서 확인해 주세요.`,
  };
}

/**
 * 발행 — 캘린더 + 목록 + 초안.
 *
 * 캘린더가 기본 보기다. 발행 계획은 "언제 비어 있나"를 보는 일인데, 목록은 그걸
 * 절대 못 보여준다(있는 날만 줄로 나오니까 빈 날이 안 보인다). 목록은 상태·오류를
 * 확인하는 보기라 탭으로 남긴다.
 *
 * 날짜 판정은 전부 KST(lib/calendar) — scheduled_at 은 UTC 라 브라우저 타임존으로
 * 나누면 해외 접속 시 하루가 밀린다. 예약 시각도 KST 로 고른다(5분마다 도는 크론이 집는다).
 *
 * 2026-09-12 비동기 「지금 발행」: 누르면 그 줄이 곧바로 «올리는 중»이 되고(서버는 선점만 하고 돌아온다 — actions.ts 머리말),
 * 올리는 동안 이 화면이 가벼운 조회(/api/publish/progress)로 따라 본다. 끝나면 짧은 알림(토스트)을 한 번. 화면을 나가도 서버는 계속 올린다.
 * 한 글이 올라가는 동안 다른 글도 올릴 수 있다 — 예전의 «한 번에 하나» 잠금은 그 한 번이 1분 가까이 화면을 붙잡았기 때문이었다.
 * 이제 서버 쪽 일은 글마다 따로 선점해 따로 돌고(중복은 선점이 막는다), 누른 줄만 응답 전까지 잠근다.
 */
export function PublishList({
  initialItems,
  renderedAt,
  channels,
  isDemo,
  truncated = false,
  loadFailed = false,
}: {
  initialItems: ScheduledPost[];
  /** 서버가 이 목록을 만든 시각 — «지금»의 첫 값(서버가 그린 글자와 하이드레이션이 같게). 그 뒤로는 조회·조작마다 브라우저 시계로 갱신한다 */
  renderedAt: number;
  /** 채널 연결 스트립 — 링크팜 포스팅 상단의 연결 상태 표시(실측 2026-08-19) */
  /** null = 연동 상태를 **확인하지 못했다**. «계정 없음»으로 그리지 않는다 */
  channels: ComposerChannel[] | null;
  isDemo: boolean;
  /** 서버 조회가 한도에서 잘렸다 — 화면이 "이게 전부"라고 거짓말하지 않게 알린다 */
  truncated?: boolean;
  /** 조회 자체가 실패했다 — «예약 없음»과 구분해야 한다(lib/data/internal.ts 규칙) */
  loadFailed?: boolean;
}) {
  /* 서버가 준 목록을 그대로 첫 렌더에 쓴다 — 마운트 후 fetch 하면 빈 화면이 한 번
     깜빡이고, effect 안 setState 는 캐스케이딩 렌더를 만든다. */
  const [items, setItems] = useState<ScheduledPost[]>(initialItems);
  const [, startTransition] = useTransition();
  const router = useRouter();

  /* 서버가 새 목록을 주면(액션 응답의 목록 다시 그리기·router.refresh) 낙관적 상태를 서버 값으로 덮는다.
     useState 초기값은 첫 마운트에만 쓰이므로 이 동기화가 없으면 refresh 가 화면에 반영되지 않는다.
     effect 대신 렌더 시점 조정 — 이 레포의 다른 곳(search-console)과 같은 관례이고 캐스케이딩 렌더가 없다. */
  const [prevInitial, setPrevInitial] = useState(initialItems);
  if (initialItems !== prevInitial) {
    setPrevInitial(initialItems);
    setItems(initialItems);
  }

  /* 링크팜 실측 서브탭: 포스팅(캘린더) / 발행예약 / 발행완료 / 초안.
     기존 "목록" 하나를 상태별 둘로 갈랐다 — 예약(고칠 수 있는 것)과 완료(이력)는
     보는 이유가 다르다. */
  const [view, setView] = useState<"calendar" | "scheduled" | "done" | "drafts">("calendar");
  /* 새 게시물 컴포저 — null 아니면 열림, 문자열이면 캘린더에서 고른 날짜가 미리 담긴다 */
  const [composer, setComposer] = useState<{ date: string | null } | null>(null);
  /* 누른 조작의 결과 — 막혔거나 거절된 것은 모달로 한 번 세운다(연동 결과와 같은 규칙, components/ui/result-modal.tsx) */
  const [result, setResult] = useState<ResultModalContent | null>(null);
  /* 뒤에서 이어지는 일의 안내·소식 — 화면을 막지 않는 토스트(components/ui/toast.tsx) */
  const [toast, setToast] = useState<ToastContent | null>(null);
  const today = kstToday();
  /* 초안·실패 글에 시각을 붙일 때 고를 수 있는 가장 이른 시각(지금, 5분 단위 올림).
     earliest(오늘)는 달력의 «이 날짜로 포스팅» 이 지난 날인지 볼 때만 쓴다. */
  const earliest = earliestPublishDate();
  const earliestAt = earliestPublishAt();
  const [cursor, setCursor] = useState(() => {
    const [y, m] = today.split("-");
    return { year: Number(y), month: Number(m) };
  });
  const [selected, setSelected] = useState<string | null>(today);

  const [draftDate, setDraftDate] = useState<Record<string, string>>({});
  /* 초안·실패 글의 예약 전환·삭제 — 한 번에 하나(짧은 조작이다) */
  const [draftBusy, setDraftBusy] = useState<string | null>(null);
  /* 시각 고르기가 열린 줄 — 한 번에 하나 */
  const [scheduleOpen, setScheduleOpen] = useState<string | null>(null);
  /* 「지금 발행」 응답을 기다리는 글 — 그 줄만 잠근다(서버는 선점만 하고 곧 돌아온다, 보통 1초 안팎) */
  const [nowPending, setNowPending] = useState<string[]>([]);
  /* 확인을 기다리는 조작 — window.confirm 이었다. 브라우저가 대화상자를 막으면(«추가 대화상자 표시 안 함») confirm 이
     즉시 false 라 세 버튼이 **조용히 아무 일도 안 했다.** 무엇을 누구에게 할지는 id 로 들고, 실행은 확인 시점에 다시 판정한다. */
  const [ask, setAsk] = useState<{ kind: AskKind; id: string } | null>(null);

  /* ── 진행 상황 따라 보기(lib/publish/progress.ts) ──
     now: 렌더 안에서 Date.now() 를 부르지 않도록 들고 있는 «지금» — 첫 값은 서버가 목록을 만든 시각(하이드레이션이 서버 글자와 같게),
          그 뒤로 조회할 때마다·조작할 때마다 갱신한다.
     gone: 조회에 안 나온 글(다른 창에서 지웠다 등) — 더 묻지 않는다(목록은 새로고침이 맞춘다). */
  const [now, setNow] = useState(renderedAt);
  const [gone, setGone] = useState<ReadonlySet<string>>(() => new Set());
  /* 이미 알린 «끝남»(id:결과) — 늦게 온 새로고침이 옛 상태를 잠깐 되돌려도 같은 소식을 두 번 띄우지 않는다 */
  const toldRef = useRef(new Set<string>());
  /* 글마다 «이 화면에서 마지막으로 손댄 시각»(지금 발행·취소를 누른 때와 그 응답이 온 때). 그보다 **먼저 보낸** 조회의 답은 그 글에 쓰지 않는다 —
     누르기 직전에 떠난 조회가 옛 상태(«실패»·«예약됨»)를 들고 늦게 오면 낙관적 «올리는 중»을 되돌리고 «못 올렸어요»를 잘못 띄운다 */
  const touchedRef = useRef(new Map<string, number>());
  const touch = (id: string) => touchedRef.current.set(id, clockMs());
  const watch = useMemo(() => watchIds(items, now, gone), [items, now, gone]);
  const watchKey = watch.join(",");
  const pollDelay = pollDelayMs(items, now);

  /* 조회 결과를 합치고, 방금 끝난 글을 한 번 알린다. useEffectEvent — 늘 최신 items 를 보되 조회 효과를 다시 걸지 않는다 */
  const applyProgress = useEffectEvent((ids: string[], answer: ScheduledPost[], sentAt: number) => {
    const nowMs = clockMs();
    const fresh = answer.filter((f) => (touchedRef.current.get(f.id) ?? 0) < sentAt);
    const merged = mergeProgress(items, fresh);
    const done = settledPosts(items, merged, nowMs).filter((s) => !toldRef.current.has(`${s.post.id}:${s.outcome}`));
    for (const s of done) toldRef.current.add(`${s.post.id}:${s.outcome}`);
    setItems((prev) => mergeProgress(prev, fresh));
    setNow(nowMs);
    if (done.length > 0) {
      const next = settledToast(done, nowMs);
      /* 읽지 않은 실패 알림은 성공 소식으로 덮지 않는다(줄은 이미 결과를 그리고 있다) */
      setToast((cur) => (cur && cur.tone === "negative" && next.tone !== "negative" ? cur : next));
    }
    const missing = ids.filter((id) => !answer.some((f) => f.id === id));
    if (missing.length > 0) {
      setGone((g) => new Set([...g, ...missing]));
      router.refresh();
    }
  });

  /* 따라 볼 글이 있는 동안만 묻는다 — 올리는 중·처리 중이면 4초, 예약 시각이 막 지난 글·멈춘 것 같은 실행만 남았으면 10초.
     탭이 가려지면 멈추고, 다시 보이면 곧바로 한 번 묻는다. 예시 화면은 서버에 아무것도 없어 묻지 않는다. */
  useEffect(() => {
    if (isDemo || !watchKey) return;
    const ids = watchKey.split(",");
    let alive = true;
    let inFlight = false;
    let timer: number | undefined;
    const tick = async () => {
      if (!alive || inFlight || document.visibilityState === "hidden") return;
      inFlight = true;
      const sentAt = clockMs();
      try {
        const res = await fetch(`/api/publish/progress?ids=${encodeURIComponent(ids.join(","))}`, { cache: "no-store" });
        if (res.status === 401) {
          /* 로그인이 풀렸다 — 더 묻지 않는다(다음 화면 이동이 로그인으로 보낸다) */
          alive = false;
          return;
        }
        if (res.ok) {
          const body = (await res.json()) as { ok?: boolean; items?: ScheduledPost[] };
          if (alive && body.ok && Array.isArray(body.items)) applyProgress(ids, body.items, sentAt);
        }
        /* 그 밖의 실패(503 등)는 «없음»이 아니다 — 목록을 건드리지 않고 다음 차례에 다시 묻는다 */
      } catch {
        /* 네트워크 — 다음 차례에 다시 */
      } finally {
        inFlight = false;
      }
      if (alive) timer = window.setTimeout(tick, pollDelay);
    };
    const onVisible = () => {
      if (document.visibilityState !== "visible" || !alive) return;
      window.clearTimeout(timer);
      void tick();
    };
    timer = window.setTimeout(tick, pollDelay);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [watchKey, pollDelay, isDemo]);

  /* 곧 예약 시각이 되는 글이 있으면 그때 한 번 깨어난다 — «지금»이 넘어가야 위 따라 보기가 그 글을 집는다(타이머 하나뿐) */
  useEffect(() => {
    if (isDemo) return;
    const at = nextWatchAt(items, now);
    if (at === null) return;
    const t = window.setTimeout(() => setNow(clockMs()), Math.max(1_000, at - clockMs() + 500));
    return () => window.clearTimeout(t);
  }, [items, now, isDemo]);

  /* 날짜별 묶음. 초안은 날짜가 "미정"의 의미라 캘린더에 찍지 않는다 —
     안 정한 날짜를 달력에 찍으면 계획이 있는 것처럼 보인다. */
  const byDay = useMemo(() => {
    const map = new Map<string, ScheduledPost[]>();
    for (const p of items) {
      if (p.status === "draft") continue;
      const key = kstDayKey(p.display_at);
      if (!key) continue;
      const list = map.get(key);
      if (list) list.push(p);
      else map.set(key, [p]);
    }
    return map;
  }, [items]);

  const drafts = useMemo(() => items.filter((p) => p.status === "draft"), [items]);
  /* 발행예약 = 아직 손댈 수 있는 것(예약·올리는 중·처리 중·실패) / 발행완료 = 이력(발행됨·취소됨).
     진행 중인 글은 맨 위로 — 「지금 발행」한 글이 미래 예약들 밑에 묻히지 않게 */
  const scheduledItems = useMemo(
    () =>
      pinInProgress(
        items.filter((p) => p.status === "scheduled" || p.status === "publishing" || p.status === "processing" || p.status === "failed"),
      ),
    [items],
  );
  const doneItems = useMemo(() => items.filter((p) => p.status === "published" || p.status === "canceled"), [items]);
  const cells = useMemo(() => monthGrid(cursor.year, cursor.month), [cursor]);
  const selectedPosts = useMemo(() => (selected ? pinInProgress(byDay.get(selected) ?? []) : []), [selected, byDay]);

  /** 오늘을 보이게 — 「지금 발행」한 새 글은 오늘 날짜다(달력 옆 하루 목록에 곧바로 보이게) */
  function revealToday() {
    const t = kstToday();
    const [y, m] = t.split("-");
    setCursor({ year: Number(y), month: Number(m) });
    setSelected(t);
    if (view === "done" || view === "drafts") setView("calendar");
    return view === "scheduled" ? "「발행예약」 맨 위" : "오늘 날짜 목록";
  }

  function cancel(id: string) {
    /* 낙관적 갱신 후 **반드시 서버 값으로 맞춘다.**
       cancelScheduledPost 는 상태 가드가 있어서, 누르는 순간 크론이 이미 발행했으면 0행이 되고 이유를 돌려준다.
       그래서 성공·실패와 무관하게 refresh 로 서버 상태를 다시 읽는다. */
    /* 되돌릴 수 없는 조작이다 — 취소된 행을 다시 예약으로 되돌리는 액션이 코드에 없다.
       확인은 호출 전에 ConfirmDialog 가 받는다(confirmAsk). 아래 스냅샷(before)은 **확인 뒤** 찍혀야 실패 복원이 옛 상태로 안 간다. */
    const before = items.find((p) => p.id === id);
    touch(id);
    setItems((prev) => prev.map((p) => (p.id === id ? { ...p, status: "canceled", display_status: "canceled", can_cancel: false } : p)));
    startTransition(async () => {
      /* 실패는 말해 준다 — 예전엔 반환값을 안 받아 «취소됨»이 조용히 «예약됨»으로 되돌아갔고, 사용자는 자기가 잘못 눌렀다고 생각했다 */
      const res = await cancelScheduledPost(id).finally(() => touch(id));
      if (!res?.ok) {
        if (before) setItems((prev) => prev.map((p) => (p.id === id ? before : p)));
        /* 서버가 이유를 준다(«이미 올리는 중이라 취소할 수 없어요» 등) — «잠시 후 다시»는 틀린 안내일 수 있다 */
        setResult({ tone: "negative", title: "예약을 취소하지 못했어요", description: res?.error ?? "잠시 후 다시 시도해 주세요." });
      }
      router.refresh();
    });
  }

  /* 「지금 발행」 — 초안·예약·실패 글을 선점해 뒤에서 내보낸다. 되돌릴 수 없는 외부 행동이라 확인을 받는다(confirmAsk).
     누르는 순간 그 줄이 «올리는 중»이 된다(낙관적) — 서버 응답(보통 1초 안팎)에 실린 목록이 서버 값으로 덮는다.
     서버가 거절하면 모달로 이유를 말한다 — 누른 조작의 결과다. 글을 건드리지 않은 거절(연동 끊김 등)이면 줄을 되돌리고,
     누르는 사이 글이 이미 다른 데로 간 거절(moved — 다른 창·크론이 먼저 집었다)이면 되돌리지 않고 응답에 실린 목록을 따른다. */
  function runNow(id: string) {
    const before = items.find((p) => p.id === id);
    if (!before || nowPending.includes(id)) return;
    const where = view === "calendar" ? "이 날짜 목록" : view === "scheduled" ? "「발행예약」 맨 위" : "「발행예약」 탭";
    /* 누른 시각 — «지금»도 함께 당겨 «방금 시작»이 정확하게 */
    const startedMs = clockMs();
    const startedIso = new Date(startedMs).toISOString();
    setNow(startedMs);
    touch(id);
    setNowPending((s) => [...s, id]);
    setScheduleOpen((o) => (o === id ? null : o));
    setItems((prev) => prev.map((p) => (p.id === id ? markPublishing(p, startedIso) : p)));
    startTransition(async () => {
      try {
        const res = await publishNow(id);
        if (!res.ok) {
          if (res.moved) {
            /* 누르는 사이 서버에서 글이 이미 다른 데로 갔다(다른 창·크론이 먼저 집었거나 지웠다) — 누르기 전 모습으로 되돌리지 않는다.
               응답에 실린 목록(revalidatePath)이 진짜 상태를 준다. «발행하지 못했어요»도 아니다 — 대개 이미 올라가는 중이다 */
            setResult({ tone: "warning", title: "그 사이 글의 상태가 바뀌었어요", description: res.error });
          } else {
            /* 서버가 글을 건드리지 않고 거절했다(연동 끊김·파일 정리 등) — 줄을 누르기 전 모습으로 */
            setItems((prev) => prev.map((p) => (p.id === id ? before : p)));
            setResult({ tone: "negative", title: "발행하지 못했어요", description: res.error });
          }
          router.refresh();
          return;
        }
        const o = res.outcome;
        setToast(
          o.state === "started"
            ? startedToast(o.label, before.has_video, where)
            : { tone: "warning", title: "곧 자동으로 다시 시도해요", description: o.error },
        );
      } catch {
        /* 호출 자체가 던진 경우(네트워크·배포 교체) — 서버는 선점했을 수도 있다. 상태는 새로고침이 말해 준다 */
        setResult({ tone: "negative", title: "결과를 확인하지 못했어요", description: "연결이 끊겼어요. 잠시 후 목록을 새로고침해 주세요." });
        router.refresh();
      } finally {
        touch(id);
        setNowPending((s) => s.filter((x) => x !== id));
      }
    });
  }

  /* 확인 모달의 「확인」 — 누른 시점의 목록으로 다시 판정한 뒤 실행한다 */
  function confirmAsk() {
    const a = ask;
    setAsk(null);
    if (!a) return;
    const post = items.find((p) => p.id === a.id);
    const still =
      !!post &&
      ASK_ALLOWED[a.kind].includes(post.status) &&
      (a.kind !== "cancel" || actionsFor(post).cancel) &&
      (a.kind !== "now" || actionsFor(post).now);
    if (!still) {
      /* 그 사이 크론이 발행했거나 다른 조작의 새로고침이 먼저 왔다 — 옛 판단으로 실행하지 않는다 */
      setResult({ tone: "warning", title: "그 사이 글의 상태가 바뀌었어요", description: "목록을 다시 확인하고 눌러 주세요." });
      router.refresh();
      return;
    }
    /* 그 글 자체에 다른 조작(예약 전환·삭제)이 도는 중이면 기다리게 한다 — 막을 때는 조용히 끝내지 않고 말한다 */
    if (draftBusy === a.id) {
      setResult({ tone: "warning", title: "이 글을 처리하고 있어요", description: "끝난 뒤 다시 눌러 주세요." });
      return;
    }
    if (a.kind === "now") {
      runNow(a.id);
      return;
    }
    if (a.kind === "cancel") {
      cancel(a.id);
      return;
    }
    if (draftBusy) {
      setResult({ tone: "warning", title: "다른 글을 처리하고 있어요", description: "끝난 뒤 다시 눌러 주세요." });
      return;
    }
    runDraft(a.id, "delete");
  }
  const askPost = ask ? items.find((p) => p.id === ask.id) : undefined;
  const askLead = askPost ? `「${captionSnippet(askPost.caption)}」 — ` : "";
  /* 「지금 발행」이 올라갈 계정 — 누르는 순간 연결된 계정이 대상이 된다(publishNow → stampPostTarget, 2026-09-12 계정 전환).
     이전 계정의 글이면 «이전 계정이 아니라 지금 계정으로»를 분명히 말한다. 발행을 시도한 뒤 계정이 바뀐 글은 대상이 안 바뀌므로 말하지 않는다. */
  const nowTarget = askPost ? (channels?.find((c) => c.channel === askPost.channel && c.connected)?.handle ?? null) : null;
  const nowTargetText =
    askPost && nowTarget && !(askPost.account_previous && askPost.publish_attempted)
      ? askPost.account_previous
        ? `이전 계정${askPost.account_handle ? `(${askPost.account_handle})` : ""}이 아니라 지금 연결된 ${nowTarget} 계정으로 올라가요. `
        : `${nowTarget} 계정으로 올라가요. `
      : "";

  function runDraft(id: string, mode: "schedule" | "delete") {
    if (draftBusy) return;
    setDraftBusy(id);
    startTransition(async () => {
      try {
        const res = mode === "delete" ? await deleteDraft(id) : await scheduleDraft(id, draftDate[id] ?? "");
        if (!res.ok) {
          setResult({
            tone: "negative",
            title: mode === "delete" ? "지우지 못했어요" : "예약하지 못했어요",
            description: res.error ?? "잠시 후 다시 시도해 주세요.",
          });
          return;
        }
        if (mode === "schedule") setScheduleOpen((o) => (o === id ? null : o));
        /* 낙관적으로 지우지 않는다 — 예약 전환은 상태와 날짜가 함께 바뀌어서
           화면에서 재구성하면 서버와 어긋날 여지가 크다. refresh 한 번이 정확하다. */
        router.refresh();
      } catch {
        setResult({ tone: "negative", title: "처리하지 못했어요", description: "연결을 확인하고 잠시 후 다시 시도해 주세요." });
      } finally {
        setDraftBusy(null);
      }
    });
  }

  /** 한 줄의 조작 묶음 — 어느 목록이든 같다(달력 옆·발행예약·발행완료·초안) */
  function rowActions(post: ScheduledPost): RowActions {
    const act = actionsFor(post);
    const pending = nowPending.includes(post.id) || draftBusy === post.id;
    return {
      busy: pending,
      onNow: act.now ? () => setAsk({ kind: "now", id: post.id }) : undefined,
      onCancel: act.cancel ? () => setAsk({ kind: "cancel", id: post.id }) : undefined,
      onDelete: act.del ? () => setAsk({ kind: "delete", id: post.id }) : undefined,
      schedule: act.schedule
        ? {
            label: post.status === "draft" ? "예약하기" : "다시 예약",
            open: scheduleOpen === post.id,
            onToggle: () => setScheduleOpen((o) => (o === post.id ? null : post.id)),
            value: draftDate[post.id] ?? "",
            min: earliestAt,
            onChange: (v) => setDraftDate((d) => ({ ...d, [post.id]: v })),
            onSubmit: () => runDraft(post.id, "schedule"),
            busy: draftBusy === post.id,
            locked: draftBusy !== null,
          }
        : undefined,
    };
  }

  /* 작성기 저장 결과 — 예약·초안은 결과 모달, 「지금 발행」은 토스트 + 오늘 날짜로 이동(새 글이 곧바로 보이게) */
  function onComposerSaved(saved: ComposerSaved) {
    setComposer(null);
    setNow(clockMs());
    if (saved.kind === "modal") {
      setResult(saved.result);
    } else if (saved.kind === "started") {
      const where = revealToday();
      setToast(startedToast(channelLabel(saved.channel), saved.hasVideo, where));
    } else {
      revealToday();
      setToast(saved.toast);
    }
    /* createPost 의 revalidatePath 가 응답에 새 목록을 실어 보낸다 — initialItems 동기화(위 prevInitial 패턴)가 화면에 반영한다.
       한 번 더 새로고침해 두는 것은 응답의 목록이 어떤 이유로든 빠졌을 때의 안전판이다 */
    router.refresh();
  }

  /* 모달이 떠 있는 동안 토스트는 미룬다 — 바닥에 붙는 모바일 모달의 버튼을 가리지 않게. 닫히면 그때 나타난다 */
  const toastShown = composer || ask || result ? null : toast;

  /* ⚠️ 앞서 여기서 **화면 전체를 EmptyState 한 장으로 바꿔치기**했다.
     0건이면 캘린더도 탭도 초안도 전부 사라져서, 이 화면의 핵심(달력을 보고 빈 날을
     고르는 것)이 "예약이 하나도 없는 사람"에게만 안 보이는 상태가 됐다 —
     예약이 없을 때야말로 달력이 가장 필요하다.
     이제 달력은 항상 그린다. 빈 상태는 달력 **옆 레일**이 안내한다. */
  return (
    <div className="space-y-5">
      {/* 조회가 실패했으면 **먼저** 말한다 — 아래 탭들은 「아직 예약이 없어요」라고 단정하는데,
          예약해 둔 사람이 그걸 보면 다시 예약하거나 발행이 날아간 줄 안다.
          실패는 «없음»이 아니다(lib/data/internal.ts 규칙). */}
      {loadFailed ? (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-card border border-warning/40 bg-warning-weak px-4 py-3 text-[14px] text-fg"
        >
          <AlertTriangle className="size-4 shrink-0 text-warning" aria-hidden />
          <span>예약 목록을 불러오지 못했어요 — 아래가 전부가 아닐 수 있어요. 잠시 후 새로고침해 주세요.</span>
        </div>
      ) : null}

      {/* 채널 연결 스트립 — 링크팜 포스팅 상단(실측). 연결 안 된 채널은 눌러서
          연동 관리로 간다. 발행이 어느 계정으로 나가는지 이 줄이 항상 말해준다. */}
      <div className="card-face flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3">
        {/* 조회 실패면 연결 여부를 말하지 않는다 — «미연결» 칩을 그리면 멀쩡한 연결이 끊긴 것처럼 읽힌다 */}
        {channels === null ? <p className="text-[14px] text-fg-sub">연결 상태를 불러오지 못했어요 · 새로고침해 주세요</p> : null}
        {(channels === null ? [] : (["instagram", "tiktok", "threads"] as const)).map((ch) => {
          const meta = channels?.find((c) => c.channel === ch);
          const connected = !!meta?.connected;
          const label = ch === "instagram" ? "인스타그램" : ch === "tiktok" ? "틱톡" : "스레드";
          const inner = (
            <>
              <span
                className={cn(
                  "relative flex size-9 items-center justify-center rounded-full border",
                  connected ? "border-primary bg-primary-weak text-fg" : "border-line bg-plate text-fg-faint",
                )}
              >
                <SnsIcon kind={ch} className="size-4" />
                {!connected ? (
                  <span className="absolute -bottom-0.5 -right-0.5 flex size-3.5 items-center justify-center rounded-full border border-line bg-body">
                    <Plus className="size-2.5 text-fg-sub" aria-hidden />
                  </span>
                ) : null}
              </span>
              <span className="min-w-0">
                <span className="block text-[12px] font-semibold">{label}</span>
                {/* "연결하기"는 눌러야 하는 활성 CTA 다 — fg-faint(4.0:1)는 본문 금지 규칙에
                    걸리고, 11px 소형 텍스트라 대비가 더 아쉽다. 양쪽 다 fg-sub. */}
                <span className="block truncate text-[11px] text-fg-sub">{connected ? (meta?.handle ?? "연결됨") : "연결하기"}</span>
              </span>
            </>
          );
          return connected ? (
            <span key={ch} className="flex items-center gap-2">
              {inner}
            </span>
          ) : (
            /* size="sm"(h-8=32px)은 안의 아바타(36px)보다 낮아 위아래로 삐져나온다 — md(40px) */
            <ButtonLink key={ch} href="/settings/channels" variant="ghost" size="md" className="flex items-center gap-2 !px-1.5">
              {inner}
            </ButtonLink>
          );
        })}
      </div>

      {/* 서브탭(링크팜 실측: 포스팅/초안/발행예약/발행완료) + 새 게시물 CTA */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* chip-row — 네 탭이 모바일에서 두 줄로 깨졌다(2026-08-29 실측) */}
        <div className="chip-row gap-1.5" role="tablist" aria-label="발행 보기">
          {(
            [
              { key: "calendar", label: "캘린더", icon: CalendarClock, count: null },
              { key: "scheduled", label: "발행예약", icon: CalendarClock, count: scheduledItems.length },
              { key: "done", label: "발행완료", icon: CheckCircle2, count: doneItems.length },
              { key: "drafts", label: "초안", icon: FileText, count: drafts.length },
            ] as const
          ).map((t) => {
            const on = view === t.key;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setView(t.key)}
                className={cn(
                  "trans-state inline-flex min-h-9 items-center gap-1.5 rounded-chip px-3.5 text-[14px] font-medium",
                  on ? "bg-primary text-on-primary" : "border border-line text-fg-sub hover:bg-tint-hover hover:text-fg",
                )}
              >
                <t.icon className="size-3.5" aria-hidden />
                {t.label}
                {t.count !== null && t.count > 0 ? <span className="tnum">{t.count}</span> : null}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          <ButtonLink href="/studio" variant="secondary" size="sm">
            스튜디오에서 만들기
          </ButtonLink>
          <Button size="sm" onClick={() => setComposer({ date: null })}>
            <Plus className="size-3.5" aria-hidden /> 새 게시물 포스팅
          </Button>
        </div>
      </div>

      <ResultModal result={result} onClose={() => setResult(null)} />
      <Toast toast={toastShown} onClose={() => setToast(null)} />
      {ask ? (
        <ConfirmDialog
          {...(ask.kind === "cancel"
            ? askPost?.display_status === "processing"
              ? {
                  title: "처리 중인 게시물을 취소할까요?",
                  description: `${askLead}취소하면 올라가지 않고, 되돌릴 수 없어요.`,
                  confirmLabel: "발행 취소",
                  cancelLabel: "그대로 두기",
                }
              : {
                  title: "이 예약을 취소할까요?",
                  description: `${askLead}예약을 취소하면 되돌릴 수 없어요.`,
                  confirmLabel: "예약 취소",
                  cancelLabel: "그대로 두기",
                }
            : ask.kind === "now"
              ? {
                  title: "지금 바로 올릴까요?",
                  description: `${askLead}${nowTargetText}누르면 바로 올리기 시작하고, 이 화면을 나가도 계속 올라가요. 올라간 게시물은 여기서 되돌릴 수 없어요.${
                    askPost?.has_video ? " 영상은 처리하는 데 몇 분 걸릴 수 있어요." : ""
                  }`,
                  confirmLabel: "지금 발행",
                  tone: "primary" as const,
                }
              : {
                  title: "이 글을 지울까요?",
                  description: `${askLead}지운 글은 되돌릴 수 없어요.`,
                  confirmLabel: "삭제",
                })}
          onCancel={() => setAsk(null)}
          onConfirm={confirmAsk}
        />
      ) : null}

      {view === "calendar" ? (
        /* 옆 칸 22rem — 한 줄(썸네일·제목·시각 / 상태·채널 칩·조작 셋)이 두 줄 안에 들어가는 폭(post-row.tsx 머리말) */
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <Card>
            <CardBody>
              <div className="flex items-center justify-between gap-2">
                <h3 className="tnum text-[17px] font-bold">
                  {cursor.year}년 {cursor.month}월
                </h3>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setCursor((c) => shiftMonth(c.year, c.month, -1))}
                    aria-label="이전 달"
                    className="trans-state relative after:absolute after:-inset-1 after:content-[''] rounded-card p-1.5 text-fg-sub hover:bg-tint-hover hover:text-fg"
                  >
                    <ChevronLeft className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const [y, m] = today.split("-");
                      setCursor({ year: Number(y), month: Number(m) });
                      setSelected(today);
                    }}
                    className="trans-state rounded-card px-2.5 py-1.5 text-[12px] font-semibold text-fg-sub hover:bg-tint-hover hover:text-fg"
                  >
                    오늘
                  </button>
                  <button
                    type="button"
                    onClick={() => setCursor((c) => shiftMonth(c.year, c.month, 1))}
                    aria-label="다음 달"
                    className="trans-state relative after:absolute after:-inset-1 after:content-[''] rounded-card p-1.5 text-fg-sub hover:bg-tint-hover hover:text-fg"
                  >
                    <ChevronRight className="size-4" />
                  </button>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-7 gap-1">
                {WEEKDAYS.map((w, i) => (
                  <div key={w} className={cn("pb-1.5 text-center text-[12px] font-semibold", i === 0 ? "text-negative-strong" : "text-fg-sub")}>
                    {w}
                  </div>
                ))}

                {cells.map((cell) => {
                  const posts = byDay.get(cell.key) ?? [];
                  const isToday = cell.key === today;
                  const isSel = cell.key === selected;
                  /* 스크린리더에는 "N건"만이 아니라 **실패가 있는지**를 말해야 한다.
                     점 색만으로는 색각 이상에서 코랄(예약)과 빨강(실패)이 안 갈린다. */
                  const failed = posts.filter((p) => p.status === "failed").length;
                  return (
                    <button
                      key={cell.key}
                      type="button"
                      onClick={() => setSelected(cell.key)}
                      aria-current={isToday ? "date" : undefined}
                      aria-label={[cell.key, posts.length > 0 ? `발행 ${posts.length}건` : "발행 없음", failed > 0 ? `실패 ${failed}건` : ""]
                        .filter(Boolean)
                        .join(" ")}
                      className={cn(
                        /* aspect-square 를 걷었다. 폭 캡을 없앤 뒤 1300px 짜리 캘린더에서
                           칸 하나가 175×175px 이 되는데 안에 든 건 12px 숫자와 1.5px 점 셋뿐이라
                           거대한 빈 상자가 됐다. 높이는 내용 기준 최소치로 고정한다. */
                        "trans-state flex min-h-[4.5rem] flex-col items-center justify-start gap-1 rounded-card border p-1.5 md:min-h-[5.5rem]",
                        isSel ? "border-primary bg-primary-weak" : "border-transparent hover:bg-tint-hover",
                        /* 실패는 색 말고 **형태**로도 구분한다 — 색각 이상에서 코랄과 빨강 점은
                           1.5px 크기로 갈리지 않는다. 칸 자체에 테두리를 준다. */
                        failed > 0 && !isSel && "border-negative",
                        cell.outside && "opacity-40",
                      )}
                    >
                      <span
                        className={cn(
                          "tnum flex size-6 items-center justify-center rounded-full text-[12px] font-semibold",
                          isToday ? "bg-primary text-on-primary" : "text-fg",
                        )}
                      >
                        {cell.day}
                      </span>
                      {/* 점 최대 3개 + 나머지는 숫자 — 칸 안에서 줄바꿈이 나면 격자가 무너진다 */}
                      {posts.length > 0 ? (
                        <span className="flex items-center gap-0.5">
                          {posts.slice(0, 3).map((p) => (
                            <span
                              key={p.id}
                              className={cn(
                                "size-1.5 rounded-full",
                                p.status === "failed"
                                  ? "bg-negative"
                                  : p.status === "published"
                                    ? "bg-positive"
                                    : p.status === "canceled"
                                      ? "bg-fg-faint"
                                      : p.status === "publishing" || p.display_status === "processing"
                                        ? "anim-pulse bg-warning"
                                        : "bg-primary",
                              )}
                            />
                          ))}
                          {posts.length > 3 ? <span className="tnum text-[11px] font-semibold text-fg-sub">+{posts.length - 3}</span> : null}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>

              {/* 범례 — 링크팜은 3개(게시됨/예약됨/알림 발행), 우리는 실패·올리는 중까지
                  갈라 보여준다. 점 색만으로 상태를 추측하게 두지 않는다. */}
              <div className="mt-4 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[12px] text-fg-sub">
                {(
                  [
                    ["bg-positive", "게시됨"],
                    ["bg-primary", "예약됨"],
                    ["bg-warning", "올리는 중·처리 중"],
                    ["bg-negative", "실패"],
                    ["bg-fg-faint", "취소됨"],
                  ] as const
                ).map(([dot, label]) => (
                  <span key={label} className="inline-flex items-center gap-1.5">
                    <span className={cn("size-1.5 rounded-full", dot)} aria-hidden />
                    {label}
                  </span>
                ))}
              </div>
              <p className="mt-2 text-[12px] text-fg-sub">
                예약한 시각부터 5분 안에 자동으로 발행돼요.
                {truncated ? " 최근 200건만 표시하고 있어요." : ""}
              </p>
            </CardBody>
          </Card>

          {/* 선택한 날 — 캘린더 옆 고정 레일. 칸 안에 내용을 다 넣으면 격자가 깨진다 */}
          <Card className="lg:sticky lg:top-20 lg:self-start">
            <CardHeader
              title={
                selected
                  ? /* 요일은 KST 정오 기준 getUTCDay — +09:00 정오는 UTC 같은 날 03시라
                       서버·브라우저 타임존과 무관하게 KST 요일이 나온다 */
                    `${Number(selected.slice(5, 7))}월 ${Number(selected.slice(8, 10))}일 (${WEEKDAYS[new Date(`${selected}T12:00:00+09:00`).getUTCDay()]})`
                  : "날짜 선택"
              }
              description={selected ? `게시물 ${selectedPosts.length}건` : undefined}
            />
            <CardBody>
              {/* 링크팜의 날짜 셀 hover「+」에 해당 — 고른 날짜로 바로 작성.
                  지난 날짜·오늘(배치 지남)은 예약할 수 없으니 버튼도 안 그린다 */}
              {selected && selected >= earliest ? (
                <Button variant="secondary" size="sm" className="mb-3 w-full" onClick={() => setComposer({ date: selected })}>
                  <Plus className="size-3.5" aria-hidden /> 이 날짜로 포스팅
                </Button>
              ) : null}
              {selectedPosts.length === 0 ? (
                items.length === 0 ? (
                  <EmptyState
                    icon={CalendarClock}
                    title="아직 예약이 없어요"
                    description="새 게시물을 쓰거나 스튜디오에서 카드뉴스를 만들면 여기서 날짜를 잡을 수 있어요."
                    action={
                      <Button size="sm" onClick={() => setComposer({ date: selected && selected >= earliest ? selected : null })}>
                        새 게시물 포스팅
                      </Button>
                    }
                  />
                ) : (
                  <p className="text-[14px] text-fg-sub">이 날짜에 등록된 게시물이 없어요.</p>
                )
              ) : (
                <ul className="divide-y divide-line">
                  {selectedPosts.map((post) => (
                    <PostRow key={post.id} post={post} nowMs={now} when="time" actions={rowActions(post)} />
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>
      ) : view === "scheduled" || view === "done" ? (
        <Card>
          <CardHeader
            title={view === "scheduled" ? "발행예약" : "발행완료"}
            description={view === "scheduled" ? "예약한 시각부터 5분 안에 자동 발행돼요" : "발행이 끝났거나 취소된 게시물이에요"}
          />
          <CardBody>
            {(view === "scheduled" ? scheduledItems : doneItems).length === 0 ? (
              <p className="text-[14px] text-fg-sub">
                {view === "scheduled" ? "예약된 게시물이 없어요. 「새 게시물 포스팅」으로 시작해 보세요." : "아직 발행이 끝난 게시물이 없어요."}
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {(view === "scheduled" ? scheduledItems : doneItems).map((post) => (
                  <PostRow key={post.id} post={post} nowMs={now} when="date" actions={rowActions(post)} />
                ))}
              </ul>
            )}
            {truncated ? <p className="mt-3 text-[12px] text-fg-sub">최근 200건만 표시하고 있어요.</p> : null}
          </CardBody>
        </Card>
      ) : null}

      {/* 초안 탭 — 날짜가 정해지지 않은 것들. 캘린더에는 찍히지 않으므로(안 정한
          날짜를 달력에 찍으면 계획이 있는 것처럼 보인다) 전용 탭이 유일한 집이다. */}
      {view === "drafts" ? (
        <Card>
          <CardHeader title="초안" description="아직 발행일을 정하지 않은 콘텐츠예요" />
          <CardBody>
            {drafts.length === 0 ? (
              <p className="text-[14px] text-fg-sub">초안이 없어요. 「새 게시물 포스팅」에서 「초안으로 저장」을 고르면 여기에 쌓여요.</p>
            ) : (
              <ul className="divide-y divide-line">
                {drafts.map((post) => (
                  <PostRow key={post.id} post={post} nowMs={now} when="none" actions={rowActions(post)} />
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      ) : null}

      {composer ? (
        <PostComposer
          channels={channels}
          isDemo={isDemo}
          defaultDate={composer.date}
          onClose={() => setComposer(null)}
          onSaved={onComposerSaved}
        />
      ) : null}
    </div>
  );
}
