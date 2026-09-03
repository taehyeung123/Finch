/**
 * 로그인 제공자 — 핀치는 Google·카카오 OAuth 로만 로그인한다.
 * 라벨은 여기 한 벌뿐이다(허브 PROVIDER_LABEL 과 로그인 계정 화면 LINKED_LABEL 두 벌이 있었다 — 2026-09-03 통합).
 */
export type Provider = "google" | "kakao";

export const PROVIDERS: readonly Provider[] = ["google", "kakao"];

export const PROVIDER_LABEL: Record<Provider, string> = {
  google: "Google",
  kakao: "카카오",
};

export function isProvider(v: string): v is Provider {
  return v === "google" || v === "kakao";
}

export function providerLabel(v: string): string {
  return isProvider(v) ? PROVIDER_LABEL[v] : v;
}
