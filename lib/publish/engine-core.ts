/**
 * 발행 엔진의 판단부 — **입출력이 없는 순수 함수** (2026-09-11 영상 발행).
 *
 * 영상은 메타가 뒤에서 처리한다(몇 초~몇 분). 요청 하나 안에서 끝까지 기다리던 옛 방식은 영상에서 성립하지 않아,
 * 한 게시물이 여러 번의 실행(「지금 발행」·5분 크론·매분 크론)에 걸쳐 나아간다. 매 걸음의 «다음에 무엇을 할지»를
 * 여기 nextStep 한 곳이 정하고, lib/publish/run.ts 는 그 걸음을 실행(메타 호출·DB 기록)만 한다.
 * 그래서 가장 위험한 판단 — **두 번 올리지 않기** — 를 Node 검사(scripts/test-publish-engine.ts)가 표로 증명한다.
 *
 * 두 번 올리지 않기의 원칙:
 *  ① 발행 호출(media_publish·threads_publish) **전에** publish_attempted_at·publish_calls 를 DB 에 먼저 적는다(run.ts).
 *     그 기록이 없으면 호출하지 않는다.
 *  ② 한 번이라도 발행을 시도한 행은 다시 부르기 전에 반드시 «이미 올라갔나»를 본다 — 준비물 상태가 PUBLISHED 이거나
 *     최근 게시물 목록에서 찾으면 기록만 한다. 못 찾아도 5분은 기다린다(메타 쪽 반영이 늦을 수 있다).
 *  ③ 발행 호출은 게시물당 최대 2번. 그 뒤에도 모르면 «확인하지 못했어요»로 멈춘다(사람이 본다).
 *  ④ 시도한 행은 준비물을 버리고 새로 만들지 않는다(reset 금지) — 새 준비물은 새 게시물이 된다.
 *
 * 처리 창(2026-09-12 점검 수리): 처리 마감(processing_deadline)은 준비물의 것이 아니라 **이번 시도**의 것이다.
 *  · 마감을 넘겨 실패하면(PROCESSING_TIMEOUT) 준비물은 남기고 마감만 비운다 — «다시 시도»가 새 창을 연다(run.ts).
 *    늦게라도 끝난 준비물은 그대로 올라가고(파일을 다시 받아 가지 않는다), 아직 처리 중이면 새 창 동안 기다린다.
 *    예전엔 옛 마감이 그대로 남아 «다시 시도»가 상태를 한 번 읽고 곧바로 또 실패했다 — 23시간 동안 다시 시도가 안 됐다.
 *  · 다시 연 창(deadlineExtended)마저 넘기면 그 준비물은 메타 쪽에서 멈춘 것으로 보고 버린다 — 다음 시도가 새로 만든다.
 *  · 준비가 끝났는데 발행 호출이 «잠시 뒤에»로 거절되는 경우도 끝이 있다(publishRetryEndMs) — 매분 끝없이 부르지 않는다.
 *
 * 대상 계정(2026-09-12 계정 전환, 0094): 글에는 «발행을 약속한 순간 연결돼 있던 계정»이 적혀 있다(lib/publish/account-core.ts).
 *  · 지금 연결된 계정이 그 계정이 아니면(targetMismatch) **무엇보다 먼저** 멈춘다 — 그 토큰으로는 만들기·상태 읽기·찾아보기·발행
 *    어느 것도 부르지 않는다. 남의 계정 토큰으로 «이미 올라갔나»를 찾아보면 같은 글을 가진 새 계정 게시물을 우리 것으로 착각한다.
 *  · 시도 전이면 «계정이 바뀌었어요»(다시 예약하면 새 계정으로 간다), 시도 뒤면 «올라갔는지 모름»(옛 계정에 올라갔을 수 있다) — run.ts.
 *  · ownerMismatch(준비물을 만든 계정 ≠ 지금 계정)는 대상이 비어 있던 옛 글·다시 예약으로 대상이 바뀐 글의 이야기다 — 준비물만 새로 만든다.
 *
 * 이 파일은 런타임 import 가 없다 — Node 검사가 그대로 읽는다.
 */
import type { ContainerStatus } from "../meta/publish-types";

export type EngineSource = "now" | "due" | "prepare" | "check";

/** 발행 시도 뒤 «못 찾음»을 믿기 전에 기다리는 시간 */
export const LOOKUP_GRACE_MS = 5 * 60_000;
/** 게시물당 발행 호출 상한 */
export const MAX_PUBLISH_CALLS = 2;
/** 메타 준비물 수명은 24시간 — 23시간이 넘으면 새로 만든다(시도 전일 때만) */
export const CONTAINER_MAX_AGE_MS = 23 * 3600_000;
/** 처리 중인 행을 다시 볼 간격 — 메타 권고 «1분마다» */
export const POLL_INTERVAL_MS = 60_000;
/** 이보다 적게 남았으면 발행 호출을 시작하지 않는다 — 도중에 끊긴 발행은 «모름»이 된다 */
export const PUBLISH_MIN_REMAINING_MS = 15_000;
/** 발행을 시도한 뒤 상태를 끝내 못 읽으면 이만큼 지나 «확인하지 못했어요»로 멈춘다 */
export const ATTEMPT_GIVE_UP_MS = 30 * 60_000;
/** 같은 게시물의 준비물 묶음을 24시간에 몇 번까지 새로 만드나 — 만들 때마다 메타가 파일을 다시 받아 간다(전송 비용) */
export const CONTAINER_SETS_PER_DAY = 3;
/** 준비가 끝난 준비물의 발행 호출이 «잠시 뒤에»(일시 오류·아직 처리 중)로 거절될 때, 처리 마감과 발행 시각 중 늦은 쪽부터
    이만큼까지만 다시 부른다. 메타 권고는 «30초~2분 안에 1~2번»(2207008) — 매분 확인하는 우리 주기로 넉넉히 잡는다 */
export const PUBLISH_RETRY_MS = 15 * 60_000;

export interface EngineFacts {
  source: EngineSource;
  nowMs: number;
  /** 이 시각 전엔 발행하지 않는다(예약 시각 — 「지금 발행」은 누른 시각) */
  publishAfterMs: number;
  /** 항목이 2개 이상 — 아이템 준비물을 먼저 만들고 묶는다 */
  carousel: boolean;
  childIds: string[] | null;
  /** 이번 걸음에서 읽은 아이템 상태 — null = 아직 안 읽음 */
  childStates: ContainerStatus[] | null;
  /** 단일 준비물 또는 캐러셀 부모 */
  containerId: string | null;
  /** 이번 걸음에서 읽은 상태 — null = 아직 안 읽음 */
  containerState: ContainerStatus | null;
  containerCreatedAtMs: number | null;
  /** 처리 마감 — 넘으면 «너무 오래 걸려요» */
  deadlineMs: number | null;
  /** 이 마감이 «다시 시도»가 다시 연 창이다(isExtendedDeadline) — 이 창마저 넘기면 준비물을 버린다 */
  deadlineExtended: boolean;
  publishAttemptedAtMs: number | null;
  publishCalls: number;
  /** 최근 게시물에서 찾았나 — null = 아직 안 찾아봄 */
  lookup: "found" | "not_found" | null;
  /** 준비물을 만든 계정과 지금 연결된 계정이 다르다(재연동) */
  ownerMismatch: boolean;
  /** 글의 대상 계정(account_platform_id)이 적혀 있고 지금 연결된 계정과 다르다(계정 전환) — account-core targetAccountMismatch */
  targetMismatch: boolean;
  /** 이번 실행에 남은 시간 */
  remainingMs: number;
}

export type WaitReason = "processing" | "not_before" | "lookup_grace" | "budget";

export type EngineStep =
  | { do: "create_children" }
  | { do: "check_children" }
  | { do: "create_container" }
  | { do: "check_container" }
  | { do: "lookup" }
  | { do: "publish" }
  | { do: "record_published" }
  | { do: "wait"; untilMs: number; reason: WaitReason }
  | { do: "reset" }
  | { do: "fail"; code: "PUBLISH_AMBIGUOUS" | "PROCESSING_TIMEOUT" | "LOST" | "CONTAINER_ERROR" | "ACCOUNT_SWITCHED"; recreate: boolean };

function hasContainers(f: EngineFacts): boolean {
  return f.containerId !== null || (f.childIds !== null && f.childIds.length > 0);
}

/**
 * 다음 걸음. 순서가 곧 우선순위다 — «계정이 맞나» 다음으로 «이미 시도했나»가 먼저다.
 */
export function nextStep(f: EngineFacts): EngineStep {
  const later = (reason: WaitReason, untilMs: number): EngineStep => ({ do: "wait", untilMs, reason });

  /* ⓪ 대상 계정이 아닌 계정이 연결돼 있다 — 메타를 한 번도 부르지 않고 멈춘다(머리말 «대상 계정»).
     준비물은 버리지 않는다(recreate=false): 옛 계정을 다시 연결하면 그대로 이어지고, 다시 예약해 대상이 바뀌면 ownerMismatch 가 새로 만든다.
     시도한 행이면 run.ts 가 «올라갔는지 모름»으로 적는다 — 시도 기록도 지우지 않는다(두 번 올리지 않기). */
  if (f.targetMismatch) return { do: "fail", code: "ACCOUNT_SWITCHED", recreate: false };

  /* ① 발행을 시도한 적이 있다 — 두 번 올리지 않기 */
  if (f.publishAttemptedAtMs !== null) {
    if (!f.containerId) return { do: "fail", code: "PUBLISH_AMBIGUOUS", recreate: false };
    if (f.containerState === null) return { do: "check_container" };
    if (f.containerState === "PUBLISHED") return { do: "record_published" };
    if (f.lookup === null) return { do: "lookup" };
    if (f.lookup === "found") return { do: "record_published" };
    /* 못 찾았다 — 메타 쪽 반영이 늦을 수 있으니 유예 동안은 기다린다 */
    const graceEnd = f.publishAttemptedAtMs + LOOKUP_GRACE_MS;
    if (f.nowMs < graceEnd) return later("lookup_grace", Math.min(graceEnd, f.nowMs + POLL_INTERVAL_MS));
    if (f.publishCalls >= MAX_PUBLISH_CALLS) return { do: "fail", code: "PUBLISH_AMBIGUOUS", recreate: false };
    if (f.containerState === "UNKNOWN" || f.containerState === "IN_PROGRESS") {
      /* 상태를 못 읽었거나 아직 처리 중 — 조금 더 본다. 너무 오래면 모르는 채로 멈춘다 */
      if (f.nowMs - f.publishAttemptedAtMs > ATTEMPT_GIVE_UP_MS) return { do: "fail", code: "PUBLISH_AMBIGUOUS", recreate: false };
      return later("processing", f.nowMs + POLL_INTERVAL_MS);
    }
    /* 준비물이 «발행 가능»인데 올라간 흔적이 없다 — 첫 호출은 실패했던 것이다. ERROR·EXPIRED 면 모른다. */
    if (f.containerState !== "FINISHED") return { do: "fail", code: "PUBLISH_AMBIGUOUS", recreate: false };
    /* → 아래 ③ 발행 관문(두 번째 호출) */
  } else {
    /* ② 아직 시도 전 */
    if (f.source === "check" && !hasContainers(f)) return { do: "fail", code: "LOST", recreate: true };
    if (hasContainers(f) && f.ownerMismatch) return { do: "reset" };
    if (hasContainers(f) && f.containerCreatedAtMs !== null && f.nowMs - f.containerCreatedAtMs > CONTAINER_MAX_AGE_MS) {
      return { do: "reset" };
    }
    if (f.carousel && !f.containerId) {
      if (!f.childIds || f.childIds.length === 0) return { do: "create_children" };
      if (f.childStates === null) return { do: "check_children" };
      if (f.childStates.some((s) => s === "ERROR")) return { do: "fail", code: "CONTAINER_ERROR", recreate: true };
      if (f.childStates.some((s) => s === "EXPIRED")) return { do: "reset" };
      if (f.childStates.every((s) => s === "FINISHED" || s === "PUBLISHED")) return { do: "create_container" };
      if (f.deadlineMs !== null && f.nowMs > f.deadlineMs) return { do: "fail", code: "PROCESSING_TIMEOUT", recreate: f.deadlineExtended };
      return later("processing", f.nowMs + POLL_INTERVAL_MS);
    }
    if (!f.containerId) return { do: "create_container" };
    if (f.containerState === null) return { do: "check_container" };
    switch (f.containerState) {
      case "PUBLISHED":
        /* 시도 기록 없이 올라가 있다 — 기록이 유실된 경우다. 절대 다시 부르지 않는다 */
        return { do: "record_published" };
      case "ERROR":
        return { do: "fail", code: "CONTAINER_ERROR", recreate: true };
      case "EXPIRED":
        return { do: "reset" };
      case "IN_PROGRESS":
      case "UNKNOWN":
        /* 첫 창이면 준비물을 남긴다(늦게 끝나면 «다시 시도»가 그대로 올린다), 다시 연 창이면 버린다 — 머리말 «처리 창» */
        if (f.deadlineMs !== null && f.nowMs > f.deadlineMs) return { do: "fail", code: "PROCESSING_TIMEOUT", recreate: f.deadlineExtended };
        return later("processing", f.nowMs + POLL_INTERVAL_MS);
      case "FINISHED":
        break;
    }
  }

  /* ③ 발행 관문 — 준비물은 «발행 가능» */
  if (f.source === "prepare") {
    /* 미리 만들기는 절대 발행하지 않는다 — 예약 시각에 매분 크론이 이어받는다 */
    return later("not_before", Math.max(f.publishAfterMs, f.nowMs + POLL_INTERVAL_MS));
  }
  if (f.publishAfterMs > f.nowMs) return later("not_before", f.publishAfterMs);
  if (f.remainingMs < PUBLISH_MIN_REMAINING_MS) return later("budget", f.nowMs + 15_000);
  return { do: "publish" };
}

/**
 * 처리 마감 — 준비물을 처음 만든 시각 기준. 사진만이면 10분, 영상은 20분 + 영상 1분당 2분(최대 60분).
 * 메타는 처리 시간을 약속하지 않는다(«1분마다, 5분까지» 확인 권고) — 15분 릴스가 5분 안에 끝난다는 보장이 없어 넉넉히 잡는다.
 * S0 실측으로 조정한다(docs/PUBLISH_VIDEO_PLAN.md).
 */
export function processingDeadlineFor(createdAtMs: number, items: Array<{ kind: string; durationMs?: number | null }>): number {
  const videos = items.filter((i) => i.kind === "video");
  if (videos.length === 0) return createdAtMs + 10 * 60_000;
  const totalMin = videos.reduce((n, v) => n + (v.durationMs ?? 60_000), 0) / 60_000;
  return createdAtMs + Math.min(60, 20 + Math.ceil(totalMin * 2)) * 60_000;
}

/**
 * 지금 마감이 준비물을 만들 때 정한 첫 창보다 늦다 — «다시 시도»(또는 회수)가 다시 연 창이다.
 * 첫 창은 processingDeadlineFor(만든 시각)과 정확히 같다(run.ts 가 만들 때 그 값을 적는다). 모르면 false(첫 창으로 본다).
 */
export function isExtendedDeadline(
  createdAtMs: number | null,
  deadlineMs: number | null,
  items: Array<{ kind: string; durationMs?: number | null }>,
): boolean {
  if (createdAtMs === null || deadlineMs === null) return false;
  return deadlineMs > processingDeadlineFor(createdAtMs, items);
}

/**
 * 준비가 끝난 준비물의 발행 호출이 «잠시 뒤에»로 거절될 때 다시 부를 수 있는 끝 — 처리 마감과 발행 시각 중 늦은 쪽 + 15분.
 * 발행 시각을 함께 보는 이유: 미리 만든 예약 영상은 마감이 예약 시각 무렵에 이미 지나 있을 수 있다(20분 전에 만든다).
 */
export function publishRetryEndMs(deadlineMs: number | null, publishAfterMs: number): number {
  return Math.max(deadlineMs ?? publishAfterMs, publishAfterMs) + PUBLISH_RETRY_MS;
}

/**
 * 게시물당 준비물 묶음 예산 — 24시간 창 안에서 CONTAINER_SETS_PER_DAY 번까지.
 * 반환 allowed=false 면 만들지 않는다. 창이 지났으면 새 창을 연다.
 */
export function containerWindow(
  nowMs: number,
  windowAtMs: number | null,
  count: number,
): { allowed: boolean; windowAtMs: number; count: number } {
  if (windowAtMs === null || nowMs - windowAtMs >= 24 * 3600_000) return { allowed: true, windowAtMs: nowMs, count: 1 };
  if (count >= CONTAINER_SETS_PER_DAY) return { allowed: false, windowAtMs, count };
  return { allowed: true, windowAtMs, count: count + 1 };
}

/** 글 비교용 정규화 — 공백을 한 칸으로, 앞 120자 */
export function captionKey(s: string | null | undefined): string {
  return (s ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
}

/**
 * «이미 올라갔나» — 발행을 시도한 시각 2분 전 이후에 올라온 게시물 중 글이 같은 것.
 * 글이 비어 있으면(스토리·글 없는 스레드) 판정하지 않는다(null) — 남이 올린 것을 우리 것으로 착각하면
 * 안 올라간 글을 «발행됨»으로 적는다.
 */
export function matchRecentMedia<T extends { id: string; caption: string | null; timestamp: string | null }>(
  recent: T[],
  opts: { sinceMs: number; caption: string },
): T | null {
  const key = captionKey(opts.caption);
  if (!key) return null;
  for (const m of recent) {
    const at = m.timestamp ? Date.parse(m.timestamp) : NaN;
    if (!Number.isFinite(at) || at < opts.sinceMs - 120_000) continue;
    if (captionKey(m.caption) === key) return m;
  }
  return null;
}
