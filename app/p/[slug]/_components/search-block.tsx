"use client";

import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";

/*
  페이지 내부 검색 — 리틀리 「검색」 블록 카피(4단계). 입력한 글자가 들어 있지 않은 .lp-block 을 숨긴다.
  서버 왕복 없음 — 블록 텍스트는 이미 화면에 있다.
  범위는 **자기 블록 목록(형제 .lp-block)** 으로 한정한다 — 문서 전체를 고르면 검색 블록이 둘일 때
  서로의 결과를 덮어쓴다(소넷 점검 4단계 #2). 검색 블록끼리는 항상 보인다.
*/
export function SearchBlock({ placeholder, t }: { placeholder: string; t: { empty: string; aria: string } }) {
  const [q, setQ] = useState("");
  const [noHit, setNoHit] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const self = root.current?.closest<HTMLElement>(".lp-block");
    const list = self?.parentElement;
    if (!self || !list) return;
    const needle = q.trim().toLowerCase();
    let shown = 0;
    for (const el of list.querySelectorAll<HTMLElement>(":scope > .lp-block")) {
      if (el === self || el.querySelector("[data-lp-search]")) continue; // 검색 블록은 항상 보인다
      const hit = !needle || (el.textContent ?? "").toLowerCase().includes(needle);
      el.hidden = !hit;
      if (hit) shown++;
    }
    setNoHit(!!needle && shown === 0);
  }, [q]);
  return (
    <div ref={root} data-lp-search>
      <label className="flex min-h-[48px] items-center gap-2 rounded-[var(--lp-radius)] border border-[var(--lp-border)] bg-[var(--lp-card)] px-3 text-[var(--lp-muted)] shadow-[var(--lp-shadow)] focus-within:border-[var(--lp-accent)]">
        <Search className="size-4 shrink-0" aria-hidden />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={placeholder}
          aria-label={t.aria}
          className="min-w-0 flex-1 bg-transparent text-[15px] text-[var(--lp-fg)] placeholder:text-[var(--lp-muted)] focus:outline-none"
        />
      </label>
      {noHit ? (
        <p role="status" className="mt-2 text-center text-[13px] text-[var(--lp-muted)]">
          {t.empty}
        </p>
      ) : null}
    </div>
  );
}
