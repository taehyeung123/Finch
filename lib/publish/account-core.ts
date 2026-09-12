/**
 * 발행 글의 계정 규칙 — **입출력이 없는 순수 함수** (2026-09-12 계정 전환).
 *
 * 사장님 지적(2026-09-12): 연결된 인스타 계정을 바꾸면 목록에 옛 계정의 글이 섞여 보이고, 어느 글이 어느 계정 것인지 모른다.
 * 더 나쁘게는 A 가 연결돼 있을 때 예약한 글이 B 로 바꾼 뒤 B 로 올라갔다. 그래서 글마다 **대상 계정**을 적는다(0094):
 *
 *  · 대상 계정은 사용자가 «발행을 약속한 순간» 연결돼 있던 계정이다 — 새 글의 예약·지금 발행, 초안·실패 글의 예약하기·다시 예약,
 *    「지금 발행」. 초안은 아직 약속이 아니라 대상이 없다(목록은 지금 계정을 보여 준다 — 예약하면 거기로 간다).
 *  · 자동으로 도는 발행(크론)은 대상 계정을 **바꾸지 않는다.** 지금 연결된 계정이 대상과 다르면 올리지 않고 실패로 멈춘다
 *    (engine-core nextStep ⓪). 새 계정으로 올리려면 사용자가 다시 예약한다 — 그 순간 대상이 새 계정이 된다.
 *  · 대상이 비어 있는 옛 글은 지금 계정으로 나가고, 엔진이 그 계정을 적는다(예전과 같다).
 *  · 발행을 **시도한 뒤**의 글은 대상을 절대 바꾸지 않는다 — 이미 옛 계정에 올라갔을 수 있다(두 번 올리지 않기).
 *
 * 부르는 곳: 목록(page.tsx → postAccountView), 연동 콜백(isAccountSwitch), 엔진(targetAccountMismatch·afterPinMiss),
 * 백필 크론(classifyMediaRead — lib/publish/account-backfill.ts). Node 검사: scripts/test-publish-account.ts.
 * 이 파일은 런타임 import 가 없다(타입만) — Node 검사가 그대로 읽는다.
 */
import type { GraphFailure } from "../meta/publish-types";

/** «지금 계정이 아닌 이전 계정» — 옛 발행 글을 지금 토큰으로 읽지 못해 누구 것인지 못 밝혔다(백필). 실제 계정 id 와 겹치지 않는다 */
export const PREVIOUS_ACCOUNT_MARKER = "__previous__";

/** 지금 그 채널에 연결된 계정(connected=true) */
export interface CurrentAccount {
  platformUserId: string;
  handle: string | null;
}

const clean = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/**
 * connected_accounts 행들 → 채널별 «지금 연결된 계정»(connected=true 이고 계정 id 가 있는 것만).
 * 목록(page.tsx)과 진행 상황 조회(app/api/publish/progress)가 같은 규칙으로 계정 칩을 정하게 한 곳에 둔다.
 */
export function currentAccountMap(
  rows: ReadonlyArray<{ channel: string; handle: string | null; connected: boolean | null; platform_user_id: unknown }>,
): Map<string, CurrentAccount> {
  const out = new Map<string, CurrentAccount>();
  for (const r of rows) {
    const id = r.platform_user_id !== null && r.platform_user_id !== undefined ? String(r.platform_user_id).trim() : "";
    if (r.connected && id) out.set(r.channel, { platformUserId: id, handle: r.handle });
  }
  return out;
}

/** «@아이디» 비교용 — 앞의 @ 를 떼고 소문자로 */
export function handleKey(h: string | null | undefined): string {
  return (h ?? "").trim().replace(/^@+/, "").toLowerCase();
}

/** 메타가 준 아이디(@ 없음) → 화면용 «@아이디». 이상한 값이면 null */
export function toHandle(username: unknown): string | null {
  const u = clean(username);
  if (!u) return null;
  const bare = u.replace(/^@+/, "");
  /* 인스타·스레드 아이디는 영문·숫자·점·밑줄 30자 — 그 밖의 글자가 섞이면 원문을 믿지 않는다 */
  return /^[A-Za-z0-9._]{1,40}$/.test(bare) ? `@${bare}` : null;
}

/**
 * 재연결이 «다른 계정으로 바꾸기»인가. 옛 id 를 모르면(행이 없거나 비어 있으면) 바꾸기로 보지 않는다 —
 * 같은 계정 재연결은 아무것도 바꾸지 않는다.
 */
export function isAccountSwitch(prevId: unknown, nextId: unknown): boolean {
  const a = clean(typeof prevId === "number" ? String(prevId) : prevId);
  const b = clean(typeof nextId === "number" ? String(nextId) : nextId);
  return !!a && !!b && a !== b;
}

/**
 * 발행 시점 판정 — 글의 대상 계정이 적혀 있고, 지금 연결된 계정과 다르다.
 * 대상이 비어 있으면(옛 글) 다르지 않다 — 지금 계정으로 나간다. 이전 계정 표식도 «다르다»다(지금 계정의 것이 아니다).
 */
export function targetAccountMismatch(targetId: string | null | undefined, currentId: string): boolean {
  const t = clean(targetId);
  return t !== null && t !== currentId;
}

/**
 * 엔진이 대상이 빈 옛 글에 지금 계정을 «비어 있을 때만» 적었는데 **0행**이었다 — 다시 읽은 행으로 가른다(run.ts).
 *  · 행이 없거나 발행 중이 아니다 → 선점을 잃었다(다른 실행·취소·계정 전환 정리) — 손을 뗀다
 *  · 발행 중인데 대상이 적혀 있다 → 선점 뒤에 연동 콜백이 옛 계정을 적은 것이다(계정 전환). 그 대상으로 판정한다 —
 *    선점이 돌려준 사본(비어 있음)만 믿고 덮어쓰면 옛 계정 때 잡힌 글이 새 계정으로 나간다.
 */
export function afterPinMiss(
  fresh: { status?: unknown; account_platform_id?: unknown; account_handle?: unknown } | null,
): { kind: "conflict" } | { kind: "target"; id: string | null; handle: string | null } {
  if (!fresh || fresh.status !== "publishing") return { kind: "conflict" };
  return { kind: "target", id: clean(fresh.account_platform_id), handle: clean(fresh.account_handle) };
}

/** 목록에 보일 계정 — handle 이 null 이고 previous 도 false 면 칩을 그리지 않는다(모름) */
export interface PostAccountView {
  handle: string | null;
  /** 지금 그 채널에 연결된 계정이 아니다 — «@이전 · 이전 계정»으로 흐리게 */
  previous: boolean;
}

/**
 * 목록 한 줄의 계정.
 * @param current 지금 그 채널에 연결된 계정. null = 연결 없음, undefined = 연결 상태를 **확인하지 못했다**(모름 — 단정하지 않는다)
 *
 *  · 초안: 대상이 없다 — 지금 계정(예약하면 거기로 간다)
 *  · 이전 계정 표식: «이전 계정»(아이디를 알면 함께)
 *  · 대상이 적힌 글: 지금 계정과 같으면 지금 이름(그 사이 바꾼 이름), 다르면 적힌 이름 + «이전 계정»,
 *    연결이 없거나 모르면 적힌 이름만(«이전»이라고 단정하지 않는다)
 *  · 대상이 빈 옛 글: 아직 안 나간 것(예약·처리 중·실패)은 지금 계정(거기로 간다), 끝난 것(발행·취소)은 모름 — 백필이 채운다
 */
export function postAccountView(
  row: { status: string; account_platform_id?: string | null; account_handle?: string | null },
  current: CurrentAccount | null | undefined,
): PostAccountView {
  const target = clean(row.account_platform_id);
  const stamped = clean(row.account_handle);
  const none: PostAccountView = { handle: null, previous: false };
  if (row.status === "draft") return current ? { handle: clean(current.handle), previous: false } : none;
  if (target === PREVIOUS_ACCOUNT_MARKER) return { handle: stamped, previous: true };
  if (target) {
    if (current && current.platformUserId === target) return { handle: clean(current.handle) ?? stamped, previous: false };
    if (current) return { handle: stamped, previous: true };
    return { handle: stamped, previous: false };
  }
  if (row.status === "published" || row.status === "canceled") return none;
  return current ? { handle: clean(current.handle), previous: false } : none;
}

/* ══════════════════════════════════════════════════════════════════
   백필 — 옛 발행 글(대상 계정이 비어 있는 것)이 누구 것인지 지금 토큰으로 읽어 본다
   ══════════════════════════════════════════════════════════════════ */

/** GET /{media-id}?fields=username,permalink,owner 의 결과 */
export type MediaReadResult =
  | { ok: true; ownerId: string | null; username: string | null; permalink: string | null }
  | { ok: false; failure: GraphFailure };

export type OwnershipVerdict =
  /** 지금 계정의 글이다 — 지금 계정 id·이름을 적는다(링크가 비었으면 함께) */
  | { verdict: "current"; permalink: string | null }
  /** 지금 계정의 글이 아니다(못 읽음·없음, 또는 남의 공개 글로 읽힘) — 이전 계정 표식. 아이디를 알면 함께 */
  | { verdict: "previous"; handle: string | null }
  /** 이번엔 모른다 — afterMs 뒤에 다시 본다 */
  | { verdict: "retry"; afterMs: number }
  /** 토큰 자체가 안 된다 — 이 사용자의 나머지 글도 이번엔 보지 않는다 */
  | { verdict: "stop_user"; afterMs: number };

/** 일시 오류 뒤 다시 볼 간격 */
export const BACKFILL_RETRY_MS = 5 * 60_000;
/** 연결·토큰이 없거나 판정이 애매할 때 다시 볼 간격 */
export const BACKFILL_LONG_RETRY_MS = 24 * 3600_000;

/**
 * 읽은 결과 → 누구 것인가.
 *
 * 메타 문서(2026-09-12 확인):
 *  · 인스타(IG Media): owner — «앱 사용자가 만든 게시물일 때만 온다. 아니면 username 이 대신 온다».
 *  · 스레드(Threads Media): owner — «내가 가진 최상위 글에서만». 고급 접근 승인 뒤엔 남의 **공개 글도 읽힌다** —
 *    그래서 «읽혔다 = 내 글»이 아니다. owner 가 오면 내 글, 안 오면 아이디를 지금 계정 이름과 대조한다.
 *  · 없는 글·권한 없는 글: 100/33(«그런 개체가 없거나 권한이 없다»)·권한 코드(10·200~299)·404 → 이전 계정 표식.
 *    ⚠️ 지금 계정에서 **지운** 글도 같은 답이 온다 — 구별할 방법이 없어 «이전 계정»으로 적힌다(docs/PUBLISH_VIDEO_PLAN.md).
 *  · 토큰 오류(190) → 이 사용자는 멈춘다. 한도·5xx·네트워크·시간 초과·1·2 → 잠시 뒤 다시.
 *  · 그 밖의 400(모르는 이유) → 표식을 영구히 박지 않고 하루 뒤 다시 본다 — 필드 이름 하나가 틀려서 모든 글이
 *    «이전 계정»으로 굳는 것을 막는다.
 */
export function classifyMediaRead(r: MediaReadResult, currentHandle: string | null): OwnershipVerdict {
  if (r.ok) {
    if (r.ownerId) return { verdict: "current", permalink: r.permalink };
    if (r.username) {
      if (currentHandle && handleKey(r.username) === handleKey(currentHandle)) return { verdict: "current", permalink: r.permalink };
      return { verdict: "previous", handle: toHandle(r.username) };
    }
    return { verdict: "retry", afterMs: BACKFILL_LONG_RETRY_MS };
  }
  const f = r.failure;
  if (f.kind === "network" || f.kind === "timeout" || f.kind === "budget") return { verdict: "retry", afterMs: BACKFILL_RETRY_MS };
  const code = f.code;
  if (code === 190) return { verdict: "stop_user", afterMs: BACKFILL_LONG_RETRY_MS };
  if (code === 4 || code === 17 || code === 32 || code === 613 || code === 80002 || code === 1 || code === 2) {
    return { verdict: "retry", afterMs: BACKFILL_RETRY_MS };
  }
  if ((f.httpStatus ?? 0) >= 500) return { verdict: "retry", afterMs: BACKFILL_RETRY_MS };
  if ((code === 100 && f.subcode === 33) || code === 10 || (code !== null && code >= 200 && code <= 299) || f.httpStatus === 404) {
    return { verdict: "previous", handle: null };
  }
  return { verdict: "retry", afterMs: BACKFILL_LONG_RETRY_MS };
}
