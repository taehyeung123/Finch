import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getKv } from "@/lib/kv/upstash";
import { consoleErrorThrottled } from "@/lib/monitoring/log-throttle";

/*
  프로필 링크 방문·체류 집계 — 버퍼(Upstash Redis)와 DB 쓰기의 공용 배관 (2026-09-06).

  전에는 방문 1건마다 DB 왕복이 8~10번이었다(페이지 조회, 30분 중복 판정, 분당 천장 2종, INSERT, 체류는 SELECT+UPDATE).
  이제 KV 가 있으면:
   · 방문: Lua 스크립트 한 번(1 왕복)으로 «크론 생존 확인 → 큐 길이 확인 → 30분 중복(SET NX) → 분당 천장(INCR) → RPUSH».
   · 체류: 같은 큐에 {slug, hash, ms} 로 RPUSH — page id 조회를 안 해 DB 왕복 0. 최근 30분 안에 집계된 방문(NX 키)이
     있을 때만 받고, 방문자당 5초에 1건으로 묶는다(쿠키를 돌려 가며 큐를 채우는 길을 막는다 — 설계 검토 abuse #2).
   · /api/cron/flush-views 가 1분마다 큐 머리를 500개씩 떼어 INSERT 배열 한 번 + 체류 RPC 한 번으로 넣는다.
  KV 가 없거나(env 미설정), 죽었거나(throw → 60초 회로 차단), **크론이 죽었거나(마지막 flush 5분 초과)**, 큐가 밀렸으면
  (2만 건 초과) 방문자 요청은 옛 경로(DB 직접)로 간다 — 통계가 조용히 암전하는 일이 없게 하는 역압이다(설계 검토 #5).

  큐 규칙(설계 검토 확인 사항): 생산자는 **RPUSH 만** 쓴다(꼬리 추가). flush 는 LRANGE 0..N-1 로 머리를 읽고 INSERT 가
  끝난 뒤 LTRIM N -1 로 그 머리를 떼어낸다 — 동시에 RPUSH 가 와도 머리 인덱스는 흔들리지 않는다.
  이 키에 LPUSH/LREM/LINSERT 를 쓰는 순간 그 안정성이 깨진다.

  ⚠️ @upstash/redis 는 응답을 자동으로 JSON.parse 한다(automaticDeserialization 기본 true) — LRANGE 는 문자열이
  아니라 **객체 배열**로 온다. parseQueueItem 이 둘 다 받는다. 이걸 문자열로 가정하고 JSON.parse 하면 전부 «불량»이
  되어 큐가 매분 통째로 버려진다(설계 검토 blocker). 그래서 flush 는 «절반 넘게 불량이면 LTRIM 하지 않고 실패» 한다.

  명령 예산(Upstash 무료 월 50만): 크론 공회전은 큐가 비었으면 명령 2개(LLEN + 심장박동) ≈ 월 8.6만, 방문 1건 = 스크립트 1회
  (스크립트 안의 명령을 따로 세는지는 Upstash 문서에 없다 — 보수적으로 월 6~8만 방문은 확실히 무료 안). 한도를 넘으면
  Upstash 가 명령을 거부한다 → 회로 차단 → 그 달은 DB 직접 기록.

  운영: 건강 확인·막힘 복구는 docs/DEPLOY.md «방문 집계 버퍼 운영» 절. 크론 실패 로그는 10분에 한 번만 남긴다 —
  지속 장애가 분당 1건씩 Sentry 한도를 먹지 않게(설계 검토 ops #2).
*/

/** 같은 방문자의 방문을 이 간격 안에서는 1건으로 본다 */
export const VIEW_WINDOW_MS = 30 * 60 * 1000;
/**
 * 해시를 못 만든(쿠키를 안 보낸) 방문의 페이지 단위 천장 — 분당.
 * 해시 기반 30분 병합은 쿠키를 보내는 브라우저에만 걸린다 — curl 로 반복하면 매번 새 해시라 한 번도 발동하지 않았다.
 * 진짜 방문자는 거의 다 쿠키를 받으므로 이 천장에 닿지 않고 스크립트만 걸린다. 정밀 차단이 아니라 폭주 차단이다.
 */
export const VIEW_ANON_PER_MIN = 60;
/**
 * 해시 유무와 무관한 페이지 단위 천장 — 분당(고정 분 버킷이라 «평균 600/분», 경계에선 순간 2배까지 허용).
 * 쿠키 토큰은 서버가 발급하지만 검증하지 않는다 — 요청마다 다른 쿠키를 보내면 매번 새 해시라 30분 병합도 익명 천장도
 * 안 걸렸다(감사 #15). 분당 600 을 넘는 진짜 페이지는 없다시피 하고, 넘어도 «깎이는» 것이지 깨지지 않는다.
 */
export const VIEW_PAGE_PER_MIN = 600;
/** 체류 상한 — 이보다 긴 값은 잘라 저장(0058 check 제약과 같은 값) */
export const DWELL_MAX_MS = 30 * 60 * 1000;

export const KV_QUEUE_KEY = "lv:q";
export const KV_LAST_FLUSH_KEY = "lv:last_flush";
export const KV_LOCK_KEY = "lv:lock";
/** 큐가 이 길이를 넘으면(≈ 몇 분치 폭주, 또는 크론 정지) 방문자 요청은 DB 직접 경로로 간다 */
export const KV_QUEUE_SOFT_MAX = 20_000;
/** 마지막 flush 가 이보다 오래됐으면 크론이 죽은 것으로 보고 DB 직접 경로 */
export const KV_FLUSH_STALE_MS = 5 * 60 * 1000;
/** 잠금 TTL — 함수 상한(maxDuration 60초)보다 길게: 함수가 죽어도 잠금이 먼저 풀려 두 run 이 겹치지 않는다.
    정상 종료는 compare-and-delete 로 즉시 푼다(다른 run 의 잠금을 지우지 않는다) */
const LOCK_TTL_S = 90;
/** KV 예외 뒤 이 시간 동안은 시도조차 안 한다 — 한도 소진·장애 때 방문마다 실패+재시도 지연이 붙는 걸 막는다 */
const BREAKER_MS = 60_000;

/** link_views 한 행 — INSERT 되는 컬럼 그대로. created_at 은 **요청 시각**(flush 시각이 아니다 — KST 자정 경계) */
export interface ViewRow {
  page_id: string;
  visitor_hash: string | null;
  country: string | null;
  region: string | null;
  src: string | null;
  device: "mobile" | "tablet" | "desktop" | null;
  referrer_host: string | null;
  created_at: string;
  /** flush 가 같은 배치의 체류를 미리 심을 때만 채운다 */
  dwell_ms?: number | null;
}

export type ViewItem = ViewRow & { t: "view"; slug: string };
export interface DwellItem {
  t: "dwell";
  slug: string;
  visitor_hash: string;
  ms: number;
  /** 요청 시각 ISO — 65분이 지난 체류는 어차피 맞는 행이 없다 */
  at: string;
}
export type QueueItem = ViewItem | DwellItem;

/* ── 방문자 요청 쪽: 큐에 넣기 ─────────────────────────────────────────── */

/*
  Lua 로 한 왕복에 처리한다. 원자적이라 «중복 판정은 됐는데 천장에서 걸린 방문자가 30분 동안 빠지는» 일도 없고
  (천장에 걸리면 NX 키를 되돌린다), 중복 새로고침은 천장 카운터를 올리지 않는다(설계 검토 #6·abuse #5).
  중복 키는 **slug** 기준이다 — 체류 스크립트가 page id 없이도 «집계된 방문이 있는가»를 볼 수 있어야 해서.
  KEYS: 1 중복키(해시 없으면 자리표시) · 2 페이지 분당 카운터 · 3 익명 분당 카운터 · 4 마지막 flush · 5 큐
  ARGV: 1 해시 있음("1"/"0") · 2 중복 창 초 · 3 페이지 천장 · 4 익명 천장 · 5 flush 허용 최소 시각(ms) · 6 큐 상한 · 7 항목 JSON
  반환: {"stale"} | {"backlog"} | {"dup"} | {"page_cap"} | {"anon_cap"} | {"ok", 큐길이}
  stale/backlog 는 부작용 없이 먼저 돌아간다 — 호출측이 DB 경로로 가며 거기서 자기 중복 판정을 한다.
*/
const ADMIT_VIEW_LUA = `
local last = redis.call('GET', KEYS[4])
if (not last) or (tonumber(last) < tonumber(ARGV[5])) then return {'stale'} end
if redis.call('LLEN', KEYS[5]) >= tonumber(ARGV[6]) then return {'backlog'} end
local hasHash = ARGV[1] == '1'
if hasHash then
  if not redis.call('SET', KEYS[1], '1', 'NX', 'EX', ARGV[2]) then return {'dup'} end
end
local n = redis.call('INCR', KEYS[2])
if n == 1 then redis.call('EXPIRE', KEYS[2], 120) end
if n > tonumber(ARGV[3]) then
  if hasHash then redis.call('DEL', KEYS[1]) end
  return {'page_cap'}
end
if not hasHash then
  local a = redis.call('INCR', KEYS[3])
  if a == 1 then redis.call('EXPIRE', KEYS[3], 120) end
  if a > tonumber(ARGV[4]) then return {'anon_cap'} end
end
local len = redis.call('RPUSH', KEYS[5], ARGV[7])
return {'ok', len}
`;

/*
  체류. KEYS: 1 마지막 flush · 2 큐 · 3 방문 중복키(slug, hash) · 4 체류 스로틀키 / ARGV: 1 flush 허용 최소 시각 · 2 큐 상한 · 3 항목 JSON
  반환: {"stale"} | {"backlog"} | {"noview"}(최근 30분 집계 방문 없음 → 호출측 DB 경로: KV 전환 직전에 DB 로 들어간 방문일 수 있다)
        | {"throttled"}(같은 방문자 5초 안 재전송 → 버림) | {"ok", 큐길이}
*/
const ENQUEUE_DWELL_LUA = `
local last = redis.call('GET', KEYS[1])
if (not last) or (tonumber(last) < tonumber(ARGV[1])) then return {'stale'} end
if redis.call('LLEN', KEYS[2]) >= tonumber(ARGV[2]) then return {'backlog'} end
if redis.call('EXISTS', KEYS[3]) == 0 then return {'noview'} end
if not redis.call('SET', KEYS[4], '1', 'NX', 'EX', '5') then return {'throttled'} end
local len = redis.call('RPUSH', KEYS[2], ARGV[3])
return {'ok', len}
`;

/* 잠금은 run 토큰과 비교해서만 연장·해제한다 — 만료 뒤 다른 run 이 잡은 잠금을 건드리지 않는다 */
const LOCK_EXTEND_LUA = `
if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('EXPIRE', KEYS[1], ARGV[2]) end
return 0
`;
const LOCK_RELEASE_LUA = `
if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end
return 0
`;

type Script = { exec(keys: string[], args: string[]): Promise<unknown> };
let scriptCache: { view: Script; dwell: Script; extend: Script; release: Script } | null = null;

function scripts() {
  const kv = getKv();
  if (!kv) return null;
  /* createScript 는 EVALSHA 를 먼저 시도하고 없으면 EVAL 로 올린다 — 스크립트 본문을 매번 보내지 않는다 */
  scriptCache ??= {
    view: kv.createScript(ADMIT_VIEW_LUA),
    dwell: kv.createScript(ENQUEUE_DWELL_LUA),
    extend: kv.createScript(LOCK_EXTEND_LUA),
    release: kv.createScript(LOCK_RELEASE_LUA),
  };
  return scriptCache;
}

function codeOf(res: unknown): string {
  return Array.isArray(res) && res.length > 0 ? String(res[0]) : "";
}

const viewKey = (slug: string, hash: string) => `lv:v:${slug}:${hash}`;

/* 회로 차단기 — 인스턴스 단위. KV 가 예외를 던지면 60초 동안 KV 를 건너뛰고 DB 직접 경로로 간다 */
let kvDownUntil = 0;
function kvOpen(): boolean {
  return Date.now() >= kvDownUntil;
}
function tripBreaker() {
  kvDownUntil = Date.now() + BREAKER_MS;
}

/* 우회 로그는 인스턴스당 10분에 한 번 — 방문마다 찍으면 Sentry 무료 한도(월 5천)를 우회 로그가 먹는다 */
function noteBypass(code: string) {
  consoleErrorThrottled(
    "links.bypass",
    10 * 60 * 1000,
    `[links] 방문 버퍼 우회(${code}) — DB 직접 기록 중. /api/cron/flush-views 가 도는지(CRON_SECRET·vercel.json) 확인`,
  );
}

/**
 * 방문을 큐에 넣는다.
 *  queued  — 큐에 들어갔다(중복·천장 판정도 끝). 호출측은 더 할 일이 없다.
 *  skipped — 30분 중복이거나 천장에 걸렸다. 기록하지 않는다.
 *  fallback — KV 없음/장애/크론 정지/큐 밀림. 호출측이 DB 직접 경로(자기 중복 판정 포함)로 간다.
 */
export async function enqueueView(row: ViewRow, slug: string): Promise<"queued" | "skipped" | "fallback"> {
  const s = kvOpen() ? scripts() : null;
  if (!s) return "fallback";
  try {
    const minute = Math.floor(Date.now() / 60_000); // epoch 기반 — 시간대 무관
    const item: ViewItem = { t: "view", slug, ...row };
    const res = await s.view.exec(
      [
        row.visitor_hash ? viewKey(slug, row.visitor_hash) : "lv:v:-",
        `lv:pm:${row.page_id}:${minute}`,
        `lv:pa:${row.page_id}:${minute}`,
        KV_LAST_FLUSH_KEY,
        KV_QUEUE_KEY,
      ],
      [
        row.visitor_hash ? "1" : "0",
        String(Math.floor(VIEW_WINDOW_MS / 1000)),
        String(VIEW_PAGE_PER_MIN),
        String(VIEW_ANON_PER_MIN),
        String(Date.now() - KV_FLUSH_STALE_MS),
        String(KV_QUEUE_SOFT_MAX),
        JSON.stringify(item),
      ],
    );
    const code = codeOf(res);
    if (code === "ok") return "queued";
    if (code === "dup" || code === "page_cap" || code === "anon_cap") return "skipped";
    noteBypass(code || "unknown");
    return "fallback";
  } catch {
    /* Upstash 장애·한도 소진 — 방문자는 통계를 남기러 온 게 아니다. 60초 차단 후 DB 경로로 */
    tripBreaker();
    return "fallback";
  }
}

/**
 * 체류를 큐에 넣는다.
 *  queued — 끝. skipped — 5초 안 재전송(버림). fallback — 호출측이 옛 경로(SELECT+UPDATE)로.
 */
export async function enqueueDwell(slug: string, visitorHash: string, ms: number): Promise<"queued" | "skipped" | "fallback"> {
  const s = kvOpen() ? scripts() : null;
  if (!s) return "fallback";
  try {
    const item: DwellItem = { t: "dwell", slug, visitor_hash: visitorHash, ms: Math.min(DWELL_MAX_MS, Math.round(ms)), at: new Date().toISOString() };
    const res = await s.dwell.exec(
      [KV_LAST_FLUSH_KEY, KV_QUEUE_KEY, viewKey(slug, visitorHash), `lv:d:${slug}:${visitorHash}`],
      [String(Date.now() - KV_FLUSH_STALE_MS), String(KV_QUEUE_SOFT_MAX), JSON.stringify(item)],
    );
    const code = codeOf(res);
    if (code === "ok") return "queued";
    if (code === "throttled") return "skipped";
    if (code === "stale" || code === "backlog") noteBypass(code);
    return "fallback";
  } catch {
    tripBreaker();
    return "fallback";
  }
}

/* ── DB 쓰기: 단건(옛 경로)과 배열(flush)이 같은 계단을 탄다 ─────────────── */

type PgError = { code?: string; message: string };

/** «컬럼이 없다» 판정 — Postgres 42703 과 PostgREST 스키마 캐시(PGRST204, 메시지에 column/schema) 둘 다 */
export function isColErr(e: PgError, col: RegExp): boolean {
  return e.code === "42703" || (col.test(e.message) && /column|schema/i.test(e.message));
}

/** 행 단위 오류 — 데이터 예외(22xxx)·무결성 위반(23xxx: FK 는 그사이 삭제된 페이지, check 는 값 범위). 그 행만 버린다 */
function isRowLevelErr(e: PgError): boolean {
  const c = e.code ?? "";
  return c.startsWith("22") || c.startsWith("23");
}

/* 미적용 DB 폴백 계단 — 0058 컬럼 → 0055 컬럼 → 0048 원형. 배열이면 **모든 행**에서 같은 컬럼을 뗀다
   (postgrest 는 배열 insert 에 키 합집합을 columns= 로 보낸다 — 한 행에만 남아 있어도 전체가 실패한다) */
async function insertOnce(admin: SupabaseClient, rows: ViewRow[]): Promise<PgError | null> {
  let { error } = await admin.from("link_views").insert(rows);
  if (error && isColErr(error, /device|referrer_host|dwell_ms/i)) {
    const stripped = rows.map((r) => ({ page_id: r.page_id, visitor_hash: r.visitor_hash, country: r.country, region: r.region, src: r.src, created_at: r.created_at }));
    ({ error } = await admin.from("link_views").insert(stripped));
  }
  if (error && isColErr(error, /src/i)) {
    const stripped = rows.map((r) => ({ page_id: r.page_id, visitor_hash: r.visitor_hash, country: r.country, region: r.region, created_at: r.created_at }));
    ({ error } = await admin.from("link_views").insert(stripped));
  }
  return error ? { code: error.code, message: error.message } : null;
}

export type InsertResult = { ok: true; inserted: number; dropped: number } | { ok: false; error: string };

/**
 * 방문 행 삽입. 배열 실패는 오류 종류로 가른다(설계 검토 #2):
 *  · 행 단위 오류(22xxx/23xxx) → 이진 분할로 나쁜 행만 찾아 버린다(왕복 log₂).
 *  · 그 밖(네트워크·5xx·타임아웃·표 없음) → ok:false. 호출측(flush)은 큐를 **자르지 않고** 이번 run 을 끝낸다.
 *  · deadline(ms epoch) 을 넘기면 분할을 멈추고 ok:false — 함수가 maxDuration 에 죽어 «INSERT 는 됐는데 LTRIM 을 못 한»
 *    상태가 되는 것보다, 다음 run 이 이미 넣은 절반을 한 번 더 넣는 쪽(과대집계)이 낫다 — 유실은 없다.
 */
export async function insertViewRows(admin: SupabaseClient, rows: ViewRow[], deadline = Number.POSITIVE_INFINITY): Promise<InsertResult> {
  if (rows.length === 0) return { ok: true, inserted: 0, dropped: 0 };
  if (Date.now() > deadline) return { ok: false, error: "time_budget" };
  const err = await insertOnce(admin, rows);
  if (!err) return { ok: true, inserted: rows.length, dropped: 0 };
  if (!isRowLevelErr(err)) return { ok: false, error: `${err.code ?? "?"} ${err.message}` };
  if (rows.length === 1) {
    consoleErrorThrottled("links.view.row_dropped", 10 * 60 * 1000, "[links] 방문 행 폐기:", err.code, err.message);
    return { ok: true, inserted: 0, dropped: 1 };
  }
  const mid = Math.floor(rows.length / 2);
  const a = await insertViewRows(admin, rows.slice(0, mid), deadline);
  if (!a.ok) return a;
  const b = await insertViewRows(admin, rows.slice(mid), deadline);
  if (!b.ok) return b;
  return { ok: true, inserted: a.inserted + b.inserted, dropped: a.dropped + b.dropped };
}

/* ── flush(크론) ─────────────────────────────────────────────────────────── */

/** LRANGE 항목 → 큐 항목. 문자열(원본 JSON)과 객체(자동 역직렬화) 둘 다 받는다. 모양이 아니면 null */
export function parseQueueItem(raw: unknown): QueueItem | null {
  let v: unknown = raw;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      return null;
    }
  }
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (o.t === "view") {
    if (typeof o.page_id !== "string" || typeof o.slug !== "string" || typeof o.created_at !== "string") return null;
    return {
      t: "view",
      slug: o.slug,
      page_id: o.page_id,
      visitor_hash: typeof o.visitor_hash === "string" ? o.visitor_hash : null,
      country: typeof o.country === "string" ? o.country : null,
      region: typeof o.region === "string" ? o.region : null,
      src: typeof o.src === "string" ? o.src : null,
      device: o.device === "mobile" || o.device === "tablet" || o.device === "desktop" ? o.device : null,
      referrer_host: typeof o.referrer_host === "string" ? o.referrer_host : null,
      created_at: o.created_at,
      dwell_ms: typeof o.dwell_ms === "number" ? o.dwell_ms : null,
    };
  }
  if (o.t === "dwell") {
    if (typeof o.slug !== "string" || typeof o.visitor_hash !== "string" || typeof o.ms !== "number" || typeof o.at !== "string") return null;
    return { t: "dwell", slug: o.slug, visitor_hash: o.visitor_hash, ms: o.ms, at: o.at };
  }
  return null;
}

export interface FlushResult {
  ok: boolean;
  skipped?: "locked";
  error?: string;
  inserted: number;
  dwellApplied: number;
  dropped: number;
  batches: number;
  remaining: number | null;
  ms: number;
}

/** 체류 RPC 한 번에 보내는 상한 — 이보다 많으면 나눠 보낸다.
    체류는 **at-most-once** 다: 배치 LTRIM 뒤에 반영하므로 여기서 실패하면 그 체류는 사라진다. 반대로 하면(반영 뒤 LTRIM)
    RPC 가 잠깐 실패할 때 이미 넣은 방문이 다음 분에 **두 번** INSERT 된다 — 방문 중복보다 체류 누락이 낫다(보조 지표). */
const DWELL_RPC_MAX = 2000;
/** 0083 미적용 폴백(행 단위 옛 경로) 상한 */
const DWELL_LEGACY_MAX = 100;
const DWELL_LOOKBACK_MS = 65 * 60 * 1000;

/**
 * 큐를 비운다. 배치(기본 500)마다 «LRANGE → 페이지 생존 확인 → INSERT 배열 → LTRIM → 잠금 연장». 체류는 run 끝에 RPC 한 번.
 * 시간 예산(기본 40초) 안에서만 돈다 — Vercel 크론은 간격보다 오래 걸리면 다음 인스턴스를 띄울 수 있고(문서),
 * 잠금 TTL 만 믿으면 두 run 이 같은 머리를 두 번 INSERT 한다(설계 검토 #3). 배치 상한 20 = 분당 1만 행 — 페이지 여러 장을
 * 천장까지 때리는 한 사용자가 남의 통계를 무한히 늦추지 못하게 드레인을 유입보다 크게 잡는다(abuse #4).
 */
export async function flushViewQueue(
  admin: SupabaseClient,
  opts: { batch?: number; maxBatches?: number; budgetMs?: number } = {},
): Promise<FlushResult> {
  const kv = getKv();
  const s = scripts();
  const started = Date.now();
  const out: FlushResult = { ok: true, inserted: 0, dwellApplied: 0, dropped: 0, batches: 0, remaining: null, ms: 0 };
  const done = (patch: Partial<FlushResult> = {}) => Object.assign(out, patch, { ms: Date.now() - started });
  if (!kv || !s) return done({ ok: false, error: "kv_not_configured" });

  const runId = crypto.randomUUID();
  const release = () => s.release.exec([KV_LOCK_KEY], [runId]).catch(() => {});
  try {
    return await flushInner(admin, kv, s, runId, started, out, done, opts);
  } catch (e) {
    /* Upstash 왕복이 도중에 throw(네트워크·타임아웃) — 잠금은 TTL 로도 풀리지만 바로 놓고, 운영자가 읽을 수 있는 모양으로 끝낸다.
       INSERT 뒤 LTRIM 전에 throw 했다면 다음 run 이 그 배치를 한 번 더 넣는다(과대집계, 유실 없음) */
    consoleErrorThrottled("links.flush.exception", 10 * 60 * 1000, "[links] flush 예외:", e instanceof Error ? e.message : e);
    await release();
    return done({ ok: false, error: "kv_error" });
  }
}

type Kv = NonNullable<ReturnType<typeof getKv>>;
type Scripts = NonNullable<ReturnType<typeof scripts>>;

async function flushInner(
  admin: SupabaseClient,
  kv: Kv,
  s: Scripts,
  runId: string,
  started: number,
  out: FlushResult,
  done: (patch?: Partial<FlushResult>) => FlushResult,
  opts: { batch?: number; maxBatches?: number; budgetMs?: number },
): Promise<FlushResult> {
  const batch = opts.batch ?? 500;
  const maxBatches = opts.maxBatches ?? 20;
  const budgetMs = opts.budgetMs ?? 40_000;
  /* 공회전이 매분 도는 자리 — 큐가 비었으면 잠금도 잡지 않고 심장박동만 남긴다(명령 2개) */
  const queued = await kv.llen(KV_QUEUE_KEY);
  if (queued === 0) {
    await kv.set(KV_LAST_FLUSH_KEY, String(Date.now()));
    return done({ remaining: 0 });
  }
  /* 잠금과 첫 LRANGE 를 한 왕복에 */
  const [lock, first] = (await kv.pipeline().set(KV_LOCK_KEY, runId, { nx: true, ex: LOCK_TTL_S }).lrange(KV_QUEUE_KEY, 0, batch - 1).exec()) as [
    unknown,
    unknown[],
  ];
  if (lock !== "OK") return done({ skipped: "locked" });
  const release = () => s.release.exec([KV_LOCK_KEY], [runId]).catch(() => {});

  /* 체류 — (slug, hash) 별 최댓값. 같은 배치의 방문 행이 있으면 거기 심고 큐에서 함께 사라진다 */
  const dwellPending = new Map<string, DwellItem>();
  let raw: unknown[] = first;
  let lastBatchFull = false;

  while (out.batches < maxBatches && Date.now() - started < budgetMs) {
    if (out.batches > 0) raw = await kv.lrange(KV_QUEUE_KEY, 0, batch - 1);
    if (raw.length === 0) {
      lastBatchFull = false;
      break;
    }
    const parsed = raw.map(parseQueueItem);
    const bad = parsed.filter((p) => p === null).length;
    /* 대량 폐기 방지 — 절반 넘게 «불량»이면 큐가 아니라 파서(또는 직렬화 계약)가 잘못된 것이다. 자르지 않고 실패한다 */
    if (bad > 0 && bad * 2 >= raw.length) {
      consoleErrorThrottled(
        "links.flush.unreadable",
        10 * 60 * 1000,
        `[links] flush 중단: 큐 항목 ${raw.length}개 중 ${bad}개를 읽지 못함 — LTRIM 하지 않음. 복구는 docs/DEPLOY.md «방문 집계 버퍼 운영»`,
      );
      await release();
      return done({ ok: false, error: "queue_unreadable" });
    }
    const views: ViewItem[] = [];
    for (const item of parsed) {
      if (!item) continue;
      if (item.t === "view") {
        views.push(item);
        continue;
      }
      /* 같은 배치의 방문 행(가장 최근 것)에 심는다 */
      let target: ViewItem | undefined;
      for (let i = views.length - 1; i >= 0; i--) {
        if (views[i].slug === item.slug && views[i].visitor_hash === item.visitor_hash) {
          target = views[i];
          break;
        }
      }
      if (target) {
        target.dwell_ms = Math.max(target.dwell_ms ?? 0, item.ms);
        continue;
      }
      const k = `${item.slug} ${item.visitor_hash}`;
      const prev = dwellPending.get(k);
      if (!prev || prev.ms < item.ms) dwellPending.set(k, item);
    }

    /* 페이지 생존 확인 1회 — 큐에 있는 사이 삭제된 페이지(on delete cascade)의 행은 FK 로 배치 전체를 넘어뜨린다.
       한 번의 IN 조회로 걸러내면 이진 분할이 «전부 불량» 최악 경로(수백 왕복)로 가는 일이 없다(abuse #1-③) */
    let rows: ViewRow[] = views.map((v) => ({
      page_id: v.page_id,
      visitor_hash: v.visitor_hash,
      country: v.country,
      region: v.region,
      src: v.src,
      device: v.device,
      referrer_host: v.referrer_host,
      created_at: v.created_at,
      dwell_ms: v.dwell_ms ?? null,
    }));
    if (rows.length > 0) {
      const ids = [...new Set(rows.map((r) => r.page_id))];
      const { data: alive, error: aliveErr } = await admin.from("link_pages").select("id").in("id", ids);
      if (aliveErr) {
        consoleErrorThrottled("links.flush.page_check", 10 * 60 * 1000, "[links] flush 중단: 페이지 확인 실패 —", aliveErr.message);
        await release();
        return done({ ok: false, error: "page_check_failed" });
      }
      const ok = new Set((alive ?? []).map((p: { id: string }) => p.id));
      const before = rows.length;
      rows = rows.filter((r) => ok.has(r.page_id));
      if (rows.length < before) out.dropped += before - rows.length;
    }

    /* 분할 재시도까지 포함해 함수 상한(60초) 안에서 끝나게 — 예산 뒤 10초를 더 준다 */
    const r = await insertViewRows(admin, rows, started + budgetMs + 10_000);
    if (!r.ok) {
      /* 일시 장애 — 큐는 그대로 두고 끝낸다. 다음 분에 같은 머리부터 다시 */
      consoleErrorThrottled("links.flush.insert", 10 * 60 * 1000, "[links] flush 중단: 방문 INSERT 실패 —", r.error);
      await release();
      return done({ ok: false, error: "insert_failed" });
    }
    out.inserted += r.inserted;
    out.dropped += r.dropped + bad;
    await kv.ltrim(KV_QUEUE_KEY, raw.length, -1);
    await s.extend.exec([KV_LOCK_KEY], [runId, String(LOCK_TTL_S)]);
    out.batches += 1;
    lastBatchFull = raw.length >= batch;
    if (!lastBatchFull) break;
  }

  if (dwellPending.size > 0) {
    const cutoff = Date.now() - DWELL_LOOKBACK_MS;
    const items = [...dwellPending.values()].filter((d) => Date.parse(d.at) >= cutoff);
    for (let i = 0; i < items.length && Date.now() - started < budgetMs; i += DWELL_RPC_MAX) {
      out.dwellApplied += await applyDwell(admin, items.slice(i, i + DWELL_RPC_MAX));
    }
  }

  /* 심장박동 + 남은 길이 + 잠금 해제를 한 왕복에. 마지막 배치가 꽉 찼을 때만 길이를 묻는다(아니면 0 이다) */
  const tail = kv.pipeline().set(KV_LAST_FLUSH_KEY, String(Date.now()));
  if (lastBatchFull) tail.llen(KV_QUEUE_KEY);
  tail.eval(LOCK_RELEASE_LUA, [KV_LOCK_KEY], [runId]);
  const tailRes = (await tail.exec()) as unknown[];
  out.remaining = lastBatchFull ? Number(tailRes[1] ?? 0) : 0;
  if (out.remaining > KV_QUEUE_SOFT_MAX) {
    consoleErrorThrottled(
      "links.flush.backlog",
      10 * 60 * 1000,
      `[links] 방문 큐 밀림: ${out.remaining}건 남음 — 크론이 유입을 못 따라간다(방문자 요청은 DB 직접 경로로 우회 중)`,
    );
  }
  return done();
}

/** 체류 반영 — 0083 RPC 한 왕복. 함수가 없으면(미적용) 행 단위 옛 경로로 상한 100 */
async function applyDwell(admin: SupabaseClient, items: DwellItem[]): Promise<number> {
  const payload = items.map((d) => ({ slug: d.slug, hash: d.visitor_hash, ms: Math.min(DWELL_MAX_MS, Math.round(d.ms)) }));
  const { data, error } = await admin.rpc("link_views_apply_dwell", { p_items: payload });
  if (!error) return typeof data === "number" ? data : 0;
  /* «함수 없음»만 미적용으로 본다 — 42501(권한 없음)은 함수 이름이 메시지에 들어 있어도 미적용이 아니다(0083 의 grant 누락) */
  const missing = error.code === "42883" || error.code === "PGRST202" || /could not find the function/i.test(error.message);
  if (!missing) {
    consoleErrorThrottled(
      "links.flush.dwell",
      10 * 60 * 1000,
      "[links] 체류 일괄 반영 실패:",
      error.code,
      error.message,
      error.code === "42501" ? "— 0083 의 grant execute … to service_role 이 빠졌는지 확인" : "",
    );
    return 0;
  }
  consoleErrorThrottled(
    "links.flush.dwell_rpc_missing",
    60 * 60 * 1000,
    `[links] 체류 RPC 없음(마이그레이션 0083 미적용) — 행 단위 경로로 ${Math.min(items.length, DWELL_LEGACY_MAX)}건만 반영`,
  );
  return applyDwellLegacy(admin, items.slice(0, DWELL_LEGACY_MAX));
}

async function applyDwellLegacy(admin: SupabaseClient, items: DwellItem[]): Promise<number> {
  const slugs = [...new Set(items.map((d) => d.slug))];
  const { data: pages } = await admin.from("link_pages").select("id, slug").in("slug", slugs);
  const idBySlug = new Map((pages ?? []).map((p: { id: string; slug: string }) => [p.slug, p.id]));
  const since = new Date(Date.now() - DWELL_LOOKBACK_MS).toISOString();
  let applied = 0;
  for (const d of items) {
    const pageId = idBySlug.get(d.slug);
    if (!pageId) continue;
    const { data: last } = await admin
      .from("link_views")
      .select("id, dwell_ms")
      .eq("page_id", pageId)
      .eq("visitor_hash", d.visitor_hash)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!last) continue;
    const next = Math.min(DWELL_MAX_MS, Math.round(d.ms));
    if (typeof last.dwell_ms === "number" && last.dwell_ms >= next) continue;
    const { error } = await admin.from("link_views").update({ dwell_ms: next }).eq("id", last.id);
    if (!error) applied += 1;
  }
  return applied;
}
