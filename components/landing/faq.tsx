"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

export interface FaqItem {
  q: string;
  a: string;
}

/** FAQ 아코디언 (PART 6.1-9) — 질문·답변 형식은 GEO 인용에도 유리 (PART 13.3) */
export function FaqAccordion({ items }: { items: FaqItem[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  return (
    <div className="divide-y divide-line rounded-card border border-line bg-body">
      {items.map((item, i) => {
        const open = openIndex === i;
        return (
          <div key={item.q}>
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setOpenIndex(open ? null : i)}
              className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-[15px] font-semibold hover:text-primary"
            >
              {item.q}
              <ChevronDown className={cn("size-4 shrink-0 text-fg-faint transition-transform", open && "rotate-180")} aria-hidden />
            </button>
            {open ? <p className="px-5 pb-5 text-[14px] leading-relaxed text-fg-sub">{item.a}</p> : null}
          </div>
        );
      })}
    </div>
  );
}
