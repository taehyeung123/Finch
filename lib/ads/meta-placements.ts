/**
 * Meta 노출 위치(Placement) 체계 — 수동 선택 UI·예상 도달 계산용 목 데이터.
 * Meta 광고 관리자의 "노출 위치" 설정을 본떠 어드밴티지+(자동, 추천)와
 * 수동(플랫폼·노출 위치 그룹 직접 선택)을 표현한다.
 * 실제 연동 시 Marketing API의 targeting placement 스펙으로 교체한다.
 */

export type AdPlatform =
  | "facebook"
  | "instagram"
  | "audience_network"
  | "messenger"
  | "threads";

export interface PlacementPosition {
  /** 고유 키 (예: "ig_feed") */
  key: string;
  /** 표시 이름 (예: "Instagram 피드") */
  label: string;
  /** 소속 플랫폼 */
  platform: AdPlatform;
}

export interface PlacementGroup {
  /** 그룹 키 (예: "feeds") */
  key: string;
  /** 그룹 이름 (예: "피드") */
  label: string;
  positions: PlacementPosition[];
}

export interface PlacementState {
  /** 노출 위치 방식 — 어드밴티지+(자동) 또는 수동 */
  mode: "advantage" | "manual";
  /** 수동 시 선택된 플랫폼 */
  platforms: AdPlatform[];
  /** 수동 시 선택된 세부 위치 key 목록 */
  positions: string[];
}

export const PLATFORM_LABEL: Record<AdPlatform, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  audience_network: "Audience Network",
  messenger: "Messenger",
  threads: "Threads",
};

/** 플랫폼 노출 순서 — 칩·요약에 사용 */
export const AD_PLATFORMS: AdPlatform[] = [
  "facebook",
  "instagram",
  "audience_network",
  "messenger",
  "threads",
];

/** Meta 노출 위치를 4개 그룹으로 정리(실용 수준). 각 위치에 소속 플랫폼 지정. */
export const PLACEMENT_GROUPS: PlacementGroup[] = [
  {
    key: "feeds",
    label: "피드",
    positions: [
      { key: "fb_feed", label: "Facebook 피드", platform: "facebook" },
      { key: "ig_feed", label: "Instagram 피드", platform: "instagram" },
      { key: "ig_profile", label: "Instagram 프로필 피드", platform: "instagram" },
      { key: "ig_explore", label: "Instagram 탐색", platform: "instagram" },
      { key: "fb_marketplace", label: "Facebook Marketplace", platform: "facebook" },
      { key: "threads_feed", label: "Threads 피드", platform: "threads" },
    ],
  },
  {
    key: "stories",
    label: "스토리 및 릴스",
    positions: [
      { key: "ig_story", label: "Instagram 스토리", platform: "instagram" },
      { key: "fb_story", label: "Facebook 스토리", platform: "facebook" },
      { key: "ig_reels", label: "Instagram 릴스", platform: "instagram" },
      { key: "fb_reels", label: "Facebook 릴스", platform: "facebook" },
      { key: "msgr_story", label: "Messenger 스토리", platform: "messenger" },
    ],
  },
  {
    key: "instream",
    label: "인스트림 및 검색",
    positions: [
      { key: "reels_instream", label: "릴스 인스트림 광고", platform: "facebook" },
      { key: "fb_search", label: "Facebook 검색 결과", platform: "facebook" },
      { key: "ig_search", label: "Instagram 검색 결과", platform: "instagram" },
    ],
  },
  {
    key: "apps",
    label: "앱 및 사이트",
    positions: [
      { key: "an_native", label: "Audience Network 네이티브·배너", platform: "audience_network" },
      { key: "an_rewarded", label: "Audience Network 보상형 동영상", platform: "audience_network" },
      { key: "msgr_inbox", label: "Messenger 받은 편지함", platform: "messenger" },
    ],
  },
];

/** Meta 권장 최소 노출 위치 수 */
export const MIN_RECOMMENDED = 6;

/** 모든 세부 위치 flat */
export function allPositions(): PlacementPosition[] {
  return PLACEMENT_GROUPS.flatMap((group) => group.positions);
}

/** 기본 상태 — 어드밴티지+(전체 플랫폼 자동, 세부 위치 미선택) */
export function defaultPlacement(): PlacementState {
  return { mode: "advantage", platforms: [...AD_PLATFORMS], positions: [] };
}

/**
 * 선택된 노출 위치 수.
 * - 어드밴티지+: 전체 위치 수
 * - 수동: 선택된 플랫폼에 속한 선택 위치만 카운트(플랫폼 필터 반영)
 */
export function selectedCount(state: PlacementState): number {
  if (state.mode === "advantage") return allPositions().length;
  const platformSet = new Set(state.platforms);
  const byKey = new Map(allPositions().map((pos) => [pos.key, pos] as const));
  return state.positions.filter((key) => {
    const pos = byKey.get(key);
    return pos != null && platformSet.has(pos.platform);
  }).length;
}

/** 예상 도달 계산용 계수(0~1) — 어드밴티지+=1, 수동=선택/전체 */
export function placementFactor(state: PlacementState): number {
  const total = allPositions().length;
  if (total === 0) return 0;
  if (state.mode === "advantage") return 1;
  return selectedCount(state) / total;
}

/** 요약 표기 — "어드밴티지+ 노출 위치" 또는 "수동 · n곳" */
export function summarizePlacement(state: PlacementState): string {
  if (state.mode === "advantage") return "어드밴티지+ 노출 위치";
  return `수동 · ${selectedCount(state)}곳`;
}
