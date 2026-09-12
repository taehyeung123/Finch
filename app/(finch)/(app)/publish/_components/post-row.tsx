"use client";

import {
  CalendarClock,
  ExternalLink,
  FileText,
  Film,
  History as HistoryIcon,
  ImageIcon,
  LoaderCircle,
  Play,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";
import { SignedThumb } from "@/components/ui/signed-thumb";
import { InstagramGlyph, ThreadsGlyph, TiktokGlyph } from "@/components/icons/brand";
import { kstDayKey, kstTimeKey } from "@/lib/calendar";
import { channelLabel } from "@/lib/publish-rules";
import { MEDIA_PURGED_MESSAGE } from "@/lib/meta/publish-errors";
import { dueNow, elapsedLabel, inProgress, stalled } from "@/lib/publish/progress";
import type { PublishListItem } from "@/lib/types";

/*
  발행 목록의 한 줄 — 달력 옆 하루 목록·「발행예약」·「발행완료」·「초안」이 **이 한 벌**을 쓴다 (2026-09-12 사장님 지시
  «발행 기록 줄 나눔이나 디자인 깔끔하게 정리»). 예전엔 세 곳이 각자 그려서, 좁은 칸(달력 옆 약 300px)에서 제목 → 상태+채널 칩 →
  계정 칩+시각 → «게시물 보기»가 제멋대로 3~4줄로 꺾였다.

  모양(모든 곳이 같다):
    [썸네일 44px] 1줄  제목(한 줄, 말줄임) ·························· 시각(오른쪽)
                  2줄  ● 상태  [채널 로고 @아이디 · 이전 계정] ········ 조작 아이콘들(오른쪽)
                  (필요할 때만) 설명 한 줄 — 올리는 중 «방금 시작»·처리 중 «4분째»·실패 이유
                  (열었을 때만) 시각 고르기 — 초안 «예약하기»·실패 글 «다시 예약»
  · 채널과 계정은 **칩 하나**다(채널 배지 + 계정 칩 두 개이던 것). 줄어드는 것은 아이디뿐이고 «이전 계정»은 절대 안 잘린다.
    칩은 최소 폭(basis)보다 좁아질 때만 상태 아래로 내려간다 — 좁은 칸(달력 옆·휴대폰)의 «실패(색면) + 이전 계정 + 조작 셋» 같은 무거운 줄만.
  · 조작은 전부 같은 크기의 아이콘 버튼(보이는 28px, 누르는 칸 36px)이고 순서가 늘 같다: 게시물 보기 · 지금 발행 · 예약 · 취소 · 삭제.
    이름은 aria-label 과 올려 보면 뜨는 title 이 말한다.
  · 올리는 중·처리 중이면 썸네일 위에 스크림 + 도는 표시(모션 축소면 멈춘다) — «업로드 중» 화면을 줄 안에서 보여 준다.
  · 토큰만 쓴다. 썸네일 레터박스(bg-plate)는 카드 안이다.
*/

export type ScheduledPost = PublishListItem;

/** 스토리 링크는 24시간만 산다 — 그 뒤엔 링크를 숨긴다(눌러도 «없는 게시물»이다) */
function storyStillUp(publishedAt: string | null, nowMs: number): boolean {
  if (!publishedAt) return false;
  const t = Date.parse(publishedAt);
  return Number.isFinite(t) && nowMs - t < 24 * 3600_000;
}

/** 줄에 딸린 시각 고르기(초안 «예약하기»·실패 글 «다시 예약») */
export interface RowScheduler {
  /** 버튼·툴팁 이름 — «예약하기» | «다시 예약» */
  label: string;
  open: boolean;
  onToggle: () => void;
  value: string;
  min: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  /** 이 줄의 예약 전환이 도는 중 */
  busy: boolean;
  /** 다른 줄의 예약·삭제가 도는 중 — 끝날 때까지 누를 수 없다(초안 처리는 한 번에 하나) */
  locked: boolean;
}

export interface RowActions {
  onNow?: () => void;
  onCancel?: () => void;
  onDelete?: () => void;
  schedule?: RowScheduler;
  /** 이 줄에 서버 응답을 기다리는 조작이 있다 — 버튼을 잠근다 */
  busy?: boolean;
}

export function PostRow({
  post,
  nowMs,
  when,
  actions,
}: {
  post: ScheduledPost;
  /** 부모가 들고 있는 «지금»(진행 상황 조회마다 갱신) — 렌더 안에서 Date.now() 를 부르지 않는다 */
  nowMs: number;
  /** time = 시각만(달력 옆 하루 목록) · date = 날짜+시각(목록) · none = 표시 안 함(초안 — 시각이 «만든 때»라 헷갈린다) */
  when: "time" | "date" | "none";
  actions: RowActions;
}) {
  const label = channelLabel(post.channel);
  const story = post.ig_surface === "story";
  const link = post.status === "published" && post.permalink && (!story || storyStillUp(post.published_at, nowMs)) ? post.permalink : null;
  const busy = !!actions.busy;
  const sched = actions.schedule;
  const whenText = when === "none" ? "" : when === "time" ? kstTimeKey(post.display_at) : dateTimeText(post.display_at, nowMs);
  const cancelLabel = post.display_status === "processing" ? "발행 취소" : "예약 취소";
  const any = !!link || !!actions.onNow || !!sched || !!actions.onCancel || !!actions.onDelete;

  return (
    <li className="flex gap-3 py-3 first:pt-0 last:pb-0">
      <PostThumb post={post} />
      <div className="min-w-0 flex-1">
        {/* 1줄 — 제목은 한 줄로 말줄임, 시각은 오른쪽에 붙박이 */}
        <div className="flex items-baseline gap-2">
          <p className="min-w-0 flex-1 truncate text-[14px] font-medium text-fg" title={post.caption.split("\n")[0] || undefined}>
            {post.caption.split("\n")[0] || "(캡션 없음)"}
          </p>
          {whenText ? (
            <time dateTime={post.display_at} className="tnum shrink-0 text-[12px] text-fg-sub">
              {whenText}
            </time>
          ) : null}
        </div>

        {/* 2줄 — 상태·채널 칩(왼쪽) | 조작(오른쪽). 칩은 아이디만 줄어든다 */}
        <div className="mt-1 flex items-center gap-2">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-1">
            <StatusPill status={post.display_status} />
            <AccountChip post={post} />
          </div>
          {any ? (
            <div className="flex shrink-0 items-center gap-1">
              {link ? (
                /* 밖으로 나가는 새 탭 링크 — 앱 안 이동이 아니라 AppLink 가 아니다. 주소는 서버가 인스타·스레드 호스트만 남겼다(safePermalink) */
                <a
                  href={link}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${label}에서 ${story ? "스토리" : "게시물"} 보기(새 창)`}
                  title={story ? "스토리 보기" : "게시물 보기"}
                  className={actionClass("neutral")}
                >
                  <ExternalLink className="size-4" aria-hidden />
                </a>
              ) : null}
              {actions.onNow ? (
                <button type="button" onClick={actions.onNow} disabled={busy} aria-label="지금 발행" title="지금 발행" className={actionClass("neutral")}>
                  <Send className="size-4" aria-hidden />
                </button>
              ) : null}
              {sched ? (
                <button
                  type="button"
                  onClick={sched.onToggle}
                  disabled={busy}
                  aria-expanded={sched.open}
                  aria-label={sched.label}
                  title={sched.label}
                  className={actionClass("neutral", sched.open)}
                >
                  <CalendarClock className="size-4" aria-hidden />
                </button>
              ) : null}
              {actions.onCancel ? (
                <button
                  type="button"
                  onClick={actions.onCancel}
                  disabled={busy}
                  aria-label={cancelLabel}
                  title={cancelLabel}
                  className={actionClass("danger")}
                >
                  <X className="size-4" aria-hidden />
                </button>
              ) : null}
              {actions.onDelete ? (
                <button
                  type="button"
                  onClick={actions.onDelete}
                  disabled={busy}
                  aria-label={post.status === "draft" ? "초안 삭제" : "삭제"}
                  title={post.status === "draft" ? "초안 삭제" : "삭제"}
                  className={actionClass("danger")}
                >
                  <Trash2 className="size-4" aria-hidden />
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        <PostNotes post={post} nowMs={nowMs} />

        {/* 시각 고르기 — 달력 아이콘을 눌렀을 때만. 예전엔 초안·실패 줄마다 날짜 칸과 버튼이 늘 나와 줄이 두세 번 꺾였다 */}
        {sched && sched.open ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              type="datetime-local"
              min={sched.min}
              step={300}
              value={sched.value}
              onChange={(e) => sched.onChange(e.target.value)}
              aria-label={post.status === "draft" ? "발행 시각" : "다시 예약할 시각"}
              className="tnum h-9 min-w-0 flex-1 basis-44 rounded-card border border-line bg-body px-2.5 text-[14px] text-fg focus:border-primary focus:outline-none"
            />
            <Button size="sm" disabled={!sched.value || sched.busy || sched.locked || busy} onClick={sched.onSubmit}>
              {sched.busy ? "처리 중…" : sched.label}
            </Button>
          </div>
        ) : null}
      </div>
    </li>
  );
}

/* 조작 아이콘 버튼 — 보이는 28px, 누르는 칸 36px(after 로 사방 4px). 색만 바뀌는 호버는 trans-state(--dur-1).
   키보드 포커스는 앱의 버튼(components/ui/button.tsx)과 같은 코랄 링 — 네 목록이 같이 쓰는 줄이라 브라우저 기본 링으로 두지 않는다.
   글자색은 한 가지만 붙인다 — cn 은 겹치는 유틸을 지우지 않아서(tailwind-merge 없음) 둘이 붙으면 어느 쪽이 이길지 모른다 */
const ACTION_BASE =
  "trans-state relative flex size-7 items-center justify-center rounded-card after:absolute after:-inset-1 after:content-[''] hover:bg-tint-hover focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-40";

function actionClass(tone: "neutral" | "danger", on = false): string {
  return cn(ACTION_BASE, on ? "bg-tint-hover text-fg" : "text-fg-sub", tone === "danger" ? "hover:text-negative" : "hover:text-fg");
}

/** "9월 12일 14:05" — 올해가 아니면 앞에 연도 */
function dateTimeText(iso: string, nowMs: number): string {
  const day = kstDayKey(iso);
  if (!day) return "";
  const [y, m, d] = day.split("-");
  const thisYear = kstDayKey(new Date(nowMs)).slice(0, 4);
  return `${y !== thisYear ? `${y}년 ` : ""}${Number(m)}월 ${Number(d)}일 ${kstTimeKey(iso)}`;
}

function ChannelGlyph({ channel }: { channel: ScheduledPost["channel"] }) {
  if (channel === "threads") return <ThreadsGlyph className="size-3 shrink-0 text-fg" />;
  if (channel === "tiktok") return <TiktokGlyph className="size-3 shrink-0 text-fg" />;
  return <InstagramGlyph className="size-3 shrink-0 text-ig" />;
}

/**
 * 썸네일 — 첫 항목(사진이면 그 사진, 영상이면 커버). 서버가 서명한 thumb_url 로 온다. 크기는 어디서나 44px.
 * 영상이면 ▶ 칩, 여러 개면 +N 칩. 썸네일이 없으면 종류 아이콘(영상=필름, 사진=그림, 글만=문서).
 * 올리는 중·처리 중이면 스크림 위에 도는 표시 — 줄 안의 «업로드 중» 화면이다.
 */
function PostThumb({ post }: { post: ScheduledPost }) {
  const kind = post.has_video ? "영상" : post.media_count > 0 ? "사진" : null;
  const working = inProgress(post);
  return (
    <span className="relative flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-card border border-line bg-plate">
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
          post.has_video && !working ? (
            <span className="absolute bottom-0.5 left-0.5 flex items-center rounded-chip bg-scrim p-0.5 text-on-scrim" aria-hidden>
              <Play className="size-2.5 fill-current" />
            </span>
          ) : null
        }
      />
      {post.media_count > 1 && !working ? (
        <span className="tnum absolute right-0.5 top-0.5 rounded-chip bg-scrim px-1 text-[11px] font-semibold leading-4 text-on-scrim" aria-hidden>
          +{post.media_count - 1}
        </span>
      ) : null}
      {working ? (
        <span className="absolute inset-0 flex items-center justify-center bg-scrim text-on-scrim" aria-hidden>
          <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" />
        </span>
      ) : null}
      {/* 글만 있는 글(스레드)도 이름을 준다 — 보이는 문서 아이콘은 aria-hidden 이라 이것이 없으면 스크린리더에 이 칸이 비어 있다 */}
      <span className="sr-only">{kind ? (post.media_count > 1 ? `${kind} 포함 ${post.media_count}개` : kind) : "글만 있는 게시물"}</span>
    </span>
  );
}

/**
 * 채널·계정 칩 — 채널 로고 + 이 글이 나간(나갈) 계정 «@아이디» 한 칩(2026-09-12 — 채널 배지와 계정 칩 두 개를 합쳤다).
 * 지금 그 채널에 연결된 계정이 아니면 «@옛 · 이전 계정» — 계정을 바꾼 뒤에도 옛 계정의 글이 새 계정 것처럼 섞여 보이지 않게 한다.
 * 계정을 모르면(아직 확인 전인 옛 발행 글) 채널 이름을 쓴다. 무엇을 보일지는 서버가 정한다(lib/publish/account-core.ts postAccountView).
 *
 * ⚠️ 잘리는 것은 **아이디뿐**이다 — «이전 계정»은 줄어들지 않는 칸에 따로 둔다(2026-09-12 점검: 한 줄을 통째로 말줄임에 넣으면
 *    아이디가 조금만 길어도 «이전 계정»이 먼저 잘려 이 칩의 존재 이유가 사라졌다). 이전 계정의 칩은 카드 안 중첩 면(plate)으로 한 칸
 *    눌러 두고 지나간 것을 뜻하는 아이콘을 붙인다. 칩은 늘 카드 안에 있다(plate 를 지면 위에 직접 쓰지 않는 규칙).
 * 폭: 최소 폭(basis)까지는 상태 옆에 붙어 아이디를 줄이고, 그보다 좁으면 줄을 바꾼다(상태 아래로 — 겹치거나 넘치지 않는다).
 *     자라는 것은 제 폭(max-content)까지만. 줄이 바뀌는 것은 «실패(색면) + 이전 계정 + 조작 셋»처럼 무거운 줄이 좁은 칸(달력 옆·휴대폰)에 올 때뿐이다.
 */
function AccountChip({ post }: { post: ScheduledPost }) {
  const previous = post.account_previous;
  const handle = post.account_handle;
  const label = channelLabel(post.channel);
  const hint = previous ? "지금 연결된 계정이 아닌 이전 계정의 글이에요" : null;
  /* 보이는 이름 — 아이디, 없으면(이전 계정 표시도 없으면) 채널 이름 */
  const shown = handle ?? (previous ? null : label);
  return (
    <span
      title={[label, handle, hint].filter(Boolean).join(" · ")}
      className={cn(
        "inline-flex min-w-0 max-w-max grow items-center gap-1 rounded-chip border border-line px-2 py-0.5 text-[12px] leading-5 whitespace-nowrap text-fg-sub",
        /* basis = 이 칩이 상태 옆에 남기 위한 최소 폭. 이전 계정 칩은 «로고 · 시계 아이콘 이전 계정»(줄지 않는 몫, 약 110px)을 다 담아야 한다 —
           그보다 작게 잡으면 칩이 그 폭으로 눌리며 «이전 계정»이 칩 밖으로 삐져나와 조작 아이콘과 겹친다 */
        previous ? "basis-28 bg-plate font-medium" : "basis-16 bg-overlay font-semibold",
      )}
    >
      <ChannelGlyph channel={post.channel} />
      {shown !== label ? <span className="sr-only">{label}</span> : null}
      {shown ? <span className="min-w-0 truncate">{shown}</span> : null}
      {previous ? (
        <span className="inline-flex shrink-0 items-center gap-1">
          {shown ? <span aria-hidden>·</span> : null}
          <HistoryIcon className="size-3 text-fg-faint" aria-hidden />
          이전 계정
        </span>
      ) : null}
    </span>
  );
}

/** 줄 아래 설명 — 필요할 때만 한 줄: 올리는 중·처리 중의 경과, 멈춘 것 같은 실행, 곧 올라갈 예약, 실패 이유 */
function PostNotes({ post, nowMs }: { post: ScheduledPost; nowMs: number }) {
  if (post.display_status === "publishing") {
    return stalled(post, nowMs) ? (
      <p className="mt-1 break-keep text-[12px] text-warning-strong">
        생각보다 오래 걸려요 — 멈춘 거라면 몇 분 안에 자동으로 정리하고 알림으로 알려 드려요.
      </p>
    ) : (
      <p className="tnum mt-1 text-[12px] text-fg-sub">{elapsedLabel(post.progress_since, nowMs)} · 화면을 나가도 계속 올라가요</p>
    );
  }
  if (post.display_status === "processing") {
    return <p className="tnum mt-1 text-[12px] text-fg-sub">{elapsedLabel(post.progress_since, nowMs)} · 끝나면 자동으로 올라가요</p>;
  }
  /* 파일이 지워진 글은 정리 크론이 error 칸을 바꾸지 않아 옛 실패 이유가 남아 있다 — 지워졌다는 것을 대신 말한다.
     문구는 서버 액션의 거절 이유·엔진 알림과 한 벌(lib/meta/publish-errors.ts). 다른 실패 이유처럼 마침표 없이 */
  if (post.status === "failed" && (post.media_purged || post.error)) {
    return <p className="mt-1 break-keep text-[12px] text-negative-strong">{post.media_purged ? MEDIA_PURGED_MESSAGE : post.error}</p>;
  }
  /* 예약 시각이 막 지났다 — 5분 크론이 곧 집는다(«예약됨»인데 시각이 지나 보이면 멈춘 줄 안다) */
  if (dueNow(post, nowMs) && Date.parse(post.scheduled_at) <= nowMs) {
    return <p className="mt-1 text-[12px] text-fg-sub">몇 분 안에 자동으로 올라가요</p>;
  }
  return null;
}
