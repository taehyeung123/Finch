"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/*
  결제 화면 결과 배너 (2026-08-14 감사 반영).
  서버 액션이 planRedirect 쿼리(planError·planChanged·subCanceled…)로 넘긴 결과를 표시하고,
  새로고침마다 배너가 재표시되지 않도록 표시 직후 쿼리를 URL에서 제거한다.
  URL 정리로 props가 비어도 배너는 로컬 상태로 유지한다.
*/
export function BillingBanner({
  error,
  notice,
  path = "/settings/billing",
}: {
  error?: string | null;
  notice?: string | null;
  /** 쿼리를 지운 뒤 남길 주소 — 결제수단 화면(/settings/billing/payment)도 같은 배너를 쓴다 */
  path?: string;
}) {
  const router = useRouter();
  const [current, setCurrent] = useState<{ error?: string | null; notice?: string | null }>({ error, notice });

  // 새 결과가 프롭으로 들어오면 렌더 중 상태 조정(React 공식 패턴) — effect 내 setState 금지 규칙 준수
  if ((error || notice) && (error !== current.error || notice !== current.notice)) {
    setCurrent({ error, notice });
  }

  useEffect(() => {
    if (error || notice) {
      router.replace(path, { scroll: false });
    }
  }, [error, notice, path, router]);

  if (!current.error && !current.notice) return null;
  return (
    <>
      {current.error ? (
        <div
          className="rounded-card border border-negative/40 bg-negative-weak p-4 text-[15px] text-negative-strong"
          role="alert"
        >
          {current.error}
        </div>
      ) : null}
      {current.notice ? (
        <div
          className="rounded-card border border-positive/40 bg-positive-weak p-4 text-[15px] text-positive-strong"
          role="status"
        >
          {current.notice}
        </div>
      ) : null}
    </>
  );
}
