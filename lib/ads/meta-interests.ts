/**
 * Meta 상세 타겟팅(관심사) 체계 — 자동완성 전용 목록.
 * Meta는 자유 텍스트를 허용하지 않고 자체 관심사 분류에서 선택한 것만 타겟팅에 쓸 수 있다.
 * 이 파일은 그 체계를 본뜬 목 데이터이며, 실제 연동 시 Marketing API의
 * targeting search(type=adinterest) 결과로 교체한다. audience는 국내 도달 가능 규모 가정치(만 명).
 */

export interface MetaInterest {
  /** 관심사 이름 — 태그·요약에 표기 */
  name: string;
  /** Meta식 상위 분류 경로 */
  category: string;
  /** 예상 도달 가능 규모 (만 명, 핀치 가정치) */
  audience: number;
}

export const META_INTERESTS: MetaInterest[] = [
  /* 쇼핑·패션 */
  { name: "온라인 쇼핑", category: "쇼핑·패션", audience: 2100 },
  { name: "뷰티", category: "쇼핑·패션", audience: 1350 },
  { name: "화장품", category: "쇼핑·패션", audience: 1180 },
  { name: "스킨케어", category: "쇼핑·패션", audience: 960 },
  { name: "헤어·네일", category: "쇼핑·패션", audience: 540 },
  { name: "패션", category: "쇼핑·패션", audience: 1620 },
  { name: "여성 의류", category: "쇼핑·패션", audience: 890 },
  { name: "남성 의류", category: "쇼핑·패션", audience: 620 },
  { name: "신발", category: "쇼핑·패션", audience: 730 },
  { name: "명품", category: "쇼핑·패션", audience: 410 },
  { name: "액세서리·주얼리", category: "쇼핑·패션", audience: 380 },
  /* 피트니스·웰니스 */
  { name: "피트니스", category: "피트니스·웰니스", audience: 880 },
  { name: "홈트레이닝", category: "피트니스·웰니스", audience: 460 },
  { name: "요가·필라테스", category: "피트니스·웰니스", audience: 390 },
  { name: "러닝", category: "피트니스·웰니스", audience: 350 },
  { name: "헬스장", category: "피트니스·웰니스", audience: 520 },
  { name: "다이어트", category: "피트니스·웰니스", audience: 700 },
  { name: "명상·마음챙김", category: "피트니스·웰니스", audience: 180 },
  { name: "영양제·건강기능식품", category: "피트니스·웰니스", audience: 610 },
  /* 음식·음료 */
  { name: "요리", category: "음식·음료", audience: 1150 },
  { name: "베이킹", category: "음식·음료", audience: 320 },
  { name: "카페", category: "음식·음료", audience: 980 },
  { name: "커피", category: "음식·음료", audience: 860 },
  { name: "맛집 탐방", category: "음식·음료", audience: 1240 },
  { name: "배달 음식", category: "음식·음료", audience: 1050 },
  { name: "와인·주류", category: "음식·음료", audience: 430 },
  { name: "비건·건강식", category: "음식·음료", audience: 260 },
  /* 취미·활동 */
  { name: "여행", category: "취미·활동", audience: 1580 },
  { name: "국내 여행", category: "취미·활동", audience: 920 },
  { name: "해외 여행", category: "취미·활동", audience: 780 },
  { name: "캠핑", category: "취미·활동", audience: 450 },
  { name: "사진·영상 촬영", category: "취미·활동", audience: 560 },
  { name: "독서", category: "취미·활동", audience: 490 },
  { name: "반려동물", category: "취미·활동", audience: 870 },
  { name: "반려견", category: "취미·활동", audience: 640 },
  { name: "반려묘", category: "취미·활동", audience: 470 },
  { name: "원예·플랜테리어", category: "취미·활동", audience: 210 },
  { name: "등산", category: "취미·활동", audience: 380 },
  { name: "낚시", category: "취미·활동", audience: 290 },
  { name: "골프", category: "취미·활동", audience: 340 },
  /* 엔터테인먼트 */
  { name: "영화", category: "엔터테인먼트", audience: 1420 },
  { name: "음악", category: "엔터테인먼트", audience: 1680 },
  { name: "K-pop", category: "엔터테인먼트", audience: 990 },
  { name: "드라마", category: "엔터테인먼트", audience: 1100 },
  { name: "예능", category: "엔터테인먼트", audience: 930 },
  { name: "웹툰·만화", category: "엔터테인먼트", audience: 720 },
  { name: "게임", category: "엔터테인먼트", audience: 1310 },
  { name: "모바일 게임", category: "엔터테인먼트", audience: 940 },
  { name: "콘서트·공연", category: "엔터테인먼트", audience: 380 },
  { name: "OTT·스트리밍", category: "엔터테인먼트", audience: 1150 },
  /* 기술 */
  { name: "스마트폰", category: "기술", audience: 1490 },
  { name: "전자기기", category: "기술", audience: 820 },
  { name: "PC·노트북", category: "기술", audience: 560 },
  { name: "인공지능", category: "기술", audience: 470 },
  { name: "스마트홈", category: "기술", audience: 230 },
  /* 비즈니스·산업 */
  { name: "마케팅", category: "비즈니스·산업", audience: 310 },
  { name: "창업·스타트업", category: "비즈니스·산업", audience: 280 },
  { name: "부동산", category: "비즈니스·산업", audience: 520 },
  { name: "재테크·투자", category: "비즈니스·산업", audience: 690 },
  { name: "주식", category: "비즈니스·산업", audience: 610 },
  { name: "자기계발", category: "비즈니스·산업", audience: 540 },
  { name: "이커머스", category: "비즈니스·산업", audience: 350 },
  /* 가족·관계 */
  { name: "육아", category: "가족·관계", audience: 580 },
  { name: "영유아 부모", category: "가족·관계", audience: 340 },
  { name: "결혼·웨딩", category: "가족·관계", audience: 260 },
  { name: "인테리어·집꾸미기", category: "가족·관계", audience: 750 },
  { name: "이사·새집", category: "가족·관계", audience: 190 },
  /* 자동차·이동 */
  { name: "자동차", category: "자동차·이동", audience: 830 },
  { name: "전기차", category: "자동차·이동", audience: 300 },
  { name: "오토바이·바이크", category: "자동차·이동", audience: 170 },
  /* 교육 */
  { name: "외국어 학습", category: "교육", audience: 420 },
  { name: "온라인 강의", category: "교육", audience: 380 },
  { name: "자격증", category: "교육", audience: 290 },
];

/** 자동완성 검색 — 이름/분류 부분 일치, 규모 큰 순 (최대 limit개) */
export function searchInterests(query: string, limit = 8): MetaInterest[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return META_INTERESTS.filter(
    (i) => i.name.toLowerCase().includes(q) || i.category.toLowerCase().includes(q),
  )
    .sort((a, b) => b.audience - a.audience)
    .slice(0, limit);
}

/** 이름으로 관심사 찾기 (선택 검증용) */
export function findInterest(name: string): MetaInterest | undefined {
  return META_INTERESTS.find((i) => i.name === name);
}
