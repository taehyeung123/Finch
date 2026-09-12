"use client";

import { useEffect, useRef, useState } from "react";
import { Clapperboard, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button, ButtonLink } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Switch } from "@/components/ui/switch";
import { isTopmostDialog } from "@/components/ui/trap-focus";
import { SnsIcon } from "@/components/sns-brand-icons";
import { earliestPublishAt } from "@/lib/calendar";
import type { ResultModalContent } from "@/components/ui/result-modal";
import type { ToastContent } from "@/components/ui/toast";
import { createPost, type CreatePostResult } from "../actions";
import {
  COMPOSER_CHANNELS,
  IG_STORY_ENABLED,
  channelLabel,
  channelRules,
  formatDurationKo,
  hasBlockingIssue,
  isPublishableChannel,
  mediaRules,
  validateMediaSet,
  validatePostText,
  type IgSurface,
} from "@/lib/publish-rules";
import { eunNeun } from "@/lib/josa";
import { MediaTiles } from "./media-tiles";
import { CoverPicker } from "./cover-picker";
import { PublishingVeil } from "./publishing-veil";
import { PICK_ACCEPT, surfaceOf, tileBusy, tileFacts, toPostMedia, useMediaTiles } from "./use-media-tiles";

/*
  새 게시물 포스팅 — 링크팜 포스팅 실측(2026-08-19) 재구현 → 2026-09-11 사진·영상 섞은 게시물.

  링크팜 흐름: 상단 「+ 새 게시물 포스팅」 → SNS 미연동이면 "SNS 연동하기" 안내
  모달(연동하러 가기), 연동이면 작성 화면. 우리도 같은 관문을 둔다 — 연동 없이
  작성부터 시키고 발행에서 실패하게 만드는 것보다, 문 앞에서 이유를 말하는 게 낫다.

  발행 방식은 셋이다: **지금 발행 / 예약 발행(시각) / 초안 저장.** 결과는 목록 화면이 알린다 — 예약·초안은 결과 모달,
  「지금 발행」은 글을 만들고 선점하는 데까지만 기다린 뒤 곧바로 닫히고(2026-09-12 비동기), 목록 한 줄이 «올리는 중»을 그린다.
  채널: 발행 어댑터가 있는 인스타그램·스레드가 활성이다(lib/meta/*-publish.ts). 틱톡은 발행 API 자체가 없어 «준비 중».

  사진·영상(2026-09-11): 고르는 즉시 굽기·검사를 하고 **브라우저가 Storage 로 직접** 올린다(use-media-tiles.ts).
  예전엔 사진을 data URL 로 서버 액션 본문에 실어 Vercel 본문 상한(4.5MB) 때문에 합계 3MB 에서 막혔고 영상은 불가능했다.
  인스타: 사진 1장 → 사진 게시물, 영상 1개 → 릴스(피드에도 보이기 기본 켬), 2~10개(섞어도 된다) → 캐러셀, 1개 + 스토리 스위치 → 스토리.
  스레드: 글만 / 사진·영상 0~20개(섞어도 된다).

  **상한은 채널·게시 면마다 다르다**(글자 수·개수·영상 길이·해상도…). 값은 lib/publish-rules.ts 한 곳에서
  서버 액션과 함께 본다 — 여기 하드코딩하면 «화면은 막는데 서버는 받는» 식으로 갈라진다.
*/

export interface ComposerChannel {
  channel: string;
  handle: string | null;
  connected: boolean;
}

/**
 * 저장 결과 — 목록 화면이 알린다.
 *  · modal: 예약·초안 — 결과 모달(방금 한 일이 끝났다)
 *  · started: 「지금 발행」을 시작했다 — 목록이 토스트로 «올리기 시작했어요»와 어디서 볼지를 말한다(보는 탭을 목록이 안다)
 *  · deferred: 저장은 됐고 크론이 곧 집어 간다 — 토스트(경고)
 */
export type ComposerSaved =
  | { kind: "modal"; result: ResultModalContent }
  | { kind: "started"; channel: string; hasVideo: boolean }
  | { kind: "deferred"; toast: ToastContent };

function resultFor(res: Extract<CreatePostResult, { ok: true }>, channel: string, when: string, hasVideo: boolean): ComposerSaved {
  const label = channelLabel(channel);
  if (res.mode !== "now") {
    if (res.mode === "draft") {
      return {
        kind: "modal",
        result: { tone: "positive", title: "초안으로 저장했어요", description: "「초안」 탭에서 언제든 시각을 정하거나 지금 발행할 수 있어요." },
      };
    }
    return {
      kind: "modal",
      result: {
        tone: "positive",
        title: `${label} 발행을 예약했어요`,
        description: `${formatWhen(when)}부터 5분 안에 자동으로 올라가요.${hasVideo ? " 영상은 처리 때문에 조금 늦을 수 있어요." : ""}`,
      },
    };
  }
  const o = res.outcome;
  if (o.state === "started") return { kind: "started", channel, hasVideo };
  /* 저장은 됐고 크론이 곧 집어 간다 — «실패»로 말하면 정상 발행 예정 글을 지우게 된다 */
  return { kind: "deferred", toast: { tone: "warning", title: "저장했어요 — 곧 자동으로 올라가요", description: o.error } };
}

/** 사진·영상 칸 아래 한 줄 — 지금 구성이 어떤 게시물로 올라가는지 */
function surfaceHint(channel: string, surface: IgSurface | null, count: number, hasVideo: boolean): string {
  if (channel === "threads") {
    const r = mediaRules("threads", null);
    return `사진·영상 최대 ${r.maxItems}개 · 영상은 ${formatDurationKo(r.video.maxDurationMs)}까지 · 글만 올려도 돼요`;
  }
  if (channel !== "instagram") return "";
  if (count === 0) return "사진 1장은 사진 게시물, 영상 1개는 릴스, 2개 이상은 캐러셀로 올라가요";
  const r = mediaRules("instagram", surface);
  /* «3초~1분»이 좁은 화면에서 «3초 / ~1분»으로 갈라지지 않게 물결표 양옆을 단어 결합(U+2060)으로 묶는다 */
  const range = (min: number | null, max: number) =>
    min ? `${formatDurationKo(min)}\u2060~\u2060${formatDurationKo(max)}` : `${formatDurationKo(max)}까지`;
  if (surface === "story") return `스토리로 올라가요 · 24시간 뒤 사라지고 글은 올라가지 않아요 · 영상은 ${range(null, r.video.maxDurationMs)}`;
  if (surface === "reels") return `릴스로 올라가요 · 영상은 ${range(r.video.minDurationMs, r.video.maxDurationMs)}`;
  if (count === 1) return "사진 게시물로 올라가요";
  return `캐러셀로 올라가요 · 모든 항목이 첫 번째 항목 비율로 잘려요${hasVideo ? ` · 영상은 ${range(r.video.minDurationMs, r.video.maxDurationMs)}` : ""}`;
}

export function PostComposer({
  channels,
  isDemo,
  defaultDate,
  onClose,
  onSaved,
}: {
  /** null = 연동 상태를 **확인하지 못했다**. «계정 없음»과 다르게 다뤄야 한다(관문을 띄우지 않는다) */
  channels: ComposerChannel[] | null;
  isDemo: boolean;
  /** 캘린더에서 날짜를 골라 들어온 경우 — 예약 모드로 그 날짜가 미리 채워진다 */
  defaultDate: string | null;
  onClose: () => void;
  onSaved: (saved: ComposerSaved) => void;
}) {
  /* 조회 실패(null)면 관문을 띄우지 않는다 — «계정 없음»이 아니라 «모름»이다. 실제 발행은 서버가 다시 확인한다.
     잘 쓰던 사람을 «연동하세요» 화면으로 튕기는 쪽이 더 나쁘다(2026-09-07 감사). */
  const anyConnected = isDemo || channels === null || channels.some((c) => c.connected);

  const earliestAt = earliestPublishAt();
  /* 처음 채널 = 고를 수 있는 첫 채널. 예전엔 늘 인스타그램이라 스레드만 연동한 사람은 꺼진 칩이 골라진 채로 시작했고,
     이제는 사진을 고르는 즉시 올리기가 «인스타그램을 연동하세요»로 막힌다 */
  const [channel, setChannel] = useState<string>(
    () =>
      COMPOSER_CHANNELS.find(
        (ch) => isPublishableChannel(ch) && (isDemo || channels === null || !!channels.find((c) => c.channel === ch)?.connected),
      ) ?? "instagram",
  );
  const rules = channelRules(channel);
  const CAPTION_MAX = rules.textMax;
  const [caption, setCaption] = useState("");
  /* 기본은 예약이다 — 「지금 발행」은 되돌릴 수 없는 외부 행동이라 기본값으로 두지 않는다 */
  const [mode, setMode] = useState<"now" | "schedule" | "draft">("schedule");
  /* 달력에서 날짜를 골라 왔으면 그날 09:00, 아니면 지금(5분 단위 올림). 이미 지난 시각이면 지금으로 */
  const [when, setWhen] = useState(() =>
    defaultDate && `${defaultDate}T09:00` >= earliestAt ? `${defaultDate}T09:00` : earliestAt,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** 인스타 — 항목이 1개일 때 «스토리로 올리기» */
  const [igStory, setIgStory] = useState(false);
  /** 인스타 릴스 — 피드에도 보이기(기본 켬) */
  const [shareToFeed, setShareToFeed] = useState(true);
  /** 커버 고르기 모달이 열린 타일 */
  const [coverFor, setCoverFor] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  /* initialTarget 은 첫 렌더에만 쓰인다(그 뒤 채널·스토리는 핸들러가 retarget 으로 알린다) */
  const media = useMediaTiles({ isDemo, initialTarget: { channel, story: false } });
  const tiles = media.tiles;

  const containerRef = useRef<HTMLDivElement>(null);
  /** 스크림(role="dialog") — Esc 를 «내가 맨 위일 때만» 처리하는 판정에 쓴다 */
  const scrimRef = useRef<HTMLDivElement>(null);
  const requestCloseRef = useRef<() => void>(() => {});
  /* 「닫을까요?」 확인 — window.confirm 이었다. 브라우저가 대화상자를 막으면 confirm 이 즉시 false 라
     dirty 인 동안 X·Esc·바깥 클릭 세 출구가 **전부** 막혀 모달에 갇혔다(새로고침 말고 나갈 길이 없었다). */
  const [confirmClose, setConfirmClose] = useState(false);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    containerRef.current?.focus();
    return () => prev?.focus?.();
  }, []);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape" || e.isComposing) return;
      /* 위에 확인·커버 모달이 떠 있으면 그쪽(ModalShell)이 Esc 를 받는다 — 여기서도 받으면 Esc 한 번에
         둘이 같이 닫혀, 사라진다고 경고하던 내용이 그대로 사라진다 */
      if (!isTopmostDialog(scrimRef.current)) return;
      requestCloseRef.current();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const dirty = tiles.length > 0 || caption.trim().length > 0;
  /* 올리는 중·올린 뒤 저장 전에 탭을 닫으려 하면 브라우저 확인을 띄운다 — 닫히면 올린 파일은 정리 크론이 24시간 뒤 치운다 */
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      /* 사파리는 returnValue 를 채워야 확인을 띄운다 */
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  function requestClose() {
    if (saving) return;
    /* 멱등 — X·Esc·바깥 클릭 어느 경로로 와도 같은 확인 모달 하나를 연다 */
    if (dirty) {
      setConfirmClose(true);
      return;
    }
    onClose();
  }
  useEffect(() => {
    requestCloseRef.current = requestClose;
  });

  /* ── 사진·영상 규칙(고르는 즉시·저장 직전이 같은 함수) ── */
  const story = IG_STORY_ENABLED && channel === "instagram" && igStory;
  const surface = surfaceOf({ channel, story }, tiles);
  const onStory = surface === "story";
  const mRules = mediaRules(channel, surface);
  const issues = validateMediaSet(channel, surface, tiles.map(tileFacts));
  const badIndexes = new Set(issues.flatMap((i) => (i.severity === "error" && i.index !== null ? [i.index] : [])));
  const hasVideo = tiles.some((t) => t.kind === "video");
  const busyTiles = tiles.filter(tileBusy);
  const readyCount = tiles.filter((t) => t.state.phase === "ready").length;
  const failedTiles = tiles.filter((t) => t.state.phase === "error");
  const croppedCount = tiles.filter((t) => t.kind === "image" && t.cropped && t.state.phase !== "preparing").length;
  const textError = validatePostText(channel, surface, caption, tiles.length);
  const overText = !onStory && caption.length > CAPTION_MAX;
  const timeOk = mode !== "schedule" || when >= earliestAt;
  const canSave =
    !saving && busyTiles.length === 0 && failedTiles.length === 0 && !hasBlockingIssue(issues) && !textError && !overText && timeOk;

  /* 사진·영상 칸 아래 문제 목록 — 올리기 실패 + 규칙 위반(오류는 빨강, 경고는 주황). 0개일 때 «1개 이상»은 저장 버튼 아래로만 */
  const problems: Array<{ text: string; tone: "error" | "warning" }> = [];
  tiles.forEach((t, i) => {
    if (t.state.phase === "error") problems.push({ text: `${i + 1}번째 ${t.kind === "video" ? "영상" : "사진"} — ${t.state.message}`, tone: "error" });
  });
  for (const it of issues) {
    if (it.code === "count_low" && tiles.length === 0) continue;
    problems.push({ text: it.message, tone: it.severity });
  }
  const shownProblems = problems.filter((p, i) => problems.findIndex((q) => q.text === p.text) === i);

  /* 저장 버튼이 왜 막혔는지 — 버튼만 조용히 꺼져 있으면 이유를 찾아 헤맨다(2026-08-31 점검) */
  const blockReason = saving
    ? null
    : busyTiles.length > 0
      ? `파일을 올리는 중이에요 — ${readyCount}/${tiles.length}`
      : failedTiles.length > 0
        ? "올리지 못한 파일이 있어요 — 다시 올리거나 빼 주세요."
        : hasBlockingIssue(issues)
          ? tiles.length === 0
            ? (issues.find((i) => i.code === "count_low")?.message ?? null)
            : "위 사진·영상 문제를 먼저 고쳐 주세요."
          : textError ?? (overText ? `${eunNeun(rules.textLabel)} ${CAPTION_MAX}자까지 쓸 수 있어요.` : !timeOk ? "예약 시각을 지금 이후로 골라 주세요." : null);

  /** 인스타 스토리는 항목이 정확히 1개일 때만 — 개수가 바뀌면 끈다(되살아나지 않게) */
  function syncStory(count: number) {
    if (igStory && count !== 1) {
      setIgStory(false);
      media.retarget({ channel, story: false });
    }
  }

  function addFiles(files: File[]) {
    if (files.length === 0 || saving) return;
    const msg = media.add(files);
    /* 정상 선택이면 이전 경고를 지운다 — 안 지우면 상한 경고가 해소된 뒤에도 남는다 */
    setError(msg);
    syncStory(media.countNow());
  }

  function pickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = [...(e.target.files ?? [])];
    e.target.value = ""; // 같은 파일 재선택 허용
    addFiles(files);
  }

  function removeTile(key: string) {
    media.remove(key);
    if (coverFor === key) setCoverFor(null);
    syncStory(media.countNow());
  }

  /* 채널을 바꾸면 이미 쓴 내용이 소급해 무효가 될 수 있다(인스타 2200자 → 스레드 500자, 스레드 20개 → 인스타 10개).
     예전엔 저장 버튼만 조용히 꺼져서 **왜 막혔는지 화면 어디에도 없었다**(2026-08-31 점검 적발). 사진·영상 쪽 이유는 칸 아래 목록이 말한다. */
  function switchChannel(next: string) {
    setChannel(next);
    const nextStory = next === "instagram" && igStory;
    if (!nextStory && igStory) setIgStory(false);
    /* 사진은 새 채널의 비율 규칙으로 다시 굽고(원본에서), 기다리던 영상은 통과하면 올린다 */
    media.retarget({ channel: next, story: IG_STORY_ENABLED && nextStory });
    const r = channelRules(next);
    const name = channelLabel(next);
    if (caption.length > r.textMax) {
      setError(`${eunNeun(name)} ${r.textMax}자까지 쓸 수 있어요 — ${caption.length - r.textMax}자를 줄여 주세요.`);
    } else {
      setError(null); // 이전 채널의 경고를 남기지 않는다
    }
  }

  function toggleStory(on: boolean) {
    setIgStory(on);
    media.retarget({ channel, story: IG_STORY_ENABLED && on });
  }

  async function save() {
    if (!canSave) return;
    /* earliestAt 은 렌더 시점 값이다 — 창을 열어 두고 머뭇거리면 «지금»이 지나가 서버가 «지난 시각»으로 거절한다.
       제출 직전에 다시 재고, 지났으면 방금 시각으로 맞춘 뒤 한 번 더 누르게 한다(타이머 없이 제출이라는 사건에서만). */
    if (mode === "schedule") {
      const fresh = earliestPublishAt();
      if (when < fresh) {
        setWhen(fresh);
        setError("시간이 좀 지났어요 — 예약 시각을 방금으로 다시 맞췄어요. 확인하고 다시 눌러 주세요.");
        return;
      }
    }
    setSaving(true);
    setError(null);
    try {
      const res = await createPost({
        channel,
        caption: onStory ? "" : caption.trim(),
        media: tiles.map(toPostMedia),
        igStory: onStory,
        shareToFeed,
        mode,
        when,
      });
      if (!res.ok) {
        setError(res.error ?? "저장하지 못했어요.");
        return;
      }
      /* 이제 파일은 글의 것이다 — 닫히면서 지우지 않는다 */
      media.markSaved();
      onSaved(resultFor(res, channel, when, hasVideo));
    } catch {
      /* {ok:false} 정상 반환이 아니라 호출 자체가 던진 경우(네트워크·배포 교체) — 잡지 않으면 에러 오버레이가 뜨고 작성 내용이 통째로 위험해진다 */
      setError("저장하지 못했어요. 연결을 확인하고 잠시 후 다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
  }

  /* ── 미연동 관문 — 링크팜 "SNS 연동하기" 모달 문법 ── */
  if (!anyConnected) {
    return (
      <div
        ref={scrimRef}
        className="modal-scrim-in fixed inset-0 z-50 m-0! flex items-center justify-center bg-black/40 p-4"
        role="dialog"
        aria-modal="true"
        aria-label="SNS 연동 안내"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="modal-card-in shadow-pop w-full max-w-md rounded-card border border-line bg-body p-6">
          <h2 className="text-[17px] font-semibold">SNS 연동하기</h2>
          <p className="mt-2 text-[15px] leading-relaxed text-fg-sub">
            아직 연동된 SNS 계정이 없어요. 계정을 연동하면 게시물 예약 발행, 채널 분석, 댓글 자동 DM 까지 쓸 수
            있습니다.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              닫기
            </Button>
            {/* 모달(fixed z-50) 안의 화면 이동 — 누르는 즉시 모달을 걷어야 «이동 중» 덮개(<main> 안 z-20)가 보인다.
                onClick 이 아니라 onNavigate: 새 탭(Ctrl/Cmd·가운데 클릭)에선 안 불려 모달이 남는다. onClose 는 부모의 로컬 상태뿐이다. */}
            <ButtonLink href="/settings/channels" onNavigate={() => onClose()}>
              연동하러 가기
            </ButtonLink>
          </div>
        </div>
      </div>
    );
  }

  const input =
    "w-full rounded-card border border-line bg-body px-3 text-[15px] text-fg placeholder:text-fg-faint focus:border-primary focus:outline-none disabled:cursor-not-allowed disabled:opacity-50";
  const coverTile = coverFor ? tiles.find((t) => t.key === coverFor) : undefined;
  const single = tiles.length === 1 ? tiles[0] : null;
  const canPickCover =
    channel === "instagram" && !!single && single.kind === "video" && single.inspect !== null && single.state.phase !== "preparing" && !saving;
  const hint = surfaceHint(channel, surface, tiles.length, hasVideo);

  return (
    <>
    {/* m-0! — 부모(publish-list)의 space-y 가 형제(커버 고르기·닫기 확인)가 뒤에 붙는 순간 이 스크림에 아래 여백을 준다.
        fixed 여도 여백은 먹어서 화면 아래 20px 가 덮이지 않았다(2026-09-12 실측, ModalShell 과 같은 이유) */}
    <div
      ref={scrimRef}
      className="modal-scrim-in fixed inset-0 z-50 m-0! flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="새 게시물 포스팅"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) requestClose();
      }}
    >
      <div
        ref={containerRef}
        tabIndex={-1}
        className="modal-card-in shadow-pop relative flex max-h-[92dvh] w-full max-w-[550px] flex-col overflow-hidden rounded-card border border-line bg-body outline-none sm:max-h-[88dvh]"
      >
        {/* 저장·발행 시작 중 덮개 — 버튼 글자만 바뀌면 멈춘 줄 안다(2026-09-12 사장님 지시). 카드 전체를 덮어 무엇이 진행 중인지 말한다.
            「지금 발행」도 글을 만들고 선점하는 짧은 동안만이다 — 올리는 일은 서버가 뒤에서 하고, 이 창은 곧바로 닫힌다 */}
        {saving ? <PublishingVeil mode={mode} /> : null}
        <div className="flex items-center gap-2 px-5 pt-4">
          <h2 className="flex-1 text-[17px] font-semibold">새 게시물 포스팅</h2>
          <button
            type="button"
            aria-label="닫기"
            onClick={requestClose}
            className="relative after:absolute after:-inset-1 after:content-[''] rounded-card p-1.5 text-fg hover:bg-tint-hover"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {/* 채널 — 연결된 채널만 활성 */}
          <div>
            <p className="text-[12px] font-medium text-fg-sub">채널</p>
            {/* flex-wrap 없이 칩 3개를 한 줄에 눌러 담아서, 390px 에서 라벨이 «인스타그/램» 처럼
                단어 중간에 끊겼다(실측: 칩 높이 60.8px·2줄). 위 채널 스트립은 이미 wrap 이다 — 규칙을 맞춘다. */}
            <div className="mt-1.5 flex flex-wrap gap-2" role="radiogroup" aria-label="발행 채널">
              {COMPOSER_CHANNELS.map((ch) => {
                const meta = channels?.find((c) => c.channel === ch);
                const publishable = isPublishableChannel(ch); // 발행 어댑터가 있는 채널만
                /* channels === null 은 «확인 못 함» — 고르는 것까지 막지 않는다. 저장 시 서버가 다시 판정한다 */
                const usable = publishable && (isDemo || channels === null || !!meta?.connected);
                return (
                  <button
                    key={ch}
                    type="button"
                    role="radio"
                    aria-checked={channel === ch}
                    disabled={!usable || saving}
                    onClick={() => switchChannel(ch)}
                    className={cn(
                      "trans-state inline-flex min-h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-chip border px-3 py-1.5 text-[14px] font-medium disabled:cursor-not-allowed disabled:opacity-45",
                      channel === ch ? "border-2 border-primary" : "border-line hover:bg-tint-hover",
                    )}
                  >
                    <SnsIcon kind={ch} className="size-3.5" />
                    {channelLabel(ch)}
                    {!publishable ? <span className="text-[11px] text-fg-sub">준비 중</span> : null}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 사진·영상 — 인스타 1~10개 / 스레드 0~20개, 섞어도 된다 */}
          <div className="min-w-0">
            <p className="text-[12px] font-medium text-fg-sub">
              사진·영상{" "}
              {rules.minMedia === 0 ? <span className="font-normal text-fg-sub">(선택)</span> : null}{" "}
              {/* 부족·초과를 캡션 카운터와 같은 신호로 */}
              <span className={cn("tnum", tiles.length < mRules.minItems || tiles.length > rules.maxMedia ? "text-negative-strong" : undefined)}>
                {tiles.length}/{rules.maxMedia}
              </span>
            </p>
            <div className="mt-1.5">
              <MediaTiles
                tiles={tiles}
                max={rules.maxMedia}
                badIndexes={badIndexes}
                locked={saving}
                onPick={() => fileRef.current?.click()}
                onDropFiles={addFiles}
                onRemove={removeTile}
                onMove={media.move}
                onMoveTo={media.moveTo}
                onRetry={media.retry}
              />
            </div>
            {hint ? <p className="mt-1.5 text-[12px] text-fg-sub">{hint}</p> : null}
            {/* 실제로 잘린 장이 있을 때만, 굽기가 끝난 뒤에 — 진행 표시 안에 넣으면 0.5초 만에 사라져 아무도 못 읽는다 */}
            {croppedCount > 0 && channel === "instagram" && surface === "feed" ? (
              <p className="mt-1 text-[12px] text-fg-sub">
                사진 {croppedCount}장을 인스타그램 비율(4:5~1.91:1)에 맞춰 가운데를 기준으로 잘랐어요.
              </p>
            ) : null}
            {shownProblems.length > 0 ? (
              <ul className="mt-1.5 space-y-0.5" aria-live="polite">
                {shownProblems.map((p) => (
                  <li key={p.text} className={cn("text-[12px]", p.tone === "error" ? "text-negative-strong" : "text-warning-strong")}>
                    {p.text}
                  </li>
                ))}
              </ul>
            ) : null}
            <input ref={fileRef} type="file" accept={PICK_ACCEPT} multiple hidden disabled={saving} onChange={pickFiles} />

            {/* 인스타 전용 — 스토리·피드에도 보이기·커버 */}
            {channel === "instagram" && ((IG_STORY_ENABLED && tiles.length === 1) || surface === "reels" || canPickCover) ? (
              <div className="mt-3 space-y-2.5 rounded-card border border-line px-3.5 py-3">
                {IG_STORY_ENABLED && tiles.length === 1 ? (
                  <div className="flex items-center justify-between gap-3">
                    <span className="min-w-0 text-[14px] font-medium">스토리로 올리기</span>
                    <Switch checked={onStory} onChange={toggleStory} disabled={saving} label="스토리로 올리기" />
                  </div>
                ) : null}
                {surface === "reels" ? (
                  <div className="flex items-center justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block text-[14px] font-medium">피드에도 보이기</span>
                      <span className="block text-[12px] text-fg-sub">끄면 릴스 탭에만 올라가요.</span>
                    </span>
                    <Switch checked={shareToFeed} onChange={setShareToFeed} disabled={saving} label="피드에도 보이기" />
                  </div>
                ) : null}
                {canPickCover && single ? (
                  <div className="flex items-center justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block text-[14px] font-medium">커버</span>
                      <span className="block text-[12px] text-fg-sub">
                        {single.inspect?.decodable === false
                          ? single.thumbOffsetMs !== null
                            ? `${formatDurationKo(single.thumbOffsetMs)} 장면`
                            : "1초 장면(기본)"
                          : "타일에 보이는 장면이 커버예요"}
                      </span>
                    </span>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={single.cover?.state === "uploading"}
                      onClick={() => setCoverFor(single.key)}
                    >
                      <Clapperboard className="size-3.5" aria-hidden /> 커버 고르기
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          {/* 캡션 — 스토리에는 글이 올라가지 않는다 */}
          <div>
            <div className="flex items-center justify-between">
              <label htmlFor="pc-caption" className="text-[12px] font-medium text-fg-sub">
                {rules.textLabel}
              </label>
              {onStory ? null : (
                <span className={cn("tnum text-[12px]", caption.length > CAPTION_MAX ? "text-negative-strong" : "text-fg-sub")}>
                  {caption.length}/{CAPTION_MAX}
                </span>
              )}
            </div>
            <textarea
              id="pc-caption"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={5}
              maxLength={CAPTION_MAX}
              disabled={onStory || saving}
              placeholder={onStory ? "스토리에는 글이 올라가지 않아요." : "본문을 입력하세요.\n#해시태그 도 여기 함께 씁니다."}
              className={`${input} mt-1.5 resize-y py-2.5 leading-relaxed`}
            />
            {onStory ? <p className="mt-1 text-[12px] text-fg-sub">스토리에는 글이 올라가지 않아요.</p> : null}
          </div>

          {/* 발행 방식 — 셋 다 실제로 되는 것만 둔다(2026-09-09 «지금 발행» 개통) */}
          <div>
            <p className="text-[12px] font-medium text-fg-sub">발행 방식</p>
            <div className="mt-1.5 space-y-1.5" role="radiogroup" aria-label="발행 방식">
              <label
                className={cn(
                  "flex cursor-pointer flex-wrap items-center gap-2.5 rounded-card border px-3.5 py-2.5",
                  mode === "now" ? "border-2 border-primary" : "border-line hover:bg-tint-hover",
                )}
              >
                <input
                  type="radio"
                  name="pc-mode"
                  checked={mode === "now"}
                  onChange={() => setMode("now")}
                  disabled={saving}
                  className="size-4 accent-[var(--color-primary)]"
                />
                <span className="text-[15px] font-medium">지금 발행</span>
                <span className="w-full text-[12px] text-fg-sub">
                  누르면 바로 올리기 시작해요. 이 화면을 나가도 계속 올라가요. 영상은 처리하는 데 몇 분 걸릴 수 있어요.
                </span>
              </label>

              <label
                className={cn(
                  "flex cursor-pointer flex-wrap items-center gap-2.5 rounded-card border px-3.5 py-2.5",
                  mode === "schedule" ? "border-2 border-primary" : "border-line hover:bg-tint-hover",
                )}
              >
                <input
                  type="radio"
                  name="pc-mode"
                  checked={mode === "schedule"}
                  onChange={() => setMode("schedule")}
                  disabled={saving}
                  className="size-4 accent-[var(--color-primary)]"
                />
                <span className="text-[15px] font-medium">예약 발행</span>
                {mode === "schedule" ? (
                  <input
                    type="datetime-local"
                    min={earliestAt}
                    step={300}
                    value={when}
                    onChange={(e) => setWhen(e.target.value)}
                    disabled={saving}
                    aria-label="발행 시각"
                    className="tnum h-9 min-w-0 rounded-card border border-line bg-body px-2.5 text-[14px] text-fg focus:border-primary focus:outline-none"
                  />
                ) : null}
                <span className="w-full text-[12px] text-fg-sub">예약한 시각에 맞춰 올라가요. 영상은 처리 때문에 조금 늦을 수 있어요.</span>
              </label>

              <label
                className={cn(
                  "flex cursor-pointer items-center gap-2.5 rounded-card border px-3.5 py-2.5",
                  mode === "draft" ? "border-2 border-primary" : "border-line hover:bg-tint-hover",
                )}
              >
                <input
                  type="radio"
                  name="pc-mode"
                  checked={mode === "draft"}
                  onChange={() => setMode("draft")}
                  disabled={saving}
                  className="size-4 accent-[var(--color-primary)]"
                />
                <span className="text-[15px] font-medium">초안으로 저장</span>
                <span className="text-[12px] text-fg-sub">시각은 나중에 정해요.</span>
              </label>
            </div>
          </div>

          {error ? (
            <p role="alert" className="text-[14px] text-negative-strong">
              {error}
            </p>
          ) : null}
        </div>

        <div className="px-5 pb-5 pt-3">
          <Button className="w-full" disabled={!canSave} onClick={save}>
            {saving
              ? mode === "now"
                ? "시작하는 중…"
                : "저장 중…"
              : mode === "draft"
                ? "초안으로 저장"
                : mode === "now"
                  ? "지금 발행하기"
                  : "예약하기"}
          </Button>
          {/* 발행·저장 중 안내는 카드를 덮는 PublishingVeil 이 맡는다 — 여기 한 줄을 남기면 덮개 뒤에 흐리게 겹치고
              화면 읽기 프로그램이 두 문장을 같이 읽는다(2026-09-12 소넷 점검) */}
          {!saving && blockReason ? (
            <p className="mt-2 text-center text-[12px] text-fg-sub" aria-live="polite">
              {blockReason}
            </p>
          ) : null}
        </div>
      </div>
    </div>
    {/* 작성 화면의 **형제**로 둔다(뒤에 = 위에). 안쪽에 두면 카드의 transform 애니메이션·키 처리와 얽힌다 */}
    {coverTile ? (
      <CoverPicker
        tile={coverTile}
        story={onStory}
        onClose={() => setCoverFor(null)}
        onPick={(blob, ms) => media.replaceCover(coverTile.key, blob, ms)}
        onPickOffset={(ms) => media.setThumbOffset(coverTile.key, ms)}
      />
    ) : null}
    {confirmClose ? (
      <ConfirmDialog
        title="작성 중인 내용이 사라져요"
        description="닫으면 지금 쓴 글과 올린 사진·영상이 저장되지 않아요."
        confirmLabel="닫기"
        cancelLabel="계속 쓰기"
        onCancel={() => setConfirmClose(false)}
        onConfirm={() => {
          setConfirmClose(false);
          media.discardAll();
          onClose();
        }}
      />
    ) : null}
    </>
  );
}

/** "YYYY-MM-DDTHH:mm" → "9월 10일 09:00" — 결과 모달 문장용 */
function formatWhen(value: string): string {
  const [d, t] = value.split("T");
  if (!d || !t) return value;
  return `${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일 ${t}`;
}
