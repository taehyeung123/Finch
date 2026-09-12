/**
 * 약관·방침 본문의 자료 구조 — 순수 모듈(서버 전용 의존 없음).
 *
 * 2026-09 개정 전에는 조항이 «문단 문자열 배열» 하나였다. 표(국외 이전·보유 기간·쿠키)와 번호 목록,
 * 굵게 강조할 중요 조항(약관규제법 §3)이 문자열 한 줄로는 표현되지 않아 블록 단위로 바꿨다.
 * 렌더러는 components/legal/legal-document.tsx 하나다 — 마케팅(/terms·/privacy)과 앱(/settings/legal/*)이 같은 걸 쓴다.
 */

/** 목록 항목 — 하위 목록이 있으면 객체로 */
export type LegalListItem = string | { text: string; sub: readonly string[] };

export type LegalBlock =
  /** 문단. strong 이면 굵게(약관규제법 §3 — 중요 내용을 고객이 알아보기 쉽게 강조) */
  | { p: string; strong?: boolean }
  /** 목록. ordered 면 1. 2. 3. 번호를 붙인다 */
  | { list: readonly LegalListItem[]; ordered?: boolean }
  /** 표 — 넓으면 가로로 스크롤된다 */
  | { table: { head: readonly string[]; rows: readonly (readonly string[])[] } }
  /** 보조 설명(본문보다 한 단계 작게) */
  | { note: string }
  /** 관련 문서 링크 줄 */
  | { links: readonly { label: string; href: string }[] };

export interface LegalSection {
  /** 조항 앵커(#terms-22) — 목차와 다른 문서의 링크가 이 값을 쓴다 */
  id: string;
  /** «제22조 (요금제와 요금)» */
  title: string;
  /** 장(章)이 바뀌는 첫 조항에만 — «제4장 유료 서비스와 크레딧» */
  chapter?: string;
  blocks: readonly LegalBlock[];
}

export interface LegalDoc {
  key: "terms" | "operation" | "privacy";
  title: string;
  /** 동의 기록에 남는 버전(ISO 날짜) */
  version: string;
  /** 공고일(ISO) — 방침처럼 공개와 동시에 시행하면 비운다 */
  announcedAt?: string;
  /** 시행일(ISO) */
  effectiveAt: string;
  /** 시행일 옆 보조 설명 — «9월 12일 이후 이 약관에 동의하고 가입하는 회원은 가입한 때부터» 같은 것 */
  effectiveNote?: string;
  /** 머리말(조항 앞) */
  intro?: readonly LegalBlock[];
  sections: readonly LegalSection[];
}
