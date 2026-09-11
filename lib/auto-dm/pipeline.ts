/* 토큰 복호화·Graph 발송·service_role RPC 를 부른다 — 서버 밖으로 나가면 안 된다 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptToken } from "@/lib/crypto/tokens";
import { ownerDevToken } from "@/lib/auto-dm/dev-token";
import { recipientHashes } from "@/lib/auto-dm/recipient-hash";
import { sendPrivateReply, replyToComment } from "@/lib/meta/graph";
import { applyAdDisclosure } from "@/lib/ads/ad-disclosure";
import { parseButtons, parseReplies, NEXT_POST_SENTINEL } from "@/lib/auto-dm/db";
import { fetchMediaMeta } from "@/lib/meta/instagram";
import { checkScope, REQUIRED_SCOPE, type ScopeCheck } from "@/lib/meta/granted-scopes";
import { consoleErrorThrottled, flatten } from "@/lib/monitoring/log-throttle";
import { isNightInKST, pickRule, type CommentEvent, type MatchableRule } from "@/lib/auto-dm/match";

/**
 * 댓글 한 건 → 자동 DM 파이프라인의 **공통부** (2026-09-11 분리).
 *
 * 부르는 곳이 둘이다 — 같은 함수라서 두 경로의 판정·발송이 절대 갈라지지 않는다:
 *  · 인스타 댓글 웹훅(app/api/webhooks/instagram/route.ts) — 메타가 댓글을 알려 줄 때
 *  · «지금 확인»(lib/auto-dm/check-now.ts) — 사용자가 버튼을 눌러 게시물 댓글을 직접 읽을 때.
 *    댓글 웹훅은 앱이 Live·고급 권한 승인을 받은 뒤에야 오기 때문에, 그 전(심사 녹화·사전 시험)에는 이 경로뿐이다.
 *
 * 처리 순서 (docs/AUTO_DM_COST_RISK.md 의 안전장치 그대로 — 웹훅에 있던 코드를 옮겼을 뿐 동작은 같다):
 *   권한 확인 → 규칙 조회(없으면 «다음 게시물» 예약 규칙 바인딩) → 댓글당 규칙 1개(pickRule)
 *   → reserve_dm_send(멱등·하루 상한·수신거부·24시간 쿨다운·월 한도를 DB 가 원자 판정)
 *   → 광고 야간 보류 → 토큰 없으면 pending → Private Reply → finalize → (선택) 공개 답글
 *
 * ⚠️ 멱등의 근거는 dm_sends 의 (rule_id, ig_comment_id) 유니크다. 같은 댓글을 웹훅과 «지금 확인»이 둘 다 처리해도,
 *    «지금 확인»을 여러 번 눌러도 reserve 가 두 번째를 null 로 돌려 한 통만 나간다(Private Reply 는 댓글당 1회뿐이다).
 */

export type AdminClient = SupabaseClient;

/**
 * 월 발송 한도 폐지(2026-08-14) — DM은 원가 0원이라 발송량 게이팅을 없앴다.
 * 플랜 차별화는 "자동화 콘텐츠 개수"(규칙 생성 시점, lib/auto-dm/limits.ts)가 담당하고,
 * 스팸 방지는 규칙별 daily_cap이 담당한다. reserve_dm_send 함수 시그니처는 유지하되
 * 실질 무제한 값을 넘긴다.
 */
export const MONTHLY_LIMIT_UNLIMITED = 1000000;

/**
 * Private Reply 는 댓글 후 7일 안에 1회만 된다(메타 문서). 반나절 여유를 둔 창 —
 * 보류분 재처리 크론(flush-dms)과 «지금 확인»이 같은 값을 본다.
 */
export const PRIVATE_REPLY_WINDOW_MS = 6.5 * 86_400_000;

/**
 * 자동 DM 이 쓰는 권한 — 댓글 읽기·비공개 답장·공개 답글이 전부 이것 하나다
 * (메타 문서 «Private Replies»: Instagram 로그인은 instagram_business_basic + instagram_business_manage_comments).
 * 수신거부 답장(messages 웹훅)은 instagram_business_manage_messages 지만, 수신거부 등록은 권한과 무관하게 **항상** 처리한다.
 */
export const AUTO_DM_SCOPE = REQUIRED_SCOPE.instagramComments;

/** 이 연동으로 자동 DM 을 돌릴 수 있는가 — «확인 불가»(null·빈 배열)는 막지 않는다(lib/meta/granted-scopes.ts 규칙) */
export function autoDmScopeCheck(granted: string[] | null | undefined): ScopeCheck {
  return checkScope(granted, AUTO_DM_SCOPE);
}

/** RPC 가 «함수를 못 찾음»인가 — 0090 적용 전 배포에서 옛 시그니처로 한 번 더 시도하기 위한 판정 */
export function isMissingFunction(msg: string | undefined): boolean {
  return !!msg && /could not find the function|does not exist/i.test(msg);
}

/**
 * 발송에 쓸 토큰 — 저장된 암호문을 풀고, 안 되면 운영자 본인 계정에 한해 개발용 토큰(lib/auto-dm/dev-token.ts).
 * TOKEN_ENCRYPTION_KEY 미설정이거나 저장 토큰이 없으면 null.
 */
export async function resolveAutoDmToken(
  admin: AdminClient,
  ownerId: string,
  cipher: string | null | undefined,
): Promise<string | null> {
  return (
    decryptToken(cipher ?? null, { userId: ownerId, field: "connected_accounts.access_token_cipher" }) ??
    (await ownerDevToken(admin, ownerId))
  );
}

/* ── 규칙 ─────────────────────────────────────────────────────── */

/** 발송 판정·본문에 필요한 규칙 필드 (auto_dm_rules 행 서브셋) */
export type PipelineRule = MatchableRule & {
  dm_message: string;
  public_reply: string | null;
  public_replies?: unknown;
  button_label: string | null;
  button_url: string | null;
  buttons?: unknown;
};

const RULE_SELECT_BASE =
  "id, post_id, trigger, keywords, status, is_advertising, dm_message, public_reply, button_label, button_url";

/**
 * 이 게시물의 활성 규칙. 조회 오류는 '규칙 없음'과 다르다 — 호출측은 error 면 이 댓글을 멈춘다
 * (멱등 예약 전이므로 웹훅은 메타 재전송으로, «지금 확인»은 다시 누르면 재처리된다).
 * buttons(0038)·public_replies(0042) 미적용 DB 는 legacy 컬럼만으로 한 번 더 읽는다.
 */
export async function loadActiveRulesForPost(
  admin: AdminClient,
  ownerId: string,
  mediaId: string,
): Promise<{ data: PipelineRule[] | null; error: string | null }> {
  const query = (columns: string) =>
    admin
      .from("auto_dm_rules")
      .select(columns)
      .eq("user_id", ownerId)
      .eq("post_id", mediaId)
      .eq("status", "active");
  const first = await query(`${RULE_SELECT_BASE}, buttons, public_replies`);
  if (first.error && /buttons|public_replies/i.test(first.error.message)) {
    const fallback = await query(RULE_SELECT_BASE);
    return { data: (fallback.data as unknown as PipelineRule[] | null) ?? null, error: fallback.error?.message ?? null };
  }
  return { data: (first.data as unknown as PipelineRule[] | null) ?? null, error: first.error?.message ?? null };
}

/**
 * "다음에 올릴 게시물" 예약 규칙 바인딩 — 예약발송 대응 (2026-08-14).
 *
 * 규칙 생성 시 post_id 를 NEXT_POST_SENTINEL 로 두고, 새 게시물에 첫 댓글이 달려
 * 웹훅이 들어오는 순간 실제 media id 로 치환한다. 게시물 업로드 시각이 규칙 생성
 * 시각보다 뒤인 경우에만 — 옛날 게시물 댓글이 예약 규칙을 가로채는 것을 막는다.
 * 메타 조회 실패·토큰 부재 시엔 그냥 null 반환 — 다음 댓글 웹훅에서 재시도된다.
 */
async function tryBindNextPostRules(
  admin: AdminClient,
  ownerId: string,
  mediaId: string,
  accessToken: string | null,
): Promise<PipelineRule[] | null> {
  const RULE_SELECT =
    "id, post_id, trigger, keywords, status, is_advertising, dm_message, public_reply, button_label, button_url, created_at";
  const query = (columns: string) =>
    admin
      .from("auto_dm_rules")
      .select(columns)
      .eq("user_id", ownerId)
      .eq("post_id", NEXT_POST_SENTINEL)
      .eq("status", "active");
  let res = await query(`${RULE_SELECT}, buttons, public_replies`);
  if (res.error && /buttons|public_replies/i.test(res.error.message)) res = await query(RULE_SELECT);
  if (res.error) {
    console.error("[auto-dm] 예약 규칙 조회 실패:", res.error.message);
    return null;
  }
  const pending = (res.data ?? []) as unknown as (PipelineRule & { created_at: string })[];
  if (pending.length === 0 || !accessToken) return null;

  const meta = await fetchMediaMeta(mediaId, accessToken);
  if (!meta?.timestamp) return null;
  const mediaTime = new Date(meta.timestamp).getTime();
  const toBind = pending.filter((r) => new Date(r.created_at).getTime() < mediaTime);
  if (toBind.length === 0) return null;

  const postType =
    meta.mediaProductType === "REELS"
      ? "reels"
      : meta.mediaType === "VIDEO"
        ? "video"
        : meta.mediaType === "CAROUSEL_ALBUM"
          ? "carousel"
          : "feed";
  const caption = (meta.caption ?? "").split("\n")[0]?.slice(0, 80) || "새 게시물";
  const ids = toBind.map((r) => r.id);

  let bind = await admin
    .from("auto_dm_rules")
    .update({ post_id: mediaId, post_caption: caption, post_type: postType, post_thumb: meta.thumbnailUrl ?? meta.mediaUrl ?? null })
    .in("id", ids);
  if (bind.error && /post_thumb/i.test(bind.error.message)) {
    bind = await admin
      .from("auto_dm_rules")
      .update({ post_id: mediaId, post_caption: caption, post_type: postType })
      .in("id", ids);
  }
  if (bind.error) {
    console.error("[auto-dm] 예약 규칙 바인딩 실패:", bind.error.message);
    return null;
  }
  console.log(`[auto-dm] 예약 규칙 ${ids.length}건을 게시물 ${mediaId}에 바인딩`);
  return toBind.map((r) => ({ ...r, post_id: mediaId }));
}

/* ── 발송 ─────────────────────────────────────────────────────── */

/** 이 댓글을 처리할 연동 계정 */
export interface PipelineAccount {
  /** 규칙·발송 기록의 주인(connected_accounts.user_id) */
  ownerId: string;
  /** /{IG_ID}/messages 의 경로 노드 — 웹훅은 entry.id, «지금 확인»은 ig_id ?? platform_user_id(flush-dms 와 같다) */
  igUserId: string;
  /** null = 토큰 미확보 — 예약은 하되 pending 으로 남겨 flush-dms 가 7일 창 안에 다시 보낸다 */
  accessToken: string | null;
  /** connected_accounts.granted_scopes — null 은 «확인 불가»라 막지 않는다 */
  grantedScopes: string[] | null;
}

/**
 * 댓글 한 건의 결과 — 웹훅은 버리고(로그는 여기서 남긴다), «지금 확인»은 세어서 화면에 보여 준다.
 * not_reserved 는 reserve_dm_send 가 null 을 준 경우다: 이미 처리된 댓글이거나(멱등), 하루 상한·수신거부·24시간 쿨다운에
 * 걸렸다 — 사유는 dm_sends 행의 status 에 남는다.
 */
export type CommentOutcome =
  | { kind: "scope_missing" }
  | { kind: "rules_error" }
  | { kind: "no_rule" }
  | { kind: "reserve_error"; ruleId: string }
  | { kind: "not_reserved"; ruleId: string }
  | { kind: "held_night"; ruleId: string }
  | { kind: "token_unavailable"; ruleId: string }
  | { kind: "sent"; ruleId: string }
  | { kind: "send_failed"; ruleId: string; status: string; retryable: boolean };

/**
 * 댓글 한 건을 처리한다 — 웹훅이 하던 일 그대로.
 * @param opts.rules 이 게시물의 활성 규칙을 이미 읽어 왔으면 넘긴다(«지금 확인»은 한 게시물의 댓글 수십 개를 연달아
 *   처리하므로 규칙을 한 번만 읽는다). 넘기지 않으면 댓글마다 읽는다(웹훅 — 한 알림에 여러 게시물이 섞인다).
 */
export async function processCommentEvent(
  admin: AdminClient,
  account: PipelineAccount,
  event: CommentEvent,
  opts?: { rules?: PipelineRule[] },
): Promise<CommentOutcome> {
  const { ownerId, igUserId, accessToken } = account;

  /* 권한이 **확실히 없는** 연동 — 보내 봐야 권한 오류로 failed_permission 이 확정되고, 댓글당 한 번뿐인 기회를 태운다.
     예약(reserve) 전에 멈추면 dm_sends 행이 없어서, 다시 연결한 뒤 «지금 확인»이 7일 창 안에서 그대로 처리한다.
     로그는 계정당 10분에 한 번(댓글마다 남기면 Sentry 한도를 태운다). */
  if (autoDmScopeCheck(account.grantedScopes).state === "missing") {
    consoleErrorThrottled(
      `auto-dm.scope-missing:${ownerId}`,
      10 * 60 * 1000,
      "[auto-dm] 댓글 권한 없이 연동된 계정 — 다시 연결 전까지 자동 DM 을 건너뜀:",
      flatten(igUserId, 40),
    );
    return { kind: "scope_missing" };
  }

  // 이 게시물의 활성 규칙 조회 → 댓글당 1개만 실행.
  let rules: PipelineRule[] | null;
  if (opts?.rules) {
    rules = opts.rules;
  } else {
    const loaded = await loadActiveRulesForPost(admin, ownerId, event.mediaId);
    if (loaded.error) {
      console.error("[auto-dm] 규칙 조회 실패:", event.commentId, loaded.error);
      return { kind: "rules_error" };
    }
    rules = loaded.data;
  }
  // 이 게시물에 규칙이 없으면 "다음 게시물" 예약 규칙 바인딩을 시도한다 (새 게시물 첫 댓글)
  if (!rules || rules.length === 0) {
    rules = await tryBindNextPostRules(admin, ownerId, event.mediaId, accessToken);
  }
  if (!rules || rules.length === 0) return { kind: "no_rule" };

  const rule = pickRule(rules, event) as PipelineRule | null;
  if (!rule) return { kind: "no_rule" };

  // 멱등 예약 — 중복 웹훅·댓글당 1회·하루 상한·옵트아웃·24h 쿨다운을 DB가 원자적으로 판정.
  // 월 한도는 폐지(2026-08-14) — 실질 무제한 값으로 함수 시그니처만 유지한다.
  /* 수신자 식별은 원문 id 가 아니라 해시로만 저장한다(개인정보 최소수집).
     ⚠️ 해시 계산은 lib/auto-dm/recipient-hash.ts 한 곳이다 — 여기서 손으로 sha256 을 다시 쓰지 말 것.
     조회는 새 해시와 옛 해시를 **함께** 본다 — 옛 방식으로 남은 수신거부를 놓치면
     수신거부한 사람에게 DM 이 나간다(되돌릴 수 없다). */
  const rh = recipientHashes(event.fromId);
  let reserve = await admin.rpc("reserve_dm_send", {
    p_owner: ownerId,
    p_rule_id: rule.id,
    p_comment_id: event.commentId,
    p_user_hash: rh.current,
    p_monthly_limit: MONTHLY_LIMIT_UNLIMITED,
    p_user_hash_legacy: rh.legacy,
  });
  if (reserve.error && isMissingFunction(reserve.error.message)) {
    /* 0090 적용 전 배포 — 옛 시그니처로 한 번 더. 여기서 멈추면 자동 DM 이 통째로 죽는다.
       ⚠️ 단, 페퍼가 켜져 있으면(rh.legacy 가 있다) 폴백하지 않는다 — 옛 함수는 해시 하나만 대조하므로
       페퍼 이전에 저장된 «수신거부»가 안 보여 되돌릴 수 없는 DM 이 나간다. 그 조합에선 이번 댓글을 건너뛰고
       (dm_sends 행이 없으니 0090 적용 뒤 재전송 때 처리된다) 로그로 알린다. */
    if (rh.legacy !== null) {
      console.error("[auto-dm] 0090 미적용인데 DM_HASH_PEPPER 가 켜져 있다 — 옛 함수로 폴백하지 않음(수신거부 대조 누락 방지):", event.commentId);
      return { kind: "reserve_error", ruleId: rule.id };
    }
    reserve = await admin.rpc("reserve_dm_send", {
      p_owner: ownerId,
      p_rule_id: rule.id,
      p_comment_id: event.commentId,
      p_user_hash: rh.current,
      p_monthly_limit: MONTHLY_LIMIT_UNLIMITED,
    });
  }
  const { data: sendId, error: reserveErr } = reserve;
  if (reserveErr) {
    console.error("[auto-dm] 발송 예약 실패:", event.commentId, reserveErr.message);
    return { kind: "reserve_error", ruleId: rule.id };
  }
  if (!sendId) return { kind: "not_reserved", ruleId: rule.id }; // 스킵 사유는 dm_sends 행에 기록됨

  // 광고성 DM 야간 보류 (21~08 KST, 정보통신망법) — 아침 08:10 flush-dms 가 보낸다
  if (rule.is_advertising && isNightInKST()) {
    await finalize(admin, sendId as string, "held_night", null, null);
    return { kind: "held_night", ruleId: rule.id };
  }

  if (!accessToken) {
    // 토큰 미확보(OAuth 전) — pending 유지, 7일 창 내 재처리 대상
    await finalize(admin, sendId as string, "pending", null, "token_unavailable");
    return { kind: "token_unavailable", ruleId: rule.id };
  }

  // 이중 방어: 저장 시점에 고지가 강제되지만(actions.ts), 발송 직전에도 재적용한다.
  // applyAdDisclosure는 멱등이라 이미 고지된 본문은 그대로 통과한다 (정보통신망법 제50조).
  const message = applyAdDisclosure(rule.dm_message, rule.is_advertising);

  const outcome = await sendPrivateReply({
    igUserId,
    commentId: event.commentId,
    message,
    buttons: parseButtons(rule),
    accessToken,
  });

  if (outcome.ok) {
    await finalize(admin, sendId as string, "sent", outcome.igMessageId, null);
    // 공개 답글은 부가 동작 — 실패해도 DM 결과에 영향 없음.
    // 준비된 답글 중 랜덤 1개 — 같은 문구 반복 도배로 인한 스팸 신호를 피한다 (0042)
    const replies = parseReplies(rule);
    if (replies.length > 0) {
      const reply = replies[Math.floor(Math.random() * replies.length)];
      await replyToComment({ commentId: event.commentId, message: reply, accessToken }).catch(() => {});
    }
    return { kind: "sent", ruleId: rule.id };
  }
  await finalize(admin, sendId as string, outcome.status, null, outcome.error);
  return { kind: "send_failed", ruleId: rule.id, status: outcome.status, retryable: outcome.retryable };
}

/** finalize_dm_send RPC 래퍼 — 실패를 조용히 삼키지 않고 로그로 남긴다 */
async function finalize(admin: AdminClient, sendId: string, status: string, igMessageId: string | null, errorMsg: string | null) {
  const { error } = await admin.rpc("finalize_dm_send", {
    p_send_id: sendId,
    p_status: status,
    p_ig_message_id: igMessageId,
    p_error: errorMsg,
  });
  if (error) console.error("[auto-dm] 발송 결과 확정 실패:", sendId, status, error.message);
}
