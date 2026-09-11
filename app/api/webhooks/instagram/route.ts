import { ownerDevToken } from "@/lib/auto-dm/dev-token";
import { consoleErrorThrottled } from "@/lib/monitoring/log-throttle";
import { NextResponse, after } from "next/server";
import crypto from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptToken } from "@/lib/crypto/tokens";
import { recipientHash, recipientHashes } from "@/lib/auto-dm/recipient-hash";
import { sendPrivateReply, replyToComment } from "@/lib/meta/graph";
import { applyAdDisclosure } from "@/lib/ads/ad-disclosure";
import { parseButtons, parseReplies, NEXT_POST_SENTINEL } from "@/lib/auto-dm/db";
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
 *  - IG_WEBHOOK_VERIFY_TOKEN : 구독 핸드셰이크
 *  - INSTAGRAM_APP_SECRET (없거나 안 맞으면 META_APP_SECRET) : 페이로드 서명 검증 — 아래 webhookSecrets 참조
 *  - SUPABASE_SERVICE_ROLE_KEY : 세션 없는 컨텍스트의 DB 접근 (lib/supabase/admin)
 *  - IG_TEST_ACCESS_TOKEN(선택) : OAuth 연동 전 개발자 모드 테스트용 임시 토큰
 */

export const runtime = "nodejs"; // node:crypto 사용 (edge 아님)
/* after() 안의 처리(댓글당 DB 왕복 + Graph 호출, 메타는 한 POST 에 댓글 여러 개를 묶는다)가 함수 실행시간에 포함된다 —
   선언이 없으면 플랫폼 기본값에 걸려 도중에 강제 종료되고, Private Reply 1회 제한 때문에 재처리 때 이미 보낸 건이
   실패로 집계된다(flush-dms·refresh-tokens·publish-scheduled 와 같은 근거, 2026-09-09 감사). */
export const maxDuration = 300;

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

/* 수신자 식별은 원문 id 가 아니라 해시로만 저장한다(개인정보 최소수집).
   ⚠️ 해시 계산은 lib/auto-dm/recipient-hash.ts 한 곳이다 — 여기서 손으로 sha256 을 다시 쓰지 말 것.
   키 없는 sha256 은 «어떤 게시물에 누가 댓글을 달았는지»가 공개 정보라 후보 대조로 되짚힌다(2026-09-08 감사).
   조회는 새 해시와 옛 해시를 **함께** 본다 — 옛 방식으로 남은 수신거부를 놓치면
   수신거부한 사람에게 DM 이 나간다(되돌릴 수 없다). */

/** RPC 가 «함수를 못 찾음»인가 — 0090 적용 전 배포에서 옛 시그니처로 한 번 더 시도하기 위한 판정 */
function isMissingFunction(msg: string | undefined): boolean {
  return !!msg && /could not find the function|does not exist/i.test(msg);
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
  let res = await query(`${RULE_SELECT}, buttons, public_replies`);
  if (res.error && /buttons|public_replies/i.test(res.error.message)) res = await query(RULE_SELECT);
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

  /* 웹훅 계정 → 핀치 사용자 매핑.
     ⚠️ entry.id 는 **인스타그램 프로페셔널 계정 ID(IG_ID)** 다. 콜백이 platform_user_id 에 저장하던 /me 의 `id` 는
     **앱 범위 ID** 라 값이 다르다(메타 문서: user_id — «This ID is the value of the id field received in webhook
     notifications»). 그래서 이 매핑이 영영 0행이었고 자동 DM 이 한 통도 나갈 수 없는 구조였다(2026-09-09 감사).
     이제 콜백이 ig_id(=user_id)를 따로 저장하고(0091) 여기서 그걸로 먼저 찾는다. 0091 미적용·아직 백필 안 된 계정은
     platform_user_id 로 한 번 더 찾는다(두 값이 같은 계정도 있다). connected=false(앱에서 해제)는 잡지 않는다 —
     끊긴 계정의 댓글을 예약해 봐야 token_unavailable 로 남았다가 6.5일 뒤 실패로 집계될 뿐이다. */
  const findAccount = (col: "ig_id" | "platform_user_id") =>
    admin
      .from("connected_accounts")
      .select("user_id, access_token_cipher, platform_user_id")
      .eq(col, igAccountId)
      .eq("channel", "instagram")
      .eq("connected", true)
      .maybeSingle();
  let lookup = await findAccount("ig_id");
  if (lookup.error && /ig_id/i.test(lookup.error.message)) lookup = await findAccount("platform_user_id");
  else if (!lookup.error && !lookup.data) lookup = await findAccount("platform_user_id");
  const { data: account, error: accountErr } = lookup;
  if (accountErr) {
    // DB 오류를 '미연동 계정'으로 오인하면 파이프라인이 조용히 죽는다 — 반드시 로그
    console.error("[auto-dm] 계정 매핑 조회 실패:", igAccountId, accountErr.message);
    return;
  }
  if (!account) {
    /* 예전엔 여기서 로그 한 줄 없이 끝나 매핑 실패를 관측할 수 없었다. 인증 전 경로라 스로틀. */
    consoleErrorThrottled("auto-dm.unmapped", 10 * 60 * 1000, "[auto-dm] 웹훅 계정에 대응하는 연동이 없음:", igAccountId);
    return;
  }

  const ownerId: string = account.user_id;
  /* 개발용 토큰 폴백은 운영자 본인 계정에만(lib/auto-dm/dev-token.ts) — 남의 계정에 쓰면 실패를 확정시킨다 */
  const accessToken =
    decryptToken(account.access_token_cipher, { userId: ownerId, field: "connected_accounts.access_token_cipher" }) ??
    (await ownerDevToken(admin, ownerId));

  /* ── 1) 수신 메시지: '수신거부' 답장 → 옵트아웃 등록 ── */
  for (const msg of entry.messaging ?? []) {
    const senderId = msg.sender?.id;
    const text = msg.message?.text;
    // 에코(우리가 보낸 DM)·자기 발신 제외 — 발송 DM 본문에 '수신거부' 안내가 포함되므로
    // 가드 없이는 우리 자신을 옵트아웃 처리하게 된다
    if (msg.message?.is_echo || senderId === igAccountId) continue;
    if (senderId && text && isOptOutMessage(text)) {
      const h = recipientHashes(senderId);
      let optErr = (
        await admin.rpc("mark_optout", {
          p_owner: ownerId,
          p_user_hash: h.current,
          p_user_hash_legacy: h.legacy,
        })
      ).error;
      /* 0090 적용 전 배포 — 옛 시그니처로 한 번 더. 수신거부 등록은 절대 놓치면 안 되는 쓰기다. */
      if (optErr && isMissingFunction(optErr.message)) {
        optErr = (await admin.rpc("mark_optout", { p_owner: ownerId, p_user_hash: h.current })).error;
      }
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
    /* user_id 를 반드시 넣는다(0087) — 이 고리가 없으면 탈퇴 cascade 가 닿지 않아
       개인정보처리방침이 확언한 «탈퇴와 동시에 파기»가 성립하지 않는다.
       0087 미적용 DB 면 컬럼이 없어 실패하므로 컬럼을 빼고 한 번 더 시도한다(계단식 폴백). */
    const logRow = {
      ig_comment_id: event.commentId,
      media_id: event.mediaId,
      from_id: recipientHash(event.fromId),
      verb: "comment",
    };
    let logErr = (await admin.from("webhook_events").insert({ ...logRow, user_id: ownerId })).error;
    if (logErr && /user_id/i.test(logErr.message)) {
      logErr = (await admin.from("webhook_events").insert(logRow)).error;
    }
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
      const first = await query(`${RULE_SELECT_BASE}, buttons, public_replies`);
      if (first.error && /buttons|public_replies/i.test(first.error.message)) {
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
          public_replies?: unknown;
          button_label: string | null;
          button_url: string | null;
          buttons?: unknown;
        })
      | null;
    if (!rule) continue;

    // 멱등 예약 — 중복 웹훅·댓글당 1회·하루 상한·옵트아웃·24h 쿨다운을 DB가 원자적으로 판정.
    // 월 한도는 폐지(2026-08-14) — 실질 무제한 값으로 함수 시그니처만 유지한다.
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
        continue;
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
      // 공개 답글은 부가 동작 — 실패해도 DM 결과에 영향 없음.
      // 준비된 답글 중 랜덤 1개 — 같은 문구 반복 도배로 인한 스팸 신호를 피한다 (0042)
      const replies = parseReplies(rule);
      if (replies.length > 0) {
        const reply = replies[Math.floor(Math.random() * replies.length)];
        await replyToComment({ commentId: event.commentId, message: reply, accessToken }).catch(() => {});
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

/**
 * 서명 검증에 쓸 시크릿 — **인스타 제품 시크릿이 먼저다**(2026-09-11).
 *
 * 인스타그램 로그인 방식은 제품 단위로 ID·시크릿 한 쌍을 따로 받는다(INSTAGRAM_APP_SECRET — .env.example 참조).
 * 연동·해제·데이터 삭제 콜백은 전부 그 쌍을 쓰는데(lib/meta/instagram-oauth.ts) 이 웹훅만 META_APP_SECRET 을 봤다.
 * 그 결과 운영에 들어온 댓글 알림이 **전부 401** 로 버려졌다 — 9/10 17:04~17:17 31건 전부 invalid_signature,
 * 자동 DM 이 한 통도 안 나간 원인이다(Vercel 로그로 확인, 2026-09-11).
 * META_APP_SECRET 은 두 번째 후보로만 남긴다 — 둘 다 우리만 아는 값이라 어느 쪽으로 맞아도 진짜 Meta 발신이다.
 */
function webhookSecrets(): string[] {
  return [process.env.INSTAGRAM_APP_SECRET, process.env.META_APP_SECRET].filter(
    (v, i, all): v is string => !!v && all.indexOf(v) === i,
  );
}

export async function POST(request: Request) {
  const secrets = webhookSecrets();
  if (secrets.length === 0) {
    return new NextResponse("not_configured", { status: 503 });
  }

  // 서명 검증은 반드시 가공 전 원문(raw body) 기준
  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");
  if (!secrets.some((secret) => signatureValid(rawBody, signature, secret))) {
    /* 조용히 401 만 주면 «알림은 오는데 DM 이 안 나간다»가 로그에서 안 보인다(이번 사고가 그랬다). 인증 전 경로라 스로틀 */
    consoleErrorThrottled("auto-dm.bad-signature", 10 * 60 * 1000, "[auto-dm] 웹훅 서명 불일치 — 시크릿 설정 확인:", signature ? "서명 있음" : "서명 없음");
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
