"use client";

import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { lpN } from "@/lib/links/i18n";

/*
  페이지 내부 검색 — 리틀리 「검색」 블록 카피(4단계). 입력한 글자가 들어 있지 않은 .lp-block 을 숨긴다.
  서버 왕복 없음 — 블록 텍스트는 이미 화면에 있다.
  범위는 **자기 블록 목록(형제 .lp-block)** 으로 한정한다 — 문서 전체를 고르면 검색 블록이 둘일 때
  서로의 결과를 덮어쓴다(소넷 점검 4단계 #2). 검색 블록끼리는 항상 보인다.

  2026-08-24 비평 반영:
   · 지우기 버튼이 없어 한 번 검색하면 손으로 전부 지워야 페이지가 돌아왔다.
   · 결과 수를 안 보여줘 "몇 개가 남았는지" 를 눈으로 세야 했다.
   · **글자가 없는 블록**(갤러리·이미지·최근 게시물·여백·구분선)은 어떤 검색어에도 안 걸려
     검색하는 순간 통째로 사라졌다 — 사진만 있는 페이지는 검색이 곧 초기화였다.
     이제 글자가 없는 블록은 검색 대상이 아니라 **항상 남긴다**(숨길 근거가 없다).
*/
export function SearchBlock({
  placeholder,
  t,
}: {
  placeholder: string;
  t: { empty: string; aria: string; count: string; clear: string };
}) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<number | null>(null);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const self = root.current?.closest<HTMLElement>(".lp-block");
    const list = self?.parentElement;
    if (!self || !list) return;
    const needle = q.trim().toLowerCase();
    let shown = 0;
    let searchable = 0;
    for (const el of list.querySelectorAll<HTMLElement>(":scope > .lp-block")) {
      if (el === self || el.querySelector("[data-lp-search]")) continue; // 검색 블록은 항상 보인다
      const text = (el.textContent ?? "").trim();
      if (!text) {
        /* 글자가 없는 블록(사진·갤러리·최근 게시물·여백) — 검색 대상이 아니다. 숨기지 않는다 */
        el.hidden = false;
        continue;
      }
      searchable++;
      const hit = !needle || text.toLowerCase().includes(needle);
      el.hidden = !hit;
      if (hit) shown++;
    }
    setHits(needle && searchable > 0 ? shown : null);
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
          /* 크롬은 type=search 에 자기 취소 버튼을 붙인다 — 테마를 안 따르는 파란 ✕ 가
             우리 ✕ 바로 옆에 뜨고, 같은 일을 하는 버튼이 둘이 된다(실측). 끈다. */
          className="min-w-0 flex-1 bg-transparent text-[15px] text-[var(--lp-fg)] placeholder:text-[var(--lp-muted)] focus:outline-none [&::-webkit-search-cancel-button]:appearance-none"
        />
        {q ? (
          <button
            type="button"
            onClick={() => setQ("")}
            aria-label={t.clear}
            title={t.clear}
            /* 44px — 이 페이지의 다른 조작면과 같은 최소 크기(보이는 건 아이콘, 나머지는 손가락 몫) */
            className="trans-state -mr-2 flex size-11 shrink-0 items-center justify-center rounded-full text-[var(--lp-muted)] hover:text-[var(--lp-fg)]"
          >
            <X className="size-4" aria-hidden />
          </button>
        ) : null}
      </label>
      {hits !== null ? (
        <p role="status" className="mt-2 text-center text-[13px] text-[var(--lp-muted)]">
          {hits === 0 ? t.empty : lpN(t.count, hits)}
        </p>
      ) : null}
    </div>
  );
}
