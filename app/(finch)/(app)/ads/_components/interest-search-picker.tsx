"use client";

import { useEffect, useRef } from "react";
import { Search, Tag, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatCompact } from "@/lib/format";
import { MAX_INTERESTS, type Interest } from "@/lib/ads/adset-rules";
import { adsWriteMessage } from "@/lib/ads/campaign-rules";
import { searchAdInterestsAction, type InterestHit } from "../targeting-actions";
import { QUERY_MIN_CHARS, useRemoteSearch, type RemoteSearchResponse } from "./use-remote-search";

/*
  관심사 선택기 — **실 연동용**. 데모 마법사의 InterestPicker(정적 목록)와 별개다(스펙 §10-4).
  자유 입력 불가 — 서버 액션(adinterest)이 준 항목만 고를 수 있고, {id,name} 으로 광고 세트에 나간다.
  «약 N~M명» 은 메타가 audience_size 상·하한을 줬을 때만 붙는다 — 없으면 아무 숫자도 만들지 않는다.
*/

/* 모듈 스코프 — 훅의 deps 가 안정되도록 */
async function searchInterests(q: string): Promise<RemoteSearchResponse<InterestHit>> {
  const res = await searchAdInterestsAction(q);
  return res.ok ? { ok: true, items: res.interests, pauseSeconds: res.pauseSeconds } : res;
}

function audienceLabel(h: InterestHit): string | null {
  if (h.audienceLower === null || h.audienceUpper === null || h.audienceUpper <= 0) return null;
  return h.audienceLower === h.audienceUpper
    ? `약 ${formatCompact(h.audienceUpper)}명`
    : `약 ${formatCompact(h.audienceLower)}~${formatCompact(h.audienceUpper)}명`;
}

export function InterestSearchPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: Interest[];
  onChange: (next: Interest[]) => void;
  disabled?: boolean;
}) {
  const { query, setQuery, items, status, errorCode } = useRemoteSearch<InterestHit>("interest", searchInterests);
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const open = query.trim() !== "";
  const full = value.length >= MAX_INTERESTS;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setQuery("");
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setQuery("");
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, setQuery]);

  const has = (id: string) => value.some((v) => v.id === id);

  function add(h: InterestHit) {
    if (disabled || has(h.id) || full) return;
    onChange([...value, { id: h.id, name: h.name }]);
    setQuery("");
    inputRef.current?.focus();
  }

  return (
    <div ref={rootRef}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-faint" aria-hidden />
        <input
          ref={inputRef}
          type="text"
          value={query}
          disabled={disabled || full}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            if (e.nativeEvent.isComposing) return;
            const first = items.find((h) => !has(h.id));
            if (status === "ok" && first) add(first);
          }}
          placeholder="관심사 검색 — 예: 뷰티, 캠핑, 재테크"
          aria-label="관심사 검색"
          className="h-10 w-full rounded-card border border-line bg-body pl-9 pr-3 text-[15px] placeholder:text-fg-faint focus:border-primary focus:outline-none disabled:opacity-60"
        />
        {open ? (
          <ul
            role="listbox"
            aria-label="관심사 검색 결과"
            className="shadow-pop absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-card border border-line bg-body"
          >
            {status === "short" ? (
              <li className="px-3.5 py-2.5 text-[14px] text-fg-sub">{QUERY_MIN_CHARS}자 이상 입력해 주세요</li>
            ) : status === "loading" ? (
              <li className="px-3.5 py-2.5 text-[14px] text-fg-sub">찾는 중…</li>
            ) : status === "error" || status === "paused" ? (
              <li role="alert" className="px-3.5 py-2.5 text-[14px] text-warning-strong">
                {adsWriteMessage(errorCode ?? "search_unverified")}
              </li>
            ) : items.length === 0 ? (
              <li className="px-3.5 py-2.5 text-[14px] text-fg-sub">
                일치하는 관심사가 없어요 — 메타 관심사 체계에 있는 항목만 고를 수 있어요
              </li>
            ) : (
              items.map((h) => {
                const on = has(h.id);
                const aud = audienceLabel(h);
                return (
                  <li key={h.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={on}
                      onClick={() => add(h)}
                      className={cn(
                        "flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left text-[15px] text-fg-sub trans-state hover:bg-tint-hover hover:text-fg",
                        on && "text-fg",
                      )}
                    >
                      <span className="inline-flex min-w-0 items-center gap-2">
                        <Tag className="size-3.5 shrink-0 text-fg-faint" aria-hidden />
                        <span className="truncate">{h.name}</span>
                        {h.path ? <span className="hidden shrink-0 text-xs text-fg-faint sm:inline">{h.path}</span> : null}
                      </span>
                      {on ? (
                        <span className="shrink-0 text-xs font-semibold text-primary-ink">선택됨</span>
                      ) : aud ? (
                        <span className="tnum shrink-0 text-xs text-fg-faint">{aud}</span>
                      ) : null}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        ) : null}
      </div>

      {value.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5" aria-label="선택된 관심사">
          {value.map((v) => (
            <span
              key={v.id}
              className="inline-flex items-center gap-1 rounded-chip bg-primary-weak px-3 py-1 text-[14px] font-semibold text-primary"
            >
              {v.name}
              <button
                type="button"
                aria-label={`${v.name} 삭제`}
                disabled={disabled}
                onClick={() => onChange(value.filter((x) => x.id !== v.id))}
                className="relative after:absolute after:-inset-2 after:content-[''] trans-state hover:text-fg"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <p className="mt-1.5 text-[12px] text-fg-sub">
        {full
          ? `관심사는 최대 ${MAX_INTERESTS}개까지 고를 수 있어요.`
          : "직접 입력한 키워드는 쓸 수 없어요 — 검색해서 뜨는 항목 중에서 골라 주세요."}
        {value.length > 0 ? (
          <span className="tnum ml-1.5">
            선택 {value.length}/{MAX_INTERESTS}
          </span>
        ) : null}
      </p>
    </div>
  );
}
