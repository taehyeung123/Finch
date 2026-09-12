"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileText,
  Film,
  History as HistoryIcon,
  ImageIcon,
  Play,
  Plus,
  RotateCcw,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { Button, ButtonLink } from "@/components/ui/button";
import { ChannelBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { StatusPill, type PostStatus } from "@/components/ui/status-pill";
import { ResultModal, type ResultModalContent } from "@/components/ui/result-modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SignedThumb } from "@/components/ui/signed-thumb";
import {
  WEEKDAYS,
  earliestPublishAt,
  earliestPublishDate,
  kstDayKey,
  kstTimeKey,
  kstToday,
  monthGrid,
  shiftMonth,
} from "@/lib/calendar";
import { SnsIcon } from "@/components/sns-brand-icons";
import type { PublishListItem } from "@/lib/types";
import { iGa } from "@/lib/josa";
import { channelLabel } from "@/lib/publish-rules";
import { cancelScheduledPost } from "@/app/(finch)/(app)/studio/actions";
import { deleteDraft, publishNow, scheduleDraft } from "../actions";
import { PublishingVeil } from "./publishing-veil";
import { PostComposer, type ComposerChannel } from "./post-composer";

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

/** 확인 모달에 «어느 글인지»를 붙인다 — 목록에서 누른 줄이 맞는지 한 번 더 보게 */
function captionSnippet(caption: string): string {
  const line = caption.split("\n")[0]?.trim() ?? "";
  if (!line) return "(캡션 없음)";
  return line.length > 24 ? `${line.slice(0, 24)}…` : line;
}

/** 목록 한 줄 — 서버(lib/publish/list-item.ts)가 만든다. 썸네일은 서명된 thumb_url 로 온다 */
export type ScheduledPost = PublishListItem;

/** 보관 기간이 지나 영상 파일을 지운 글 — 다시 예약·지금 발행이 안 된다(서버 actions.ts 와 같은 문구) */
const PURGED_TEXT = "영상 파일이 보관 기간이 지나 지워졌어요 — 지운 뒤 다시 만들어 주세요.";

/**
 * 한 줄에서 할 수 있는 조작 — 버튼은 **실제 상태(status)** 로 가른다(보이는 상태 display_status 가 아니라).
 * · 미리 준비 중인 예약 영상(processing 인데 «예약됨»으로 보임): 취소 + 지금 발행(준비물이 있어 곧바로 올라간다)
 * · 처리 중: 취소만 — 그것도 발행을 시도하기 전일 때만(can_cancel). 시도한 뒤엔 이미 올라갔을 수 있다
 * · 파일이 지워진 실패 글: 다시 예약·지금 발행 없이 삭제만
 */
function actionsFor(post: ScheduledPost) {
  const prepared = post.status === "processing" && post.display_status === "scheduled";
  return {
    now: !post.media_purged && (post.status === "draft" || post.status === "scheduled" || post.status === "failed" || prepared),
    cancel: post.can_cancel && (post.status === "scheduled" || post.status === "processing"),
    reschedule: post.status === "failed" && !post.media_purged,
    del: post.status === "draft" || post.status === "failed" || post.status === "canceled",
  };
}

/** 스토리 링크는 24시간만 산다 — 그 뒤엔 링크를 숨긴다(눌러도 «없는 게시물»이다) */
function storyStillUp(publishedAt: string | null): boolean {
  if (!publishedAt) return false;
  const t = Date.parse(publishedAt);
  return Number.isFinite(t) && Date.now() - t < 24 * 3600_000;
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
 */
export function PublishList({
  initialItems,
  channels,
  isDemo,
  truncated = false,
  loadFailed = false,
}: {
  initialItems: ScheduledPost[];
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

  /* 서버가 새 목록을 주면(취소·초안 처리 후 router.refresh) 낙관적 상태를 서버 값으로
     덮는다. useState 초기값은 첫 마운트에만 쓰이므로 이 동기화가 없으면 refresh 가
     화면에 반영되지 않는다. effect 대신 렌더 시점 조정 — 이 레포의 다른 곳
     (search-console)과 같은 관례이고 캐스케이딩 렌더가 없다. */
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
  /* 저장·발행 결과 — 모달로 한 번 세운다(연동 결과와 같은 규칙, components/ui/result-modal.tsx).
     예전엔 sr-only 문장 하나뿐이어서 눈으로는 아무 확인도 못 봤다. */
  const [result, setResult] = useState<ResultModalContent | null>(null);
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
  const [draftBusy, setDraftBusy] = useState<string | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  /* 「지금 발행」 진행 중인 글 — 한 번에 하나만. 메타 처리 시간 때문에 1분 가까이 걸릴 수 있다 */
  const [nowBusy, setNowBusy] = useState<string | null>(null);
  /* 덮개에 쓸 글 — 누른 순간의 값을 붙잡아 둔다. 목록이 도중에 새로 고쳐져 그 글이 빠져도 덮개가 먼저 사라지지 않게(소넷 점검) */
  const [nowPost, setNowPost] = useState<ScheduledPost | null>(null);
  /* 예약 취소 실패 안내 — 낙관적 «취소됨»이 조용히 되돌아가던 자리(실측) */
  const [cancelError, setCancelError] = useState<string | null>(null);
  /* 확인을 기다리는 조작 — window.confirm 이었다. 브라우저가 대화상자를 막으면(«추가 대화상자 표시 안 함») confirm 이
     즉시 false 라 세 버튼이 **조용히 아무 일도 안 했다.** 무엇을 누구에게 할지는 id 로 들고, 실행은 확인 시점에 다시 판정한다. */
  const [ask, setAsk] = useState<{ kind: AskKind; id: string } | null>(null);

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
  /* 발행예약 = 아직 손댈 수 있는 것(예약·발행 중·실패) / 발행완료 = 이력(발행됨·취소됨) */
  const scheduledItems = useMemo(
    () => items.filter((p) => p.status === "scheduled" || p.status === "publishing" || p.status === "processing" || p.status === "failed"),
    [items],
  );
  const doneItems = useMemo(
    () => items.filter((p) => p.status === "published" || p.status === "canceled"),
    [items],
  );
  const cells = useMemo(() => monthGrid(cursor.year, cursor.month), [cursor]);
  const selectedPosts = selected ? (byDay.get(selected) ?? []) : [];

  function cancel(id: string) {
    /* 낙관적 갱신 후 **반드시 서버 값으로 맞춘다.**
       cancelScheduledPost 는 .eq("status","scheduled") 가드가 있어서,
       누르는 순간 크론이 이미 발행했으면 0행 매치 + 에러 없음 → ok:true 를 준다.
       그 경우 DB 는 published 인데 화면만 "취소됨"으로 굳는다.
       그래서 성공·실패와 무관하게 refresh 로 서버 상태를 다시 읽는다. */
    /* 되돌릴 수 없는 조작이다 — 취소된 행을 다시 예약으로 되돌리는 액션이 코드에 없다.
       확인은 호출 전에 ConfirmDialog 가 받는다(confirmAsk). 아래 스냅샷(before)은 **확인 뒤** 찍혀야 실패 복원이 옛 상태로 안 간다. */
    const before = items.find((p) => p.id === id);
    setCancelError(null);
    setItems((prev) => prev.map((p) => (p.id === id ? { ...p, status: "canceled", display_status: "canceled", can_cancel: false } : p)));
    startTransition(async () => {
      /* 예전엔 반환값을 받지도 않았다 — 비로그인·DB 오류로 {ok:false} 가 와도 화면은 잠깐
         «취소됨»을 보였다가 refresh 후 조용히 «예약됨»으로 되돌아갔다. 사용자는 자기가
         잘못 눌렀다고 생각한다. 실패는 말해 준다. */
      const res = await cancelScheduledPost(id);
      if (!res?.ok) {
        if (before) setItems((prev) => prev.map((p) => (p.id === id ? before : p)));
        /* 서버가 이유를 준다(«이미 올리는 중이라 취소할 수 없어요» 등) — «잠시 후 다시»는 틀린 안내일 수 있다 */
        setCancelError(res?.error ?? "예약을 취소하지 못했어요. 잠시 후 다시 시도해 주세요.");
      }
      router.refresh();
    });
  }

  /* 「지금 발행」 — 초안·예약·실패 글을 그 자리에서 내보낸다. 되돌릴 수 없는 외부 행동이라 확인을 받는다.
     결과는 성공·실패 모두 모달로 보여 준다 — 실패한 글은 목록에 남아 다시 시도하거나 지울 수 있다. */
  function runNow(id: string) {
    /* 확인(confirmAsk)을 거친 뒤에만 불린다. 동시 발행 가드는 **여기, 확인 시점에** 다시 본다 —
       window.confirm 은 동기라 확인하는 동안 다른 줄을 못 눌렀지만, 모달은 사람이 읽는 몇 초가 걸린다.
       막을 때는 조용히 끝내지 않고 말한다(조용한 return 이 이번에 걷어 낸 «클릭 무시» 그 자체다). */
    if (nowBusy || draftBusy) {
      setResult({ tone: "warning", title: "다른 글을 처리하고 있어요", description: "끝난 뒤 다시 눌러 주세요." });
      return;
    }
    setNowBusy(id);
    setNowPost(items.find((p) => p.id === id) ?? null);
    setDraftError(null);
    startTransition(async () => {
      try {
        const res = await publishNow(id);
        if (!res.ok) {
          setResult({ tone: "negative", title: "발행하지 못했어요", description: res.error });
          return;
        }
        const o = res.outcome;
        setResult(
          o.state === "published"
            ? { tone: "positive", title: `${o.label}에 올라갔어요`, description: "「발행완료」 탭에서 확인할 수 있어요." }
            : o.state === "processing"
              ? /* 메타가 영상·사진을 처리 중 — 매분 크론이 이어서 올리고 알림을 보낸다. soon = 준비가 끝나 다음 확인에서 올라간다 */
                o.soon
                ? { tone: "positive", title: "곧 올라가요", description: `준비가 끝났어요. 곧 ${o.label}에 올라가고, 올라가면 알림으로 알려 드려요.` }
                : {
                    tone: "positive",
                    title: `${iGa(o.label)} ${o.hasVideo ? "영상을" : "게시물을"} 처리하고 있어요`,
                    description: "끝나는 대로 자동으로 올라가요. 보통 몇 분 걸리고, 올라가면 알림으로 알려 드려요. 「발행예약」 탭에서 상태를 볼 수 있어요.",
                  }
              : o.state === "deferred"
                ? /* 이미 있던 글이다 — «저장했어요»가 아니라 «곧 다시 한다» */
                  { tone: "warning", title: "곧 자동으로 다시 시도해요", description: o.error }
                : { tone: "negative", title: `${o.label}에 올리지 못했어요`, description: `${o.error} — 다시 시도하거나 지울 수 있어요.` },
        );
        router.refresh();
      } catch {
        /* 호출 자체가 던진 경우(네트워크·시간 초과) — 서버는 계속 진행 중일 수 있다. 상태는 새로고침이 말해 준다 */
        setResult({ tone: "negative", title: "결과를 확인하지 못했어요", description: "연결이 끊겼거나 시간이 오래 걸렸어요. 잠시 후 목록을 새로고침해 주세요." });
        router.refresh();
      } finally {
        setNowBusy(null);
        setNowPost(null);
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
    if (a.kind === "now") {
      runNow(a.id);
      return;
    }
    if (a.kind === "cancel") {
      /* 「지금 발행」이 도는 중이면 서버는 이미 publishing 이라 취소가 0행에 적용된다(아래 버튼 주석) */
      if (nowBusy) {
        setResult({ tone: "warning", title: "발행이 끝난 뒤 다시 눌러 주세요", description: "지금 올리고 있는 글이 있어요." });
        return;
      }
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
    setDraftError(null);
    startTransition(async () => {
      try {
        const res = mode === "delete" ? await deleteDraft(id) : await scheduleDraft(id, draftDate[id] ?? "");
        if (!res.ok) {
          setDraftError(res.error ?? "처리하지 못했어요.");
          return;
        }
        /* 낙관적으로 지우지 않는다 — 예약 전환은 상태와 날짜가 함께 바뀌어서
           화면에서 재구성하면 서버와 어긋날 여지가 크다. refresh 한 번이 정확하다. */
        router.refresh();
      } finally {
        setDraftBusy(null);
      }
    });
  }

  /* ⚠️ 앞서 여기서 **화면 전체를 EmptyState 한 장으로 바꿔치기**했다.
     0건이면 캘린더도 탭도 초안도 전부 사라져서, 이 화면의 핵심(달력을 보고 빈 날을
     고르는 것)이 "예약이 하나도 없는 사람"에게만 안 보이는 상태가 됐다 —
     예약이 없을 때야말로 달력이 가장 필요하다.
     (같은 파일 위 주석이 "0건에 null 반환해서 기능이 사라져 보였다"고 스스로
      적어놓고 한 단계 약하게 반복한 것이다.)
     이제 달력은 항상 그린다. 빈 상태는 달력 **옆 레일**이 안내한다. */

  /* 「지금 발행」 중인 글 — 버튼 글자만 «발행 중…»으로 바뀌면 멈춘 줄 안다(2026-09-12 사장님 지시). 화면 가운데 덮개로 말한다 */
  return (
    <div className="space-y-5">
      {nowBusy ? (
        <PublishingVeil
          layout="screen"
          channel={nowPost?.channel ?? "instagram"}
          mode="now"
          hasMedia={(nowPost?.media_count ?? 0) > 0}
          hasVideo={nowPost?.has_video ?? false}
        />
      ) : null}
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

      {cancelError ? (
        <p role="alert" className="rounded-card border border-negative/40 bg-negative-weak px-4 py-3 text-[14px] text-negative-strong">
          {cancelError}
        </p>
      ) : null}

      {/* 채널 연결 스트립 — 링크팜 포스팅 상단(실측). 연결 안 된 채널은 눌러서
          연동 관리로 간다. 발행이 어느 계정으로 나가는지 이 줄이 항상 말해준다. */}
      <div className="card-face flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3">
        {/* 조회 실패면 연결 여부를 말하지 않는다 — «미연결» 칩을 그리면 멀쩡한 연결이 끊긴 것처럼 읽힌다 */}
        {channels === null ? (
          <p className="text-[14px] text-fg-sub">연결 상태를 불러오지 못했어요 · 새로고침해 주세요</p>
        ) : null}
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
                <span className="block truncate text-[11px] text-fg-sub">
                  {connected ? (meta?.handle ?? "연결됨") : "연결하기"}
                </span>
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
                  description: `${askLead}${nowTargetText}올라간 게시물은 여기서 되돌릴 수 없어요.${askPost?.has_video ? " 영상은 처리하는 데 몇 분 걸릴 수 있어요." : ""}`,
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
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
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
                  <div
                    key={w}
                    className={cn(
                      "pb-1.5 text-center text-[12px] font-semibold",
                      i === 0 ? "text-negative-strong" : "text-fg-sub",
                    )}
                  >
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
                      aria-label={[
                        cell.key,
                        posts.length > 0 ? `발행 ${posts.length}건` : "발행 없음",
                        failed > 0 ? `실패 ${failed}건` : "",
                      ]
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
                          {posts.length > 3 ? (
                            <span className="tnum text-[11px] font-semibold text-fg-sub">+{posts.length - 3}</span>
                          ) : null}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>

              {/* 범례 — 링크팜은 3개(게시됨/예약됨/알림 발행), 우리는 실패·발행 중까지
                  갈라 보여준다. 점 색만으로 상태를 추측하게 두지 않는다. */}
              <div className="mt-4 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[12px] text-fg-sub">
                {(
                  [
                    ["bg-positive", "게시됨"],
                    ["bg-primary", "예약됨"],
                    ["bg-warning", "발행·처리 중"],
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
                <Button
                  variant="secondary"
                  size="sm"
                  className="mb-3 w-full"
                  onClick={() => setComposer({ date: selected })}
                >
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
                      <Button
                        size="sm"
                        onClick={() => setComposer({ date: selected && selected >= earliest ? selected : null })}
                      >
                        새 게시물 포스팅
                      </Button>
                    }
                  />
                ) : (
                  <p className="text-[14px] text-fg-sub">이 날짜에 등록된 게시물이 없어요.</p>
                )
              ) : (
                <ul className="space-y-3">
                  {selectedPosts.map((post) => {
                    const act = actionsFor(post);
                    return (
                      <li key={post.id} className="flex gap-2.5">
                        <PostThumb post={post} small />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[14px] font-medium">
                            {post.caption.split("\n")[0] || "(캡션 없음)"}
                          </p>
                          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                            <StatusPill status={post.display_status} />
                            <ChannelBadge channel={post.channel} />
                            <AccountChip post={post} />
                            <span className="tnum text-[12px] text-fg-sub">{kstTimeKey(post.display_at)}</span>
                            {act.now ? (
                              <button
                                type="button"
                                onClick={() => setAsk({ kind: "now", id: post.id })}
                                disabled={nowBusy !== null}
                                className="trans-state relative rounded-card p-1 text-fg-sub after:absolute after:-inset-2 after:content-[''] hover:bg-tint-hover hover:text-fg disabled:opacity-40"
                                aria-label="지금 발행"
                                title="지금 발행"
                              >
                                <Send className={cn("size-3.5", nowBusy === post.id && "anim-pulse")} />
                              </button>
                            ) : null}
                            {act.cancel ? (
                              <button
                                type="button"
                                onClick={() => setAsk({ kind: "cancel", id: post.id })}
                                disabled={nowBusy !== null}
                                className="trans-state relative rounded-card p-1 text-fg-sub after:absolute after:-inset-2 after:content-[''] hover:bg-tint-hover hover:text-negative disabled:opacity-40"
                                aria-label={post.display_status === "processing" ? "발행 취소" : "예약 취소"}
                                title={post.display_status === "processing" ? "발행 취소" : "예약 취소"}
                              >
                                <X className="size-3.5" />
                              </button>
                            ) : null}
                          </div>
                          <PostNotes post={post} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>
      ) : view === "scheduled" || view === "done" ? (
        <Card>
          <CardHeader
            title={view === "scheduled" ? "발행예약" : "발행완료"}
            description={
              view === "scheduled" ? "예약한 시각부터 5분 안에 자동 발행돼요" : "발행이 끝났거나 취소된 게시물이에요"
            }
          />
          <CardBody>
            {/* 실패 행의 「다시 예약」·「삭제」, 취소된 글의 「삭제」도 runDraft 를 타므로, 그 오류를 이 탭들에서도 보여준다 */}
            {draftError ? (
              <p role="alert" className="mb-3 text-[14px] text-negative-strong">
                {draftError}
              </p>
            ) : null}
            {(view === "scheduled" ? scheduledItems : doneItems).length === 0 ? (
              <p className="text-[14px] text-fg-sub">
                {view === "scheduled"
                  ? "예약된 게시물이 없어요. 「새 게시물 포스팅」으로 시작해 보세요."
                  : "아직 발행이 끝난 게시물이 없어요."}
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {(view === "scheduled" ? scheduledItems : doneItems).map((post) => {
                  const act = actionsFor(post);
                  const any = act.now || act.cancel || act.reschedule || act.del;
                  return (
                    /* 줄바꿈이 되는 한 줄 — 좁은 화면에선 조작이 둘째 줄로 내려간다(예전엔 실패 줄의 날짜 입력·버튼이 가로로 넘쳤다) */
                    <li key={post.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3 first:pt-0 last:pb-0">
                      <PostThumb post={post} />
                      <div className="min-w-0 flex-1 basis-40">
                        <p className="truncate text-[15px] font-medium">{post.caption.split("\n")[0] || "(캡션 없음)"}</p>
                        <p className="mt-0.5 flex items-center gap-1.5 text-[12px] text-fg-sub">
                          <CalendarClock className="size-3 shrink-0" aria-hidden />
                          <span className="tnum">
                            {kstDayKey(post.display_at)} {kstTimeKey(post.display_at)}
                          </span>
                        </p>
                        <PostNotes post={post} />
                      </div>
                      {/* 계정 칩까지 셋이라 좁은 화면에선 이 묶음 안에서도 줄을 바꾼다(한 줄 폭을 넘지 않게) */}
                      <div className="flex max-w-full shrink-0 flex-wrap items-center gap-2">
                        <ChannelBadge channel={post.channel} />
                        <AccountChip post={post} />
                        <StatusPill status={post.display_status} />
                      </div>
                      {any ? (
                        <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
                          {act.now ? (
                            <Button size="sm" variant="secondary" disabled={nowBusy !== null || draftBusy !== null} onClick={() => setAsk({ kind: "now", id: post.id })}>
                              <Send className="size-3.5" aria-hidden /> {nowBusy === post.id ? "발행 중…" : "지금 발행"}
                            </Button>
                          ) : null}
                          {/* 발행 실패한 글은 여기 말고 갈 곳이 없다 — 예전엔 버튼이 하나도 없어서
                              재시도도 삭제도 못 하고 목록에 영구히 남았다(크론도 scheduled 만 집는다).
                              날짜 입력은 초안 탭과 같은 컨트롤을 쓴다(같은 액션 scheduleDraft 를 탄다). */}
                          {act.reschedule ? (
                            <>
                              <input
                                type="datetime-local"
                                min={earliestAt}
                                step={300}
                                value={draftDate[post.id] ?? ""}
                                onChange={(e) => setDraftDate((d) => ({ ...d, [post.id]: e.target.value }))}
                                aria-label="다시 예약할 시각"
                                className="tnum h-9 min-w-0 rounded-card border border-line bg-body px-2.5 text-[14px] text-fg focus:border-primary focus:outline-none"
                              />
                              <Button
                                size="sm"
                                variant="secondary"
                                disabled={!draftDate[post.id] || draftBusy !== null}
                                onClick={() => runDraft(post.id, "schedule")}
                              >
                                <RotateCcw className="size-3.5" aria-hidden /> 다시 예약
                              </Button>
                            </>
                          ) : null}
                          {act.cancel ? (
                            /* 「지금 발행」이 도는 동안은 막는다 — 서버는 이미 publishing 이라 취소가 0행에 적용되고, 화면만 «취소됨»이 되면서 글은 올라갔다 */
                            <button
                              type="button"
                              onClick={() => setAsk({ kind: "cancel", id: post.id })}
                              disabled={nowBusy !== null}
                              className="trans-state relative after:absolute after:-inset-1 after:content-[''] rounded-card p-1.5 text-fg-sub hover:bg-tint-hover hover:text-negative disabled:opacity-40"
                              aria-label={post.display_status === "processing" ? "발행 취소" : "예약 취소"}
                              title={post.display_status === "processing" ? "발행 취소" : "예약 취소"}
                            >
                              <X className="size-4" />
                            </button>
                          ) : null}
                          {act.del ? (
                            <button
                              type="button"
                              onClick={() => setAsk({ kind: "delete", id: post.id })}
                              disabled={draftBusy !== null}
                              className="trans-state relative after:absolute after:-inset-1 after:content-[''] rounded-card p-1.5 text-fg-sub hover:bg-tint-hover hover:text-negative disabled:opacity-40"
                              aria-label="삭제"
                              title="삭제"
                            >
                              <Trash2 className="size-4" />
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
            {truncated ? <p className="mt-3 text-[12px] text-fg-sub">최근 200건만 표시하고 있어요.</p> : null}
          </CardBody>
        </Card>
      ) : null}

      {/* 초안 탭 — 날짜가 정해지지 않은 것들. 캘린더에는 찍히지 않으므로(안 정한
          날짜를 달력에 찍으면 계획이 있는 것처럼 보인다) 전용 탭이 유일한 집이다.
          날짜 지정·삭제가 **여기에만** 있다. */}
      {view === "drafts" ? (
        <Card>
          <CardHeader title="초안" description="아직 발행일을 정하지 않은 콘텐츠예요" />
          <CardBody>
            {drafts.length === 0 ? (
              <p className="text-[14px] text-fg-sub">
                초안이 없어요. 「새 게시물 포스팅」에서 「초안으로 저장」을 고르면 여기에 쌓여요.
              </p>
            ) : null}
            {draftError ? (
              <p role="alert" className="mb-3 text-[14px] text-negative-strong">
                {draftError}
              </p>
            ) : null}
            <ul className={cn("divide-y divide-line", drafts.length === 0 && "hidden")}>
              {drafts.map((post) => (
                <li key={post.id} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <PostThumb post={post} />
                  <p className="min-w-0 flex-1 basis-40 truncate text-[15px] font-medium">
                    {post.caption.split("\n")[0] || "(캡션 없음)"}
                  </p>
                  <ChannelBadge channel={post.channel} />
                  <AccountChip post={post} />
                  <StatusPill status="draft" />
                  <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" variant="secondary" disabled={nowBusy !== null || draftBusy !== null} onClick={() => setAsk({ kind: "now", id: post.id })}>
                      <Send className="size-3.5" aria-hidden /> {nowBusy === post.id ? "발행 중…" : "지금 발행"}
                    </Button>
                    <input
                      type="datetime-local"
                      min={earliestAt}
                      step={300}
                      value={draftDate[post.id] ?? ""}
                      onChange={(e) => setDraftDate((d) => ({ ...d, [post.id]: e.target.value }))}
                      aria-label="발행 시각"
                      className="tnum h-9 min-w-0 rounded-card border border-line bg-body px-2.5 text-[14px] text-fg focus:border-primary focus:outline-none"
                    />
                    <Button
                      size="sm"
                      disabled={!draftDate[post.id] || draftBusy !== null || nowBusy !== null}
                      onClick={() => runDraft(post.id, "schedule")}
                    >
                      {draftBusy === post.id ? "처리 중…" : "예약하기"}
                    </Button>
                    <button
                      type="button"
                      onClick={() => setAsk({ kind: "delete", id: post.id })}
                      disabled={draftBusy !== null}
                      aria-label="초안 삭제"
                      title="초안 삭제"
                      className="trans-state relative after:absolute after:-inset-1 after:content-[''] rounded-card p-1.5 text-fg-faint hover:bg-tint-hover hover:text-negative disabled:opacity-40"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}

      {composer ? (
        <PostComposer
          channels={channels}
          isDemo={isDemo}
          defaultDate={composer.date}
          onClose={() => setComposer(null)}
          onSaved={(r) => {
            setComposer(null);
            setResult(r);
            /* createPost 의 revalidatePath 가 서버 목록을 새로 내려보낸다 —
               initialItems 동기화(위 prevInitial 패턴)가 화면에 반영한다 */
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * 목록 썸네일 — 첫 항목(사진이면 그 사진, 영상이면 커버). 서버가 서명한 thumb_url 로 온다.
 * 영상이면 ▶ 칩, 여러 개면 +N 칩. 썸네일이 없으면 종류 아이콘(영상=필름, 사진=그림, 글만=문서).
 */
function PostThumb({ post, small = false }: { post: ScheduledPost; small?: boolean }) {
  const kind = post.has_video ? "영상" : post.media_count > 0 ? "사진" : null;
  return (
    <span
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-card border border-line bg-plate",
        small ? "size-10" : "size-12",
      )}
    >
      {/* 서명 URL(1시간)이 만료돼 깨지면 «썸네일 없음»과 같은 종류 아이콘으로 물러난다 — ▶ 칩도 사진이 보일 때만 */}
      <SignedThumb
        src={post.thumb_url}
        className="size-full object-cover"
        fallback={
          post.has_video ? (
            <Film className="size-4 text-fg-faint" aria-hidden />
          ) : post.media_count > 0 ? (
            <ImageIcon className="size-4 text-fg-faint" aria-hidden />
          ) : (
            <FileText className="size-4 text-fg-faint" aria-hidden />
          )
        }
        overlay={
          post.has_video ? (
            <span className="absolute bottom-0.5 left-0.5 flex items-center rounded-chip bg-scrim p-0.5 text-on-scrim" aria-hidden>
              <Play className="size-2.5 fill-current" />
            </span>
          ) : null
        }
      />
      {post.media_count > 1 ? (
        <span className="tnum absolute right-0.5 top-0.5 rounded-chip bg-scrim px-1 text-[11px] font-semibold leading-4 text-on-scrim" aria-hidden>
          +{post.media_count - 1}
        </span>
      ) : null}
      {kind ? <span className="sr-only">{post.media_count > 1 ? `${kind} 포함 ${post.media_count}개` : kind}</span> : null}
    </span>
  );
}

/**
 * 계정 칩 — 이 글이 나간(나갈) 계정 «@아이디». 채널 배지 옆에 둔다(2026-09-12 계정 전환).
 * 지금 그 채널에 연결된 계정이 아니면 «@옛 · 이전 계정» — 계정을 바꾼 뒤에도 옛 계정의 글이 새 계정 것처럼 섞여 보이지 않게 한다.
 * 계정을 모르면(아직 확인 전인 옛 발행 글) 그리지 않는다. 무엇을 보일지는 서버가 정한다(lib/publish/account-core.ts postAccountView).
 *
 * ⚠️ 잘리는 것은 **아이디뿐**이다 — «이전 계정»은 줄어들지 않는 칸에 따로 둔다. 예전엔 «@아이디 · 이전 계정» 한 줄을 통째로
 *    말줄임에 넣어서, 아이디가 조금만 길어도(실사용 10~20자, 이름을 못 받은 계정의 «@ig_숫자» 폴백은 20자 안팎) 끝의 «이전 계정»이
 *    먼저 잘려 이 칩의 존재 이유가 사라졌다(2026-09-12 점검). 이전 계정의 칩은 카드 안 중첩 면(plate)으로 한 칸 눌러 두고
 *    지나간 것을 뜻하는 아이콘을 붙인다 — 예전의 점선 테두리는 다크(8% 헤어라인)에서 거의 안 보였고, 이 저장소에서 점선은
 *    «아직 없음»의 모양이다(empty-state). 칩은 늘 카드 안에 있다(plate 를 지면 위에 직접 쓰지 않는 규칙).
 */
function AccountChip({ post }: { post: ScheduledPost }) {
  if (!post.account_handle && !post.account_previous) return null;
  const previous = post.account_previous;
  /* 말줄임된 아이디도 올려 보면 전부 보인다 */
  const hint = previous ? "지금 연결된 계정이 아닌 이전 계정의 글이에요" : null;
  return (
    <span
      title={[post.account_handle, hint].filter(Boolean).join(" · ") || undefined}
      className={cn(
        "inline-flex min-w-0 max-w-full items-center gap-1 rounded-chip border border-line px-2.5 py-0.5 text-[12px] leading-5 whitespace-nowrap text-fg-sub",
        previous ? "bg-plate font-medium" : "bg-overlay font-semibold",
      )}
    >
      {previous ? <HistoryIcon className="size-3 shrink-0 text-fg-faint" aria-hidden /> : null}
      {post.account_handle ? <span className="min-w-0 max-w-[10rem] truncate">{post.account_handle}</span> : null}
      {previous ? (
        <span className="shrink-0">
          {post.account_handle ? <span aria-hidden>· </span> : null}이전 계정
        </span>
      ) : null}
    </span>
  );
}

/** 한 줄 아래 붙는 설명 — 처리 중 안내·실패 이유·게시물 링크 */
function PostNotes({ post }: { post: ScheduledPost }) {
  const label = channelLabel(post.channel);
  const story = post.ig_surface === "story";
  const link = post.status === "published" && post.permalink && (!story || storyStillUp(post.published_at)) ? post.permalink : null;
  return (
    <>
      {post.display_status === "processing" ? (
        <p className="mt-0.5 text-[12px] text-fg-sub">{iGa(label)} 처리하고 있어요 · 끝나면 자동으로 올라가요</p>
      ) : null}
      {post.status === "failed" && (post.media_purged || post.error) ? (
        <p className="mt-0.5 text-[12px] text-negative-strong">{post.media_purged ? PURGED_TEXT : post.error}</p>
      ) : null}
      {link ? (
        /* 밖으로 나가는 새 탭 링크 — 앱 안 이동이 아니라 AppLink 가 아니다. 주소는 서버가 인스타·스레드 호스트만 남겼다(safePermalink) */
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${label}에서 ${story ? "스토리" : "게시물"} 보기(새 창)`}
          className="relative mt-1 inline-flex items-center gap-1 text-[12px] font-medium text-primary-ink after:absolute after:-inset-x-1 after:-inset-y-2.5 after:content-[''] hover:underline"
        >
          <ExternalLink className="size-3" aria-hidden />
          {story ? "스토리 보기" : "게시물 보기"}
        </a>
      ) : null}
    </>
  );
}
