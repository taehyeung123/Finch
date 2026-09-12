"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { GoogleAnalytics } from "@next/third-parties/google";

/*
  Google Analytics — **로그인 전 공개 화면에서만** 수집한다 (2026-09 개인정보처리방침 제14·15조).

  예전엔 (finch) 루트 레이아웃이 GA 를 실어 로그인 뒤 모든 화면(설정·광고 관리자·링크 편집기)까지 수집했다.
  그 화면 주소에는 인스타그램 계정명·캠페인 ID·팀 초대 토큰이 실릴 수 있고, 방침은 «핀치 웹사이트 이용 통계»라고만 적고 있었다
  (2026-09-12 법률 문서 검토에서 세 검토가 모두 지적). 그래서 싣는 곳을 공개 화면 레이아웃(마케팅·로그인)으로 좁혔다.

  남는 구멍 셋과 막는 방법 — 모두 gtag 의 공식 끄기 스위치(window["ga-disable-측정ID"] = true — 구글 문서 «Disable Google Analytics»):
   ① 새 화면 이동(pushState). 공개 화면에서 GA 가 한 번 뜬 뒤 **새로고침 없이** 앱으로 넘어가면 스크립트는 그대로 떠 있고,
      GA4 의 «페이지 변경(브라우저 기록)» 수집이 앱 주소를 보낸다. 앱·온보딩·팀 레이아웃은 GaOff 를 그려 스위치를 켠다.
      렌더 중에 켜는 이유: Next 는 새 화면을 그린 **다음** 주소(history.pushState)를 바꾸는데, 효과(useEffect)는 그보다 늦어
      첫 페이지뷰가 먼저 나갈 수 있다. 렌더는 주소 변경보다 앞선다. 공개 화면으로 돌아오면 PublicAnalytics 가 다시 끈다.
   ② 뒤로·앞으로(popstate). 여기는 순서가 반대다 — 브라우저가 주소를 **먼저** 바꾸고 popstate 를 쏜 뒤, Next 는 새 화면을
      전환(startTransition)으로 나중에 그린다. 그 사이 GA 의 기록 리스너가 옛 스위치 값(공개 화면의 false)으로 앱 주소를 보낼 수
      있다(2026-09-12 점검: /settings/billing → 요금제 비교 → 뒤로). 그래서 이 문서에서 그려진 주소마다 종류를 기억해 두고,
      popstate 가 오면 **화면을 그리기 전에** 주소만 보고 스위치를 먼저 맞춘다. 캡처 단계로 걸어 GA 리스너보다 먼저 돈다.
      같은 문서 안의 기록 항목은 전부 이 문서가 그린 화면이라 기억에 있다 — 없으면(예상 밖) 끄는 쪽으로 둔다.
   ③ 주소에 식별값이 실리는 공개 화면 — 데이터 삭제 상태 확인(?id=확인 코드). 공개 레이아웃 안이지만 수집하지 않는다.
*/

const GA_ID = process.env.NEXT_PUBLIC_GA_ID;

type Kind = "public" | "off";

/** 이 문서에서 그려진 주소(pathname) → 수집 여부. popstate 때 화면보다 먼저 스위치를 맞추는 데 쓴다(위 ②) */
const seen = new Map<string, Kind>();

function setGaDisabled(disabled: boolean): void {
  if (!GA_ID || typeof window === "undefined") return;
  (window as unknown as Record<string, unknown>)[`ga-disable-${GA_ID}`] = disabled;
}

/** 공개 화면이지만 주소에 확인 코드가 실린다 — 수집하지 않는다(위 ③). 경로: /{instagram|threads|meta-ads}/data-deletion-status */
function isSensitivePublicPath(pathname: string): boolean {
  return pathname.endsWith("/data-deletion-status");
}

if (typeof window !== "undefined" && GA_ID) {
  /* 모듈이 처음 평가될 때 한 번 건다 — GA 스크립트(next/script afterInteractive)는 하이드레이션 뒤에 실리므로 항상 이보다 늦다.
     캡처 단계라 같은 대상(window)의 일반 리스너보다 먼저 돈다. */
  window.addEventListener(
    "popstate",
    () => {
      setGaDisabled(seen.get(window.location.pathname) !== "public");
    },
    { capture: true },
  );
}

/** 지금 주소의 종류를 기억한다 — 화면이 커밋된 뒤(Next 가 주소를 바꾼 뒤)라 window.location 이 새 주소다 */
function useRememberKind(kind: Kind): void {
  const pathname = usePathname();
  useEffect(() => {
    if (!GA_ID) return;
    seen.set(window.location.pathname, kind);
  }, [pathname, kind]);
}

/** 공개 화면 레이아웃 전용 — GA 를 싣고, 앱에서 돌아온 경우 끄기 스위치를 푼다 */
export function PublicAnalytics() {
  const pathname = usePathname();
  const off = isSensitivePublicPath(pathname ?? "");
  setGaDisabled(off);
  useRememberKind(off ? "off" : "public");
  return GA_ID ? <GoogleAnalytics gaId={GA_ID} /> : null;
}

/** 로그인 뒤 화면 레이아웃 전용 — 이미 떠 있는 GA 가 이 화면들을 수집하지 않게 끈다 */
export function GaOff() {
  setGaDisabled(true);
  useRememberKind("off");
  return null;
}
