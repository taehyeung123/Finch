"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { LeavingModal } from "@/components/ui/connect-link";
import { euroRo } from "@/lib/josa";

/*
  로그인·가입의 «Google/카카오로 계속하기» — 누르면 구글·카카오 로그인 화면으로 **밖으로 나간다.**

  예전엔 `void signInWithOAuth(...)` 한 줄이라, 인가 화면이 뜰 때까지 1~3초 동안 화면에 아무 변화가 없었다
  (2026-09-10 감사 — 신규 가입자가 가장 먼저 누르는 버튼이다). 그 사이 한 번 더 누르면 signInWithOAuth 가 PKCE 검증값을
  새로 만들어 덮어써, **먼저 열린 인가 화면의 콜백이 실패**했다(로그인 화면으로 «로그인에 실패했습니다»와 함께 돌아온다).

  그래서 채널 연결(ConnectLink)과 같은 모양으로:
   - 누르는 즉시 «Google로 이동하고 있어요» 모달(LeavingModal — 닫을 수 없는 busy 스크림이 두 번째 클릭도 막는다)
   - 실패(오류 반환·예외)면 모달을 **먼저** 내리고 화면 안에 한 줄 알린다. finally 로 풀지 않는다 — 성공 경로는 떠나는 중이다.
   - 뒤로가기(bfcache 복원)로 돌아오면 원복. 첫 로드의 pageshow(persisted=false)는 무시한다 — 막 누른 클릭을 지우면 안 된다.
*/

type Provider = "google" | "kakao";

const PROVIDER_LABEL: Record<Provider, string> = { google: "Google", kakao: "카카오" };

export function useOAuthStart() {
  const [leaving, setLeaving] = useState<Provider | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const reset = (e: PageTransitionEvent) => {
      if (e.persisted) setLeaving(null);
    };
    window.addEventListener("pageshow", reset);
    return () => window.removeEventListener("pageshow", reset);
  }, []);

  async function start(provider: Provider, redirectTo: string) {
    if (leaving) return;
    setFailed(false);
    setLeaving(provider);
    try {
      const { error } = await createClient().auth.signInWithOAuth({ provider, options: { redirectTo } });
      if (error) {
        setLeaving(null);
        setFailed(true);
      }
    } catch {
      setLeaving(null);
      setFailed(true);
    }
  }

  const modal = leaving ? (
    <LeavingModal
      label={`${PROVIDER_LABEL[leaving]} 로그인 화면으로 이동 중`}
      title={`${euroRo(PROVIDER_LABEL[leaving])} 이동하고 있어요`}
      description="로그인 화면이 열려요. 잠시만 기다려 주세요."
    />
  ) : null;

  return { start, leaving, failed, modal };
}

/** 시작하지 못했을 때 화면 안 한 줄 — 로그인·가입이 같은 문장을 쓴다 */
export function OAuthStartFailed() {
  return (
    <p role="alert" className="mt-4 rounded-card bg-negative-weak p-3 text-[14px] text-negative">
      로그인 화면을 열지 못했어요. 잠시 후 다시 시도해 주세요.
    </p>
  );
}
