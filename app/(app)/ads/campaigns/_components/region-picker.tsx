"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, MapPin, Search, X } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  KR_PROVINCES,
  NATIONWIDE,
  applyRegionPick,
  formatRegionPick,
  isNationwide,
  searchRegions,
  type RegionPick,
} from "@/lib/geo/kr-regions";

/*
  지역 타겟팅 선택기 — Meta 지역 타겟팅과 같은 시·도 → 시·군·구 2단계.
  260여 개를 한 화면에 깔지 않기 위해:
  ① 검색 자동완성(가장 빠른 경로) ② 시·도 17개만 노출, 클릭 시 시·군·구 펼침 ③ 선택 결과는 삭제 가능한 태그.
  규칙: 전국 선택 시 개별 선택 해제 / "시·도 전체"와 그 하위 시·군·구 선택은 상호 대체.
*/

const chipBase =
  "inline-flex items-center gap-1.5 rounded-chip border px-3.5 py-1.5 text-[13px] font-semibold transition-colors";
const chipOff = "border-line bg-overlay text-fg-sub hover:border-line-strong hover:text-fg";
const chipOn = "border-primary bg-primary text-on-primary";

/** Meta 광고 세트당 위치 상한 — 도시 단위 250곳 (국가 25 / 우편번호 50,000) */
const MAX_LOCATIONS = 250;

export function RegionPicker({
  value,
  onChange,
}: {
  value: RegionPick[];
  onChange: (next: RegionPick[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [openProvince, setOpenProvince] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const nationwide = isNationwide(value);
  const suggestions = useMemo(() => searchRegions(query), [query]);

  // 드롭다운(query 비어있지 않을 때 표시)을 외부 클릭·Escape로 닫는다 — 아래 UI 가림 방지
  useEffect(() => {
    if (query.trim() === "") return;
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
  }, [query]);

  const has = (pick: RegionPick) =>
    value.some((p) => p.province === pick.province && p.district === pick.district);

  /** 하위 시·군·구가 하나라도 선택된 시·도의 선택 수 (배지 표시용) */
  const countFor = (provinceName: string) =>
    value.filter((p) => p.province === provinceName).length;

  function add(pick: RegionPick) {
    // 상호배타·상한 로직은 순수 함수(lib/geo/kr-regions.ts)가 담당 — 테스트로 검증됨
    const next = applyRegionPick(value, pick, MAX_LOCATIONS);
    if (next !== value) onChange(next);
  }

  function remove(pick: RegionPick) {
    onChange(value.filter((p) => !(p.province === pick.province && p.district === pick.district)));
  }

  function toggle(pick: RegionPick) {
    if (has(pick)) remove(pick);
    else add(pick);
  }

  const openedProvince = KR_PROVINCES.find((p) => p.name === openProvince);

  return (
    <div ref={rootRef} className="space-y-3">
      {/* 검색 + 전국 */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-pressed={nationwide}
          onClick={() => onChange(nationwide ? [] : [NATIONWIDE])}
          className={cn(chipBase, nationwide ? chipOn : chipOff)}
        >
          전국
        </button>
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-faint" aria-hidden />
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="지역 검색 — 예: 성남, 해운대, 강원"
            className="h-10 w-full rounded-card border border-line bg-body pl-9 pr-3 text-[14px] placeholder:text-fg-faint focus:border-primary focus:outline-none"
          />
          {query.trim() !== "" ? (
            <ul
              role="listbox"
              aria-label="지역 검색 결과"
              className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-card border border-line bg-overlay"
            >
              {suggestions.length > 0 ? (
                suggestions.map((s) => {
                  const selected = has(s);
                  return (
                    <li key={`${s.province}-${s.district ?? "전체"}`}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={selected}
                        onClick={() => {
                          add(s);
                          setQuery("");
                          searchRef.current?.focus();
                        }}
                        className="flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left text-[14px] text-fg-sub transition-colors hover:bg-body hover:text-fg"
                      >
                        <span className="inline-flex items-center gap-2">
                          <MapPin className="size-3.5 text-fg-faint" aria-hidden />
                          {formatRegionPick(s)}
                        </span>
                        {selected ? <span className="text-xs text-primary">선택됨</span> : null}
                      </button>
                    </li>
                  );
                })
              ) : (
                <li className="px-3.5 py-2.5 text-[13px] text-fg-faint">일치하는 지역이 없어요</li>
              )}
            </ul>
          ) : null}
        </div>
      </div>

      {/* 선택된 지역 태그 */}
      {!nationwide && value.length > 0 ? (
        <div className="flex flex-wrap gap-1.5" aria-label="선택된 지역">
          {value.map((p) => (
            <span
              key={`${p.province}-${p.district ?? "전체"}`}
              className="inline-flex items-center gap-1 rounded-chip bg-primary-weak px-2.5 py-1 text-[13px] font-semibold text-primary"
            >
              {formatRegionPick(p)}
              <button
                type="button"
                aria-label={`${formatRegionPick(p)} 삭제`}
                onClick={() => remove(p)}
                className="rounded-chip p-0.5 transition-colors hover:bg-overlay"
              >
                <X className="size-3" aria-hidden />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      {/* 시·도 브라우즈 — 클릭 시 시·군·구 펼침 */}
      <div className="rounded-card border border-line bg-surface p-3">
        <div className="flex flex-wrap gap-1.5">
          {KR_PROVINCES.map((province) => {
            const count = countFor(province.name);
            const wholeSelected = has({ province: province.name });
            const opened = openProvince === province.name;
            return (
              <button
                key={province.name}
                type="button"
                aria-expanded={opened}
                onClick={() =>
                  province.districts.length === 0
                    ? toggle({ province: province.name })
                    : setOpenProvince(opened ? null : province.name)
                }
                className={cn(chipBase, wholeSelected ? chipOn : count > 0 ? "border-primary bg-primary-weak text-primary" : chipOff)}
              >
                {province.name}
                {count > 0 && !wholeSelected ? <span className="tnum text-[11px]">{count}</span> : null}
                {province.districts.length > 0 ? (
                  <ChevronDown className={cn("size-3.5 transition-transform", opened && "rotate-180")} aria-hidden />
                ) : null}
              </button>
            );
          })}
        </div>

        {openedProvince ? (
          <div className="mt-3 border-t border-line pt-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-[13px] font-semibold text-fg-sub">{openedProvince.fullName}</p>
              <button
                type="button"
                onClick={() => toggle({ province: openedProvince.name })}
                className={cn(
                  "rounded-chip border px-3 py-1 text-xs font-semibold transition-colors",
                  has({ province: openedProvince.name }) ? chipOn : chipOff,
                )}
              >
                {openedProvince.name} 전체
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {openedProvince.districts.map((district) => {
                const pick = { province: openedProvince.name, district };
                return (
                  <button
                    key={district}
                    type="button"
                    aria-pressed={has(pick)}
                    onClick={() => toggle(pick)}
                    className={cn(
                      "rounded-chip border px-3 py-1 text-xs font-medium transition-colors",
                      has(pick) ? chipOn : chipOff,
                    )}
                  >
                    {district}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>

      <p className="text-xs text-fg-faint">
        전국을 선택하면 개별 지역 선택이 해제됩니다. 시·군·구 단위까지 지정할 수 있어요.
        {!nationwide && value.length > 0 ? (
          <span className="tnum ml-1.5">
            선택 {value.length}/{MAX_LOCATIONS}곳
          </span>
        ) : null}
        <span className="ml-1.5">(Meta 정책: 광고 세트당 도시 단위 최대 {MAX_LOCATIONS}곳)</span>
      </p>
    </div>
  );
}
