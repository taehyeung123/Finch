/*
  월 캘린더 격자 계산 — 순수 함수. React 와 무관하고 서버·클라이언트 양쪽에서 쓴다.

  **모든 날짜 판정은 KST 기준이다.** scheduled_at 은 timestamptz(UTC)로 저장되는데,
  브라우저 로컬 타임존으로 칸을 나누면 해외에서 접속한 사용자에게 "6월 1일 아침
  발행"이 5월 31일 칸에 들어간다. 발행 배치도 KST 06:00 에 도는 이상(vercel.json),
  달력의 하루도 KST 하루여야 한다.

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
 * 발행 배치가 도는 시각(KST). vercel.json 의 "0 21 * * *"(UTC 21시) = KST 06시.
 * ⚠️ 크론 스케줄을 바꾸면 이 값도 같이 바꿔야 한다 — 안 그러면 화면이 거짓말을 한다.
 */
export const PUBLISH_BATCH_HOUR_KST = 6;

/**
 * **지금 예약해서 실제로 나갈 수 있는 가장 이른 날짜**(KST).
 *
 * 배치는 하루 한 번, KST 06:00 에만 돈다. 그 시각이 지난 뒤 "오늘"로 예약하면
 * 오늘은 아무 일도 안 일어나고 **내일 아침**에 나간다. 그런데 화면은 캘린더 오늘 칸에
 * 점을 찍고 "예약일 아침 배치에서 자동 발행됩니다"라고 안내했다 — 오늘 쓰려던
 * 콘텐츠가 하루 뒤에 조용히 발행되는 상태였다.
 *
 * 날짜 선택의 min 을 이 값으로 두면 고를 수 없는 날이 애초에 안 열린다.
 */
export function earliestPublishDate(): string {
  const kst = new Date(Date.now() + KST_OFFSET_MS);
  const beforeBatch = kst.getUTCHours() < PUBLISH_BATCH_HOUR_KST;
  if (beforeBatch) return kstDayKey(new Date());
  return kstDayKey(new Date(Date.now() + 24 * 60 * 60 * 1000));
}

/** 오늘 아침 배치가 이미 지났는가 — 화면이 "내일 아침에 나갑니다"를 안내할 때 쓴다 */
export function batchPassedToday(): boolean {
  return earliestPublishDate() !== kstToday();
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
