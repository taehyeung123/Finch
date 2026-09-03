import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptToken, isTokenEncryptionConfigured } from "@/lib/crypto/tokens";
import { issueBillingKey } from "@/lib/toss/billing";
import { notifyUser } from "@/lib/notify";

/**
 * 결제 카드 변경 2단계 — 빌링 인증(authKey) → 새 billingKey 발급 → 기존 구독의 카드만 교체.
 *
 * 구독 활성화(/api/billing/issue)와 다른 점:
 *  - **청구하지 않는다.** 다음 정기결제(또는 past_due 재시도)부터 새 카드로 나간다.
 *  - status 를 건드리지 않는다. past_due 는 크론이 새 키로 재시도해 성공하면 스스로 active 로 돌아간다.
 * 같은 점: customerKey 가 **이 사용자의** 구독인지 먼저 대조한다(타인 키 탈취 방지),
 * 빌링키는 재조회 불가라 즉시 암호화 저장한다(평문 금지).
 */
export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { authKey?: string; customerKey?: string } | null;
  if (!body?.authKey || !body?.customerKey) {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  if (!isTokenEncryptionConfigured()) {
    console.error("[billing:card:issue] TOKEN_ENCRYPTION_KEY 미설정 — 빌링키 저장 불가");
    return NextResponse.json({ error: "서버 설정 오류입니다." }, { status: 503 });
  }
  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "서버 설정 오류입니다." }, { status: 503 });
  }

  const { data: sub } = await admin
    .from("subscriptions")
    .select("id, user_id, status, card_summary")
    .eq("toss_customer_key", body.customerKey)
    .maybeSingle();
  if (!sub || sub.user_id !== user.id) {
    return NextResponse.json({ error: "구독 정보를 찾을 수 없습니다." }, { status: 404 });
  }
  if (!["active", "past_due", "canceled"].includes(String(sub.status))) {
    return NextResponse.json({ error: "카드를 바꿀 수 있는 구독 상태가 아니에요." }, { status: 409 });
  }

  // 1) 새 빌링키 발급 → 즉시 암호화
  const issued = await issueBillingKey({ authKey: body.authKey, customerKey: body.customerKey });
  if (!issued.ok) {
    return NextResponse.json({ error: `카드 등록에 실패했어요: ${issued.message}` }, { status: 402 });
  }
  const cipher = encryptToken(issued.data.billingKey);
  if (!cipher) {
    return NextResponse.json({ error: "서버 설정 오류입니다." }, { status: 503 });
  }
  const card = issued.data.card;
  const cardSummary = card ? `${card.company ?? card.cardCompany ?? "카드"} ${card.number ?? ""}`.trim() : null;

  // 2) 기존 행의 카드만 교체 — 소유자 조건을 한 번 더 건다(위 대조와 이중 방어)
  const { data: updated, error: upErr } = await admin
    .from("subscriptions")
    .update({ billing_key_cipher: cipher, card_summary: cardSummary })
    .eq("id", sub.id)
    .eq("user_id", user.id)
    .select("id");
  if (upErr || !updated || updated.length === 0) {
    /* 토스에는 새 키가 발급됐는데 우리 쪽 저장이 실패 — 이전 카드가 그대로 청구된다. 사실대로 말한다. */
    console.error("[billing:card:issue] 카드 교체 저장 실패:", sub.id, upErr?.message ?? "0행");
    return NextResponse.json(
      { error: "새 카드를 저장하지 못했어요. 이전 카드가 그대로 유지됩니다 — 잠시 후 다시 시도해 주세요." },
      { status: 500 },
    );
  }

  await notifyUser(admin, {
    userId: user.id,
    type: "billing",
    title: "결제 카드를 변경했어요",
    body: `다음 결제부터 ${cardSummary ?? "새 카드"}(으)로 청구됩니다.${sub.status === "past_due" ? " 실패했던 결제는 자동으로 다시 시도합니다." : ""}`,
  });

  return NextResponse.json({ status: "changed", cardSummary });
}
