import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { isMissingTableError } from "@/lib/supabase/errors";
import { evaluateConsent, type ConsentStatus } from "./versions";

/**
 * 가입 필수 동의 — 만 14세 확인 · 이용약관 · 개인정보 수집·이용 안내 확인 (0079).
 *
 * OAuth 는 가입=로그인이라 가입 페이지 체크박스는 /login 으로 우회된다.
 * 그래서 **첫 로그인 직후**에 동의 화면(/onboarding/consent)으로 보내 받고,
 * user_consents 에 기록한다. 게이트는 app/(finch)/(app)/layout.tsx 가 세운다.
 *
 * 버전·날짜는 lib/legal/versions.ts(순수 모듈)가 정본이다 — 동의 화면(클라이언트)도 같은 값을 읽어야 해서 거기 둔다.
 * 판정 규칙은 versions.ts 의 evaluateConsent 한 곳이다(여기와 설정 > 사업자 정보가 같은 함수를 쓴다).
 */
export {
  TERMS_VERSION,
  TERMS_ANNOUNCED,
  TERMS_MIN_ACCEPTED,
  PRIVACY_VERSION,
  PRIVACY_MIN_ACCEPTED,
  evaluateConsent,
  type ConsentStatus,
} from "./versions";

export interface ConsentRecord {
  termsVersion: string;
  privacyVersion: string;
  /** 광고성 정보(이메일) 수신 동의 시각 — null 은 미동의 */
  marketingAt: string | null;
}

export interface ConsentSnapshot {
  status: ConsentStatus;
  /** 기록이 있으면 그 값 — 조회 실패(unknown)·기록 없음(missing)이면 null */
  record: ConsentRecord | null;
}

/**
 * 동의 기록과 상태 — React cache 로 한 렌더에 1회만 나간다(레이아웃 게이트가 페이지마다 부른다).
 *
 * ⚠️ 실패는 «미동의»가 아니다. 조회가 죽었다고 missing 을 돌려주면
 * DB 장애 순간 전 사용자가 동의 화면에 갇히고, 저장도 같은 DB 라 빠져나올 수도 없다.
 * 인증 가드(layout)가 Supabase 장애에 fail-open 하는 것과 같은 이유로 unknown 은 통과시킨다.
 */
export const getConsentSnapshot = cache(async (userId: string): Promise<ConsentSnapshot> => {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("user_consents")
      .select("terms_version, privacy_version, marketing_email_at")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      /* 0079 미적용 — 아직 열리지 않은 기능이다. 게이트를 세우면 저장할 표도 없어 전원이 갇힌다. */
      if (isMissingTableError(error)) return { status: "unknown", record: null };
      console.error("[consent] 동의 상태 조회 실패:", error.message);
      return { status: "unknown", record: null };
    }
    if (!data) return { status: "missing", record: null };
    const row = data as { terms_version: string; privacy_version: string; marketing_email_at: string | null };
    const record: ConsentRecord = {
      termsVersion: row.terms_version,
      privacyVersion: row.privacy_version,
      marketingAt: row.marketing_email_at,
    };
    /* 문서가 개정되면(버전 상승) 재동의 — 다만 공고 기간에는 막지 않고 알리기만 한다(pending) */
    return { status: evaluateConsent(record), record };
  } catch (e) {
    console.error("[consent] 동의 상태 조회 실패:", e);
    return { status: "unknown", record: null };
  }
});

/** 상태만 — 게이트(«missing» 이면 동의 화면)가 쓰는 짧은 형태. 조회는 getConsentSnapshot 과 공유된다 */
export const getConsentStatus = cache(async (userId: string): Promise<ConsentStatus> => {
  return (await getConsentSnapshot(userId)).status;
});
