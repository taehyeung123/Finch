import { NextResponse } from "next/server";
import crypto from "node:crypto";

/**
 * 인스타그램 그래프 웹훅 수신 엔드포인트 (댓글 자동 DM용) — 보안 스캐폴드.
 *
 * 실제 메시지 발송은 API-last 단계다. 지금은 두 가지 보안 관문만 완성해 둔다:
 *  1) GET  — Meta 웹훅 구독 검증 핸드셰이크 (hub.verify_token 대조 후 hub.challenge 반환)
 *  2) POST — 댓글 알림 수신. 본문 HMAC-SHA256 서명(x-hub-signature-256)을 앱 시크릿으로
 *            검증하기 전에는 어떤 처리도 하지 않는다 (CLAUDE.md 웹훅 서명검증 필수 규칙).
 *
 * 시크릿은 전부 서버 전용(NEXT_PUBLIC_ 금지):
 *  - IG_WEBHOOK_VERIFY_TOKEN : 구독 검증 토큰
 *  - META_APP_SECRET         : 페이로드 서명 검증 키
 * 두 값이 없으면(연동 전) 처리하지 않고 503으로 응답한다.
 */

export const runtime = "nodejs"; // node:crypto 사용 (edge 아님)

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  const verifyToken = process.env.IG_WEBHOOK_VERIFY_TOKEN;
  if (!verifyToken) {
    // 연동 전 — 검증 토큰 미설정
    return new NextResponse("not_configured", { status: 503 });
  }

  if (mode === "subscribe" && token === verifyToken && challenge) {
    // Meta는 평문 challenge 그대로 에코하기를 기대한다
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

export async function POST(request: Request) {
  const appSecret = process.env.META_APP_SECRET;
  if (!appSecret) {
    // 연동 전 — 서명 검증 불가이므로 처리하지 않는다
    return new NextResponse("not_configured", { status: 503 });
  }

  // 서명 검증은 반드시 "가공 전 원문(raw body)" 기준
  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");

  if (!signatureValid(rawBody, signature, appSecret)) {
    return new NextResponse("invalid_signature", { status: 401 });
  }

  // 여기부터는 서명이 검증된 신뢰 가능한 페이로드다.
  // TODO(API-last): Meta 앱 심사(instagram_manage_messages + instagram_manage_comments) 완료 후
  //   - 댓글 이벤트 파싱 → 게시물별 AutoDmRule 매칭(키워드/전체) → 댓글 1건당 1회·7일 이내 중복 방지
  //   - dailyCap·월 한도·플랜 게이팅 확인 후 큐(Inngest 등)로 Private Reply 발송 위임
  //   - isAdvertising 규칙은 (광고) 표기·수신거부 안내가 포함됐는지 최종 확인
  // 현재는 수신 확인만 하고 200으로 응답한다 (Meta 재전송 방지).
  return NextResponse.json({ received: true });
}
