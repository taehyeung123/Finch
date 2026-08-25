"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CalendarClock, CheckCircle2, ChevronLeft, ChevronRight, FileText, ImageIcon, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button, ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { StatusPill, type PostStatus } from "@/components/ui/status-pill";
import {
  WEEKDAYS,
  batchPassedToday,
  earliestPublishDate,
  kstDayKey,
  kstToday,
  monthGrid,
  shiftMonth,
} from "@/lib/calendar";
import { SnsIcon } from "@/components/sns-brand-icons";
import { cancelScheduledPost } from "@/app/(finch)/(app)/studio/actions";
import { deleteDraft, scheduleDraft } from "../actions";
import { PostComposer, type ComposerChannel } from "./post-composer";

export interface ScheduledPost {
  id: string;
  caption: string;
  image_urls: string[];
  scheduled_at: string;
  status: PostStatus;
  error: string | null;
}

/**
 * 발행 — 캘린더 + 목록 + 초안.
 *
 * 캘린더가 기본 보기다. 발행 계획은 "언제 비어 있나"를 보는 일인데, 목록은 그걸
 * 절대 못 보여준다(있는 날만 줄로 나오니까 빈 날이 안 보인다). 목록은 상태·오류를
 * 확인하는 보기라 탭으로 남긴다.
 *
 * 날짜 판정은 전부 KST(lib/calendar) — scheduled_at 은 UTC 라 브라우저 타임존으로
 * 나누면 해외 접속 시 하루가 밀린다. 발행 배치도 KST 06:00 에 돈다.
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
  channels: ComposerChannel[];
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
  const [notice, setNotice] = useState("");
  const today = kstToday();
  /* 초안에 날짜를 붙일 때 고를 수 있는 가장 이른 날. 배치가 KST 06:00 하루 1회라
     그 시각이 지나면 오늘은 이미 늦었다 — 고를 수 없는 날을 열어두지 않는다. */
  const earliest = earliestPublishDate();
  const batchPassed = batchPassedToday();
  const [cursor, setCursor] = useState(() => {
    const [y, m] = today.split("-");
    return { year: Number(y), month: Number(m) };
  });
  const [selected, setSelected] = useState<string | null>(today);

  const [draftDate, setDraftDate] = useState<Record<string, string>>({});
  const [draftBusy, setDraftBusy] = useState<string | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  /* 예약 취소 실패 안내 — 낙관적 «취소됨»이 조용히 되돌아가던 자리(실측) */
  const [cancelError, setCancelError] = useState<string | null>(null);

  /* 날짜별 묶음. 초안은 날짜가 "미정"의 의미라 캘린더에 찍지 않는다 —
     안 정한 날짜를 달력에 찍으면 계획이 있는 것처럼 보인다. */
  const byDay = useMemo(() => {
    const map = new Map<string, ScheduledPost[]>();
    for (const p of items) {
      if (p.status === "draft") continue;
      const key = kstDayKey(p.scheduled_at);
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
    () => items.filter((p) => p.status === "scheduled" || p.status === "publishing" || p.status === "failed"),
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
       그런데 되돌릴 수 있는 «컴포저 닫기»에는 확인창이 있고 여기엔 없었다. 순서가 뒤집혀 있었다. */
    if (!window.confirm("이 예약을 취소할까요? 되돌릴 수 없어요.")) return;
    const before = items.find((p) => p.id === id)?.status ?? "scheduled";
    setCancelError(null);
    setItems((prev) => prev.map((p) => (p.id === id ? { ...p, status: "canceled" } : p)));
    startTransition(async () => {
      /* 예전엔 반환값을 받지도 않았다 — 비로그인·DB 오류로 {ok:false} 가 와도 화면은 잠깐
         «취소됨»을 보였다가 refresh 후 조용히 «예약됨»으로 되돌아갔다. 사용자는 자기가
         잘못 눌렀다고 생각한다. 실패는 말해 준다. */
      const res = await cancelScheduledPost(id);
      if (!res?.ok) {
        setItems((prev) => prev.map((p) => (p.id === id ? { ...p, status: before } : p)));
        setCancelError("예약을 취소하지 못했어요. 잠시 후 다시 시도해 주세요.");
      }
      router.refresh();
    });
  }

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

      {cancelError ? (
        <p role="alert" className="rounded-card border border-negative/40 bg-negative-weak px-4 py-3 text-[14px] text-negative-strong">
          {cancelError}
        </p>
      ) : null}

      {/* 채널 연결 스트립 — 링크팜 포스팅 상단(실측). 연결 안 된 채널은 눌러서
          연동 관리로 간다. 발행이 어느 계정으로 나가는지 이 줄이 항상 말해준다. */}
      <div className="card-face flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3">
        {(["instagram", "tiktok", "threads"] as const).map((ch) => {
          const meta = channels.find((c) => c.channel === ch);
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
            <ButtonLink key={ch} href="/settings" variant="ghost" size="md" className="flex items-center gap-2 !px-1.5">
              {inner}
            </ButtonLink>
          );
        })}
      </div>

      {/* 서브탭(링크팜 실측: 포스팅/초안/발행예약/발행완료) + 새 게시물 CTA */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="발행 보기">
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
                  "trans-state inline-flex items-center gap-1.5 rounded-chip px-3.5 py-1.5 text-[14px] font-medium",
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

      <p aria-live="polite" className="sr-only">
        {notice}
      </p>

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
                    className="trans-state rounded-card p-1.5 text-fg-sub hover:bg-tint-hover hover:text-fg"
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
                    className="trans-state rounded-card p-1.5 text-fg-sub hover:bg-tint-hover hover:text-fg"
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
                                      : p.status === "publishing"
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
                    ["bg-warning", "발행 중"],
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
                예약일 오전 6시 배치에서 자동 발행됩니다(정시 발행이 아니에요).
                {batchPassed ? " 오늘 배치는 이미 지났어요 — 내일부터 예약할 수 있어요." : ""}
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
                  {selectedPosts.map((post) => (
                    <li key={post.id} className="flex gap-2.5">
                      <Thumb url={post.image_urls[0]} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14px] font-medium">
                          {post.caption.split("\n")[0] || "(캡션 없음)"}
                        </p>
                        <div className="mt-1 flex items-center gap-2">
                          <StatusPill status={post.status} />
                          {post.status === "scheduled" ? (
                            <button
                              type="button"
                              onClick={() => cancel(post.id)}
                              className="trans-state rounded-card p-1 text-fg-faint hover:bg-tint-hover hover:text-negative"
                              aria-label="예약 취소"
                            >
                              <X className="size-3.5" />
                            </button>
                          ) : null}
                        </div>
                        {post.status === "failed" && post.error ? (
                          <p className="mt-1 text-[12px] text-negative-strong">{post.error}</p>
                        ) : null}
                      </div>
                    </li>
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
            description={
              view === "scheduled" ? "예약일 아침 배치에서 자동 발행됩니다" : "발행이 끝났거나 취소된 게시물이에요"
            }
          />
          <CardBody>
            {/* 실패 행의 「다시 예약」·「삭제」도 runDraft 를 타므로, 그 오류를 이 탭에서도 보여준다 */}
            {draftError && view === "scheduled" ? (
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
                {(view === "scheduled" ? scheduledItems : doneItems).map((post) => (
                  <li key={post.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                    <Thumb url={post.image_urls[0]} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-medium">{post.caption.split("\n")[0] || "(캡션 없음)"}</p>
                      <p className="mt-0.5 flex items-center gap-1.5 text-[12px] text-fg-sub">
                        <CalendarClock className="size-3" aria-hidden />
                        {kstDayKey(post.scheduled_at)}
                        {post.status === "failed" && post.error ? ` · ${post.error}` : ""}
                      </p>
                    </div>
                    <StatusPill status={post.status} />
                    {post.status === "scheduled" ? (
                      <button
                        type="button"
                        onClick={() => cancel(post.id)}
                        className="trans-state rounded-card p-1.5 text-fg-faint hover:bg-tint-hover hover:text-negative"
                        aria-label="예약 취소"
                        title="예약 취소"
                      >
                        <X className="size-4" />
                      </button>
                    ) : null}
                    {/* 발행 실패한 글은 여기 말고 갈 곳이 없다 — 예전엔 버튼이 하나도 없어서
                        재시도도 삭제도 못 하고 목록에 영구히 남았다(크론도 scheduled 만 집는다).
                        날짜 입력은 초안 탭과 같은 컨트롤을 쓴다(같은 액션 scheduleDraft 를 탄다). */}
                    {post.status === "failed" ? (
                      <div className="flex shrink-0 items-center gap-2">
                        <input
                          type="date"
                          min={earliest}
                          value={draftDate[post.id] ?? ""}
                          onChange={(e) => setDraftDate((d) => ({ ...d, [post.id]: e.target.value }))}
                          aria-label="다시 예약할 날짜"
                          className="h-9 rounded-card border border-line bg-body px-2.5 text-[14px] text-fg focus:border-primary focus:outline-none"
                        />
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={!draftDate[post.id] || draftBusy !== null}
                          onClick={() => runDraft(post.id, "schedule")}
                        >
                          <RotateCcw className="size-3.5" aria-hidden /> 다시 예약
                        </Button>
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm("이 글을 지울까요? 되돌릴 수 없어요.")) runDraft(post.id, "delete");
                          }}
                          disabled={draftBusy !== null}
                          className="trans-state rounded-card p-1.5 text-fg-faint hover:bg-tint-hover hover:text-negative disabled:opacity-40"
                          aria-label="삭제"
                          title="삭제"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    ) : null}
                  </li>
                ))}
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
                  <Thumb url={post.image_urls[0]} />
                  <p className="min-w-0 flex-1 truncate text-[15px] font-medium">
                    {post.caption.split("\n")[0] || "(캡션 없음)"}
                  </p>
                  <StatusPill status="draft" />
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      min={earliest}
                      value={draftDate[post.id] ?? ""}
                      onChange={(e) => setDraftDate((d) => ({ ...d, [post.id]: e.target.value }))}
                      aria-label="발행 예정일"
                      className="h-9 rounded-card border border-line bg-body px-2.5 text-[14px] text-fg focus:border-primary focus:outline-none"
                    />
                    <Button
                      size="sm"
                      disabled={!draftDate[post.id] || draftBusy !== null}
                      onClick={() => runDraft(post.id, "schedule")}
                    >
                      {draftBusy === post.id ? "처리 중…" : "예약하기"}
                    </Button>
                    <button
                      type="button"
                      onClick={() => runDraft(post.id, "delete")}
                      disabled={draftBusy !== null}
                      aria-label="초안 삭제"
                      title="초안 삭제"
                      className="trans-state rounded-card p-1.5 text-fg-faint hover:bg-tint-hover hover:text-negative disabled:opacity-40"
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
          onSaved={(message) => {
            setComposer(null);
            setNotice(message);
            /* createPost 의 revalidatePath 가 서버 목록을 새로 내려보낸다 —
               initialItems 동기화(위 prevInitial 패턴)가 화면에 반영한다 */
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}

function Thumb({ url }: { url?: string }) {
  return (
    <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-card border border-line bg-plate">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- Supabase Storage 공개 URL, 최적화 프록시 불필요
        <img src={url} alt="" className="size-full object-cover" />
      ) : (
        <ImageIcon className="size-4 text-fg-faint" aria-hidden />
      )}
    </span>
  );
}
