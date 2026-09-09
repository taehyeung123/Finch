/*
  월 캘린더 격자 계산 — 순수 함수. React 와 무관하고 서버·클라이언트 양쪽에서 쓴다.

  **모든 날짜 판정은 KST 기준이다.** scheduled_at 은 timestamptz(UTC)로 저장되는데,
  브라우저 로컬 타임존으로 칸을 나누면 해외에서 접속한 사용자에게 "6월 1일 09:00
  발행"이 5월 31일 칸에 들어간다. 발행 시각을 KST 로 고르는 이상, 달력의 하루도 KST 하루여야 한다.

  Date 객체의 로컬 타임존에 의존하지 않으려고, UTC 게터만 쓰고 오프셋을 직접 더한다
  (서버는 UTC, 브라우저는 사용자 타임존이라 둘이 갈리면 SSR 불일치가 난다).
*/
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** ISO 문자열 → KST 기준 "YYYY-MM-DD". 이 값이 캘린더 칸의 키다. */
export function kstDayKey(iso: string | Date): string {
  const t = typeof iso === "string" ? Date.parse(iso) : iso.getTime();
  if (Number.isNaN(t)) return "";
  const d = new Date(t + KST_OFFSET_MS);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 지금(KST) 기준 오늘 키 */
export function kstToday(): string {
  return kstDayKey(new Date());
}

/**
 * 발행 크론 주기(분). vercel.json 의 "*\/5 * * * *". 예약 시각이 지나면 이 안에 집힌다 —
 * 화면 문구 「예약한 시각부터 5분 안에」의 근거다. ⚠️ 크론 스케줄을 바꾸면 이 값도 같이 바꾼다.
 *
 * (2026-09-09 이전에는 하루 한 번 06:00 KST 배치였다 — Vercel Hobby 시절의 제약이 Pro 로 옮긴 뒤에도
 *  남아 있었고, 그래서 이 파일에 «배치 시각»·«오늘 배치가 지났는가» 같은 함수가 있었다. 전부 걷어냈다.)
 */
export const PUBLISH_CRON_MINUTES = 5;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** ISO 문자열 → KST 기준 "HH:mm". 목록에서 날짜 옆에 붙인다. */
export function kstTimeKey(iso: string | Date): string {
  const t = typeof iso === "string" ? Date.parse(iso) : iso.getTime();
  if (Number.isNaN(t)) return "";
  const d = new Date(t + KST_OFFSET_MS);
  return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
}

/** ISO → <input type="datetime-local"> 값("YYYY-MM-DDTHH:mm", KST). */
export function kstDateTimeLocal(iso: string | Date): string {
  const day = kstDayKey(iso);
  return day ? `${day}T${kstTimeKey(iso)}` : "";
}

/**
 * <input type="datetime-local"> 값(KST) → ISO(UTC). 형식이 틀리면 null.
 * ⚠️ `new Date("2026-08-20T09:00")` 처럼 오프셋 없이 파싱하면 서버(UTC)와 브라우저가 다른 시각을 만든다 —
 *    반드시 +09:00 을 붙여 KST 로 못박는다(2026-08-17 실측: 자정이 09:00 으로 밀려 하루 늦게 나갔다).
 */
export function parseKstDateTimeLocal(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const t = Date.parse(`${value}:00+09:00`);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

/**
 * **지금 예약할 수 있는 가장 이른 시각**(KST, datetime-local 값) — 지금을 크론 주기 단위로 올린 값.
 * 날짜·시각 입력의 min 으로 두면 고를 수 없는 시각이 애초에 안 열린다.
 */
export function earliestPublishAt(): string {
  const step = PUBLISH_CRON_MINUTES * 60_000;
  return kstDateTimeLocal(new Date(Math.ceil(Date.now() / step) * step));
}

/** 오늘(KST) — 캘린더의 «이 날짜로 포스팅» 버튼이 «지난 날인가»를 판정할 때 쓴다 */
export function earliestPublishDate(): string {
  return kstToday();
}

export interface CalendarCell {
  /** "YYYY-MM-DD" (KST) */
  key: string;
  day: number;
  /** 이번 달이 아닌 앞뒤 채움 칸 */
  outside: boolean;
}

/**
 * year·month(1~12)의 월 격자. 일요일 시작 6주 고정(42칸).
 *
 * 6주 고정인 이유: 달마다 5주/6주로 높이가 바뀌면 월을 넘길 때 화면이 튄다.
 * 항상 42칸이면 캘린더 높이가 변하지 않는다.
 */
export function monthGrid(year: number, month: number): CalendarCell[] {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const startDow = first.getUTCDay(); // 0=일
  const cells: CalendarCell[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(Date.UTC(year, month - 1, 1 - startDow + i));
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    cells.push({
      key: `${y}-${m}-${day}`,
      day: d.getUTCDate(),
      outside: d.getUTCMonth() + 1 !== month || y !== year,
    });
  }
  return cells;
}

/** 월 이동 — 12월 다음은 다음 해 1월. 달력 UI 가 매번 다시 짜지 않게 여기 둔다. */
export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const idx = year * 12 + (month - 1) + delta;
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
}

export const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;
