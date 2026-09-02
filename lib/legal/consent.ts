import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { isMissingTableError } from "@/lib/supabase/errors";

/**
 * 가입 필수 동의 — 만 14세 확인 · 이용약관 · 개인정보 수집·이용 (0079).
 *
 * OAuth 는 가입=로그인이라 가입 페이지 체크박스는 /login 으로 우회된다.
 * 그래서 **첫 로그인 직후**에 동의 화면(/onboarding/consent)으로 보내 받고,
 * user_consents 에 기록한다. 게이트는 app/(finch)/(app)/layout.tsx 가 세운다.
 */

/**
 * 현행 문서 버전 = 각 문서가 명시한 시행일.
 * ⚠️ 약관·방침을 «중요 변경»으로 개정하면 이 값을 새 시행일로 올린다 —
 * 그러면 기존 사용자도 다음 방문에서 재동의 화면을 만난다(아래 버전 비교).
 */
export const TERMS_VERSION = "2026-07-16";
export const PRIVACY_VERSION = "2026-07-16";

export type ConsentStatus =
  /** 필수 동의가 현행 버전으로 전부 기록돼 있다 */
  | "ok"
  /** 기록이 없거나 구버전 — 동의 화면으로 보낸다 */
  | "missing"
  /** 확인 불가(0079 미적용·조회 실패) — 막지 않는다. «모름»으로 사람을 가두지 않는다 */
  | "unknown";

/**
 * 동의 상태 조회 — React cache 로 한 렌더에 1회만 나간다(레이아웃 게이트가 페이지마다 부른다).
 *
 * ⚠️ 실패는 «미동의»가 아니다. 조회가 죽었다고 missing 을 돌려주면
 * DB 장애 순간 전 사용자가 동의 화면에 갇히고, 저장도 같은 DB 라 빠져나올 수도 없다.
 * 인증 가드(layout)가 Supabase 장애에 fail-open 하는 것과 같은 이유로 unknown 은 통과시킨다.
 */
export const getConsentStatus = cache(async (userId: string): Promise<ConsentStatus> => {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("user_consents")
      .select("terms_version, privacy_version")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      /* 0079 미적용 — 아직 열리지 않은 기능이다. 게이트를 세우면 저장할 표도 없어 전원이 갇힌다. */
      if (isMissingTableError(error)) return "unknown";
      console.error("[consent] 동의 상태 조회 실패:", error.message);
      return "unknown";
    }
    if (!data) return "missing";
    const row = data as { terms_version: string; privacy_version: string };
    /* 문서가 개정되면(버전 상승) 재동의 — 구버전 동의는 새 문서에 대한 동의가 아니다 */
    if (row.terms_version !== TERMS_VERSION || row.privacy_version !== PRIVACY_VERSION) {
      return "missing";
    }
    return "ok";
  } catch (e) {
    console.error("[consent] 동의 상태 조회 실패:", e);
    return "unknown";
  }
});
