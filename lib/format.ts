// 숫자·날짜 포맷 유틸 — 표기 일관성을 위해 전 페이지 공통 사용

/** 12345678 → "1,234.6만" / 4321 → "4,321" 식 한국형 축약 표기 */
export function formatCompact(n: number): string {
  if (n >= 100_000_000) return `${trimZero((n / 100_000_000).toFixed(1))}억`;
  if (n >= 10_000) return `${trimZero((n / 10_000).toFixed(1))}만`;
  return n.toLocaleString("ko-KR");
}

/** 통화 (KRW) */
export function formatKRW(n: number): string {
  return `${n.toLocaleString("ko-KR")}원`;
}

/** 증감 표기: +1.2% / -0.8% */
export function formatDelta(n: number, unit = "%"): string {
  const sign = n > 0 ? "+" : "";
  return `${sign}${trimZero(n.toFixed(1))}${unit}`;
}

/** 증감 수치 축약: +1.2만 */
export function formatDeltaCompact(n: number): string {
  const sign = n > 0 ? "+" : n < 0 ? "-" : "";
  return `${sign}${formatCompact(Math.abs(n))}`;
}

export function formatPercent(n: number): string {
  return `${trimZero(n.toFixed(1))}%`;
}

/** ISO → "n분 전 / n시간 전 / n일 전" */
export function formatAgo(iso: string, now = new Date("2026-07-11T09:00:00+09:00")): string {
  const diffMs = now.getTime() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "방금 전";
  if (mins < 60) return `${mins}분 전`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}일 전`;
  return new Date(iso).toLocaleDateString("ko-KR");
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

function trimZero(s: string): string {
  return s.endsWith(".0") ? s.slice(0, -2) : s;
}
