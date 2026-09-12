import { REFUND_HEAD, refundExamples, refundTermSections } from "@/lib/legal/refund";
import { TERMS_DOC } from "@/lib/legal/documents";
import { cn } from "@/lib/cn";
import { LegalBlocks, LegalMeta, LegalSections } from "./legal-document";

/*
  환불정책 — 요약 표 + 계산 예시 + 이용약관 제22~29조 원문(본문을 따로 쓰지 않는다, lib/legal/refund.ts).
  서버 컴포넌트다: 계산 예시가 요금표(lib/toss/config.ts, server-only)를 읽는다.
*/
export function RefundPolicy({ variant = "marketing" }: { variant?: "marketing" | "app" }) {
  const app = variant === "app";
  const h2 = app ? "text-[17px] font-semibold" : "text-[19px] font-bold md:text-xl";
  return (
    <div>
      <LegalMeta doc={TERMS_DOC} variant={variant} />
      <LegalBlocks blocks={REFUND_HEAD} variant={variant} className="mt-4" />

      <section className={app ? "mt-7" : "mt-10"}>
        <h2 className={h2}>계산 예시</h2>
        <LegalBlocks blocks={refundExamples()} variant={variant} className={app ? "mt-2" : "mt-3"} />
      </section>

      <section className={app ? "mt-7" : "mt-10"}>
        <h2 className={cn(h2, "border-t border-line pt-6")}>이용약관 원문 (제22조~제29조)</h2>
        <LegalSections sections={refundTermSections()} variant={variant} className={app ? "mt-4" : "mt-6"} />
      </section>
    </div>
  );
}
