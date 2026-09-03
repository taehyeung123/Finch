"use client";

import { useState } from "react";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { FinchLogo } from "@/components/logo";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/client";
import { GoogleIcon, KakaoIcon } from "@/components/icons/provider-icons";

/* 소셜 버튼 공통 — 브랜드 배경색 위 텍스트는 text-on-kakao(다크) 토큰 사용 */
const socialButton =
  "flex h-12 w-full items-center justify-center gap-2.5 rounded-card text-[15px] font-semibold cursor-pointer transition-opacity hover:opacity-90 active:opacity-80 focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2";

/**
 * 회원가입 — OAuth는 가입=로그인. 미설정 시 데모 모드 폴백.
 *
 * nextPath 는 서버 컴포넌트(page.tsx)가 화이트리스트로 만들어 넘긴 값만 받는다.
 * 여기서 searchParams 를 직접 읽지 않는 이유: ① 검증을 클라이언트에 두면
 * 우회된다 ② 정적 렌더 경로에서 useSearchParams 는 Suspense 경계를 요구한다.
 */
export function SignupForm({ nextPath = "/onboarding" }: { nextPath?: string }) {
  const configured = isSupabaseConfigured();
  const [configNotice, setConfigNotice] = useState(false);

  function signUp(provider: "google" | "kakao") {
    if (!configured) {
      setConfigNotice(true);
      return;
    }
    void createClient().auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`,
      },
    });
  }

  return (
    <div className="w-full max-w-[360px]">
      <Link href="/" aria-label="핀치 홈으로 이동" className="mb-8 inline-flex items-center rounded-card py-2 lg:hidden">
        <FinchLogo />
      </Link>

      <h1 className="text-2xl font-bold leading-tight">무료로 시작하기</h1>
      <p className="mt-1 text-[15px] text-fg-sub">소셜 계정으로 3초 만에 시작 — 신용카드가 필요 없어요</p>

      <div className="mt-6 space-y-2">
        <button
          type="button"
          onClick={() => signUp("google")}
          className={`${socialButton} border border-line bg-body text-fg`}
        >
          <GoogleIcon className="size-5" />
          Google로 시작하기
        </button>
        <button type="button" onClick={() => signUp("kakao")} className={`${socialButton} bg-kakao text-on-kakao`}>
          <KakaoIcon className="size-5" />
          카카오로 시작하기
        </button>
      </div>

      {configNotice ? (
        <p role="status" className="mt-3 rounded-card bg-warning-weak p-3 text-[14px] text-warning">
          Supabase 키 설정 후 사용 가능 — docs/AUTH_SETUP.md 참고
        </p>
      ) : null}

      {!configured ? (
        <>
          <div className="my-6 flex items-center gap-3" aria-hidden>
            <span className="h-px flex-1 bg-line" />
            <span className="text-xs text-fg-faint">또는</span>
            <span className="h-px flex-1 bg-line" />
          </div>
          <ButtonLink href={nextPath} variant="secondary" className="w-full">
            로그인 없이 둘러보기
          </ButtonLink>
        </>
      ) : null}

      {/* 실제 동의는 첫 로그인 직후 동의 화면에서 항목별로 받는다(/onboarding/consent, 0079).
          예전의 «가입 시 동의하게 됩니다» 한 줄은 구분 동의가 아니라서(개인정보보호법 §22) 안내로 바꿨다. */}
      <p className="mt-4 text-center text-xs text-fg-sub">
        가입을 진행하면 다음 단계에서{" "}
        <Link href="/terms" className="-my-2 inline-block py-2.5 underline underline-offset-2 hover:text-fg">
          이용약관
        </Link>
        ·{" "}
        <Link href="/privacy" className="-my-2 inline-block py-2.5 underline underline-offset-2 hover:text-fg">
          개인정보 수집·이용
        </Link>{" "}
        동의를 받아요
      </p>

      <p className="mt-6 text-center text-[14px] text-fg-sub">
        이미 계정이 있나요?{" "}
        <Link href="/login" className="-my-1.5 inline-block px-1 py-2 font-semibold text-primary hover:text-primary-hover">
          로그인
        </Link>
      </p>
    </div>
  );
}
