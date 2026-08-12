import "server-only";

import type { Channel, HookType, ReferenceAd, ReferenceItem } from "@/lib/types";
import { searchPool, type PoolItem } from "@/lib/pool/search";
import { industryLabel } from "@/lib/industry/taxonomy";
import { HOOK_VALUES } from "@/lib/reference/engine";

/*
  풀 → 화면 어댑터.

  레퍼런스 화면은 이미 ReferenceItem / ReferenceAd 두 형태를 그린다. 공용 풀로 옮기면서
  화면 컴포넌트를 다시 쓰지 않는다 — 데이터 출처만 바꾸고 모양은 여기서 맞춘다.
  (화면과 저장소를 한 번에 바꾸면 무엇이 깨졌는지 구분이 안 된다.)

  전환 방식: 풀에 내용이 생기면 자동으로 넘어간다. 스위치를 사람이 켜지 않는다 —
  깜빡하면 마이그레이션은 됐는데 화면은 옛 데이터를 보는 상태가 조용히 유지된다.
*/

/** 시각 → "몇 시간 전". 화면이 쓰는 단위가 시간이라 여기서 맞춰 준다. */
function agoHours(iso: string | null): number {
  if (!iso) return 0;
  const h = (Date.now() - new Date(iso).getTime()) / 3_600_000;
  return h > 0 ? Math.round(h) : 0;
}

function isChannel(p: string): p is Channel {
  return p === "instagram" || p === "tiktok" || p === "threads";
}

/** 업종 배열 → 카드에 찍을 한 단어. 여러 개면 첫 번째만 — 카드에 여러 줄이 들어가면 다시 조잡해진다. */
function categoryOf(industryIds: string[]): string {
  return industryIds.length > 0 ? industryLabel(industryIds[0]) : "기타";
}

/** enrich 배치 산출 후킹 태그 — 목록 밖 값이 DB 에 섞여도 화면 타입을 지킨다 */
function hooksOf(p: PoolItem): HookType[] {
  return p.aiHooks.filter((h): h is HookType => (HOOK_VALUES as string[]).includes(h)).slice(0, 2);
}

export function poolItemToReference(p: PoolItem): ReferenceItem {
  return {
    id: p.id,
    channel: isChannel(p.platform) ? p.platform : "instagram",
    // AI 주제어(ai_topic)가 업종명보다 구체적이다 — 배치가 지나간 소재부터 세밀해진다
    category: p.aiTopic || categoryOf(p.industryIds),
    title: p.title || p.body.slice(0, 40),
    // enrich 배치 전에는 본문 앞부분이 요약 자리를 대신한다 —
    // 빈 줄을 두면 카드 높이가 들쭉날쭉해져 그리드가 흔들린다.
    summary: p.aiSummary || p.body.slice(0, 120),
    creatorHandle: p.brandName ? `@${p.brandName.replace(/^@/, "")}` : "",
    // 후킹 태그가 채워지는 순간 탐색의 후킹기법 필터(패싯)가 되살아난다
    hooks: hooksOf(p),
    aiComment: p.aiComment || undefined,
    hashtags: p.hashtags.length > 0 ? p.hashtags : undefined,
    views: p.views,
    likes: p.likes,
    followerCount: p.followerCount,
    comments: p.comments,
    matchedSource: "",
    // 0으로 두면 '수집 기간' 필터와 '최근 수집순' 정렬이 통째로 죽는다
    collectedAgoHours: agoHours(p.firstSeenAt),
    postedAgoHours: p.postedAt ? agoHours(p.postedAt) : undefined,
    dataSource: "thirdparty",
    url: p.permalink,
    thumbnailUrl: p.thumbUrl,
    caption: p.body,
  };
}

export function poolItemToAd(p: PoolItem): ReferenceAd {
  return {
    id: p.id,
    // 카드가 이 값으로 facebook.com/ads/library/?id=... 링크를 만든다.
    // 내부 UUID 를 넣으면 메타가 모르는 ID 라 "결과 없음" 창이 뜬다.
    adArchiveId: p.externalId,
    pageName: p.brandName ?? "알 수 없는 광고주",
    pageProfileUrl: null,
    body: p.body,
    ctaText: p.ctaText,
    thumbnailUrl: p.thumbUrl,
    isActive: p.isActive ?? true,
    startDate: p.postedAt,
    endDate: p.endedAt,
    platforms: p.adPlatforms,
    matchedSource: "",
    // 집행 기간이 이 카드가 파는 정보다. AI 코멘트 자리에 실측값을 넣는다 —
    // 지어낸 문장보다 "62일째 집행 중"이 훨씬 쓸모 있다.
    aiComment: p.runDays && p.runDays > 0 ? `${p.runDays}일째 집행 중` : "",
    category: categoryOf(p.industryIds),
    status: "unseen",
    favorite: false,
    collectedAgoHours: agoHours(p.firstSeenAt),
  };
}

export interface PoolFeed {
  ready: boolean;
  items: ReferenceItem[];
  ads: ReferenceAd[];
}

/**
 * 화면 초기 진입용 풀 조회.
 *
 * 검색어 없이 히트 순 상위를 가져온다 — 첫 화면이 비어 있으면 사용자는 검색을 시도하지 않는다.
 * 풀이 아직 비었으면 ready=false 로 돌려주고, 호출측은 기존 개인 수집분을 그대로 쓴다.
 * 공급사 호출은 없다. 이 경로 전체가 DB 조회다.
 */
export async function loadPoolFeed(pageSize = 40): Promise<PoolFeed> {
  /* 오가닉은 kind 로 **따로** 뽑는다. 전체를 히트순으로 섞어 뽑으면 광고 수백 건이
     상위를 채워 오가닉 게시물이 첫 40건에서 밀려난다 — 오가닉을 수집해도 화면에는
     하나도 안 보이는 상태가 된다("팔로워 수 대비 인기 영상" 섹션이 안 뜨는 원인). */
  const [posts, ads] = await Promise.all([
    searchPool({ kind: "post", sort: "heat", pageSize }).catch(() => null),
    searchPool({ kind: "ad", platform: "meta_ads", sort: "longest", pageSize }).catch(() => null),
  ]);

  const postItems = posts?.items ?? [];
  const adItems = ads?.items ?? [];

  return {
    ready: postItems.length + adItems.length > 0,
    items: postItems.map(poolItemToReference),
    ads: adItems.map(poolItemToAd),
  };
}
