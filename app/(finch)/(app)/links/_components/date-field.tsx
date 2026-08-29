"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3 } from "lucide-react";
import { ModalShell } from "@/components/ui/modal-shell";

/*
  커스텀 날짜·시간 픽커(2026-08-27 사장님 지시 «날짜 시간 입력도 커스텀으로 이쁘게») —
  네이티브 date/time/datetime-local 대체. 달력 그리드 + 시·분 칩, 선택 표시는 픽커들과
  같은 문법(어두운 판 + 밝은 글자). 값 형식은 네이티브와 동일하게 유지한다:
  date «YYYY-MM-DD» · time «HH:mm» · datetime «YYYY-MM-DDTHH:mm» — 저장 경로가 안 바뀐다.
*/

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function parseDate(v: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

function parseTime(v: string): { h: number; min: number } | null {
  const m = /(?:^|T)(\d{2}):(\d{2})/.exec(v);
  if (!m) return null;
  return { h: Number(m[1]), min: Number(m[2]) };
}

function fmtDate(v: string): string | null {
  const p = parseDate(v);
  if (!p) return null;
  const day = WEEK[new Date(p.y, p.m - 1, p.d).getDay()];
  return `${p.y}. ${p.m}. ${p.d} (${day})`;
}

function fmtTime(v: string): string | null {
  const t = parseTime(v);
  if (!t) return null;
  const ampm = t.h < 12 ? "오전" : "오후";
  const h12 = t.h % 12 === 0 ? 12 : t.h % 12;
  return `${ampm} ${h12}:${pad(t.min)}`;
}

/** 달력 한 달 — 앞뒤 빈 칸 포함 42칸 */
function monthCells(y: number, m: number): (number | null)[] {
  const first = new Date(y, m - 1, 1).getDay();
  const days = new Date(y, m, 0).getDate();
  const cells: (number | null)[] = Array.from({ length: first }, () => null);
  for (let d = 1; d <= days; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function DateTimePickerField({
  mode,
  value,
  onChange,
  ariaLabel,
  placeholder,
}: {
  mode: "date" | "time" | "datetime";
  /** date: YYYY-MM-DD · time: HH:mm · datetime: YYYY-MM-DDTHH:mm — 비우면 "" */
  value: string;
  onChange: (v: string) => void;
  ariaLabel: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  /* 모달 안 임시값 — 「확인」에서만 확정한다(날짜만 고르다 닫아도 반쪽 값이 안 나간다) */
  const [tDate, setTDate] = useState("");
  const [tTime, setTTime] = useState("");
  const [view, setView] = useState<{ y: number; m: number }>({ y: 2026, m: 1 });
  const minuteRef = useRef<HTMLDivElement>(null);
  const hourRef = useRef<HTMLDivElement>(null);

  const shownDate = mode !== "time" ? fmtDate(value) : null;
  const shownTime = mode !== "date" ? fmtTime(value) : null;
  const shown = [shownDate, shownTime].filter(Boolean).join(" ");

  function openModal() {
    const d = parseDate(value);
    const t = parseTime(value);
    const now = new Date();
    setTDate(d ? `${d.y}-${pad(d.m)}-${pad(d.d)}` : "");
    setTTime(t ? `${pad(t.h)}:${pad(t.min)}` : "");
    setView(d ? { y: d.y, m: d.m } : { y: now.getFullYear(), m: now.getMonth() + 1 });
    setOpen(true);
  }

  /* 선택된 시·분 칩이 보이게 — 스크롤 줄이라 열자마자 자리로 데려간다 */
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => {
      hourRef.current?.querySelector<HTMLElement>('[aria-pressed="true"]')?.scrollIntoView({ inline: "center", block: "nearest" });
      minuteRef.current?.querySelector<HTMLElement>('[aria-pressed="true"]')?.scrollIntoView({ inline: "center", block: "nearest" });
    }, 30);
    return () => window.clearTimeout(t);
  }, [open]);

  function commit() {
    if (mode === "date") onChange(tDate);
    else if (mode === "time") onChange(tTime);
    else onChange(tDate ? `${tDate}T${tTime || "00:00"}` : "");
    setOpen(false);
  }

  const today = new Date();
  const todayKey = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  const t = parseTime(tTime ? `${tTime}` : "");
  const chip = (on: boolean) =>
    `trans-state shrink-0 rounded-chip border px-2.5 py-1 text-[12px] font-medium ${
      on ? "border-fg bg-fg text-body" : "border-line bg-body text-fg-sub hover:bg-tint-hover hover:text-fg"
    }`;

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        aria-label={ariaLabel}
        className="trans-state mt-1 flex h-10 w-full items-center gap-2 rounded-card border border-line bg-body px-3 text-[14px] hover:bg-tint-hover"
      >
        {mode === "time" ? <Clock3 className="size-4 shrink-0 text-fg-faint" aria-hidden /> : <CalendarDays className="size-4 shrink-0 text-fg-faint" aria-hidden />}
        {shown ? (
          <span className="min-w-0 flex-1 truncate text-left text-fg">{shown}</span>
        ) : (
          <span className="min-w-0 flex-1 truncate text-left text-fg-faint">{placeholder ?? "고르기"}</span>
        )}
      </button>
      {open ? (
        <ModalShell
          label={ariaLabel}
          title={ariaLabel}
          onClose={() => setOpen(false)}
          size="sm"
          footer={
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  onChange("");
                  setOpen(false);
                }}
                className="trans-state rounded-card px-2.5 py-1.5 text-[14px] font-medium text-fg-sub hover:bg-tint-hover hover:text-fg"
              >
                비우기
              </button>
              <div className="flex gap-2">
                <button type="button" onClick={() => setOpen(false)} className="trans-state rounded-card border border-line px-3 py-1.5 text-[14px] font-medium text-fg-sub hover:bg-tint-hover">
                  취소
                </button>
                <button
                  type="button"
                  onClick={commit}
                  disabled={mode !== "time" && !tDate}
                  className="trans-state rounded-card bg-primary px-3 py-1.5 text-[14px] font-semibold text-on-primary hover:bg-primary-hover disabled:opacity-50"
                >
                  확인
                </button>
              </div>
            </div>
          }
        >
          <div className="space-y-4">
            {mode !== "time" ? (
              <div>
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    aria-label="이전 달"
                    onClick={() => setView((v) => (v.m === 1 ? { y: v.y - 1, m: 12 } : { y: v.y, m: v.m - 1 }))}
                    className="trans-state relative after:absolute after:-inset-1 after:content-[''] rounded-card p-1.5 text-fg-sub hover:bg-tint-hover hover:text-fg"
                  >
                    <ChevronLeft className="size-4" />
                  </button>
                  <p className="text-[14px] font-semibold">
                    {view.y}년 {view.m}월
                  </p>
                  <button
                    type="button"
                    aria-label="다음 달"
                    onClick={() => setView((v) => (v.m === 12 ? { y: v.y + 1, m: 1 } : { y: v.y, m: v.m + 1 }))}
                    className="trans-state relative after:absolute after:-inset-1 after:content-[''] rounded-card p-1.5 text-fg-sub hover:bg-tint-hover hover:text-fg"
                  >
                    <ChevronRight className="size-4" />
                  </button>
                </div>
                <div className="mt-2 grid grid-cols-7 text-center">
                  {WEEK.map((w, i) => (
                    <span key={w} className={`py-1 text-[11px] font-semibold ${i === 0 ? "text-negative" : "text-fg-sub"}`}>
                      {w}
                    </span>
                  ))}
                  {monthCells(view.y, view.m).map((d, i) => {
                    if (d === null) return <span key={i} aria-hidden />;
                    const key = `${view.y}-${pad(view.m)}-${pad(d)}`;
                    const on = tDate === key;
                    const isToday = key === todayKey;
                    return (
                      <button
                        key={i}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setTDate(key)}
                        className={`trans-state mx-auto my-0.5 flex size-8 items-center justify-center rounded-full text-[14px] ${
                          on ? "bg-fg font-semibold text-body" : isToday ? "border border-line font-semibold text-fg hover:bg-tint-hover" : "text-fg hover:bg-tint-hover"
                        }`}
                      >
                        {d}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
            {mode !== "date" ? (
              <div className="space-y-2">
                {mode === "datetime" || mode === "time" ? (
                  <p className="text-[12px] font-medium text-fg-sub">{mode === "time" ? "시각 — 비워 두면 하루 종일" : "시각"}</p>
                ) : null}
                <div ref={hourRef} className="flex gap-1 overflow-x-auto pb-1" aria-label="시">
                  {Array.from({ length: 24 }, (_, h) => (
                    <button key={h} type="button" aria-pressed={t?.h === h} onClick={() => setTTime(`${pad(h)}:${pad(t?.min ?? 0)}`)} className={chip(t?.h === h)}>
                      {h < 12 ? "오전" : "오후"} {h % 12 === 0 ? 12 : h % 12}시
                    </button>
                  ))}
                </div>
                <div ref={minuteRef} className="flex gap-1 overflow-x-auto pb-1" aria-label="분">
                  {Array.from({ length: 12 }, (_, i) => i * 5).map((m) => (
                    <button key={m} type="button" aria-pressed={t?.min === m} onClick={() => setTTime(`${pad(t?.h ?? 0)}:${pad(m)}`)} className={chip(t?.min === m)}>
                      {pad(m)}분
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </ModalShell>
      ) : null}
    </>
  );
}
