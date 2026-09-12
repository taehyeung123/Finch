import { AppLink } from "@/components/ui/app-link";
import { TERMS_MIN_ACCEPTED, koMonthDay } from "@/lib/legal/versions";

/*
  이용약관 개정 공고 띠 — 옛 약관에 동의한 회원에게 공고 기간(시행일 전)에만 앱 상단에 뜬다.
  (app) 레이아웃이 이미 받아 둔 동의 상태(«pending»)로만 판단한다 — 추가 조회가 없다(레이아웃은 더 기다리지 않는다).
  시행일이 지나면 띠 대신 동의 화면(게이트)이 선다(lib/legal/versions.ts evaluateConsent).
  모양은 바로 위 «예시 데이터» 띠와 같은 한 줄 — 새 면·새 크기를 만들지 않는다.
*/
export function TermsUpdateBanner() {
  const link =
    "trans-state -my-1.5 inline-block py-1.5 font-semibold text-fg underline underline-offset-2 hover:text-primary-ink";
  return (
    <p role="status" className="flex flex-wrap items-center gap-x-3 gap-y-0.5 border-b border-line bg-plate px-4 py-1.5 text-[12px] text-fg-sub md:px-6">
      <span className="break-keep">{koMonthDay(TERMS_MIN_ACCEPTED)}부터 이용약관이 바뀌어요 — 운영정책이 새로 생기고 유료 서비스·환불 기준이 구체화돼요.</span>
      <a href="/terms/changes" target="_blank" rel="noopener noreferrer" className={link}>
        변경 내용
      </a>
      <AppLink href="/onboarding/consent" className={link}>
        미리 동의하기
      </AppLink>
    </p>
  );
}
