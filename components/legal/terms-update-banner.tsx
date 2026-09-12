import { AppLink } from "@/components/ui/app-link";
import { TERMS_MIN_ACCEPTED, koMonthDay } from "@/lib/legal/versions";
import { TermsGateRefresh } from "./terms-gate-refresh";

/*
  이용약관 개정 공고 띠 — 옛 약관에 동의한 회원에게 공고 기간(시행일 전)에만 앱 상단에 뜬다.
  (app) 레이아웃이 이미 받아 둔 동의 상태(«pending»)로만 판단한다 — 추가 조회가 없다(레이아웃은 더 기다리지 않는다).
  시행일이 지나면 띠 대신 동의 화면(게이트)이 선다(lib/legal/versions.ts evaluateConsent).
  열려 있던 탭은 시행일 자정에 TermsGateRefresh 가 서버에서 다시 그리게 해 게이트를 세운다.

  면은 흰 판(bg-body) — 회색 지면 위 띠는 흰 판으로 만든다(CLAUDE.md «bg-plate 를 지면 위에 직접 쓰지 말 것»).
  예전엔 bg-plate 였는데 라이트에서 지면(surface)과 같은 색이라 띠가 아니라 글자 한 줄로만 보였다(2026-09-12 점검).
  바로 위 «예시 데이터» 띠와 같은 모양·크기다(둘을 함께 고쳤다 — app/(finch)/(app)/layout.tsx).
*/
export function TermsUpdateBanner() {
  const link =
    "trans-state -my-1.5 inline-block py-1.5 font-semibold text-fg underline underline-offset-2 hover:text-primary-ink";
  return (
    <>
      <p role="status" className="flex flex-wrap items-center gap-x-3 gap-y-0.5 border-b border-line bg-body px-4 py-1.5 text-[12px] text-fg-sub md:px-6">
        <span className="break-keep">{koMonthDay(TERMS_MIN_ACCEPTED)}부터 이용약관이 바뀌어요 — 운영정책이 새로 생기고 유료 서비스·환불 기준이 구체화돼요.</span>
        <a href="/terms/changes" target="_blank" rel="noopener noreferrer" className={link}>
          변경 내용
        </a>
        <AppLink href="/onboarding/consent" className={link}>
          미리 동의하기
        </AppLink>
      </p>
      <TermsGateRefresh />
    </>
  );
}
