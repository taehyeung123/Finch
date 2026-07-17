/**
 * 실 데이터 프로바이더 (서버 전용) — 연동된 인스타그램 계정의 실 인사이트/미디어를 조회한다.
 *
 * 흐름: connected_accounts 조회(RLS) → 토큰 복호화 → 만료 임박 시 갱신·재저장 → 어댑터 호출.
 * 라이브 인사이트는 Meta 앱 심사·비즈니스 인증 완료 후에만 실제로 값이 채워진다(그 전엔 dev 테스터 계정만).
 * 어떤 단계든 불가하면 null을 반환해 호출측이 데모/빈 상태로 폴백하게 한다.
 *
 * next/headers(createClient) 경유라 서버 컨텍스트에서만 동작한다.
 */

import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/supabase/config";
import { decryptToken, encryptToken } from "@/lib/crypto/tokens";
import { refreshLongLivedToken } from "@/lib/meta/instagram-oauth";
import {
  fetchAccountInsights,
  fetchRecentMedia,
  type AccountInsights,
  type MediaItem,
} from "@/lib/meta/instagram";

export interface LiveInstagramAccount {
  id: string;
  platformUserId: string;
  handle: string;
  displayName: string | null;
  bio: string | null;
  followers: number;
  posts: number;
  tokenExpiresInDays: number | null;
}

export interface LiveInstagramAnalytics {
  account: LiveInstagramAccount;
  insights: AccountInsights;
  media: MediaItem[];
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

interface AccountRow {
  id: string;
  platform_user_id: string | null;
  handle: string;
  display_name: string | null;
  bio: string | null;
  connected: boolean;
  followers: number;
  posts: number;
  access_token_cipher: string | null;
  token_expires_at: string | null;
}

/** 연동된 인스타 계정 행 조회 (토큰 포함, 서버 전용). 없으면 null. */
async function loadInstagramRow(): Promise<AccountRow | null> {
  if (isDemoMode()) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("connected_accounts")
    .select("id, platform_user_id, handle, display_name, bio, connected, followers, posts, access_token_cipher, token_expires_at")
    .eq("channel", "instagram")
    .eq("connected", true)
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("[live] 인스타 계정 조회 실패:", error.message);
    return null;
  }
  return (data as AccountRow | null) ?? null;
}

/** 계정 기본 정보(토큰 제외) — 대시보드/설정의 실 계정 표시용. 라이브 호출 없이 DB만. */
export async function getConnectedInstagramAccount(): Promise<LiveInstagramAccount | null> {
  const row = await loadInstagramRow();
  if (!row || !row.platform_user_id) return null;
  return {
    id: row.id,
    platformUserId: row.platform_user_id,
    handle: row.handle,
    displayName: row.display_name,
    bio: row.bio,
    followers: row.followers,
    posts: row.posts,
    tokenExpiresInDays: daysUntil(row.token_expires_at),
  };
}

/**
 * 유효 토큰 확보 — 만료 임박(<=10일)이면 갱신 후 재저장. 만료·복호화 실패면 null.
 * 갱신은 실패해도 기존 토큰으로 시도(아직 유효할 수 있음)하되, 이미 만료면 포기.
 */
async function ensureFreshToken(row: AccountRow): Promise<string | null> {
  const token = decryptToken(row.access_token_cipher);
  if (!token) return null;

  const remaining = daysUntil(row.token_expires_at);
  if (remaining !== null && remaining <= 0) {
    // 이미 만료 — 재연동 필요
    return null;
  }
  if (remaining !== null && remaining <= 10) {
    try {
      const refreshed = await refreshLongLivedToken(token);
      const cipher = encryptToken(refreshed.accessToken);
      if (cipher) {
        const supabase = await createClient();
        await supabase
          .from("connected_accounts")
          .update({
            access_token_cipher: cipher,
            token_expires_at: new Date(Date.now() + refreshed.expiresInSeconds * 1000).toISOString(),
          })
          .eq("id", row.id);
        return refreshed.accessToken;
      }
    } catch (e) {
      console.error("[live] 토큰 갱신 실패, 기존 토큰으로 시도:", e instanceof Error ? e.message : String(e));
    }
  }
  return token;
}

/**
 * 라이브 인사이트 + 미디어. 연동/토큰/설정 중 하나라도 없으면 null → 호출측 폴백.
 * 부분 실패(인사이트만 막힘 등)는 어댑터가 0/빈배열로 흡수한다.
 */
export async function getLiveInstagramAnalytics(): Promise<LiveInstagramAnalytics | null> {
  const row = await loadInstagramRow();
  if (!row || !row.platform_user_id) return null;

  const token = await ensureFreshToken(row);
  if (!token) return null;

  const igId = row.platform_user_id;
  const [insights, media] = await Promise.all([
    fetchAccountInsights(igId, token),
    fetchRecentMedia(igId, token),
  ]);

  return {
    account: {
      id: row.id,
      platformUserId: igId,
      handle: row.handle,
      displayName: row.display_name,
      bio: row.bio,
      followers: row.followers,
      posts: row.posts,
      tokenExpiresInDays: daysUntil(row.token_expires_at),
    },
    insights,
    media,
  };
}
