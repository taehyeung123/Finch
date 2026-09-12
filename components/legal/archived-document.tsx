import Link from "next/link";
import type { ArchivedDoc } from "@/lib/legal/archive";
import { LegalSections } from "./legal-document";

/*
  종전 게시본 — 약관 부칙 제3조·방침 제22조가 가리키는 «내가 동의했던 문서».
  본문은 lib/legal/archive.ts 의 얼린 사본을 그대로 그린다(당시 문구 그대로 — 고치지 않는다).
  맨 위 띠가 «지금 문서가 아니다»를 먼저 말한다. 검색에는 내보내지 않는다(페이지 metadata 가 noindex).
*/
export function ArchivedLegalDocument({ doc, currentHref }: { doc: ArchivedDoc; currentHref: string }) {
  return (
    <div>
      <div role="note" className="rounded-card border border-line bg-body p-4 text-[15px] leading-relaxed text-fg-sub">
        <p className="break-keep font-semibold text-fg">개정 전 게시본입니다 — 지금 적용되는 문서가 아닙니다.</p>
        <p className="mt-1 break-keep">{doc.period}</p>
        <p className="mt-2">
          <Link href={currentHref} className="trans-state -my-2 inline-block py-2 font-medium text-fg-sub underline underline-offset-2 hover:text-fg">
            현행 {doc.title} 보기
          </Link>
        </p>
      </div>

      {/* 당시 문서 위에 떠 있던 안내 문구 — 기록이라 그대로 싣는다 */}
      <p className="mt-6 break-keep border-l-2 border-line pl-3 text-[14px] leading-relaxed text-fg-sub">
        <span className="font-semibold text-fg">당시 게시된 안내:</span> {doc.headNotice}
      </p>

      <LegalSections sections={doc.sections} className="mt-10" />
    </div>
  );
}
