"use client";

import { ResultBanner } from "@/components/ui/result-banner";

/*
  결제 화면 결과 배너 — 2026-09-03 설정 재설계로 공용 ResultBanner 에 흡수됐다.
  호출부(플랜 관리·결제수단)가 그대로 쓰도록 어댑터만 남긴다. 새 코드는 ResultBanner 를 직접 쓴다.
*/
export function BillingBanner({
  error,
  notice,
  path = "/settings/billing",
}: {
  error?: string | null;
  notice?: string | null;
  path?: string;
}) {
  return <ResultBanner error={error} notice={notice} path={path} />;
}
