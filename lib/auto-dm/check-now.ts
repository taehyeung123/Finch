/* 토큰 암호문을 읽고(service_role) 인스타에 댓글을 묻는다 — 서버 밖으로 나가면 안 된다 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { isTokenEncryptionConfigured } from "@/lib/crypto/tokens";
import { NEXT_POST_SENTINEL } from "@/lib/auto-dm/db";
import { fetchCommentsForAutoDm, type AutoDmComment } from "@/lib/meta/instagram";
import { consoleErrorThrottled } from "@/lib/monitoring/log-throttle";
import {
  autoDmScopeCheck,
  isMissingFunction,
  loadActiveRulesForPost,
  processCommentEvent,
  PRIVATE_REPLY_WINDOW_MS,
  resolveAutoDmToken,
  type AdminClient,
  type CommentOutcome,
  type PipelineAccount,
} from "@/lib/auto-dm/pipeline";
import {
  CHECK_NOW_COOLDOWN_SEC,
  type CheckNowResult,
  type CheckNowRuleCounters,
  type CheckNowSummary,
} from "@/lib/auto-dm/check-now-types";

/*
  자동 DM «지금 확인» — 사용자가 버튼을 누르면 규칙의 게시물 댓글을 직접 읽어, 웹훅이 할 일을 그대로 한다 (2026-09-11).

  왜 필요한가: 댓글 웹훅은 메타 앱이 Live 가 되고 고급 권한 승인이 난 뒤에야 온다. 그 전에는 어떤 댓글도 자동 DM 을 깨우지 못해서
  심사자가 기능을 재현할 방법이 없고(녹화), 우리도 승인 전에 실제 발송을 시험할 수 없었다(docs/APP_REVIEW.md §4-1).

  흐름 — 싼 확인을 먼저, 인스타 호출은 마지막에:
   1) 규칙: 내 것인가(RLS + user_id) · 실행 중인가 · 게시물이 정해졌는가(«다음 게시물» 미지정은 건너뛴다)
   2) 연동: 내 인스타 연동(service_role + user_id — 암호문은 서버만 읽는다, 0085) · 댓글 권한(«확인 불가»는 막지 않는다) · 토큰
   3) 남용 제한: 규칙당 30초에 한 번 — DB 함수가 원자적으로 자리를 잡는다(0092). 없으면 **막는다**(닫는 쪽 실패)
   4) 댓글: 최신 50개(한 번에 받을 수 있는 최대) — 내 계정 댓글·7일 창(6.5일) 밖·이미 처리한 댓글은 뺀다
   5) 나머지를 오래된 것부터 **웹훅과 같은 함수**(lib/auto-dm/pipeline.ts processCommentEvent)에 넣는다 — 시간 예산 안에서만
  멱등: dm_sends (rule_id, ig_comment_id) 유니크 — 다시 눌러도, 웹훅이 같은 댓글을 처리해도 한 통만 나간다.
*/

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/* 인스타 미디어 ID 는 숫자 문자열이다. post_id 는 규칙 저장 때 사용자 입력으로 들어오므로 Graph 경로에 넣기 전에 모양을 본다 */
const MEDIA_ID_RE = /^[A-Za-z0-9_]{1,64}$/;
const COMMENT_BATCH = 50;
/* auto-dm 페이지의 maxDuration(60초) 안에서 — 진행 중인 발송 한 건·카운터 조회·응답 여유를 남기고 새 댓글 처리를 멈추는 시각.
   재는 기준은 액션 시작이다(댓글 조회에 쓴 시간도 포함). 못 본 댓글은 «다음 확인 때 이어서»로 알린다 — 멱등이라 안전하다. */
const PROCESS_BUDGET_MS = 40_000;

interface OwnerAccountRow {
  user_id: string;
  platform_user_id: string | null;
  handle: string | null;
  access_token_cipher: string | null;
  token_expires_at: string | null;
  /** 0091 — 미적용 DB 면 undefined */
  ig_id?: string | null;
  /** 0075 — null = 확인 불가. 미적용 DB 면 undefined */
  granted_scopes?: string[] | null;
}

/**
 * 이 사용자의 인스타 연동 한 행 — 암호문을 읽으므로 service_role 로, 범위는 user_id 필터가 정한다.
 * select("*") 금지(CLAUDE.md) — 컬럼을 적고, 시기별로 없을 수 있는 컬럼(ig_id 0091·granted_scopes 0075)은 오류가 가리키는 것만 빼고 다시 읽는다.
 */
async function loadOwnerInstagramAccount(
  admin: AdminClient,
  ownerId: string,
): Promise<{ ok: true; row: OwnerAccountRow | null } | { ok: false }> {
  const BASE = "user_id, platform_user_id, handle, access_token_cipher, token_expires_at";
  let optional = ["ig_id", "granted_scopes"];
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await admin
      .from("connected_accounts")
      .select([BASE, ...optional].join(", "))
      .eq("user_id", ownerId)
      .eq("channel", "instagram")
      .eq("connected", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!res.error) return { ok: true, row: (res.data as unknown as OwnerAccountRow | null) ?? null };
    const message = res.error.message;
    const missing = optional.filter((col) => message.includes(col));
    if (missing.length === 0) {
      console.error("[auto-dm:check] 연동 조회 실패:", message);
      return { ok: false };
    }
    optional = optional.filter((col) => !missing.includes(col));
  }
  return { ok: false };
}

/** 내 계정이 단 댓글인가 — 우리 공개 답글은 답글이라 목록에 안 오지만, 주인이 직접 단 최상위 댓글은 온다 */
function isOwnComment(c: AutoDmComment, row: OwnerAccountRow): boolean {
  if (c.fromId && (c.fromId === row.ig_id || c.fromId === row.platform_user_id)) return true;
  const handle = (row.handle ?? "").replace(/^@/, "").toLowerCase();
  return handle.length > 0 && (c.fromUsername ?? "").toLowerCase() === handle;
}

/** 댓글 시각(ms) — 메타는 "+0000" 처럼 콜론 없는 오프셋을 준다. 못 읽으면 null */
function commentTime(ts: string | null): number | null {
  if (!ts) return null;
  const t = Date.parse(ts.replace(/([+-]\d{2})(\d{2})$/, "$1:$2"));
  return Number.isFinite(t) ? t : null;
}

function emptySummary(): CheckNowSummary {
  return { checked: 0, sent: 0, already: 0, unmatched: 0, expired: 0, blocked: 0, held: 0, failed: 0, errors: 0, deferred: 0 };
}

function tally(s: CheckNowSummary, o: CommentOutcome): void {
  switch (o.kind) {
    case "sent":
      s.sent++;
      return;
    case "no_rule":
      s.unmatched++;
      return;
    /* reserve 가 null — 하루 상한·수신거부·24시간 쿨다운(사유는 dm_sends 행) 또는 동시에 들어온 웹훅이 먼저 잡았다 */
    case "not_reserved":
    case "scope_missing":
      s.blocked++;
      return;
    case "held_night":
    case "token_unavailable":
      s.held++;
      return;
    case "send_failed":
      if (o.retryable) s.held++;
      else s.failed++;
      return;
    case "rules_error":
    case "reserve_error":
      s.errors++;
      return;
  }
}

/** 확인 뒤 카드 숫자 — 실패해도 결과 자체는 맞으므로 빈 목록으로 두고(화면은 옛 숫자 유지) 로그만 남긴다 */
async function loadCounters(supabase: SupabaseClient, ownerId: string, postId: string): Promise<CheckNowRuleCounters[]> {
  const { data, error } = await supabase
    .from("auto_dm_rules")
    .select("id, sent_total, sent_today, failed_total, last_sent_at")
    .eq("user_id", ownerId)
    .eq("post_id", postId);
  if (error) {
    console.error("[auto-dm:check] 카운터 조회 실패:", error.message);
    return [];
  }
  return ((data ?? []) as { id: string; sent_total: number; sent_today: number; failed_total: number; last_sent_at: string | null }[]).map(
    (r) => ({ id: r.id, sentTotal: r.sent_total, sentToday: r.sent_today, failedTotal: r.failed_total, lastSentAt: r.last_sent_at }),
  );
}

/**
 * «지금 확인» 본체 — 서버 액션(app/(finch)/(app)/auto-dm/actions.ts checkRuleNow)이 인증 뒤에 부른다.
 * @param supabase 세션 클라이언트(규칙 소유 확인·카운터 — RLS 가 한 겹 더 막는다)
 * @param userId   getUser() 로 확인한 사용자
 */
export async function runCheckNow(supabase: SupabaseClient, userId: string, ruleId: string): Promise<CheckNowResult> {
  const startedAt = Date.now();
  if (!UUID_RE.test(ruleId)) return { ok: false, code: "not_found" };

  /* ── 1) 규칙 ── */
  const { data: ruleData, error: ruleErr } = await supabase
    .from("auto_dm_rules")
    .select("id, post_id, status")
    .eq("id", ruleId)
    .eq("user_id", userId)
    .maybeSingle();
  if (ruleErr) {
    console.error("[auto-dm:check] 규칙 조회 실패:", ruleErr.message);
    return { ok: false, code: "unavailable" };
  }
  const rule = ruleData as { id: string; post_id: string; status: string } | null;
  if (!rule) return { ok: false, code: "not_found" };
  if (rule.status !== "active") return { ok: false, code: "inactive" };
  if (rule.post_id === NEXT_POST_SENTINEL) return { ok: false, code: "unbound" };
  if (!MEDIA_ID_RE.test(rule.post_id)) return { ok: false, code: "post_gone" };

  /* ── 2) 연동 ── */
  const admin = createAdminClient();
  if (!admin) {
    console.error("[auto-dm:check] 확인 불가 — 서버 자격증명 미설정");
    return { ok: false, code: "unavailable" };
  }
  const acc = await loadOwnerInstagramAccount(admin, userId);
  if (!acc.ok) return { ok: false, code: "unavailable" };
  if (!acc.row) return { ok: false, code: "not_connected" };
  const row = acc.row;
  if (autoDmScopeCheck(row.granted_scopes ?? null).state === "missing") return { ok: false, code: "scope_missing" };

  /* /{IG_ID}/messages 의 경로 노드 — flush-dms 와 같은 규칙(ig_id 가 먼저, 0091 이전 행은 platform_user_id) */
  const igUserId = row.ig_id ?? row.platform_user_id;
  if (!igUserId) {
    console.error("[auto-dm:check] 연동 행에 계정 ID 가 없음 — 다시 연결 필요");
    return { ok: false, code: "token_expired" };
  }
  /* 만료가 지난 암호문은 풀지 않는다(보내 봐야 190). 운영자 본인은 개발용 토큰으로 이어 갈 수 있다(dev-token.ts) */
  const cipherExpired = !!row.token_expires_at && Date.parse(row.token_expires_at) <= Date.now();
  const token = await resolveAutoDmToken(admin, userId, cipherExpired ? null : row.access_token_cipher);
  if (!token) {
    if (!cipherExpired && row.access_token_cipher && !isTokenEncryptionConfigured()) {
      /* 암호문은 있는데 키가 없다 — 우리 설정 문제라 «다시 연결»을 시켜 봐야 저장부터 실패한다 */
      console.error("[auto-dm:check] 토큰을 풀 수 없음 — TOKEN_ENCRYPTION_KEY 미설정");
      return { ok: false, code: "unavailable" };
    }
    /* 암호문이 없거나·만료됐거나·키가 바뀌어 못 푼다 — 다시 연결하면 새 토큰이 저장된다 */
    return { ok: false, code: "token_expired" };
  }

  /* ── 3) 남용 제한 — 앞의 값싼 확인을 다 통과한 뒤에만 자리를 잡는다(설정 문제로 막힌 사람을 30초씩 묶지 않게) ── */
  const claim = await admin.rpc("claim_auto_dm_check", {
    p_rule_id: ruleId,
    p_owner: userId,
    p_min_seconds: CHECK_NOW_COOLDOWN_SEC,
  });
  if (claim.error) {
    if (isMissingFunction(claim.error.message)) {
      /* 0092 미적용 — 제한 없이 열지 않는다(연타·스크립트가 함수 시간과 사용자 토큰 한도를 태운다). 적용하면 바로 풀린다 */
      consoleErrorThrottled("auto-dm.check.no-claim", 10 * 60 * 1000, "[auto-dm:check] 0092 미적용 — «지금 확인»을 막음(남용 제한 없이 열지 않는다)");
    } else {
      console.error("[auto-dm:check] 확인 자리 잡기 실패:", claim.error.message);
    }
    return { ok: false, code: "unavailable" };
  }
  /* 숫자가 아니면(null 포함) 통과로 읽지 않는다 — Number(null) 은 0 이라 «통과»가 된다 */
  const wait = typeof claim.data === "number" ? claim.data : Number.NaN;
  if (wait === -1) return { ok: false, code: "not_found" };
  if (!Number.isFinite(wait)) {
    console.error("[auto-dm:check] 확인 자리 잡기 응답이 숫자가 아님");
    return { ok: false, code: "unavailable" };
  }
  if (wait > 0) return { ok: false, code: "throttled", retryAfterSec: wait };

  /* ── 4) 댓글 ── */
  const fetched = await fetchCommentsForAutoDm(rule.post_id, token, COMMENT_BATCH);
  if (!fetched.ok) {
    const code =
      fetched.reason === "token"
        ? "token_expired"
        : fetched.reason === "permission"
          ? "scope_missing"
          : fetched.reason === "gone"
            ? "post_gone"
            : "fetch_failed";
    return { ok: false, code };
  }

  const summary = emptySummary();
  const now = Date.now();
  const candidates: { comment: AutoDmComment; fromId: string; at: number }[] = [];
  for (const c of fetched.comments) {
    if (isOwnComment(c, row)) continue;
    summary.checked++;
    const at = commentTime(c.timestamp);
    /* 7일 창 밖(또는 시각을 모름) — 보내면 메타가 거절하고 flush 도 못 살린다 */
    if (at === null || now - at > PRIVATE_REPLY_WINDOW_MS) {
      summary.expired++;
      continue;
    }
    /* 받는 사람을 모르면 수신거부·24시간 확인을 할 수 없다 — 웹훅도 from.id 없는 댓글은 건너뛴다(보내지 않는 쪽으로) */
    if (!c.fromId) {
      summary.blocked++;
      continue;
    }
    candidates.push({ comment: c, fromId: c.fromId, at });
  }

  /* 이미 처리한 댓글 — 규칙과 무관하게 한 댓글에는 한 번만 본다(웹훅이 먼저 처리한 것도 여기서 걸린다).
     조회 실패를 «처리한 것 없음»으로 읽지 않는다 — 멱등이라 발송이 겹치진 않지만 결과 숫자가 거짓이 된다. */
  let queue = candidates;
  if (candidates.length > 0) {
    const { data: prior, error: priorErr } = await admin
      .from("dm_sends")
      .select("ig_comment_id")
      .eq("user_id", userId)
      .in(
        "ig_comment_id",
        candidates.map((x) => x.comment.id),
      );
    if (priorErr) {
      console.error("[auto-dm:check] 처리 기록 조회 실패:", priorErr.message);
      return { ok: false, code: "unavailable" };
    }
    const done = new Set(((prior ?? []) as { ig_comment_id: string }[]).map((r) => r.ig_comment_id));
    queue = candidates.filter((x) => {
      if (!done.has(x.comment.id)) return true;
      summary.already++;
      return false;
    });
  }

  if (queue.length > 0) {
    /* 규칙은 한 번만 읽는다 — 이 게시물의 활성 규칙 전부(댓글마다 pickRule 이 웹훅과 같은 규칙을 고른다) */
    const loaded = await loadActiveRulesForPost(admin, userId, rule.post_id);
    if (loaded.error) {
      console.error("[auto-dm:check] 규칙 조회 실패:", loaded.error);
      return { ok: false, code: "unavailable" };
    }
    const rules = loaded.data ?? [];
    if (rules.length === 0) return { ok: false, code: "inactive" }; // 그 사이 꺼졌다

    const account: PipelineAccount = { ownerId: userId, igUserId, accessToken: token, grantedScopes: row.granted_scopes ?? null };
    /* 오래된 댓글부터 — 7일 창에 가까운 것이 먼저다(웹훅이 받았을 순서와도 같다) */
    queue.sort((a, b) => a.at - b.at);
    for (let i = 0; i < queue.length; i++) {
      if (Date.now() - startedAt > PROCESS_BUDGET_MS) {
        summary.deferred += queue.length - i;
        break;
      }
      const { comment, fromId } = queue[i];
      const outcome = await processCommentEvent(
        admin,
        account,
        { commentId: comment.id, mediaId: rule.post_id, text: comment.text, fromId, fromUsername: comment.fromUsername },
        { rules },
      );
      tally(summary, outcome);
    }
  }

  /* 운영 관측용 한 줄 — 숫자만(댓글 원문·사람 id 는 남기지 않는다) */
  console.info(
    `[auto-dm:check] rule=${ruleId} checked=${summary.checked} sent=${summary.sent} already=${summary.already} unmatched=${summary.unmatched} expired=${summary.expired} blocked=${summary.blocked} held=${summary.held} failed=${summary.failed} errors=${summary.errors} deferred=${summary.deferred} ms=${Date.now() - startedAt}`,
  );

  const counters = await loadCounters(supabase, userId, rule.post_id);
  return { ok: true, summary, counters };
}
