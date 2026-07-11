"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ButtonLink } from "@/components/ui/button";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/client";
import { GoogleIcon, KakaoIcon } from "../_components/provider-icons";

/* 소셜 버튼 공통 — 브랜드 배경색 위 텍스트는 text-on-kakao(다크) 토큰 사용 */
const socialButton =
  "flex h-11 w-full items-center justify-center gap-2.5 rounded-card text-[15px] font-semibold transition-opacity hover:opacity-90 active:opacity-80 focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2";

/** 로그인 — Supabase OAuth(Google·Kakao). 환경변수 미설정 시 데모 모드 폴백 */
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginCard />
    </Suspense>
  );
}

function LoginCard() {
  const configured = isSupabaseConfigured();
  const authError = useSearchParams().get("error") === "auth";
  const [configNotice, setConfigNotice] = useState(false);

  function signIn(provider: "google" | "kakao") {
    if (!configured) {
      setConfigNotice(true);
      return;
    }
    void createClient().auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${location.origin}/auth/callback?next=/dashboard` },
    });
  }

  return (
    <div className="mx-auto w-full max-w-md rounded-card border border-line bg-body p-8">
      <h1 className="text-2xl font-bold leading-tight">로그인</h1>
      <p className="mt-1 text-[15px] text-fg-sub">핀치 계정으로 계속하세요.</p>

      {authError ? (
        <p role="alert" className="mt-4 rounded-card bg-negative-weak p-3 text-[13px] text-negative">
          로그인에 실패했습니다. 잠시 후 다시 시도해 주세요.
        </p>
      ) : null}

      <div className="mt-6 space-y-2">
        <button type="button" onClick={() => signIn("google")} className={`${socialButton} bg-white text-on-kakao`}>
          <GoogleIcon className="size-5" />
          Google로 계속하기
        </button>
        <button type="button" onClick={() => signIn("kakao")} className={`${socialButton} bg-kakao text-on-kakao`}>
          <KakaoIcon className="size-5" />
          카카오로 계속하기
        </button>
      </div>

      {configNotice ? (
        <p role="status" className="mt-3 rounded-card bg-warning-weak p-3 text-[13px] text-warning">
          Supabase 키 설정 후 사용 가능 — docs/AUTH_SETUP.md 참고
        </p>
      ) : null}

      {/* 둘러보기 탈출구는 항상 노출 — 로그인 연동이 죽어 있어도 사이트가 막다른 길이 되지 않도록 */}
      <div className="my-6 flex items-center gap-3" aria-hidden>
        <span className="h-px flex-1 bg-line" />
        <span className="text-xs text-fg-faint">또는</span>
        <span className="h-px flex-1 bg-line" />
      </div>
      <ButtonLink href="/dashboard" variant="secondary" className="w-full">
        로그인 없이 둘러보기
      </ButtonLink>

      <p className="mt-6 text-center text-[13px] text-fg-sub">
        아직 계정이 없나요?{" "}
        <Link href="/signup" className="font-semibold text-primary hover:text-primary-hover">
          회원가입
        </Link>
      </p>
    </div>
  );
}
