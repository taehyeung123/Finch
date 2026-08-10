import "server-only";

/*
  업종 분류 체계 — 핀치판.

  스니핏 24개를 실측했으나 그대로 쓰지 않았다. 근거 2가지:
  1) 스니핏 목록은 "커머스 상품 카테고리"에 가깝다(주방용품·오피스문구 등).
     한국 메타광고에서 실제로 물량이 도는 축은 상품 종류가 아니라
     "누가 돈을 태우는가"에 더 가깝다 — 병원·학원·프랜차이즈·부동산이
     주방용품보다 광고 집행량이 훨씬 크다.
  2) 업종이 너무 잘게 쪼개지면 각 칸의 소재 수가 부족해 빈 업종이 생긴다.
     빈 칸이 보이는 순간 "데이터 적은 서비스"로 읽힌다(is_visible 게이트의 존재 이유).

  그래서 22개로 줄이고 5개 대분류로 묶었다. 화면은 이 배열에 직접 접근하지 않고
  listVisibleIndustries()를 거친다 — 자격 미달 업종이 UI에 새는 경로를 구조적으로 막는다.
  그래서 이 파일은 server-only 이고 INDUSTRIES 를 export 하지 않는다.
*/

export const INDUSTRY_GROUPS = [
  { key: "beauty_fashion", label: "뷰티·패션" },
  { key: "food_health", label: "푸드·건강" },
  { key: "living_home", label: "리빙·생활" },
  { key: "service_local", label: "서비스·로컬" },
  { key: "digital_finance", label: "디지털·금융" },
] as const;

export type IndustryGroupKey = (typeof INDUSTRY_GROUPS)[number]["key"];

interface IndustryDef {
  id: string;
  nameKo: string;
  group: IndustryGroupKey;
  sort: number;
}

const INDUSTRIES: IndustryDef[] = [
  // 뷰티·패션 — 메타광고 물량 1위 군
  { id: "beauty", nameKo: "뷰티·화장품", group: "beauty_fashion", sort: 10 },
  { id: "skincare_clinic", nameKo: "피부·성형", group: "beauty_fashion", sort: 20 },
  { id: "fashion", nameKo: "패션·의류", group: "beauty_fashion", sort: 30 },
  { id: "accessory", nameKo: "주얼리·잡화", group: "beauty_fashion", sort: 40 },

  // 푸드·건강
  { id: "food", nameKo: "식품·간편식", group: "food_health", sort: 50 },
  { id: "health_supplement", nameKo: "건강기능식품", group: "food_health", sort: 60 },
  { id: "diet_fitness", nameKo: "다이어트·피트니스", group: "food_health", sort: 70 },
  { id: "dining", nameKo: "외식·카페", group: "food_health", sort: 80 },

  // 리빙·생활
  { id: "living", nameKo: "리빙·인테리어", group: "living_home", sort: 90 },
  { id: "household", nameKo: "생활용품", group: "living_home", sort: 100 },
  { id: "baby_kids", nameKo: "유아·출산", group: "living_home", sort: 110 },
  { id: "pet", nameKo: "반려동물", group: "living_home", sort: 120 },
  { id: "appliance", nameKo: "가전·디지털기기", group: "living_home", sort: 130 },

  // 서비스·로컬 — 한국 광고 집행이 큰데 스니핏 목록에서 얇았던 군
  { id: "medical", nameKo: "병원·의료", group: "service_local", sort: 140 },
  { id: "education", nameKo: "교육·학원", group: "service_local", sort: 150 },
  { id: "travel", nameKo: "여행·숙박", group: "service_local", sort: 160 },
  { id: "franchise", nameKo: "프랜차이즈·창업", group: "service_local", sort: 170 },
  { id: "wedding", nameKo: "웨딩·행사", group: "service_local", sort: 180 },

  // 디지털·금융
  { id: "it_saas", nameKo: "IT·앱·SaaS", group: "digital_finance", sort: 190 },
  { id: "finance", nameKo: "금융·보험", group: "digital_finance", sort: 200 },
  { id: "realestate", nameKo: "부동산", group: "digital_finance", sort: 210 },
  { id: "game_content", nameKo: "게임·콘텐츠", group: "digital_finance", sort: 220 },

  // 분류 실패분의 대피소. AI confidence 가 낮으면 여기로 보낸다 —
  // 억지로 특정 업종에 넣으면 그 업종 정확도가 통째로 떨어진다.
  { id: "etc", nameKo: "기타", group: "digital_finance", sort: 999 },
];

export type IndustryKey = string;

const BY_ID = new Map(INDUSTRIES.map((i) => [i.id, i]));

/** 업종 한국어 라벨 — 모르는 키는 그대로 돌려준다(화면이 깨지지 않게) */
export function industryLabel(id: string): string {
  return BY_ID.get(id)?.nameKo ?? id;
}

export function industryGroup(id: string): IndustryGroupKey | null {
  return BY_ID.get(id)?.group ?? null;
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
