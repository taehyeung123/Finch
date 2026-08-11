import "server-only";

/*
  업종 분류 체계 — 서버 전용 파생값.

  목록 자체는 lib/industry/list.ts 에 있다. 화면(필터의 고정 업종 칩)도 같은 목록을
  써야 하므로 server-only 일 수 없다. 이 파일은 시드 생성·노출 자격처럼
  서버에서만 의미가 있는 것만 담는다.

  스니핏 24개를 실측했으나 그대로 쓰지 않았다. 그쪽은 커머스 상품 카테고리에 가깝고
  (주방용품·오피스문구 등), 한국 메타광고에서 물량이 도는 축은 "누가 돈을 태우는가"에
  더 가깝다 — 병원·학원·프랜차이즈·부동산이 주방용품보다 집행량이 훨씬 크다.
*/

import { INDUSTRY_GROUP_LABELS, INDUSTRY_LIST, industryLabelOf } from "@/lib/industry/list";

export const INDUSTRY_GROUPS = Object.entries(INDUSTRY_GROUP_LABELS).map(([key, label]) => ({
  key,
  label,
}));

interface IndustryDef {
  id: string;
  nameKo: string;
  group: string;
  sort: number;
}

const INDUSTRIES: IndustryDef[] = [
  ...INDUSTRY_LIST.map((i, idx) => ({
    id: i.id,
    nameKo: i.label,
    group: i.group,
    sort: (idx + 1) * 10,
  })),
  // 분류 실패분의 대피소. AI confidence 가 낮으면 여기로 보낸다 —
  // 억지로 특정 업종에 넣으면 그 업종 정확도가 통째로 떨어진다.
  { id: "etc", nameKo: "기타", group: "digital_finance", sort: 999 },
];

export type IndustryKey = string;

const BY_ID = new Map(INDUSTRIES.map((i) => [i.id, i]));

/** 업종 한국어 라벨 — 모르는 키는 그대로 돌려준다(화면이 깨지지 않게) */
export function industryLabel(id: string): string {
  return BY_ID.has(id) ? (BY_ID.get(id)?.nameKo ?? id) : industryLabelOf(id);
}

export function isKnownIndustry(id: string): boolean {
  return BY_ID.has(id);
}

/** 시드 마이그레이션 생성용 — 런타임 화면에서는 쓰지 않는다 */
export function allIndustryDefs(): readonly IndustryDef[] {
  return INDUSTRIES;
}

/**
 * 업종이 화면에 노출될 자격.
 * 브랜드 4곳 & 소재 40건을 동시에 넘겨야 한다. 한쪽만 보면
 * "브랜드 1곳이 소재 200건"인 업종이 통과해 화면이 단조로워진다.
 */
export const INDUSTRY_VISIBLE_MIN_BRANDS = 4;
export const INDUSTRY_VISIBLE_MIN_CREATIVES = 40;

/** 허브 오픈 게이트 — 자격 통과 업종이 이 수 미만이면 메뉴 자체를 렌더하지 않는다 */
export const INDUSTRY_HUB_MIN_VISIBLE = 12;
