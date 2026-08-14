import { NextResponse, after } from "next/server";
import crypto from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptToken } from "@/lib/crypto/tokens";
import { sendPrivateReply, replyToComment } from "@/lib/meta/graph";
import { applyAdDisclosure } from "@/lib/ads/ad-disclosure";
import { parseButtons, NEXT_POST_SENTINEL } from "@/lib/auto-dm/db";
import { fetchMediaMeta } from "@/lib/meta/instagram";
import { isNightInKST, isOptOutMessage, pickRule, type CommentEvent, type MatchableRule } from "@/lib/auto-dm/match";

/**
 * 인스타그램 그래프 웹훅 — 댓글 자동 DM 발송 파이프라인.
 *
 * 처리 순서 (docs/AUTO_DM_COST_RISK.md의 안전장치 그대로):
 *  1) GET  — Meta 구독 검증 핸드셰이크
 *  2) POST — 원문 HMAC-SHA256 서명검증 → 즉시 200 응답 → after()로 비동기 처리
 *     비동기: 자기댓글 가드 → 계정 매핑 → 규칙 매칭(댓글당 1개) → reserve_dm_send(멱등·하루상한·
 *     옵트아웃·24h 쿨다운·월한도 원자 처리) → 광고 야간 보류 → Private Reply 발송 → finalize
 *     + 수신 메시지의 '수신거부' 답장은 옵트아웃 등록
 *
 * 시크릿(전부 서버 전용, NEXT_PUBLIC_ 금지):
 *  - IG_WEBHOOK_VERIFY_TOKEN / META_APP_SECRET : 웹훅 검증
 *  - SUPABASE_SERVICE_ROLE_KEY : 세션 없는 컨텍스트의 DB 접근 (lib/supabase/admin)
 *  - IG_TEST_ACCESS_TOKEN(선택) : OAuth 연동 전 개발자 모드 테스트용 임시 토큰
 */

export const runtime = "nodejs"; // node:crypto 사용 (edge 아님)

/**
 * 월 발송 한도 폐지(2026-08-14) — DM은 원가 0원이라 발송량 게이팅을 없앴다.
 * 플랜 차별화는 "자동화 콘텐츠 개수"(규칙 생성 시점, lib/auto-dm/limits.ts)가 담당하고,
 * 스팸 방지는 규칙별 daily_cap이 담당한다. reserve_dm_send 함수 시그니처는 유지하되
 * 실질 무제한 값을 넘긴다.
 */
const MONTHLY_LIMIT_UNLIMITED = 1000000;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  const verifyToken = process.env.IG_WEBHOOK_VERIFY_TOKEN;
  if (!verifyToken) {
    return new NextResponse("not_configured", { status: 503 });
  }
  if (mode === "subscribe" && token === verifyToken && challenge) {
    return new NextResponse(challenge, { status: 200 });
  }
  return new NextResponse("forbidden", { status: 403 });
}

/** 타이밍 세이프 서명 비교 — 길이가 다르거나 파싱 실패 시 false */
function signatureValid(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!header || !header.startsWith("sha256=")) return false;
  const expected = crypto.createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  const received = header.slice("sha256=".length);
  const expectedBuf = Buffer.from(expected, "hex");
  const receivedBuf = Buffer.from(received, "hex");
  if (expectedBuf.length !== receivedBuf.length) return false;
  try {
    return crypto.timingSafeEqual(expectedBuf, receivedBuf);
  } catch {
    return false;
  }
}

/** 수신자 식별은 원문 id가 아니라 해시로만 저장 (개인정보 최소수집) */
function hashRecipient(igUserId: string): string {
  return crypto.createHash("sha256").update(igUserId).digest("hex");
}

/* 채널 토큰 복호화는 lib/crypto/tokens.decryptToken(AES-256-GCM, 서버 전용) 사용.
 * TOKEN_ENCRYPTION_KEY 미설정이거나 저장 토큰이 없으면 null → IG_TEST_ACCESS_TOKEN(개발자 모드) 폴백. */

/* ── Meta 웹훅 페이로드 타입 (필요 필드만) ─────────────────────── */
interface WebhookCommentValue {
  id?: string;
  text?: string;
  from?: { id?: string; username?: string };
  media?: { id?: string };
}
interface WebhookEntry {
  id?: string; // 연동된 IG 계정의 사용자 id
  changes?: { field?: string; value?: WebhookCommentValue }[];
  messaging?: {
    sender?: { id?: string };
    message?: { text?: string; is_echo?: boolean };
  }[];
}
interface WebhookBody {
  object?: string;
  entry?: WebhookEntry[];
}

/**
 * "다음에 올릴 게시물" 예약 규칙 바인딩 — 리틀리 예약발송 대응 (2026-08-14).
 *
 * 규칙 생성 시 post_id 를 NEXT_POST_SENTINEL 로 두고, 새 게시물에 첫 댓글이 달려
 * 웹훅이 들어오는 순간 실제 media id 로 치환한다. 게시물 업로드 시각이 규칙 생성
 * 시각보다 뒤인 경우에만 — 옛날 게시물 댓글이 예약 규칙을 가로채는 것을 막는다.
 * 메타 조회 실패·토큰 부재 시엔 그냥 null 반환 — 다음 댓글 웹훅에서 재시도된다.
 */
async function tryBindNextPostRules(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  ownerId: string,
  mediaId: string,
  accessToken: string | null,
): Promise<Record<string, unknown>[] | null> {
  const RULE_SELECT =
    "id, post_id, trigger, keywords, status, is_advertising, dm_message, public_reply, button_label, button_url, created_at";
  const query = (columns: string) =>
    admin
      .from("auto_dm_rules")
      .select(columns)
      .eq("user_id", ownerId)
      .eq("post_id", NEXT_POST_SENTINEL)
      .eq("status", "active");
  let res = await query(`${RULE_SELECT}, buttons`);
  if (res.error && /buttons/i.test(res.error.message)) res = await query(RULE_SELECT);
  if (res.error) {
    console.error("[auto-dm] 예약 규칙 조회 실패:", res.error.message);
    return null;
  }
  const pending = (res.data ?? []) as unknown as ({ id: string; created_at: string } & Record<string, unknown>)[];
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

async function processEntry(entry: WebhookEntry) {
  const admin = createAdminClient();
  if (!admin) return; // Supabase 미연동 — 파이프라인 비활성

  const igAccountId = entry.id;
  if (!igAccountId) return;

  // 웹훅 계정 → 핀치 사용자 매핑 (platform_user_id는 0004에서 채널별 유니크 — 중복 연동 불가)
  const { data: account, error: accountErr } = await admin
    .from("connected_accounts")
    .select("user_id, access_token_cipher, platform_user_id")
    .eq("platform_user_id", igAccountId)
    .eq("channel", "instagram")
    .maybeSingle();
  if (accountErr) {
    // DB 오류를 '미연동 계정'으로 오인하면 파이프라인이 조용히 죽는다 — 반드시 로그
    console.error("[auto-dm] 계정 매핑 조회 실패:", igAccountId, accountErr.message);
    return;
  }
  if (!account) return;

  const ownerId: string = account.user_id;
  const accessToken = decryptToken(account.access_token_cipher) ?? process.env.IG_TEST_ACCESS_TOKEN ?? null;

  /* ── 1) 수신 메시지: '수신거부' 답장 → 옵트아웃 등록 ── */
  for (const msg of entry.messaging ?? []) {
    const senderId = msg.sender?.id;
    const text = msg.message?.text;
    // 에코(우리가 보낸 DM)·자기 발신 제외 — 발송 DM 본문에 '수신거부' 안내가 포함되므로
    // 가드 없이는 우리 자신을 옵트아웃 처리하게 된다
    if (msg.message?.is_echo || senderId === igAccountId) continue;
    if (senderId && text && isOptOutMessage(text)) {
      const { error: optErr } = await admin.rpc("mark_optout", {
        p_owner: ownerId,
        p_user_hash: hashRecipient(senderId),
      });
      if (optErr) console.error("[auto-dm] 옵트아웃 등록 실패:", optErr.message);
    }
  }

  /* ── 2) 댓글 이벤트 → 자동 DM ── */
  for (const change of entry.changes ?? []) {
    if (change.field !== "comments") continue;
    const v = change.value ?? {};
    if (!v.id || !v.media?.id || !v.from?.id) continue;

    // 자기 댓글 가드 — 우리가 단 공개 답글이 다시 웹훅으로 들어와 무한 루프가 되는 것을 차단
    if (v.from.id === igAccountId) continue;

    const event: CommentEvent = {
      commentId: v.id,
      mediaId: v.media.id,
      text: v.text ?? "",
      fromId: v.from.id,
      fromUsername: v.from.username ?? null,
    };

    // 감사·디버깅용 최소 필드 로그 (원문 페이로드는 저장하지 않는다 — 비용·개인정보)
    const { error: logErr } = await admin.from("webhook_events").insert({
      ig_comment_id: event.commentId,
      media_id: event.mediaId,
      from_id: hashRecipient(event.fromId),
      verb: "comment",
    });
    if (logErr) console.error("[auto-dm] 이벤트 로그 실패:", logErr.message);

    // 이 게시물의 활성 규칙 조회 → 댓글당 1개만 실행.
    // 조회 오류는 '규칙 없음'과 다르다 — 멱등 예약 전이므로 중단하면 Meta 재전송으로 재처리된다.
    // buttons(0038)는 미적용 DB 폴백을 위해 실패 시 legacy 컬럼만으로 재조회한다.
    const RULE_SELECT_BASE =
      "id, post_id, trigger, keywords, status, is_advertising, dm_message, public_reply, button_label, button_url";
    const loadRules = async (): Promise<{ data: unknown; error: string | null }> => {
      const query = (columns: string) =>
        admin
          .from("auto_dm_rules")
          .select(columns)
          .eq("user_id", ownerId)
          .eq("post_id", event.mediaId)
          .eq("status", "active");
      const first = await query(`${RULE_SELECT_BASE}, buttons`);
      if (first.error && /buttons/i.test(first.error.message)) {
        const fallback = await query(RULE_SELECT_BASE);
        return { data: fallback.data, error: fallback.error?.message ?? null };
      }
      return { data: first.data, error: first.error?.message ?? null };
    };
    const { data: rulesData, error: rulesErr } = await loadRules();
    let rules = rulesData as (MatchableRule & Record<string, unknown>)[] | null;
    if (rulesErr) {
      console.error("[auto-dm] 규칙 조회 실패:", event.commentId, rulesErr);
      continue;
    }
    // 이 게시물에 규칙이 없으면 "다음 게시물" 예약 규칙 바인딩을 시도한다 (새 게시물 첫 댓글)
    if (!rules || rules.length === 0) {
      rules = (await tryBindNextPostRules(admin, ownerId, event.mediaId, accessToken)) as
        | (MatchableRule & Record<string, unknown>)[]
        | null;
    }
    if (!rules || rules.length === 0) continue;

    const rule = pickRule(rules, event) as
      | (MatchableRule & {
          dm_message: string;
          public_reply: string | null;
          button_label: string | null;
          button_url: string | null;
          buttons?: unknown;
        })
      | null;
    if (!rule) continue;

    // 멱등 예약 — 중복 웹훅·댓글당 1회·하루 상한·옵트아웃·24h 쿨다운을 DB가 원자적으로 판정.
    // 월 한도는 폐지(2026-08-14) — 실질 무제한 값으로 함수 시그니처만 유지한다.
    const { data: sendId, error: reserveErr } = await admin.rpc("reserve_dm_send", {
      p_owner: ownerId,
      p_rule_id: rule.id,
      p_comment_id: event.commentId,
      p_user_hash: hashRecipient(event.fromId),
      p_monthly_limit: MONTHLY_LIMIT_UNLIMITED,
    });
    if (reserveErr) {
      console.error("[auto-dm] 발송 예약 실패:", event.commentId, reserveErr.message);
      continue;
    }
    if (!sendId) continue; // 스킵 사유는 dm_sends 행에 기록됨

    // 광고성 DM 야간 보류 (21~08 KST, 정보통신망법) — 아침 재개 큐는 TODO(API-last)
    if (rule.is_advertising && isNightInKST()) {
      await finalize(admin, sendId, "held_night", null, null);
      continue;
    }

    if (!accessToken) {
      // 토큰 미확보(OAuth 전) — pending 유지, 7일 창 내 재처리 대상
      await finalize(admin, sendId, "pending", null, "token_unavailable");
      continue;
    }

    // 이중 방어: 저장 시점에 고지가 강제되지만(actions.ts), 발송 직전에도 재적용한다.
    // applyAdDisclosure는 멱등이라 이미 고지된 본문은 그대로 통과한다 (정보통신망법 제50조).
    const message = applyAdDisclosure(rule.dm_message, rule.is_advertising);

    const outcome = await sendPrivateReply({
      igUserId: igAccountId,
      commentId: event.commentId,
      message,
      buttons: parseButtons(rule),
      accessToken,
    });

    if (outcome.ok) {
      await finalize(admin, sendId, "sent", outcome.igMessageId, null);
      // 공개 답글은 부가 동작 — 실패해도 DM 결과에 영향 없음
      if (rule.public_reply) {
        await replyToComment({ commentId: event.commentId, message: rule.public_reply, accessToken }).catch(() => {});
      }
    } else {
      await finalize(admin, sendId, outcome.status, null, outcome.error);
    }
  }
}

/** finalize_dm_send RPC 래퍼 — 실패를 조용히 삼키지 않고 로그로 남긴다 */
async function finalize(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  sendId: string,
  status: string,
  igMessageId: string | null,
  errorMsg: string | null,
) {
  const { error } = await admin.rpc("finalize_dm_send", {
    p_send_id: sendId,
    p_status: status,
    p_ig_message_id: igMessageId,
    p_error: errorMsg,
  });
  if (error) console.error("[auto-dm] 발송 결과 확정 실패:", sendId, status, error.message);
}

export async function POST(request: Request) {
  const appSecret = process.env.META_APP_SECRET;
  if (!appSecret) {
    return new NextResponse("not_configured", { status: 503 });
  }

  // 서명 검증은 반드시 가공 전 원문(raw body) 기준
  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");
  if (!signatureValid(rawBody, signature, appSecret)) {
    return new NextResponse("invalid_signature", { status: 401 });
  }

  let body: WebhookBody;
  try {
    body = JSON.parse(rawBody) as WebhookBody;
  } catch {
    return new NextResponse("invalid_json", { status: 400 });
  }

  // Meta는 빠른 200을 요구한다(늦으면 재전송·구독 비활성 위험) — 처리는 응답 후 비동기로
  after(async () => {
    try {
      for (const entry of body.entry ?? []) {
        await processEntry(entry);
      }
    } catch (e) {
      console.error("[auto-dm] webhook 처리 실패:", e);
    }
  });

  return NextResponse.json({ received: true });
}
