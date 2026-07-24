/**
 * TikTok 프로필 조회 어댑터 (open.tiktokapis.com v2).
 * 근거: docs/REAL_API_SPEC.md 6절.
 *
 * 심사 없이(Sandbox + target user) 확인된 범위는 GET /v2/user/info/ 뿐이다.
 * video.list(영상 목록)·research/insight 계열 API는 Content Posting API·Data Portability API와
 * 마찬가지로 Sandbox 지원 여부가 문서로 명확히 확인되지 않아(docs/REAL_API_SPEC.md 6절 5항)
 * 이 파일에 구현하지 않는다 — 필요해지면 실제 테스터 계정으로 먼저 검증 후 추가할 것.
 *
 * 서버 전용: 액세스 토큰을 클라이언트로 노출하지 않는다.
 */

const USER_INFO_ENDPOINT = "https://open.tiktokapis.com/v2/user/info/";

/** 요청 필드 — user.info.basic/profile/stats 세 스코프로 커버되는 범위만 (lib/tiktok/oauth.ts TIKTOK_SCOPES와 1:1) */
const USER_INFO_FIELDS = ["open_id", "avatar_url", "display_name", "username", "follower_count", "following_count", "likes_count", "video_count"].join(",");

export interface TiktokAccountInfo {
  openId: string;
  displayName: string | null;
  username: string | null;
  avatarUrl: string | null;
  followerCount: number;
  followingCount: number;
  likesCount: number;
  videoCount: number;
}

interface TiktokUserInfoResponse {
  data?: {
    user?: {
      open_id?: string;
      display_name?: string;
      username?: string;
      avatar_url?: string;
      follower_count?: number;
      following_count?: number;
      likes_count?: number;
      video_count?: number;
    };
  };
  error?: { code?: string; message?: string; log_id?: string };
}

/** 연동 직후·주기 갱신용 프로필 기본 정보 조회 (설정·대시보드 표시용). */
export async function fetchTiktokUserInfo(accessToken: string): Promise<TiktokAccountInfo> {
  const res = await fetch(`${USER_INFO_ENDPOINT}?fields=${USER_INFO_FIELDS}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    // 인사이트가 아닌 기본 프로필이라도 불필요한 중복 호출을 줄이기 위해 짧게 캐시 (IG/Threads 어댑터와 동일 정책)
    next: { revalidate: 300 },
  });
  const json = (await res.json().catch(() => ({}))) as TiktokUserInfoResponse;
  // TikTok v2 응답은 HTTP 200이어도 본문 error.code가 "ok"가 아니면 실패인 경우가 있어 둘 다 확인한다.
  const user = json.data?.user;
  if (!res.ok || !user?.open_id || (json.error?.code && json.error.code !== "ok")) {
    throw new Error(`user_info_failed: ${json.error?.message ?? json.error?.code ?? `http_${res.status}`}`);
  }
  return {
    openId: user.open_id,
    displayName: user.display_name ?? null,
    username: user.username ?? null,
    avatarUrl: user.avatar_url ?? null,
    followerCount: typeof user.follower_count === "number" ? user.follower_count : 0,
    followingCount: typeof user.following_count === "number" ? user.following_count : 0,
    likesCount: typeof user.likes_count === "number" ? user.likes_count : 0,
    videoCount: typeof user.video_count === "number" ? user.video_count : 0,
  };
}
