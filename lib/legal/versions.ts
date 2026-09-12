/**
 * 약관·방침 버전과 날짜 — **순수 모듈**(서버 전용 의존 없음).
 *
 * 동의 화면(클라이언트)과 문서 본문·설정 화면(서버)이 같은 날짜를 읽는다. lib/legal/consent.ts 는
 * supabase 서버 클라이언트를 끌어오므로 클라이언트 컴포넌트가 거기서 상수를 가져오면 빌드가 깨진다 —
 * 그래서 숫자만 여기 둔다(lib/pricing/credit-config.ts 와 같은 수법). consent.ts 는 이 파일을 다시 export 한다.
 *
 * 2026-09 개정(docs/LEGAL_REVIEW_2026-09.md). 2026-09-12 사장님 지시로 공고·게시를 9-14 → 9-12(배포일)로 당겼다:
 *  · 개인정보처리방침 — 2026-09-12 공개와 동시에 시행. 실제 처리와 다르게 적혀 있던 곳을 바로잡은 개정이라
 *    재확인을 받지 않는다(PRIVACY_MIN_ACCEPTED 는 옛 버전 그대로).
 *  · 이용약관·운영정책 — 2026-09-12 공고, 2026-09-22 시행(공고 10일). 공고일 이후 새 약관에 동의하고 가입하는 회원은
 *    가입 때부터, 기존 회원은 9-22 이후 처음 이용할 때 명시적으로 동의를 받는다(공고 기간에는 띠로 알리고 «미리 동의»를 연다).
 *
 * ⚠️ 날짜를 바꾸면 문서 본문(공고일·시행일·부칙)과 동의 게이트가 한꺼번에 따라 바뀐다 — 값은 이 파일 한 곳이다.
 * ⚠️ 값끼리 지켜야 하는 관계가 있다(아래 versionInvariantProblems). 어기면 이 모듈을 불러오는 순간 던진다 —
 *    정적 페이지(/terms 등)가 이 파일을 읽으므로 운영이 아니라 `next build` 가 먼저 멈춘다.
 *    확인: node scripts/test-legal.ts
 */

/** 현행 이용약관(운영정책 포함) — 동의할 때 user_consents.terms_version 에 기록하는 값 = 기존 회원 시행일 */
export const TERMS_VERSION = "2026-09-22";
/** 현행 이용약관 공고일 = 게시·배포일 — 이날부터 새 가입자에게 적용하고, 기존 회원에게 개정을 알린다 */
export const TERMS_ANNOUNCED = "2026-09-12";
/**
 * 이 버전보다 옛 약관에 동의한 회원은 이 날짜(KST)부터 재동의 게이트를 만난다.
 * 그 전(공고 기간)에는 막지 않고 앱 상단 띠로만 알린다.
 * ⚠️ TERMS_VERSION 을 넘으면 안 된다 — 넘으면 동의 화면이 적는 값(TERMS_VERSION)이 기준에 못 미쳐 동의해도 못 빠져나간다.
 *    그래서 따로 적지 않고 TERMS_VERSION 을 그대로 쓴다.
 */
export const TERMS_MIN_ACCEPTED = TERMS_VERSION;

/** 현행 개인정보처리방침 — 공개일 = 시행일 = 배포일 */
export const PRIVACY_VERSION = "2026-09-12";
/**
 * 방침은 이번 개정에서 재확인을 받지 않는다 — 가장 옛 버전(최초 게시본)까지 그대로 유효.
 * ⚠️ 이 값을 올리려면 재동의 화면(onboarding/consent 의 update 모양)에 방침 확인 항목을 **먼저** 넣는다.
 *    지금 그 화면은 약관만 다시 묻고 방침 버전은 건드리지 않아서, 값만 올리면 동의해도 게이트를 못 빠져나간다
 *    (그래서 아래 불변식 ④가 FIRST_RECORDED_PRIVACY_VERSION 보다 크게 두는 것을 막는다).
 */
export const PRIVACY_MIN_ACCEPTED = "2026-07-16";

/** 종전 문서(개정 전 게시본) 버전 — 보관 페이지(/terms/archive/…, /privacy/archive/…)의 주소가 된다 */
export const PREVIOUS_TERMS_VERSION = "2026-07-16";
export const PREVIOUS_PRIVACY_VERSION = "2026-07-16";

/**
 * 동의 기록(0079, 2026-09-02~)에 남아 있을 수 있는 **가장 옛** 방침 버전 — 역사적 사실이라 바꾸지 않는다.
 * 0079 도입부터 2026-09 개정 전까지 가입 화면이 적은 값은 이것 하나다(git a81dcb9 의 lib/legal/consent.ts).
 */
export const FIRST_RECORDED_PRIVACY_VERSION = "2026-07-16";

/** 약관 개정 공고 기간의 하한(일) — 약관 제3조③1 «적용일 7일 전부터». 불리한 변경의 30일은 versionInvariantProblems ⑥ */
export const TERMS_MIN_NOTICE_DAYS = 7;

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

/** «YYYY-MM-DD»(한국 시간 자정)의 epoch ms — 게이트가 서는 순간. 열려 있는 탭이 그 시각에 다시 그리게 할 때 쓴다 */
export function kstMidnightMs(iso: string): number {
  return Date.parse(`${iso}T00:00:00+09:00`);
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

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 버전 상수끼리의 관계 — 하나라도 어기면 **동의해도 게이트를 못 빠져나가는 회원**이 생기거나 문서 날짜가 거꾸로 된다
 * (2026-09-12 점검 «날짜를 잘못 바꾸면 전원이 동의 화면 루프»). 빈 배열이면 정상.
 *
 *  ① 모든 값이 YYYY-MM-DD — 문자열 비교가 날짜 비교가 되는 전제
 *  ② TERMS_MIN_ACCEPTED ≤ TERMS_VERSION — 동의 화면(가입·재동의)이 적는 값이 기준을 넘어야 게이트를 빠져나간다
 *  ③ PRIVACY_MIN_ACCEPTED ≤ PRIVACY_VERSION — 새 가입자가 적는 값이 기준을 넘어야 한다
 *  ④ PRIVACY_MIN_ACCEPTED ≤ FIRST_RECORDED_PRIVACY_VERSION — 재동의 화면은 방침 버전을 적지 않는다.
 *     기준을 이보다 올리면 기존 회원이 재동의를 해도 영영 missing 이다(재동의 화면에 방침 확인을 넣은 뒤에만 풀 것)
 *  ⑤ PREVIOUS_* < 현행 — 보관 페이지가 «개정 전» 문서를 가리킨다
 *  ⑥ TERMS_ANNOUNCED ≤ TERMS_VERSION, 그 사이 ≥ TERMS_MIN_NOTICE_DAYS(7일) — 약관 제3조③1.
 *     불리한 변경의 30일(제3조③2)은 «간주동의»의 요건이다. 이번 개정은 기존 회원에게 명시적 동의(게이트)로만 적용하고,
 *     간주동의는 부칙 제2조대로 시행 30일 뒤 개별 통지 + 다시 30일 뒤라 공고일부터 60일이 넘는다(docs/LEGAL_REVIEW_2026-09.md 6·10절).
 */
export interface VersionSet {
  TERMS_VERSION: string;
  TERMS_ANNOUNCED: string;
  TERMS_MIN_ACCEPTED: string;
  PRIVACY_VERSION: string;
  PRIVACY_MIN_ACCEPTED: string;
  PREVIOUS_TERMS_VERSION: string;
  PREVIOUS_PRIVACY_VERSION: string;
  FIRST_RECORDED_PRIVACY_VERSION: string;
}

/** 지금 이 파일의 값 — 검사 함수의 기본 입력(검증 스크립트는 일부러 틀린 값을 넣어 검사가 잡는지도 본다) */
export const CURRENT_VERSIONS: VersionSet = {
  TERMS_VERSION,
  TERMS_ANNOUNCED,
  TERMS_MIN_ACCEPTED,
  PRIVACY_VERSION,
  PRIVACY_MIN_ACCEPTED,
  PREVIOUS_TERMS_VERSION,
  PREVIOUS_PRIVACY_VERSION,
  FIRST_RECORDED_PRIVACY_VERSION,
};

export function versionInvariantProblems(v: VersionSet = CURRENT_VERSIONS): string[] {
  const p: string[] = [];
  for (const [k, val] of Object.entries(v)) {
    if (!ISO_DAY.test(val) || Number.isNaN(kstMidnightMs(val))) p.push(`${k}(${val}) 는 YYYY-MM-DD 여야 한다`);
  }
  if (p.length > 0) return p;
  if (v.TERMS_MIN_ACCEPTED > v.TERMS_VERSION) p.push("TERMS_MIN_ACCEPTED > TERMS_VERSION — 동의해도 게이트를 못 빠져나간다");
  if (v.PRIVACY_MIN_ACCEPTED > v.PRIVACY_VERSION) {
    p.push("PRIVACY_MIN_ACCEPTED > PRIVACY_VERSION — 새 가입자가 동의해도 게이트를 못 빠져나간다");
  }
  if (v.PRIVACY_MIN_ACCEPTED > v.FIRST_RECORDED_PRIVACY_VERSION) {
    p.push("PRIVACY_MIN_ACCEPTED > FIRST_RECORDED_PRIVACY_VERSION — 재동의 화면은 방침 버전을 적지 않아 기존 회원이 갇힌다");
  }
  if (!(v.PREVIOUS_TERMS_VERSION < v.TERMS_VERSION)) p.push("PREVIOUS_TERMS_VERSION 이 현행보다 옛것이 아니다");
  if (!(v.PREVIOUS_PRIVACY_VERSION < v.PRIVACY_VERSION)) p.push("PREVIOUS_PRIVACY_VERSION 이 현행보다 옛것이 아니다");
  if (v.TERMS_ANNOUNCED > v.TERMS_VERSION) p.push("TERMS_ANNOUNCED 가 시행일(TERMS_VERSION)보다 뒤다");
  const noticeDays = Math.round((kstMidnightMs(v.TERMS_VERSION) - kstMidnightMs(v.TERMS_ANNOUNCED)) / 86_400_000);
  if (noticeDays < TERMS_MIN_NOTICE_DAYS) {
    p.push(`약관 공고 기간 ${noticeDays}일 — 적용일 ${TERMS_MIN_NOTICE_DAYS}일 전부터 알려야 한다(약관 제3조③)`);
  }
  return p;
}

/* 불러오는 순간 검사한다 — 어긋난 값이 운영까지 가지 않게(정적 페이지 빌드가 여기서 멈춘다) */
{
  const problems = versionInvariantProblems();
  if (problems.length > 0) {
    throw new Error(`[legal/versions] 버전 불변식 위반 — ${problems.join(" · ")}`);
  }
}
