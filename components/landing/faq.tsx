"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

export interface FaqItem {
  q: string;
  a: string;
}

/*
  FAQ 아코디언 (PART 6.1-9) — 질문·답변 형식은 GEO 인용에도 유리 (PART 13.3)

  ⚠️ 닫힌 답변도 **DOM 에는 있어야 한다**(2026-08-29 쏘넷 점검). 예전에는 열린 하나만
  렌더해서, 페이지가 FAQPage 구조화 데이터로 7개 답을 신고하는데 화면에는 1개만 있었다 —
  검색엔진이 보기에 «구조화 데이터와 페이지 내용이 다른» 상태다. 접기로 가려 두는 것은
  허용되지만, 아예 없는 것은 다르다. hidden 속성으로 감추고 마크업에는 남긴다.
*/
export function FaqAccordion({ items }: { items: FaqItem[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  return (
    <div className="divide-y divide-line rounded-card border border-line bg-body">
      {items.map((item, i) => {
        const open = openIndex === i;
        const answerId = `faq-answer-${i}`;
        return (
          <div key={item.q}>
            <button
              type="button"
              aria-expanded={open}
              aria-controls={answerId}
              onClick={() => setOpenIndex(open ? null : i)}
              className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-[15px] font-semibold hover:text-primary-ink"
            >
              {item.q}
              <ChevronDown className={cn("size-4 shrink-0 text-fg-faint transition-transform", open && "rotate-180")} aria-hidden />
            </button>
            <p id={answerId} hidden={!open} className="px-5 pb-5 text-[14px] leading-relaxed text-fg-sub">
              {item.a}
            </p>
          </div>
        );
      })}
    </div>
  );
}
