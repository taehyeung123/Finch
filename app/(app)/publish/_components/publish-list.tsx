"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, ChevronLeft, ChevronRight, ImageIcon, List, Trash2, X } from "lucide-react";
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
import { cancelScheduledPost } from "@/app/(app)/studio/actions";
import { deleteDraft, scheduleDraft } from "../actions";

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
  truncated = false,
}: {
  initialItems: ScheduledPost[];
  /** 서버 조회가 한도에서 잘렸다 — 화면이 "이게 전부"라고 거짓말하지 않게 알린다 */
  truncated?: boolean;
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

  const [view, setView] = useState<"calendar" | "list">("calendar");
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
  const listItems = useMemo(() => items.filter((p) => p.status !== "draft"), [items]);
  const cells = useMemo(() => monthGrid(cursor.year, cursor.month), [cursor]);
  const selectedPosts = selected ? (byDay.get(selected) ?? []) : [];

  function cancel(id: string) {
    /* 낙관적 갱신 후 **반드시 서버 값으로 맞춘다.**
       cancelScheduledPost 는 .eq("status","scheduled") 가드가 있어서,
       누르는 순간 크론이 이미 발행했으면 0행 매치 + 에러 없음 → ok:true 를 준다.
       그 경우 DB 는 published 인데 화면만 "취소됨"으로 굳는다.
       그래서 성공·실패와 무관하게 refresh 로 서버 상태를 다시 읽는다. */
    setItems((prev) => prev.map((p) => (p.id === id ? { ...p, status: "canceled" } : p)));
    startTransition(async () => {
      await cancelScheduledPost(id);
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

  /* 0건일 때 null 을 반환하던 것이 이 기능이 메뉴에서 사라져 보이던 원인이었다.
     빈 상태는 "없음"을 알리는 자리가 아니라 다음 행동을 주는 자리다. */
  if (items.length === 0) {
    return (
      <Card>
        <CardBody>
          <EmptyState
            icon={CalendarClock}
            title="아직 예약한 게시물이 없어요"
            description="스튜디오에서 카드뉴스를 만들면 여기서 발행 일정을 잡을 수 있어요."
            action={<ButtonLink href="/studio">스튜디오에서 만들기</ButtonLink>}
          />
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {/* 보기 전환 — 캘린더가 기본. 두 보기는 같은 데이터를 다른 질문으로 읽는다:
          캘린더는 "언제 비었나", 목록은 "무엇이 잘못됐나". */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex gap-1.5" role="tablist" aria-label="발행 보기">
          {(
            [
              { key: "calendar", label: "캘린더", icon: CalendarClock },
              { key: "list", label: "목록", icon: List },
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
              </button>
            );
          })}
        </div>
        <ButtonLink href="/studio" variant="secondary" size="sm">
          새 콘텐츠 만들기
        </ButtonLink>
      </div>

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
                        "trans-state flex aspect-square flex-col items-center justify-start gap-1 rounded-card border p-1.5",
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

              <p className="mt-4 text-[12px] text-fg-sub">
                예약일 오전 6시 배치에서 자동 발행됩니다(정시 발행이 아니에요).
                {batchPassed ? " 오늘 배치는 이미 지났어요 — 내일부터 예약할 수 있어요." : ""}
                {truncated ? " 최근 200건만 표시하고 있어요." : ""}
              </p>
            </CardBody>
          </Card>

          {/* 선택한 날 — 캘린더 옆 고정 레일. 칸 안에 내용을 다 넣으면 격자가 깨진다 */}
          <Card className="lg:sticky lg:top-20 lg:self-start">
            <CardHeader
              title={selected ? `${Number(selected.slice(5, 7))}월 ${Number(selected.slice(8, 10))}일` : "날짜 선택"}
            />
            <CardBody>
              {selectedPosts.length === 0 ? (
                <p className="text-[14px] text-fg-sub">이 날은 예약이 없어요.</p>
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
      ) : (
        <Card>
          <CardHeader title="예약 목록" description="예약일 아침 배치에서 자동 발행됩니다" />
          <CardBody>
            {listItems.length === 0 ? (
              <p className="text-[14px] text-fg-sub">예약된 게시물이 없어요. 아래 초안에서 날짜를 정해 보세요.</p>
            ) : (
              <ul className="divide-y divide-line">
                {listItems.map((post) => (
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
                  </li>
                ))}
              </ul>
            )}
            {truncated ? <p className="mt-3 text-[12px] text-fg-sub">최근 200건만 표시하고 있어요.</p> : null}
          </CardBody>
        </Card>
      )}

      {/* 초안 — 날짜가 정해지지 않은 것들. 캘린더에는 찍히지 않으므로 여기 따로 두지
          않으면 만든 사람이 다시 찾을 길이 없다.
          날짜 지정·삭제가 **여기에만** 있다 — 이게 없으면 초안은 지울 수도 예약으로
          바꿀 수도 없는 미아가 되고, 쌓이면 조회 한도를 밀어 진짜 예약을 가린다. */}
      {drafts.length > 0 ? (
        <Card>
          <CardHeader title="초안" description="아직 발행일을 정하지 않은 콘텐츠예요" />
          <CardBody>
            {draftError ? (
              <p role="alert" className="mb-3 text-[14px] text-negative-strong">
                {draftError}
              </p>
            ) : null}
            <ul className="divide-y divide-line">
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
