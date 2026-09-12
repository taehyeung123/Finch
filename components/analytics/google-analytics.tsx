"use client";

import { GoogleAnalytics } from "@next/third-parties/google";

/*
  Google Analytics — **로그인 전 공개 화면에서만** 수집한다 (2026-09 개인정보처리방침 제14·15조).

  예전엔 (finch) 루트 레이아웃이 GA 를 실어 로그인 뒤 모든 화면(설정·광고 관리자·링크 편집기)까지 수집했다.
  그 화면 주소에는 인스타그램 계정명·캠페인 ID·팀 초대 토큰이 실릴 수 있고, 방침은 «핀치 웹사이트 이용 통계»라고만 적고 있었다
  (2026-09-12 법률 문서 검토에서 세 검토가 모두 지적). 그래서 싣는 곳을 공개 화면 레이아웃(마케팅·로그인)으로 좁혔다.

  남는 구멍: 공개 화면에서 GA 가 한 번 뜬 뒤 **새로고침 없이** 앱으로 넘어가면 스크립트는 그대로 떠 있고,
  GA4 의 «페이지 변경(브라우저 기록)» 수집이 앱 주소를 보낸다. 그래서 앱·온보딩 레이아웃은 GaOff 를 그려
  gtag 의 공식 끄기 스위치(window["ga-disable-측정ID"] = true — 구글 문서 «Disable Google Analytics»)를 켠다.
  렌더 중에 켜는 이유: Next 는 새 화면을 그린 **다음** 주소(history.pushState)를 바꾸는데, 효과(useEffect)는 그보다 늦어
  첫 페이지뷰가 먼저 나갈 수 있다. 렌더는 주소 변경보다 앞선다. 공개 화면으로 돌아오면 PublicAnalytics 가 다시 끈다.
*/

const GA_ID = process.env.NEXT_PUBLIC_GA_ID;

function setGaDisabled(disabled: boolean): void {
  if (!GA_ID || typeof window === "undefined") return;
  (window as unknown as Record<string, unknown>)[`ga-disable-${GA_ID}`] = disabled;
}

/** 공개 화면 레이아웃 전용 — GA 를 싣고, 앱에서 돌아온 경우 끄기 스위치를 푼다 */
export function PublicAnalytics() {
  setGaDisabled(false);
  return GA_ID ? <GoogleAnalytics gaId={GA_ID} /> : null;
}

/** 로그인 뒤 화면 레이아웃 전용 — 이미 떠 있는 GA 가 이 화면들을 수집하지 않게 끈다 */
export function GaOff() {
  setGaDisabled(true);
  return null;
}
