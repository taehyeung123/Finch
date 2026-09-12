/**
 * 발행 목록의 «진행 상황» 판단 — **입출력이 없는 순수 함수** (2026-09-12 비동기 「지금 발행」).
 *
 * 사장님 지시(2026-09-12): «발행 중일 때 나가면 발행 취소되냐? 차라리 발행 누르면 오른쪽 발행 기록에 로딩중·업로드중이 뜨게 하고
 * 나가도 괜찮은 걸로.» 그래서 「지금 발행」은 글을 만들고 선점한 뒤 **바로 돌아온다** — 메타에 올리는 일은 응답 뒤(after)에
 * 서버가 이어서 한다(publish/actions.ts 머리말). 화면은 목록 한 줄이 «올리는 중»을 그리고, 끝날 때까지 가벼운 조회로 따라 본다.
 *
 * 여기서 정하는 것:
 *  · 무엇을 따라 보나(watchIds) — 올리는 중·처리 중인 글 + 예약 시각이 막 지난 글(크론이 5분 안에 집는다)
 *  · 얼마나 자주(pollDelayMs) — 올리는 중·처리 중이면 4초(사장님 지시 «4초쯤»). 예약 시각이 막 지난 글만 남았거나 멈춘 것 같은 실행뿐이면 10초
 *    (크론이 5분마다·회수는 10분 뒤라 더 자주 봐도 소용없다)
 *  · 새로 받은 값을 어떻게 합치나(mergeProgress) — 서명 썸네일은 다시 만들지 않는다(조회가 가벼우려고, 사진이 다시 불러와지지 않게)
 *  · 무엇이 «방금 끝났나»(settledPosts) — 화면에 있는 동안 끝난 글을 한 번 알린다
 *  · «방금 시작»·«3분째»(elapsedLabel), «생각보다 오래 걸려요»(stalled)
 *
 * 이 파일은 런타임 import 가 없다(타입만) — Node 검사(scripts/test-publish-progress.ts)가 그대로 읽는다.
 */
import type { PublishListItem } from "../types";

/** 올리는 중·처리 중 — 사진은 보통 몇 초~십몇 초면 끝나고, 처리 중은 매분 크론이 끝내는 순간을 곧바로 보여 준다 */
export const PROGRESS_FAST_MS = 4_000;
/** 예약 시각이 막 지난 글(5분 크론이 집는다)·멈춘 것 같은 실행(10분 뒤 회수)만 남았을 때 */
export const PROGRESS_SLOW_MS = 10_000;
/**
 * 이보다 오래 publishing 이면 그 실행은 죽었을 가능성이 크다 — 「지금 발행」은 /publish maxDuration(120초) 안에서,
 * 크론은 한 건 90초 안에서 끝난다. 죽은 실행이 남긴 행은 5분 크론이 10분 뒤 회수한다(publish-scheduled ① 회수).
 */
export const STALLED_AFTER_MS = 3 * 60_000;
/** 예약 시각이 지난 뒤 이 시간 동안은 목록이 따라 본다 — 5분 크론이 집어 올리는 모습이 화면에 그대로 보이게 */
export const DUE_WATCH_MS = 10 * 60_000;
/** 한 번에 물어볼 글 수 상한 — 조회 라우트도 같은 값으로 자른다 */
export const MAX_WATCH = 50;

type Item = PublishListItem;

const ms = (iso: string | null | undefined): number => (iso ? Date.parse(iso) : NaN);

/** 지금 진행 중으로 **보이는** 글 — 미리 준비 중인 예약 영상(processing 이지만 «예약됨»으로 보임)은 아니다 */
export function inProgress(p: Pick<Item, "display_status">): boolean {
  return p.display_status === "publishing" || p.display_status === "processing";
}

/** 예약 시각이 막 지났다(또는 곧이다) — 크론이 곧 집는다. «예약됨»으로 보이는 것만(미리 준비 중인 영상 포함) */
export function dueNow(p: Pick<Item, "display_status" | "status" | "scheduled_at">, nowMs: number): boolean {
  if (p.display_status !== "scheduled") return false;
  if (p.status !== "scheduled" && p.status !== "processing") return false;
  const at = ms(p.scheduled_at);
  return Number.isFinite(at) && at <= nowMs + 60_000 && at >= nowMs - DUE_WATCH_MS;
}

/** 따라 볼 글 id — 진행 중인 것이 먼저, 상한 MAX_WATCH */
export function watchIds(items: ReadonlyArray<Item>, nowMs: number, exclude?: ReadonlySet<string>): string[] {
  const busy: string[] = [];
  const due: string[] = [];
  for (const p of items) {
    if (exclude?.has(p.id)) continue;
    if (inProgress(p)) busy.push(p.id);
    else if (dueNow(p, nowMs)) due.push(p.id);
  }
  return [...busy, ...due].slice(0, MAX_WATCH);
}

/**
 * 다음에 «예약 시각이 막 지남» 창(dueNow)에 들어올 시각 — 한 시간 안의 것만. 목록이 그때 한 번 깨어나 따라 보기 시작한다
 * (그 전엔 아무것도 묻지 않는다 — 타이머 하나뿐이다). 없으면 null.
 */
export function nextWatchAt(items: ReadonlyArray<Item>, nowMs: number): number | null {
  let best: number | null = null;
  for (const p of items) {
    if (p.display_status !== "scheduled" || (p.status !== "scheduled" && p.status !== "processing")) continue;
    const enter = ms(p.scheduled_at) - 60_000;
    if (!Number.isFinite(enter) || enter <= nowMs || enter - nowMs > 3600_000) continue;
    if (best === null || enter < best) best = enter;
  }
  return best;
}

/**
 * 이 글의 이번 실행이 멈춘 것 같다 — publishing 인데 선점한 지 STALLED_AFTER_MS 가 지났다.
 * 선점 시각을 모르면(옛 행) 발행 시각으로 본다.
 */
export function stalled(p: Pick<Item, "status" | "run_started_at" | "progress_since">, nowMs: number): boolean {
  if (p.status !== "publishing") return false;
  const since = ms(p.run_started_at ?? p.progress_since);
  return Number.isFinite(since) && nowMs - since > STALLED_AFTER_MS;
}

/** 다음 조회까지 — 올리는 중(멈추지 않은)·처리 중인 글이 있으면 빠르게, 아니면 느리게 */
export function pollDelayMs(items: ReadonlyArray<Item>, nowMs: number): number {
  for (const p of items) {
    if (p.display_status === "processing") return PROGRESS_FAST_MS;
    if (p.status === "publishing" && !stalled(p, nowMs)) return PROGRESS_FAST_MS;
  }
  return PROGRESS_SLOW_MS;
}

/**
 * 조회 결과를 목록에 합친다 — id 로 바꿔 끼우고, 조회가 서명하지 않은 썸네일(null)은 원래 것을 둔다.
 * 목록에 없는 글은 더하지 않는다(조회는 이미 보이는 글만 묻는다). 바뀐 게 없으면 **같은 배열**을 돌려준다(쓸데없는 다시 그리기 방지).
 */
export function mergeProgress(prev: ReadonlyArray<Item>, fresh: ReadonlyArray<Item>): Item[] {
  if (fresh.length === 0) return prev as Item[];
  const byId = new Map(fresh.map((f) => [f.id, f]));
  let changed = false;
  const next = prev.map((p) => {
    const f = byId.get(p.id);
    if (!f) return p;
    const merged: Item = f.thumb_url === null && p.thumb_url !== null ? { ...f, thumb_url: p.thumb_url } : f;
    if (!changed && !sameItem(p, merged)) changed = true;
    return merged;
  });
  return changed ? next : (prev as Item[]);
}

function sameItem(a: Item, b: Item): boolean {
  for (const k of Object.keys(b) as Array<keyof Item>) {
    if (a[k] !== b[k]) return false;
  }
  return true;
}

export type SettledOutcome = "published" | "failed" | "released";

export interface Settled {
  post: Item;
  outcome: SettledOutcome;
}

/**
 * 따라 보던 글 중 **방금 끝난 것**. prev 에서 진행 중(또는 예약 시각이 막 지남)이던 글이 next 에서
 *  · published → 올라갔다 / failed → 못 올렸다
 *  · 진행 중이던 글이 다시 «예약됨»(status scheduled) → 이번엔 못 했고 크론이 곧 다시 한다(엔진 released)
 * 취소(canceled)는 사람이 한 일이라 알리지 않는다. 처리 중으로 넘어간 것은 아직 진행 중이다.
 */
export function settledPosts(prev: ReadonlyArray<Item>, next: ReadonlyArray<Item>, nowMs: number): Settled[] {
  const before = new Map(prev.map((p) => [p.id, p]));
  const out: Settled[] = [];
  for (const n of next) {
    const p = before.get(n.id);
    if (!p) continue;
    const busy = inProgress(p);
    if (!busy && !dueNow(p, nowMs)) continue;
    if (n.status === "published" && p.status !== "published") out.push({ post: n, outcome: "published" });
    else if (n.status === "failed" && p.status !== "failed") out.push({ post: n, outcome: "failed" });
    else if (busy && n.status === "scheduled" && n.display_status === "scheduled") out.push({ post: n, outcome: "released" });
  }
  return out;
}

/** «방금 시작» / «3분째» — 모르거나 시계가 어긋나 미래면 «방금 시작» */
export function elapsedLabel(sinceIso: string | null | undefined, nowMs: number): string {
  const since = ms(sinceIso);
  if (!Number.isFinite(since)) return "방금 시작";
  const min = Math.floor((nowMs - since) / 60_000);
  if (min < 1) return "방금 시작";
  if (min < 60) return `${min}분째`;
  const h = Math.floor(min / 60);
  return `${h}시간째`;
}

/**
 * 진행 중인 글을 맨 위로 — 나머지 순서는 그대로(서버 순서). 「지금 발행」한 글이 미래 예약들 밑에 묻히지 않게.
 * 바꿀 게 없으면 같은 배열을 돌려준다.
 */
export function pinInProgress<T extends Pick<Item, "display_status">>(list: ReadonlyArray<T>): T[] {
  if (!list.some(inProgress)) return list as T[];
  return [...list.filter(inProgress), ...list.filter((p) => !inProgress(p))];
}

/** 「지금 발행」을 누른 순간의 낙관적 모습 — 서버 응답(목록 다시 그리기)이 오면 서버 값으로 덮인다 */
export function markPublishing(p: Item, nowIso: string): Item {
  return {
    ...p,
    status: "publishing",
    display_status: "publishing",
    can_cancel: false,
    error: null,
    progress_since: nowIso,
    run_started_at: nowIso,
  };
}
