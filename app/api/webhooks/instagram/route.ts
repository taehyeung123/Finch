import { consoleErrorThrottled } from "@/lib/monitoring/log-throttle";
import { NextResponse, after } from "next/server";
import crypto from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { recipientHash, recipientHashes } from "@/lib/auto-dm/recipient-hash";
import { isOptOutMessage, type CommentEvent } from "@/lib/auto-dm/match";
import { isMissingFunction, processCommentEvent, resolveAutoDmToken } from "@/lib/auto-dm/pipeline";

/**
 * 인스타그램 그래프 웹훅 — 댓글 자동 DM 발송 파이프라인.
 *
 * 처리 순서 (docs/AUTO_DM_COST_RISK.md의 안전장치 그대로):
 *  1) GET  — Meta 구독 검증 핸드셰이크
 *  2) POST — 원문 HMAC-SHA256 서명검증 → 즉시 200 응답 → after()로 비동기 처리
 *     비동기: 자기댓글 가드 → 계정 매핑 → 이벤트 로그 → **공통 파이프라인**(lib/auto-dm/pipeline.ts:
 *     권한 확인 → 규칙 매칭(댓글당 1개) → reserve_dm_send(멱등·하루상한·옵트아웃·24h 쿨다운·월한도 원자 처리)
 *     → 광고 야간 보류 → Private Reply 발송 → finalize)
 *     + 수신 메시지의 '수신거부' 답장은 옵트아웃 등록
 *  ⚠️ 댓글 한 건의 판정·발송은 pipeline.ts 한 곳이다 — «지금 확인»(lib/auto-dm/check-now.ts)도 같은 함수를 부른다.
 *     여기서 발송 로직을 다시 쓰지 말 것(두 경로가 갈라지면 같은 댓글에 다른 판정이 나간다).
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

/* 채널 토큰 복호화는 lib/crypto/tokens.decryptToken(AES-256-GCM, 서버 전용) 사용 — pipeline.resolveAutoDmToken.
 * TOKEN_ENCRYPTION_KEY 미설정이거나 저장 토큰이 없으면 null → IG_TEST_ACCESS_TOKEN(개발자 모드, 운영자 본인만) 폴백. */

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

interface MappedAccount {
  user_id: string;
  access_token_cipher: string | null;
  platform_user_id: string | null;
  /** 0075 — null 은 «확인 불가»(0075 이전 연동). 0075 미적용 DB 면 컬럼 없이 읽어 undefined */
  granted_scopes?: string[] | null;
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
     끊긴 계정의 댓글을 예약해 봐야 token_unavailable 로 남았다가 6.5일 뒤 실패로 집계될 뿐이다.
     granted_scopes(0075)를 함께 읽는다 — 댓글 권한이 **확실히 없는** 연동은 파이프라인이 발송 전에 건너뛴다.
     0075 미적용 DB 면 그 컬럼만 빼고 다시 읽는다(«확인 불가» = 막지 않는다). */
  const ACCOUNT_COLUMNS = "user_id, access_token_cipher, platform_user_id";
  const findAccount = (col: "ig_id" | "platform_user_id", withScopes: boolean) =>
    admin
      .from("connected_accounts")
      .select(withScopes ? `${ACCOUNT_COLUMNS}, granted_scopes` : ACCOUNT_COLUMNS)
      .eq(col, igAccountId)
      .eq("channel", "instagram")
      .eq("connected", true)
      .maybeSingle();
  const lookupBy = async (col: "ig_id" | "platform_user_id") => {
    const first = await findAccount(col, true);
    if (first.error && /granted_scopes/i.test(first.error.message)) return findAccount(col, false);
    return first;
  };
  let lookup = await lookupBy("ig_id");
  if (lookup.error && /ig_id/i.test(lookup.error.message)) lookup = await lookupBy("platform_user_id");
  else if (!lookup.error && !lookup.data) lookup = await lookupBy("platform_user_id");
  const { data: accountData, error: accountErr } = lookup;
  if (accountErr) {
    // DB 오류를 '미연동 계정'으로 오인하면 파이프라인이 조용히 죽는다 — 반드시 로그
    console.error("[auto-dm] 계정 매핑 조회 실패:", igAccountId, accountErr.message);
    return;
  }
  const account = accountData as unknown as MappedAccount | null;
  if (!account) {
    /* 예전엔 여기서 로그 한 줄 없이 끝나 매핑 실패를 관측할 수 없었다. 인증 전 경로라 스로틀. */
    consoleErrorThrottled("auto-dm.unmapped", 10 * 60 * 1000, "[auto-dm] 웹훅 계정에 대응하는 연동이 없음:", igAccountId);
    return;
  }

  const ownerId: string = account.user_id;
  /* 개발용 토큰 폴백은 운영자 본인 계정에만(lib/auto-dm/dev-token.ts) — 남의 계정에 쓰면 실패를 확정시킨다 */
  const accessToken = await resolveAutoDmToken(admin, ownerId, account.access_token_cipher);

  /* ── 1) 수신 메시지: '수신거부' 답장 → 옵트아웃 등록 ──
     권한 확인과 무관하게 **항상** 처리한다 — 수신거부 등록은 사람을 보호하는 쓰기라 어떤 이유로도 건너뛰지 않는다. */
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

    /* 판정·발송은 공통 파이프라인 — 결과는 파이프라인이 로그로 남기므로 여기선 버린다.
       규칙 조회·예약이 실패한 댓글은 dm_sends 행이 없어서 메타 재전송(또는 «지금 확인»)이 다시 처리한다. */
    await processCommentEvent(
      admin,
      { ownerId, igUserId: igAccountId, accessToken, grantedScopes: account.granted_scopes ?? null },
      event,
    );
  }
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
