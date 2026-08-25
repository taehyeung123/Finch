/*
  「일정」 블록 유틸 — 날짜 파싱·표기·캘린더 파일(.ics) 생성.

  리틀리 「일정」 흡수(2026-08-25). 예약받기(booking)와는 다르다 — 여기엔 백엔드가 없다.
  주인이 적어 둔 날짜를 **알리기만** 한다(공구 오픈, 라이브, 팝업 기간). 방문자는 눌러서
  자기 캘린더에 담는다. 그래서 "누르면 아무 일도 안 나는 버튼"이 되지 않는다.

  ⚠️ 시각은 전부 **KST 고정**으로 다룬다. 주인은 한국 시간으로 적고, 서버는 UTC 에서 돈다.
  new Date("2026-09-01T20:00") 은 Node 에서 서버 로컬(UTC)로 읽혀 9시간이 밀린다 —
  그래서 문자열을 직접 쪼개 쓰고, epoch 이 필요할 때만 +09:00 을 붙인다(한국은 서머타임이 없다).
*/

/** 지금 시각 — 렌더 중에 Date.now() 를 직접 부르면 순수성 규칙에 걸린다(react-hooks/purity).
    이 화면은 force-dynamic 이라 요청마다 한 번 읽는 것이 맞고, 테스트는 now 를 넣어 고정한다. */
export function nowMs(): number {
  return Date.now();
}

/** 주인이 적는 형식: "2026-09-01" (하루 종일) 또는 "2026-09-01T20:00" */
export interface EventPart {
  y: number;
  mo: number;
  d: number;
  /** 시각이 없으면 하루 종일 일정 */
  h: number | null;
  mi: number;
}

const RE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?$/;

export function parseEventAt(v: unknown): EventPart | null {
  if (typeof v !== "string") return null;
  const m = RE.exec(v.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi] = m;
  const part: EventPart = { y: +y, mo: +mo, d: +d, h: h === undefined ? null : +h, mi: mi === undefined ? 0 : +mi };
  if (part.mo < 1 || part.mo > 12 || part.d < 1 || part.d > 31) return null;
  if (part.h !== null && (part.h > 23 || part.mi > 59)) return null;
  /* 2월 30일 같은 값 걸러내기 — UTC 로 만들어 되읽는다(시간대와 무관한 달력 계산) */
  const probe = new Date(Date.UTC(part.y, part.mo - 1, part.d));
  if (probe.getUTCMonth() !== part.mo - 1 || probe.getUTCDate() !== part.d) return null;
  return part;
}

/** KST 벽시계 → epoch(ms). 한국은 연중 +09:00 고정이라 오프셋을 그대로 붙인다 */
export function eventEpoch(p: EventPart): number {
  return Date.UTC(p.y, p.mo - 1, p.d, (p.h ?? 0) - 9, p.mi);
}

/** 일정이 끝난 것으로 볼 시각 — 종료가 없으면 시작일의 자정(하루 종일) 또는 시작+2시간 */
export function eventEndEpoch(start: EventPart, end: EventPart | null): number {
  if (end) return eventEpoch(end) + (end.h === null ? 24 * 3600_000 : 0);
  return start.h === null ? eventEpoch(start) + 24 * 3600_000 : eventEpoch(start) + 2 * 3600_000;
}

/** "9월 1일 (화)" · 영어/일본어 페이지는 그 언어 표기 — 시간대는 KST 로 고정해 서버·브라우저가 같은 값을 낸다 */
export function formatEventDate(p: EventPart, lang: string): string {
  return new Intl.DateTimeFormat(lang === "en" ? "en-US" : lang === "ja" ? "ja-JP" : "ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(new Date(Date.UTC(p.y, p.mo - 1, p.d, 3)));
}

/** "20:00" — 하루 종일이면 빈 문자열 */
export function formatEventTime(p: EventPart): string {
  return p.h === null ? "" : `${String(p.h).padStart(2, "0")}:${String(p.mi).padStart(2, "0")}`;
}

/** 날짜 칩용 — { mo: "9월", d: "1" } (숫자만 크게 보여준다) */
export function eventChip(p: EventPart, lang: string): { top: string; d: string } {
  const top =
    lang === "en"
      ? new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", month: "short" }).format(new Date(Date.UTC(p.y, p.mo - 1, p.d, 3)))
      : `${p.mo}${lang === "ja" ? "月" : "월"}`;
  return { top, d: String(p.d) };
}

/* ── .ics (RFC 5545) ─────────────────────────────────────────────────────────
   UTC 로 굳혀 내보낸다(DTSTART:…Z) — TZID 를 쓰려면 VTIMEZONE 정의가 따라와야 하고,
   그걸 빠뜨린 파일을 거부하는 클라이언트가 있다. 하루 종일 일정만 VALUE=DATE. */

const esc = (v: string) => v.replace(/\\/g, "\\\\").replace(/([,;])/g, "\\$1").replace(/\r?\n/g, "\\n");

/** 75옥텟 접기 — 한글은 3바이트라 30자 정도에서 걸린다. 접지 않으면 잘라 버리는 클라이언트가 있다 */
function fold(line: string): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let cur = "";
  let curBytes = 0;
  for (const ch of line) {
    const size = Buffer.byteLength(ch, "utf8");
    /* 이어지는 줄은 앞에 공백 한 칸이 붙으므로 74 에서 끊는다 */
    if (curBytes + size > (out.length === 0 ? 75 : 74)) {
      out.push(cur);
      cur = "";
      curBytes = 0;
    }
    cur += ch;
    curBytes += size;
  }
  if (cur) out.push(cur);
  return out.join("\r\n ");
}

const utcStamp = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const dateStamp = (p: EventPart) => `${p.y}${String(p.mo).padStart(2, "0")}${String(p.d).padStart(2, "0")}`;

export interface IcsEvent {
  uid: string;
  title: string;
  start: EventPart;
  end: EventPart | null;
  place?: string;
  url?: string;
}

/** 여러 일정을 한 파일로 — 방문자가 한 번에 담을 수 있게(리틀리는 한 건씩만 준다) */
export function buildIcs(events: IcsEvent[], now = 0): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Finch//Profile Link//KO", "CALSCALE:GREGORIAN"];
  for (const ev of events) {
    lines.push("BEGIN:VEVENT", `UID:${ev.uid}`, `DTSTAMP:${utcStamp(now)}`);
    if (ev.start.h === null) {
      const endPart = ev.end ?? ev.start;
      /* 하루 종일 일정의 DTEND 는 **다음 날**(끝을 배타적으로 읽는다) */
      const endNext = new Date(Date.UTC(endPart.y, endPart.mo - 1, endPart.d + 1));
      lines.push(
        `DTSTART;VALUE=DATE:${dateStamp(ev.start)}`,
        `DTEND;VALUE=DATE:${endNext.toISOString().slice(0, 10).replace(/-/g, "")}`,
      );
    } else {
      lines.push(`DTSTART:${utcStamp(eventEpoch(ev.start))}`, `DTEND:${utcStamp(eventEndEpoch(ev.start, ev.end))}`);
    }
    lines.push(fold(`SUMMARY:${esc(ev.title)}`));
    if (ev.place) lines.push(fold(`LOCATION:${esc(ev.place)}`));
    /* URL 은 URI 값 타입이라 TEXT 이스케이프 대상이 아니다 — `?a=1;b=2` 같은 주소에
       백슬래시가 박혀 캘린더가 엉뚱한 곳으로 연다. 개행만 막는다(헤더 주입 방지) */
    if (ev.url) lines.push(fold(`URL:${ev.url.replace(/[\r\n]/g, "")}`));
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

/** <a download> 에 걸 데이터 URI — 서버에서 만들어 정적으로 내보낸다(방문자 JS 없음) */
export function icsHref(ics: string): string {
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`;
}
