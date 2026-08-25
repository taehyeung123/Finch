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

/**
 * ISO → "n분 전 / n시간 전 / n일 전"
 *
 * ⚠️ 기본 기준 시각이 **2026-07-11 로 박혀 있었다.** 그보다 나중 시각은 diff 가 음수라
 * 무조건 "방금 전"이 됐고, 데모뿐 아니라 **실제 모드에서도** 알림·대시보드 게시물·
 * 경쟁사 광고 감지·오디언스 최근 활동·링크 분석 기록이 전부 "방금 전"으로 나왔다.
 * 일시중지된 자동 DM 규칙까지 "방금 전 발송"이라고 말했다(실측).
 * 시각을 고정하고 싶은 호출부(스냅샷 테스트 등)는 now 를 명시적으로 넘긴다.
 */
export function formatAgo(iso: string, now = new Date()): string {
  const diffMs = now.getTime() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  /* 미래 시각(예약된 것, 시계 차이) — "방금 전"이라고 하면 이미 지난 일처럼 읽힌다 */
  if (mins < 0) return "곧";
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
