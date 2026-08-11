import "server-only";

import type { Channel, HookType, ReferenceAd, ReferenceItem } from "@/lib/types";
import { searchPool, type PoolItem } from "@/lib/pool/search";
import { industryLabel } from "@/lib/industry/taxonomy";

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

export function poolItemToReference(p: PoolItem): ReferenceItem {
  return {
    id: p.id,
    channel: isChannel(p.platform) ? p.platform : "instagram",
    category: categoryOf(p.industryIds),
    title: p.title || p.body.slice(0, 40),
    // 풀은 AI 요약을 배치로 채운다. 아직 없으면 본문 앞부분이 그 자리를 대신한다 —
    // 빈 줄을 두면 카드 높이가 들쭉날쭉해져 그리드가 흔들린다.
    summary: p.body.slice(0, 120),
    creatorHandle: p.brandName ? `@${p.brandName.replace(/^@/, "")}` : "",
    hooks: [] as HookType[],
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
    adArchiveId: p.id,
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
  const [posts, ads] = await Promise.all([
    searchPool({ platform: "all", sort: "heat", pageSize }).catch(() => null),
    searchPool({ platform: "meta_ads", sort: "longest", pageSize }).catch(() => null),
  ]);

  const postItems = (posts?.items ?? []).filter((p) => p.kind === "post");
  const adItems = ads?.items ?? [];

  return {
    ready: postItems.length + adItems.length > 0,
    items: postItems.map(poolItemToReference),
    ads: adItems.map(poolItemToAd),
  };
}
