/**
 * Toss Payments 서버 호출 — 결제 승인·조회 (서버 전용).
 * 실 스펙: docs/REAL_API_SPEC.md 4절.
 *
 * 인증: Authorization: Basic base64(secretKey + ":")  ← 콜론(빈 비번) 필수.
 * 승인은 리다이렉트 후 10분 이내, Idempotency-Key로 중복 승인 방지.
 * TOSS_SECRET_KEY는 서버 전용(NEXT_PUBLIC_ 금지).
 */

const TOSS_API_BASE = "https://api.tosspayments.com/v1";

function authHeader(): string | null {
  const secret = process.env.TOSS_SECRET_KEY;
  if (!secret) return null;
  return `Basic ${Buffer.from(`${secret}:`).toString("base64")}`;
}

export interface TossPayment {
  paymentKey: string;
  orderId: string;
  status: string; // READY | IN_PROGRESS | DONE | CANCELED | ABORTED | EXPIRED ...
  totalAmount: number;
  method?: string;
  approvedAt?: string;
  raw: Record<string, unknown>;
}

export type TossResult =
  | { ok: true; payment: TossPayment }
  | { ok: false; code: string; message: string };

function toPayment(json: Record<string, unknown>): TossPayment {
  return {
    paymentKey: String(json.paymentKey ?? ""),
    orderId: String(json.orderId ?? ""),
    status: String(json.status ?? ""),
    totalAmount: typeof json.totalAmount === "number" ? json.totalAmount : Number(json.totalAmount ?? 0),
    method: typeof json.method === "string" ? json.method : undefined,
    approvedAt: typeof json.approvedAt === "string" ? json.approvedAt : undefined,
    raw: json,
  };
}

/** 결제 승인 — successUrl에서 받은 (paymentKey, orderId, amount)로 확정. idempotencyKey로 중복 방지. */
export async function confirmPayment(params: {
  paymentKey: string;
  orderId: string;
  amount: number;
  idempotencyKey: string;
}): Promise<TossResult> {
  const auth = authHeader();
  if (!auth) return { ok: false, code: "not_configured", message: "TOSS_SECRET_KEY 미설정" };
  try {
    const res = await fetch(`${TOSS_API_BASE}/payments/confirm`, {
      method: "POST",
      headers: {
        Authorization: auth,
        "Content-Type": "application/json",
        "Idempotency-Key": params.idempotencyKey,
      },
      body: JSON.stringify({
        paymentKey: params.paymentKey,
        orderId: params.orderId,
        amount: params.amount,
      }),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      return {
        ok: false,
        code: String(json.code ?? `http_${res.status}`),
        message: String(json.message ?? "결제 승인 실패"),
      };
    }
    return { ok: true, payment: toPayment(json) };
  } catch (e) {
    return { ok: false, code: "network", message: e instanceof Error ? e.message : String(e) };
  }
}

/** 결제 취소 — 전액 취소(환불). 운영자가 Toss 상점관리자에서 취소해도 웹훅으로 동기화된다. */
export async function cancelPayment(params: {
  paymentKey: string;
  cancelReason: string;
  idempotencyKey?: string;
}): Promise<TossResult> {
  const auth = authHeader();
  if (!auth) return { ok: false, code: "not_configured", message: "TOSS_SECRET_KEY 미설정" };
  try {
    const res = await fetch(`${TOSS_API_BASE}/payments/${encodeURIComponent(params.paymentKey)}/cancel`, {
      method: "POST",
      headers: {
        Authorization: auth,
        "Content-Type": "application/json",
        ...(params.idempotencyKey ? { "Idempotency-Key": params.idempotencyKey } : {}),
      },
      body: JSON.stringify({ cancelReason: params.cancelReason }),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      return {
        ok: false,
        code: String(json.code ?? `http_${res.status}`),
        message: String(json.message ?? "결제 취소 실패"),
      };
    }
    return { ok: true, payment: toPayment(json) };
  } catch (e) {
    return { ok: false, code: "network", message: e instanceof Error ? e.message : String(e) };
  }
}

/** 결제 단건 조회 — 웹훅(미서명) 진위 확인용. 본문 대신 이 조회 결과를 신뢰한다. */
export async function getPayment(paymentKey: string): Promise<TossResult> {
  const auth = authHeader();
  if (!auth) return { ok: false, code: "not_configured", message: "TOSS_SECRET_KEY 미설정" };
  try {
    const res = await fetch(`${TOSS_API_BASE}/payments/${encodeURIComponent(paymentKey)}`, {
      headers: { Authorization: auth },
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      return {
        ok: false,
        code: String(json.code ?? `http_${res.status}`),
        message: String(json.message ?? "결제 조회 실패"),
      };
    }
    return { ok: true, payment: toPayment(json) };
  } catch (e) {
    return { ok: false, code: "network", message: e instanceof Error ? e.message : String(e) };
  }
}
