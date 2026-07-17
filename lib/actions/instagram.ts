"use server";

/**
 * 인스타그램 실 데이터 서버 액션 — 클라이언트 페이지(대시보드/분석)가 호출하는 진입점.
 * 실 프로바이더(lib/data/live)는 서버 전용이라 클라이언트가 직접 못 부르므로 이 액션으로 감싼다.
 * 연동/토큰/설정이 없으면 null을 반환 → 클라이언트는 데모/빈 상태로 폴백.
 */

import {
  getConnectedInstagramAccount,
  getLiveInstagramAnalytics,
  type LiveInstagramAccount,
  type LiveInstagramAnalytics,
} from "@/lib/data/live";

export async function fetchConnectedInstagramAccount(): Promise<LiveInstagramAccount | null> {
  return getConnectedInstagramAccount();
}

export async function fetchLiveInstagramAnalytics(): Promise<LiveInstagramAnalytics | null> {
  return getLiveInstagramAnalytics();
}
