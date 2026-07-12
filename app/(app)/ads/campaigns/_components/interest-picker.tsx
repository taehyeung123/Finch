"use client";

import { useMemo, useRef, useState } from "react";
import { Search, Tag, X } from "lucide-react";
import { searchInterests, findInterest } from "@/lib/ads/meta-interests";

/*
  상세 타겟팅(관심사) 선택기 — Meta와 동일하게 자유 입력 불가.
  타이핑하면 Meta 관심사 체계에서 일치하는 항목만 자동완성으로 뜨고, 그중에서만 선택할 수 있다.
  Enter는 첫 번째 제안을 선택하며, 일치 항목이 없으면 아무것도 추가되지 않는다.
*/

export function InterestPicker({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const suggestions = useMemo(
    () => searchInterests(query).filter((s) => !value.includes(s.name)),
    [query, value],
  );
  const noMatch = query.trim() !== "" && suggestions.length === 0;

  function add(name: string) {
    // 목록 밖 키워드 방지 — Meta 관심사 체계에 있는 항목만 통과
    if (!findInterest(name) || value.includes(name)) return;
    onChange([...value, name]);
    setQuery("");
    inputRef.current?.focus();
  }

  return (
    <div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-faint" aria-hidden />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            if (e.nativeEvent.isComposing) return;
            if (suggestions.length > 0) add(suggestions[0].name);
          }}
          placeholder="관심사 검색 — 예: 뷰티, 캠핑, 재테크"
          aria-label="관심사 검색"
          className="h-10 w-full rounded-card border border-line bg-body pl-9 pr-3 text-[14px] placeholder:text-fg-faint focus:border-primary focus:outline-none"
        />
        {query.trim() !== "" ? (
          <ul
            role="listbox"
            aria-label="관심사 검색 결과"
            className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-card border border-line bg-overlay"
          >
            {suggestions.length > 0 ? (
              suggestions.map((s) => (
                <li key={s.name}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={false}
                    onClick={() => add(s.name)}
                    className="flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left text-[14px] text-fg-sub transition-colors hover:bg-body hover:text-fg"
                  >
                    <span className="inline-flex min-w-0 items-center gap-2">
                      <Tag className="size-3.5 shrink-0 text-fg-faint" aria-hidden />
                      <span className="truncate">{s.name}</span>
                      <span className="shrink-0 text-xs text-fg-faint">{s.category}</span>
                    </span>
                    <span className="tnum shrink-0 text-xs text-fg-faint">약 {s.audience}만</span>
                  </button>
                </li>
              ))
            ) : (
              <li className="px-3.5 py-2.5 text-[13px] text-fg-faint">
                일치하는 관심사가 없어요 — Meta 관심사 체계에 있는 항목만 선택할 수 있습니다
              </li>
            )}
          </ul>
        ) : null}
      </div>

      {value.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5" aria-label="선택된 관심사">
          {value.map((name) => {
            const meta = findInterest(name);
            return (
              <span
                key={name}
                className="inline-flex items-center gap-1 rounded-chip bg-primary-weak px-3 py-1 text-[13px] font-semibold text-primary"
              >
                {name}
                {meta ? <span className="tnum text-[11px] opacity-70">약 {meta.audience}만</span> : null}
                <button
                  type="button"
                  aria-label={`${name} 삭제`}
                  onClick={() => onChange(value.filter((v) => v !== name))}
                  className="transition-colors hover:text-fg"
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              </span>
            );
          })}
        </div>
      ) : null}

      <p className="mt-1.5 text-xs text-fg-faint">
        {noMatch
          ? "직접 입력한 키워드는 쓸 수 없어요 — 검색해서 뜨는 항목 중에서 선택해주세요 (Meta 방식)"
          : "타이핑하면 Meta 관심사 체계에서 일치하는 항목이 떠요. 목록에서만 선택할 수 있습니다."}
      </p>
    </div>
  );
}
