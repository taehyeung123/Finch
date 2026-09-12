/**
 * 약관·방침 버전과 날짜 — **순수 모듈**(서버 전용 의존 없음).
 *
 * 동의 화면(클라이언트)과 문서 본문·설정 화면(서버)이 같은 날짜를 읽는다. lib/legal/consent.ts 는
 * supabase 서버 클라이언트를 끌어오므로 클라이언트 컴포넌트가 거기서 상수를 가져오면 빌드가 깨진다 —
 * 그래서 숫자만 여기 둔다(lib/pricing/credit-config.ts 와 같은 수법). consent.ts 는 이 파일을 다시 export 한다.
 *
 * 2026-09 개정(docs/LEGAL_REVIEW_2026-09.md):
 *  · 개인정보처리방침 — 2026-09-14 공개와 동시에 시행. 실제 처리와 다르게 적혀 있던 곳을 바로잡은 개정이라
 *    재확인을 받지 않는다(PRIVACY_MIN_ACCEPTED 는 옛 버전 그대로).
 *  · 이용약관·운영정책 — 2026-09-14 공고, 2026-09-22 시행. 9-14 이후 새로 가입하는 회원은 가입 때부터,
 *    기존 회원은 9-22 이후 처음 이용할 때 명시적으로 동의를 받는다(공고 기간에는 띠로 알리고 «미리 동의»를 연다).
 *
 * ⚠️ 날짜를 바꾸면 문서 본문(공고일·시행일·부칙)과 동의 게이트가 한꺼번에 따라 바뀐다 — 값은 이 파일 한 곳이다.
 */

/** 현행 이용약관(운영정책 포함) — 동의할 때 user_consents.terms_version 에 기록하는 값 = 기존 회원 시행일 */
export const TERMS_VERSION = "2026-09-22";
/** 현행 이용약관 공고일 — 이날부터 새 가입자에게 적용하고, 기존 회원에게 개정을 알린다 */
export const TERMS_ANNOUNCED = "2026-09-14";
/**
 * 이 버전보다 옛 약관에 동의한 회원은 이 날짜(KST)부터 재동의 게이트를 만난다.
 * 그 전(공고 기간)에는 막지 않고 앱 상단 띠로만 알린다.
 */
export const TERMS_MIN_ACCEPTED = "2026-09-22";

/** 현행 개인정보처리방침 — 공개일 = 시행일 */
export const PRIVACY_VERSION = "2026-09-14";
/**
 * 방침은 이번 개정에서 재확인을 받지 않는다 — 가장 옛 버전(최초 게시본)까지 그대로 유효.
 * ⚠️ 이 값을 올리려면 재동의 화면(onboarding/consent 의 update 모양)에 방침 확인 항목을 **먼저** 넣는다.
 *    지금 그 화면은 약관만 다시 묻고 방침 버전은 건드리지 않아서, 값만 올리면 동의해도 게이트를 못 빠져나간다.
 */
export const PRIVACY_MIN_ACCEPTED = "2026-07-16";

/** 종전 문서(개정 전 게시본) 버전 — 보관 페이지(/terms/archive/…, /privacy/archive/…)의 주소가 된다 */
export const PREVIOUS_TERMS_VERSION = "2026-07-16";
export const PREVIOUS_PRIVACY_VERSION = "2026-07-16";

/** «2026-09-22» → «2026년 9월 22일» */
export function koDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${y}년 ${Number(m)}월 ${Number(d)}일`;
}

/** «2026-09-22» → «9월 22일» */
export function koMonthDay(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${Number(m)}월 ${Number(d)}일`;
}

/** 오늘 날짜(한국 시간) «YYYY-MM-DD» — 게이트는 사람이 읽는 날짜(KST)로 선다 */
export function todayKst(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export type ConsentStatus =
  /** 필수 동의가 현행 기준으로 전부 기록돼 있다 */
  | "ok"
  /** 옛 약관에 동의했고 아직 공고 기간이다 — 막지 않고 알리기만 한다(앱 상단 띠 · 미리 동의) */
  | "pending"
  /** 기록이 없거나, 게이트 날짜가 지났는데 옛 버전이다 — 동의 화면으로 보낸다 */
  | "missing"
  /** 확인 불가(0079 미적용·조회 실패) — 막지 않는다. «모름»으로 사람을 가두지 않는다 */
  | "unknown";

export interface ConsentVersions {
  termsVersion: string;
  privacyVersion: string;
}

/**
 * 동의 기록 → 상태. 버전은 ISO 날짜라 문자열 비교가 곧 날짜 비교다.
 *
 * 규칙(2026-09 개정 결정):
 *  · 행이 없다 → missing(첫 가입 동의)
 *  · 방침 확인 버전이 PRIVACY_MIN_ACCEPTED 보다 옛것 → missing
 *  · 약관 버전이 TERMS_MIN_ACCEPTED 보다 옛것 → 오늘(KST)이 그 날짜 이후면 missing, 전이면 pending
 *  · 그 밖 → ok
 */
export function evaluateConsent(record: ConsentVersions | null, today: string = todayKst()): ConsentStatus {
  if (!record) return "missing";
  if (record.privacyVersion < PRIVACY_MIN_ACCEPTED) return "missing";
  if (record.termsVersion < TERMS_MIN_ACCEPTED) {
    return today >= TERMS_MIN_ACCEPTED ? "missing" : "pending";
  }
  return "ok";
}
