/**
 * Toss 자동결제(빌링) 서버 호출 — 빌링키 발급·정기 청구 (서버 전용).
 *
 * 키 주의: 빌링은 '결제위젯 연동 키'가 아니라 **API 개별 연동 키**(test_ck_/test_sk_) 세트를 쓴다.
 * env: TOSS_BILLING_SECRET_KEY (서버 전용) + NEXT_PUBLIC_TOSS_BILLING_CLIENT_KEY (빌링 등록창용 공개키).
 * 테스트 키로 개발·테스트 가능("실제 결제가 안되는 테스트" 배지), 라이브 전환만 자동결제 별도 계약 필요.
 * 빌링키는 발급 후 재조회 불가 → 호출측이 즉시 암호화(lib/crypto/tokens) 저장한다.
 */

const TOSS_API_BASE = "https://api.tosspayments.com/v1";

function authHeader(): string | null {
  const secret = process.env.TOSS_BILLING_SECRET_KEY;
  if (!secret) return null;
  return `Basic ${Buffer.from(`${secret}:`).toString("base64")}`;
}

export function isBillingConfigured(): boolean {
  return Boolean(process.env.TOSS_BILLING_SECRET_KEY && process.env.NEXT_PUBLIC_TOSS_BILLING_CLIENT_KEY);
}

export function getBillingClientKey(): string | null {
  return process.env.NEXT_PUBLIC_TOSS_BILLING_CLIENT_KEY || null;
}

async function tossPost<T>(
  path: string,
  body: Record<string, unknown>,
  idempotencyKey?: string,
): Promise<{ ok: true; data: T } | { ok: false; code: string; message: string }> {
  const auth = authHeader();
  if (!auth) return { ok: false, code: "not_configured", message: "TOSS_BILLING_SECRET_KEY 미설정" };
  try {
    const res = await fetch(`${TOSS_API_BASE}${path}`, {
      method: "POST",
      headers: {
        Authorization: auth,
        "Content-Type": "application/json",
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      return {
        ok: false,
        code: String(json.code ?? `http_${res.status}`),
        message: String(json.message ?? "결제 API 호출 실패"),
      };
    }
    return { ok: true, data: json as T };
  } catch (e) {
    return { ok: false, code: "network", message: e instanceof Error ? e.message : String(e) };
  }
}

export interface BillingKeyResult {
  billingKey: string;
  customerKey: string;
  card?: { number?: string; company?: string; cardCompany?: string };
}

/** 빌링 인증(authKey) → billingKey 발급 */
export async function issueBillingKey(params: { authKey: string; customerKey: string }) {
  return tossPost<BillingKeyResult>("/billing/authorizations/issue", params);
}

export interface BillingChargeResult {
  paymentKey: string;
  orderId: string;
  status: string;
  totalAmount: number;
  approvedAt?: string;
  method?: string;
}

/**
 * billingKey로 정기 청구 실행.
 * orderId를 주기별로 결정적으로 만들고 Idempotency-Key로 넘기면
 * 재시도 시 이중 청구가 발생하지 않는다 (뷰스코프 검증 패턴).
 */
export async function chargeBilling(
  billingKey: string,
  params: { customerKey: string; amount: number; orderId: string; orderName: string },
) {
  return tossPost<BillingChargeResult>(
    `/billing/${encodeURIComponent(billingKey)}`,
    params,
    params.orderId,
  );
}
