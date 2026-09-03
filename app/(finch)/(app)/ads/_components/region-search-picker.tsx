"use client";

import { useEffect, useRef } from "react";
import { MapPin, Search, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { MAX_REGIONS, type GeoInput, type GeoRegion } from "@/lib/ads/adset-rules";
import { adsWriteMessage } from "@/lib/ads/campaign-rules";
import { searchAdRegionsAction } from "../targeting-actions";
import { QUERY_MIN_CHARS, useRemoteSearch, type RemoteSearchResponse } from "./use-remote-search";

/*
  지역(시·도) 선택기 — **실 연동용**. 데모 마법사의 RegionPicker(정적 행정구역표)와 별개다(스펙 §10-4).
  검색은 서버 액션(adgeolocation, KR region)이 하고, 고른 것은 {key,name} 으로 광고 세트에 그대로 나간다.
  «전국» = geo.mode country. 시·도를 하나라도 고르면 regions 모드, 마지막 것을 지우면 전국으로 돌아간다.
*/

const chipBase =
  "inline-flex items-center gap-1.5 rounded-chip border px-3.5 py-1.5 text-[14px] font-semibold trans-state";
const chipOff = "border-line bg-overlay text-fg-sub hover:border-line-strong hover:text-fg";
const chipOn = "border-primary bg-primary text-on-primary";

/* 모듈 스코프 — 훅의 deps 가 안정되도록(렌더마다 새 함수면 매 렌더 재요청) */
async function searchRegions(q: string): Promise<RemoteSearchResponse<GeoRegion>> {
  const res = await searchAdRegionsAction(q);
  return res.ok ? { ok: true, items: res.regions, pauseSeconds: res.pauseSeconds } : res;
}

export function RegionSearchPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: GeoInput;
  onChange: (next: GeoInput) => void;
  disabled?: boolean;
}) {
  const { query, setQuery, items, status, errorCode } = useRemoteSearch<GeoRegion>("region", searchRegions);
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const nationwide = value.mode === "country";
  const selected = value.mode === "regions" ? value.regions : [];
  const open = query.trim() !== "";

  /* 드롭다운을 외부 클릭·Escape 로 닫는다 — 아래 필드 가림 방지(기존 피커와 같은 수법) */
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

  const has = (r: GeoRegion) => selected.some((s) => s.key === r.key);
  const full = selected.length >= MAX_REGIONS;

  function add(r: GeoRegion) {
    if (disabled || has(r) || full) return;
    onChange({ mode: "regions", regions: [...selected, { key: r.key, name: r.name }] });
    setQuery("");
    inputRef.current?.focus();
  }

  function remove(r: GeoRegion) {
    const next = selected.filter((s) => s.key !== r.key);
    onChange(next.length === 0 ? { mode: "country" } : { mode: "regions", regions: next });
  }

  return (
    <div ref={rootRef} className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-pressed={nationwide}
          disabled={disabled}
          onClick={() => onChange({ mode: "country" })}
          className={cn(chipBase, nationwide ? chipOn : chipOff, disabled && "cursor-not-allowed opacity-60")}
        >
          전국
        </button>
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-faint" aria-hidden />
          <input
            ref={inputRef}
            type="search"
            value={query}
            disabled={disabled || full}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              if (e.nativeEvent.isComposing) return;
              const first = items.find((r) => !has(r));
              if (status === "ok" && first) add(first);
            }}
            placeholder="시·도 검색 — 예: 서울, 경기, 부산"
            aria-label="지역 검색"
            className="h-10 w-full rounded-card border border-line bg-body pl-9 pr-3 text-[15px] placeholder:text-fg-faint focus:border-primary focus:outline-none disabled:opacity-60"
          />
          {open ? (
            <ul
              role="listbox"
              aria-label="지역 검색 결과"
              className="shadow-pop absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-card border border-line bg-body"
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
                <li className="px-3.5 py-2.5 text-[14px] text-fg-sub">일치하는 시·도가 없어요 — 시·도 이름으로 검색해 주세요</li>
              ) : (
                items.map((r) => {
                  const on = has(r);
                  return (
                    <li key={r.key}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={on}
                        onClick={() => add(r)}
                        className="flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left text-[15px] text-fg-sub trans-state hover:bg-tint-hover hover:text-fg"
                      >
                        <span className="inline-flex items-center gap-2">
                          <MapPin className="size-3.5 text-fg-faint" aria-hidden />
                          {r.name}
                        </span>
                        {on ? <span className="text-xs font-semibold text-primary-ink">선택됨</span> : null}
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          ) : null}
        </div>
      </div>

      {selected.length > 0 ? (
        <div className="flex flex-wrap gap-1.5" aria-label="선택된 지역">
          {selected.map((r) => (
            <span
              key={r.key}
              className="inline-flex items-center gap-1 rounded-chip bg-primary-weak px-2.5 py-1 text-[14px] font-semibold text-primary"
            >
              {r.name}
              <button
                type="button"
                aria-label={`${r.name} 삭제`}
                disabled={disabled}
                onClick={() => remove(r)}
                className="relative rounded-chip p-0.5 after:absolute after:-inset-2 after:content-[''] trans-state hover:bg-tint-hover"
              >
                <X className="size-3" aria-hidden />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <p className="text-[12px] text-fg-sub">
        전국을 고르면 시·도 선택이 해제돼요. 지금은 시·도 단위까지 고를 수 있어요.
        {selected.length > 0 ? <span className="tnum ml-1.5">선택 {selected.length}곳</span> : null}
      </p>
    </div>
  );
}
