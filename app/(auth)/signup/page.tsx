"use client";

import { useState } from "react";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/client";
import { GoogleIcon, KakaoIcon } from "../_components/provider-icons";

/* 소셜 버튼 공통 — 브랜드 배경색 위 텍스트는 text-on-kakao(다크) 토큰 사용 */
const socialButton =
  "flex h-11 w-full items-center justify-center gap-2.5 rounded-card text-[15px] font-semibold transition-opacity hover:opacity-90 active:opacity-80 focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2";

/** 회원가입 — OAuth는 가입=로그인. 완료 후 온보딩으로 이동, 미설정 시 데모 모드 폴백 */
export default function SignupPage() {
  const configured = isSupabaseConfigured();
  const [configNotice, setConfigNotice] = useState(false);

  function signUp(provider: "google" | "kakao") {
    if (!configured) {
      setConfigNotice(true);
      return;
    }
    void createClient().auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${location.origin}/auth/callback?next=/onboarding` },
    });
  }

  return (
    <div className="mx-auto w-full max-w-md rounded-card border border-line bg-body p-8">
      <h1 className="text-2xl font-bold leading-tight">무료로 시작하기</h1>
      <p className="mt-1 text-[15px] text-fg-sub">소셜 계정으로 3초 만에 시작 — 신용카드가 필요 없어요</p>

      <div className="mt-6 space-y-2">
        <button type="button" onClick={() => signUp("google")} className={`${socialButton} bg-white text-on-kakao`}>
          <GoogleIcon className="size-5" />
          Google로 시작하기
        </button>
        <button type="button" onClick={() => signUp("kakao")} className={`${socialButton} bg-kakao text-on-kakao`}>
          <KakaoIcon className="size-5" />
          카카오로 시작하기
        </button>
      </div>

      {configNotice ? (
        <p role="status" className="mt-3 rounded-card bg-warning-weak p-3 text-[13px] text-warning">
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
          <ButtonLink href="/onboarding" variant="secondary" className="w-full">
            데모 모드로 둘러보기
          </ButtonLink>
        </>
      ) : null}

      <p className="mt-4 text-center text-xs text-fg-faint">
        가입 시 이용약관과 개인정보처리방침에 동의하게 됩니다 (문서 준비 중)
      </p>

      <p className="mt-6 text-center text-[13px] text-fg-sub">
        이미 계정이 있나요?{" "}
        <Link href="/login" className="font-semibold text-primary hover:text-primary-hover">
          로그인
        </Link>
      </p>
    </div>
  );
}
