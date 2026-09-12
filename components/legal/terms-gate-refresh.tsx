"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { TERMS_MIN_ACCEPTED, kstMidnightMs } from "@/lib/legal/versions";

/*
  공고 기간 띠가 떠 있는 탭을 시행일 자정(한국 시간)에 서버에서 다시 그리게 한다.

  왜(2026-09-12 점검): (app) 레이아웃은 화면을 옮겨 다녀도 다시 그려지지 않는다(레이아웃은 이동 사이에 유지된다 —
  node_modules/next/dist/docs 의 authentication 가이드 «layouts don't re-render on navigation»). 게이트는 레이아웃에 있으니,
  9/21 에 열어 둔 탭은 9/22 가 돼도 새로고침 전까지 옛 띠와 전체 기능이 그대로였다 — 갇히는 쪽이 아니라 느슨해지는 쪽이지만,
  «9/22 부터 동의를 받는다»가 탭마다 달라진다. router.refresh() 는 레이아웃까지 서버에서 다시 그리므로 거기서 게이트(redirect)가 선다.

  · 서버 시계가 조금 늦어도 자정을 넘긴 뒤에 묻도록 1.5초 여유를 둔다. 한 번만 부른다 — 서버가 아직 pending 이라고 해도(시계 차이)
    같은 컴포넌트가 그대로 남아 다시 부르지 않는다(되풀이 새로고침 없음).
  · 절전·백그라운드 탭은 타이머가 늦게 돈다 — 탭이 다시 보이거나 초점을 받을 때 한 번 더 본다.
  · setTimeout 은 약 24.8일(2^31-1ms)을 넘기면 즉시 실행된다 — 그보다 멀면 타이머를 걸지 않고 보임·초점 확인에만 맡긴다.
*/

const SLACK_MS = 1_500;
const MAX_TIMEOUT_MS = 2_147_483_647;

export function TermsGateRefresh() {
  const router = useRouter();

  useEffect(() => {
    const at = kstMidnightMs(TERMS_MIN_ACCEPTED) + SLACK_MS;
    let done = false;
    const fire = () => {
      if (done || Date.now() < at) return;
      done = true;
      router.refresh();
    };
    const wait = at - Date.now();
    const timer = wait <= MAX_TIMEOUT_MS ? window.setTimeout(fire, Math.max(0, wait)) : undefined;
    const onVisible = () => {
      if (document.visibilityState === "visible") fire();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", fire);
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", fire);
    };
  }, [router]);

  return null;
}
