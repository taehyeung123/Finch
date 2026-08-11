/*
  업종 목록 — **화면과 서버가 함께 쓰는 단일 출처.** (server-only 아님)

  왜 고정 목록인가
  ------------------------------------------------------------------
  전에는 필터의 "카테고리"를 수집된 데이터에서 뽑아 만들었다(AI 자동 분류).
  그래서 웨딩 관련 자료가 많으면 '웨딩드레스 4 · 웨딩촬영 2 · 웨딩케이크 1' 같은
  잡동사니가 카테고리 자리를 차지했다. 'ai'를 찾으러 온 사람에게는 아무 의미가 없다.

  스니핏이 하는 방식이 맞다: **업종은 데이터가 아니라 제품이 정하는 고정 축이다.**
  뷰티·패션·식품… 언제 들어와도 같은 목록이 같은 자리에 있어야 사용자가 외운다.
  자료가 0건이어도 목록은 그대로 있고, 그건 결함이 아니라 "이 업종은 아직 없다"는 정보다.

  분류 방식
  ------------------------------------------------------------------
  공용 풀 소재는 크롤 키워드에서 업종이 정해진다(industry_ids).
  그 값이 없는 자료(예전 개인 수집분)는 industryFromText() 로 글자에서 추정한다 —
  이게 없으면 고정 목록이 옛 자료에서 항상 0건이 되어 '눌러도 안 되는 버튼'이 된다.
*/

export interface IndustryEntry {
  id: string;
  label: string;
  group: string;
  /** 글자 추정용 별칭. label 자체는 자동으로 포함되므로 여기 또 쓰지 않는다 */
  aliases?: string[];
}

export const INDUSTRY_GROUP_LABELS: Record<string, string> = {
  beauty_fashion: "뷰티·패션",
  food_health: "푸드·건강",
  living_home: "리빙·생활",
  service_local: "서비스·로컬",
  digital_finance: "디지털·금융",
};

export const INDUSTRY_LIST: IndustryEntry[] = [
  { id: "beauty", label: "뷰티·화장품", group: "beauty_fashion", aliases: ["뷰티", "화장품", "코스메틱", "스킨케어", "메이크업"] },
  { id: "skincare_clinic", label: "피부·성형", group: "beauty_fashion", aliases: ["피부과", "성형", "시술", "리프팅", "보톡스", "필러"] },
  { id: "fashion", label: "패션·의류", group: "beauty_fashion", aliases: ["패션", "의류", "옷", "코디", "룩북", "쇼핑몰"] },
  { id: "accessory", label: "주얼리·잡화", group: "beauty_fashion", aliases: ["주얼리", "액세서리", "가방", "지갑", "시계", "안경"] },

  { id: "food", label: "식품·간편식", group: "food_health", aliases: ["식품", "간편식", "밀키트", "먹스타", "요리", "레시피"] },
  { id: "health_supplement", label: "건강기능식품", group: "food_health", aliases: ["건강기능", "영양제", "유산균", "콜라겐", "비타민"] },
  { id: "diet_fitness", label: "다이어트·피트니스", group: "food_health", aliases: ["다이어트", "헬스", "운동", "필라테스", "요가", "홈트", "체중"] },
  { id: "dining", label: "외식·카페", group: "food_health", aliases: ["맛집", "카페", "외식", "디저트", "배달", "먹방"] },

  { id: "living", label: "리빙·인테리어", group: "living_home", aliases: ["인테리어", "리빙", "집꾸미기", "가구", "홈스타일링"] },
  { id: "household", label: "생활용품", group: "living_home", aliases: ["생활용품", "살림", "청소", "정리수납", "주방용품"] },
  { id: "baby_kids", label: "유아·출산", group: "living_home", aliases: ["육아", "유아", "출산", "아기", "기저귀", "임산부"] },
  { id: "pet", label: "반려동물", group: "living_home", aliases: ["반려", "강아지", "고양이", "펫", "멍스타", "냥스타"] },
  { id: "appliance", label: "가전·디지털", group: "living_home", aliases: ["가전", "디지털", "노트북", "청소기", "카메라", "스마트폰"] },

  { id: "medical", label: "병원·의료", group: "service_local", aliases: ["병원", "의료", "치과", "한의원", "임플란트", "건강검진"] },
  { id: "education", label: "교육·학원", group: "service_local", aliases: ["교육", "학원", "공부", "인강", "자격증", "영어", "유학"] },
  { id: "travel", label: "여행·숙박", group: "service_local", aliases: ["여행", "숙박", "호텔", "펜션", "캠핑", "항공", "호캉스"] },
  { id: "franchise", label: "프랜차이즈·창업", group: "service_local", aliases: ["창업", "프랜차이즈", "부업", "자영업", "사장님"] },
  { id: "wedding", label: "웨딩·행사", group: "service_local", aliases: ["웨딩", "결혼", "예식", "스드메", "청첩장", "돌잔치", "신혼"] },

  { id: "it_saas", label: "IT·앱·SaaS", group: "digital_finance", aliases: ["IT", "앱", "SaaS", "개발", "솔루션", "홈페이지", "자동화", "AI", "인공지능"] },
  { id: "finance", label: "금융·보험", group: "digital_finance", aliases: ["금융", "보험", "대출", "적금", "재테크", "주식", "카드"] },
  { id: "realestate", label: "부동산", group: "digital_finance", aliases: ["부동산", "분양", "아파트", "청약", "전세", "오피스텔"] },
  { id: "game_content", label: "게임·콘텐츠", group: "digital_finance", aliases: ["게임", "웹툰", "웹소설", "OTT", "굿즈", "덕질"] },
];

const BY_ID = new Map(INDUSTRY_LIST.map((i) => [i.id, i]));

export function industryLabelOf(id: string): string {
  return BY_ID.get(id)?.label ?? id;
}

/* 추정용 색인 — 별칭이 긴 것부터 본다. '웨딩케이크'가 '웨딩'보다 먼저 걸리게. */
const MATCHERS: Array<{ needle: string; id: string }> = INDUSTRY_LIST.flatMap((i) => [
  ...i.label.split("·").map((part) => ({ needle: part, id: i.id })),
  ...(i.aliases ?? []).map((a) => ({ needle: a, id: i.id })),
]).sort((a, b) => b.needle.length - a.needle.length);

/**
 * 글자에서 업종을 추정한다. 못 찾으면 null.
 *
 * 공용 풀 소재는 크롤 키워드로 이미 업종이 정해져 있으므로 이 함수를 타지 않는다.
 * 업종이 비어 있는 자료(예전 개인 수집분 등)만 여기로 온다 — 이게 없으면
 * 고정 업종 목록이 옛 자료에서 항상 0건이 되어 눌러도 안 되는 버튼이 된다.
 */
export function industryFromText(...texts: Array<string | undefined | null>): string | null {
  const hay = texts.filter(Boolean).join(" ").toLowerCase();
  if (!hay) return null;
  for (const m of MATCHERS) {
    if (hay.includes(m.needle.toLowerCase())) return m.id;
  }
  return null;
}
