/* 연동 토큰 암호문을 풀어 메타에 묻는다 — 서버 밖으로 나가면 안 된다 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptToken } from "@/lib/crypto/tokens";
import { Deadline } from "@/lib/meta/deadline";
import { GRAPH_INSTAGRAM_BASE, GRAPH_THREADS_BASE } from "@/lib/meta/graph";
import { graphCall } from "@/lib/meta/instagram-publish";
import {
  BACKFILL_LONG_RETRY_MS,
  PREVIOUS_ACCOUNT_MARKER,
  classifyMediaRead,
  type CurrentAccount,
  type MediaReadResult,
} from "@/lib/publish/account-core";
import { safePermalink } from "@/lib/publish/list-item";

/*
  옛 발행 글의 계정 백필 (2026-09-12 계정 전환, 0094).

  0094 전에 올라간 글에는 «어느 계정으로 올렸는지»가 없다. 매분 크론(app/api/cron/publish-processing)이 본 작업(처리 중 글)을
  끝내고 **남는 시간에만** 10건씩 채운다 — 본 작업이 밀린 회차에는 하지 않는다.

   · 준비물을 만든 계정(container_owner_id, 0093)이 있으면 그것이 곧 올린 계정이다 — 메타에 묻지 않고 적는다.
   · 없으면 지금 연결된 계정의 토큰으로 GET /{게시물 id}?fields=username,permalink,owner 를 읽는다
     (인스타 graph.instagram.com · 스레드 graph.threads.net — 필드 이름은 두 문서 모두 2026-09-12 확인).
     판정은 account-core classifyMediaRead: 내 글 → 지금 계정 · 못 읽음/없음 → 이전 계정 표식('__previous__') ·
     일시 오류 → account_check_after 로 미뤄 두고 다음에 · 토큰 오류 → 이 사용자는 하루 뒤.
   · 연결이 없거나 토큰이 만료된 사용자는 하루 뒤 다시 본다(다시 연결하면 그때 채운다).
  모든 쓰기는 «아직 비어 있을 때만»(account_platform_id is null) — 그 사이 연동 콜백·엔진이 적었으면 건드리지 않는다.
  토큰 암호문은 admin + user_id 로만 읽는다(0085). 칸을 적는다(select("*") 금지).
*/

interface BackfillRow {
  id: string;
  user_id: string;
  channel: string;
  ig_media_id: string;
  permalink: string | null;
  container_owner_id: string | null;
}

export interface BackfillTally {
  checked: number;
  current: number;
  previous: number;
  later: number;
}

/** 호출 하나의 상한 — 남는 시간에 도는 일이라 짧게 */
const PER_CALL_MS = 6_000;
/** 이보다 적게 남았으면 새로 묻지 않는다 */
const MIN_LEFT_MS = 2_500;
/** 게시물 id 는 메타가 준 숫자·영문 — 그 밖의 값은 주소에 싣지 않는다 */
const MEDIA_ID_RE = /^[0-9A-Za-z_]{1,64}$/;
/** 모양이 망가진 게시물 id — 다시 볼 이유가 거의 없다 */
const BROKEN_RETRY_MS = 30 * 24 * 3600_000;

async function readMedia(channel: string, mediaId: string, token: string, d: Deadline): Promise<MediaReadResult> {
  const slicer = {
    slice: () => {
      const s = d.slice();
      return s === null ? null : Math.min(s, PER_CALL_MS);
    },
  };
  const base = channel === "threads" ? GRAPH_THREADS_BASE : GRAPH_INSTAGRAM_BASE;
  const r = await graphCall<{ username?: unknown; permalink?: unknown; owner?: unknown }>(
    base,
    "GET",
    `/${mediaId}`,
    token,
    { fields: "username,permalink,owner" },
    slicer,
  );
  if (!r.ok) return { ok: false, failure: r.failure };
  const owner = r.data.owner;
  const ownerRaw =
    owner && typeof owner === "object" && "id" in owner ? (owner as { id?: unknown }).id : typeof owner === "string" ? owner : null;
  const ownerId = typeof ownerRaw === "string" || typeof ownerRaw === "number" ? String(ownerRaw) : null;
  return {
    ok: true,
    ownerId: ownerId || null,
    username: typeof r.data.username === "string" ? r.data.username : null,
    permalink: typeof r.data.permalink === "string" ? r.data.permalink : null,
  };
}

/**
 * 남는 시간에 옛 발행 글 몇 건의 계정을 채운다. **예외를 던지지 않는다**(호출측도 감싸지만 두 겹으로).
 * @param opts.budgetMs 이 호출이 쓸 시간 — 크론의 남은 시간 안이어야 한다
 * @param opts.limit    한 번에 볼 글 수
 */
export async function backfillPostAccounts(
  admin: SupabaseClient,
  opts: { budgetMs: number; limit: number },
): Promise<BackfillTally> {
  const tally: BackfillTally = { checked: 0, current: 0, previous: 0, later: 0 };
  const deadline = new Deadline(opts.budgetMs);
  const nowIso = new Date().toISOString();

  /* 확인 시각이 없거나 지난 것부터 — 미뤄 둔 글이 줄 맨 앞을 계속 차지하지 않는다(0094 부분 인덱스) */
  const { data, error } = await admin
    .from("scheduled_posts")
    .select("id, user_id, channel, ig_media_id, permalink, container_owner_id")
    .eq("status", "published")
    .is("account_platform_id", null)
    .not("ig_media_id", "is", null)
    .in("channel", ["instagram", "threads"])
    .or(`account_check_after.is.null,account_check_after.lte."${nowIso}"`)
    .order("account_check_after", { ascending: true, nullsFirst: true })
    .limit(Math.max(1, Math.min(opts.limit, 50)));
  if (error) {
    /* 실패를 «채울 글 없음»으로 읽지 않는다 — 기록만 남기고 다음 회차에 */
    console.error("[publish:account-backfill] 조회 실패:", error.message);
    return tally;
  }
  const rows = (data ?? []) as BackfillRow[];
  if (rows.length === 0) return tally;

  /** 비어 있을 때만 적는다 — 그 사이 연동 콜백·엔진이 적었으면 건드리지 않는다 */
  const put = async (row: BackfillRow, fields: Record<string, unknown>): Promise<boolean> => {
    const { error: wErr } = await admin
      .from("scheduled_posts")
      .update(fields)
      .eq("id", row.id)
      .eq("user_id", row.user_id)
      .is("account_platform_id", null);
    if (wErr) console.error("[publish:account-backfill] 기록 실패:", row.id, wErr.message);
    return !wErr;
  };
  const later = async (row: BackfillRow, afterMs: number) => {
    tally.later++;
    await put(row, { account_check_after: new Date(Date.now() + afterMs).toISOString() });
  };

  /* 사용자·채널별로 묶는다 — 연결 조회·토큰 풀기를 한 번씩만 */
  const groups = new Map<string, BackfillRow[]>();
  for (const r of rows) {
    const key = `${r.user_id}:${r.channel}`;
    const g = groups.get(key);
    if (g) g.push(r);
    else groups.set(key, [r]);
  }

  let sampleFailure: string | null = null;
  for (const group of groups.values()) {
    if (deadline.remaining() < MIN_LEFT_MS) break;
    const { user_id: userId, channel } = group[0];

    const { data: acc, error: accErr } = await admin
      .from("connected_accounts")
      .select("platform_user_id, handle, access_token_cipher, token_expires_at")
      .eq("user_id", userId)
      .eq("channel", channel)
      .eq("connected", true)
      .limit(1)
      .maybeSingle();
    if (accErr) {
      /* 조회 «실패»는 «연결 없음»이 아니다 — 아무것도 적지 않고 다음 회차에 */
      console.error("[publish:account-backfill] 연결 조회 실패:", channel, accErr.message);
      continue;
    }
    const accRow = acc as { platform_user_id?: unknown; handle?: unknown; access_token_cipher?: string | null; token_expires_at?: string | null } | null;
    const accId = accRow && accRow.platform_user_id !== null && accRow.platform_user_id !== undefined ? String(accRow.platform_user_id).trim() : "";
    const current: CurrentAccount | null = accId ? { platformUserId: accId, handle: typeof accRow?.handle === "string" ? accRow.handle : null } : null;
    const expired = !!accRow?.token_expires_at && Date.parse(accRow.token_expires_at) <= Date.now();
    const token =
      current && !expired
        ? decryptToken(accRow?.access_token_cipher ?? null, { userId, field: "connected_accounts.access_token_cipher" })
        : null;

    let stopUserAfterMs: number | null = null;
    for (const row of group) {
      if (deadline.remaining() < MIN_LEFT_MS) break;
      tally.checked++;
      /* ① 준비물을 만든 계정을 안다(0093 뒤 새 엔진으로 나간 글) — 묻지 않고 적는다. 지금 계정이 아니면 이름은 모른다(«이전 계정») */
      if (row.container_owner_id) {
        const same = current?.platformUserId === row.container_owner_id;
        if (await put(row, { account_platform_id: row.container_owner_id, account_handle: same ? current?.handle ?? null : null })) {
          if (same) tally.current++;
          else tally.previous++;
        }
        continue;
      }
      if (stopUserAfterMs !== null) {
        await later(row, stopUserAfterMs);
        continue;
      }
      /* ② 연결·토큰이 없다 — 누구 것인지 물을 수 없다. 다시 연결하면 그때 채운다(하루 뒤) */
      if (!current || !token) {
        await later(row, BACKFILL_LONG_RETRY_MS);
        continue;
      }
      if (!MEDIA_ID_RE.test(row.ig_media_id)) {
        console.warn("[publish:account-backfill] 게시물 id 모양이 이상함 — 30일 뒤 다시:", row.id);
        await later(row, BROKEN_RETRY_MS);
        continue;
      }
      /* ③ 지금 토큰으로 읽어 본다 */
      const read = await readMedia(channel, row.ig_media_id, token, deadline);
      const v = classifyMediaRead(read, current.handle);
      if (!read.ok && v.verdict !== "previous" && !sampleFailure) {
        const f = read.failure;
        sampleFailure = `${channel}:${f.kind}:${f.httpStatus ?? "-"}:${f.code ?? "-"}/${f.subcode ?? "-"}`;
      }
      switch (v.verdict) {
        case "current": {
          const link = row.permalink ? null : safePermalink(v.permalink);
          if (await put(row, { account_platform_id: current.platformUserId, account_handle: current.handle, ...(link ? { permalink: link } : {}) })) {
            tally.current++;
          }
          break;
        }
        case "previous":
          if (await put(row, { account_platform_id: PREVIOUS_ACCOUNT_MARKER, account_handle: v.handle })) tally.previous++;
          break;
        case "retry":
          await later(row, v.afterMs);
          break;
        case "stop_user":
          stopUserAfterMs = v.afterMs;
          await later(row, v.afterMs);
          break;
      }
    }
  }
  if (sampleFailure) console.warn("[publish:account-backfill] 일부는 다음에 다시:", { ...tally, sample: sampleFailure });
  return tally;
}
