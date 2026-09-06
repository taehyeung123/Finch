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
  /* ⚠️ 숫자 넷은 **null 이 될 수 있다 = «확인 불가»**. 사용자가 동의 화면에서 user.info.stats 만 빼고 허용하면
     응답에 이 필드들이 아예 안 온다(스코프 승인 ≠ 사용자 동의 — 틱톡 문서가 못 박는다).
     예전엔 그때 0 을 넣었는데, 그건 «팔로워 0명»이라는 거짓말이고 갱신 크론이 진짜 값을 0 으로 덮어쓴 뒤
     「하루 사이 수천 명 감소」 알림까지 보냈다. 모르면 null 로 두고 호출측이 컬럼을 안 건드린다(저장소 0075 규칙). */
  followerCount: number | null;
  followingCount: number | null;
  likesCount: number | null;
  videoCount: number | null;
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
    followerCount: typeof user.follower_count === "number" ? user.follower_count : null,
    followingCount: typeof user.following_count === "number" ? user.following_count : null,
    likesCount: typeof user.likes_count === "number" ? user.likes_count : null,
    videoCount: typeof user.video_count === "number" ? user.video_count : null,
  };
}
