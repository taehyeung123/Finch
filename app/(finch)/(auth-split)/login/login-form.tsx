"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ButtonLink } from "@/components/ui/button";
import { FinchLogo } from "@/components/logo";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/client";
import { GoogleIcon, KakaoIcon } from "@/components/icons/provider-icons";

/* 소셜 버튼 공통 — 브랜드 배경색 위 텍스트는 text-on-kakao(다크) 토큰 사용 */
const socialButton =
  "flex h-12 w-full items-center justify-center gap-2.5 rounded-card text-[15px] font-semibold cursor-pointer transition-opacity hover:opacity-90 active:opacity-80 focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2";

/** 로그인 — Supabase OAuth(Google·Kakao). 환경변수 미설정 시 데모 모드 폴백 */
export function LoginForm() {
  return (
    <Suspense fallback={null}>
      <LoginCard />
    </Suspense>
  );
}

function LoginCard() {
  const configured = isSupabaseConfigured();
  const searchParams = useSearchParams();
  const authError = searchParams.get("error") === "auth";
  const [configNotice, setConfigNotice] = useState(false);

  // next 파라미터(예: 팀 초대 수락 후 복귀용 /team/accept?token=...)는 same-origin 검증
  // ("/"로 시작 + "//" 금지 + "\" 금지) 통과 시에만 사용 — app/auth/callback/route.ts와 동일 규칙.
  const nextParam = searchParams.get("next");
  const next =
    nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//") && !nextParam.includes("\\")
      ? nextParam
      : "/dashboard";

  function signIn(provider: "google" | "kakao") {
    if (!configured) {
      setConfigNotice(true);
      return;
    }
    void createClient().auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
  }

  return (
    <div className="w-full max-w-[360px]">
      <Link href="/" aria-label="핀치 홈으로 이동" className="mb-8 inline-flex items-center rounded-card py-2 lg:hidden">
        <FinchLogo />
      </Link>

      <h1 className="text-2xl font-bold leading-tight">로그인</h1>
      <p className="mt-1 text-[15px] text-fg-sub">핀치 계정으로 계속하세요.</p>

      {authError ? (
        <p role="alert" className="mt-4 rounded-card bg-negative-weak p-3 text-[14px] text-negative">
          로그인에 실패했습니다. 잠시 후 다시 시도해 주세요.
        </p>
      ) : null}

      <div className="mt-6 space-y-2">
        <button
          type="button"
          onClick={() => signIn("google")}
          className={`${socialButton} border border-line bg-body text-fg`}
        >
          <GoogleIcon className="size-5" />
          Google로 계속하기
        </button>
        <button type="button" onClick={() => signIn("kakao")} className={`${socialButton} bg-kakao text-on-kakao`}>
          <KakaoIcon className="size-5" />
          카카오로 계속하기
        </button>
      </div>

      {configNotice ? (
        <p role="status" className="mt-3 rounded-card bg-warning-weak p-3 text-[14px] text-warning">
          Supabase 키 설정 후 사용 가능 — docs/AUTH_SETUP.md 참고
        </p>
      ) : null}

      {/* 둘러보기 탈출구는 **데모 폴백에서만** 노출한다.
          "항상 노출 — 막다른 길이 되지 않도록" 이 원래 의도였지만, 실서버(수파베이스 설정됨)에서는
          /dashboard 가드가 비로그인 사용자를 즉시 /login 으로 되돌려서 **이 링크 자체가 막다른
          고리**였다 — 프로덕션 첫 화면에서 눌러도 제자리로 돌아오는 버튼(2026-08-26 실서버 실측).
          실서버의 탈출구는 위 로고(홈으로)가 맡는다. */}
      {!configured ? (
        <>
          <div className="my-6 flex items-center gap-3" aria-hidden>
            <span className="h-px flex-1 bg-line" />
            <span className="text-xs text-fg-faint">또는</span>
            <span className="h-px flex-1 bg-line" />
          </div>
          <ButtonLink href="/dashboard" variant="secondary" className="w-full">
            로그인 없이 둘러보기
          </ButtonLink>
        </>
      ) : null}

      {/* OAuth 는 이 페이지로도 «가입»된다(처음 로그인 = 계정 생성) — 동의 예고를 signup 과 같게 둔다.
          한쪽에만 있으면 로그인 버튼으로 가입한 신규가 동의 화면을 예고 없이 만난다. */}
      <p className="mt-4 text-center text-xs text-fg-sub">
        처음 로그인하시면 다음 단계에서{" "}
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
        아직 계정이 없나요?{" "}
        <Link href="/signup" className="-my-1.5 inline-block px-1 py-2 font-semibold text-primary hover:text-primary-hover">
          회원가입
        </Link>
      </p>
    </div>
  );
}
