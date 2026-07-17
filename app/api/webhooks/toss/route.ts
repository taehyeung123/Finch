import { NextResponse, after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPayment } from "@/lib/toss/server";

/**
 * Toss 결제 웹훅 — 결제 상태 변경 반영.
 * 실 스펙: docs/REAL_API_SPEC.md 4절.
 *
 * 결제 웹훅(PAYMENT_STATUS_CHANGED 등)은 서명이 없고 공식 IP 허용목록도 없다.
 * 따라서 본문을 신뢰하지 않고, paymentKey로 Toss API를 재조회한 결과를 진위의 근거로 삼는다.
 * 항상 200을 반환한다(실패 시 Toss가 최대 7회 재시도).
 */
export const runtime = "nodejs";

interface TossWebhookBody {
  eventType?: string;
  data?: { paymentKey?: string; orderId?: string; status?: string };
}

const STATUS_MAP: Record<string, "paid" | "canceled" | "failed"> = {
  DONE: "paid",
  CANCELED: "canceled",
  PARTIAL_CANCELED: "canceled",
  ABORTED: "failed",
  EXPIRED: "failed",
};

export async function POST(request: Request) {
  let body: TossWebhookBody;
  try {
    body = (await request.json()) as TossWebhookBody;
  } catch {
    return NextResponse.json({ received: true }, { status: 200 });
  }

  const paymentKey = body.data?.paymentKey;
  // 결제 상태 변경만 처리 (그 외 이벤트는 수신확인만)
  if (body.eventType === "PAYMENT_STATUS_CHANGED" && paymentKey) {
    after(async () => {
      const admin = createAdminClient();
      if (!admin) return; // 서비스 롤 키 미설정 — 반영 불가

      // 본문 status를 믿지 않고 재조회
      const result = await getPayment(paymentKey);
      if (!result.ok) {
        console.error("[toss-webhook] 결제 재조회 실패:", result.message);
        return;
      }
      const mapped = STATUS_MAP[result.payment.status];
      if (!mapped) return; // READY/IN_PROGRESS 등 중간상태는 건너뜀

      const { error } = await admin
        .from("payment_orders")
        .update({
          status: mapped,
          payment_key: result.payment.paymentKey,
          method: result.payment.method ?? null,
          approved_at: result.payment.approvedAt ?? null,
          raw: result.payment.raw,
        })
        .eq("order_id", result.payment.orderId);
      if (error) console.error("[toss-webhook] 주문 갱신 실패:", error.message);
    });
  }

  return NextResponse.json({ received: true }, { status: 200 });
}
