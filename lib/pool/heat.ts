import "server-only";

/*
  히트 스코어 — 검색 결과의 기본 정렬 기준.

  "양질이 잘 뜨게" 하려면 정렬이 전부다. 목록에 뭐가 들어있느냐보다 뭐가 위에 있느냐가
  체감 품질을 정한다. 그래서 좋아요 순 같은 단순 정렬을 쓰지 않는다 —
  팔로워 많은 계정이 상단을 영구 점거하고, 화면이 매번 똑같아진다.

  광고와 오가닉은 "잘 됐다"의 의미가 다르므로 식을 나눈다.

  광고: **집행 기간이 성과의 대리 지표다.**
    광고주는 성과가 안 나오는 소재를 두 달씩 돌리지 않는다. 60일 이상 살아있는 광고는
    그 자체로 검증된 소재다(스니핏·훔쳐봐가 파는 핵심 정보도 결국 이것).
    좋아요 수는 광고 라이브러리가 주지 않으므로 애초에 쓸 수 없다.

  오가닉: **팔로워 대비 배수.**
    절대 조회수는 계정 크기를 재는 것이지 콘텐츠 실력을 재는 게 아니다.
    팔로워 1천에 조회 50만이 팔로워 100만에 조회 50만보다 훨씬 배울 게 많다.
    단 팔로워를 모르면(수집 경로에 따라 0) 배수를 못 구하므로 절대치로 후퇴한다.

  두 값 모두 0~100 스케일로 맞춘다. 한 목록에 광고와 오가닉이 섞여 나오기 때문에
  스케일이 다르면 한쪽이 통째로 밀린다.
*/

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** 로그 압축 — 상위 1%가 스코어를 독식하는 걸 막는다 */
function log01(value: number, ceiling: number): number {
  if (value <= 0) return 0;
  return clamp(Math.log10(1 + value) / Math.log10(1 + ceiling), 0, 1);
}

/** 신선도 — 30일까지 1.0, 이후 180일에 걸쳐 0.45까지 완만히 떨어진다.
 *  0으로 죽이지 않는 이유: 1년 된 명작 광고는 여전히 레퍼런스 가치가 있다. */
function freshness(postedAt: Date | null): number {
  if (!postedAt) return 0.7;
  const days = (Date.now() - postedAt.getTime()) / 86_400_000;
  if (days <= 30) return 1;
  return clamp(1 - ((days - 30) / 180) * 0.55, 0.45, 1);
}

export interface AdHeatInput {
  runDays: number;
  isActive: boolean;
  startedAt: Date | null;
  /** 광고주가 현재 돌리는 총 광고 수 — 많을수록 예산이 큰 광고주 = 참고 가치 ↑ */
  brandActiveAdCount: number;
  hasThumb: boolean;
  bodyLength: number;
}

export function adHeat(a: AdHeatInput): number {
  // 60일을 만점 기준으로 잡았다(두 달 = 한 분기 캠페인이 갱신되고도 살아남은 소재).
  const longevity = log01(a.runDays, 60);
  const alive = a.isActive ? 1 : 0.55;
  const spender = log01(a.brandActiveAdCount, 40);
  // 본문이 한 줄뿐인 광고는 카드에서 배울 게 없다. 완전 배제는 안 하고 감점만.
  const substance = a.bodyLength >= 40 ? 1 : a.bodyLength >= 10 ? 0.8 : 0.6;
  const visual = a.hasThumb ? 1 : 0.5; // 썸네일 없는 카드는 그리드에서 구멍이 된다

  const base = longevity * 62 + spender * 20 + 18;
  return Math.round(base * alive * substance * visual * freshness(a.startedAt) * 10) / 10;
}

export interface PostHeatInput {
  views: number;
  likes: number;
  comments: number;
  followerCount: number;
  postedAt: Date | null;
  hasThumb: boolean;
}

export function postHeat(p: PostHeatInput): number {
  const engagement = p.likes + p.comments * 3; // 댓글이 좋아요보다 훨씬 비싼 행동
  let core: number;
  if (p.followerCount > 0) {
    // 팔로워 대비 조회 배수. 20배를 만점으로 본다(실측상 이 위는 대형 바이럴 소수).
    const multiple = (p.views || engagement) / p.followerCount;
    core = log01(multiple, 20) * 70;
  } else {
    // 팔로워를 모르는 경로(IG 계정 게시물 등) — 절대 조회수로 후퇴.
    // 0을 분모로 쓰지 않는다. 이 갈래가 없으면 해당 경로 게시물이 전부 0점이 된다.
    core = log01(p.views || engagement, 1_000_000) * 58;
  }
  const depth = log01(engagement, 50_000) * 22;
  const visual = p.hasThumb ? 1 : 0.6;
  return Math.round((core + depth + 8) * visual * freshness(p.postedAt) * 10) / 10;
}

/** 저장 수 보정 — 사람이 실제로 담아간 소재를 올린다. 배치 롤업에서 곱한다. */
export function saveBoost(saveCount: number): number {
  return 1 + Math.min(0.35, saveCount * 0.02);
}
