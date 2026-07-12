/**
 * 대한민국 행정구역 — 광고 지역 타겟팅용 (Meta 지역 타겟팅과 동일한 시·도 → 시·군·구 2단계).
 * weight는 예상 도달 계산용 인구 비중(전국=1, 통계청 주민등록인구 기준 근사치) — 핀치 자체 가정치.
 * 실제 Meta 연동 시 이 데이터 대신 Marketing API의 geo targeting search 결과를 사용한다.
 */

export interface Province {
  /** 화면 표기용 축약명 */
  name: string;
  /** 공식 명칭 */
  fullName: string;
  /** 전국 대비 인구 비중 (합계 ≈ 1) */
  weight: number;
  /** 시·군·구 — 세종은 하위 구가 없어 빈 배열 */
  districts: string[];
}

export const KR_PROVINCES: Province[] = [
  {
    name: "서울",
    fullName: "서울특별시",
    weight: 0.182,
    districts: [
      "강남구", "강동구", "강북구", "강서구", "관악구", "광진구", "구로구", "금천구",
      "노원구", "도봉구", "동대문구", "동작구", "마포구", "서대문구", "서초구", "성동구",
      "성북구", "송파구", "양천구", "영등포구", "용산구", "은평구", "종로구", "중구", "중랑구",
    ],
  },
  {
    name: "경기",
    fullName: "경기도",
    weight: 0.264,
    districts: [
      "수원시", "성남시", "고양시", "용인시", "부천시", "안산시", "안양시", "남양주시",
      "화성시", "평택시", "의정부시", "시흥시", "파주시", "광명시", "김포시", "군포시",
      "광주시", "이천시", "양주시", "오산시", "구리시", "안성시", "포천시", "의왕시",
      "하남시", "여주시", "동두천시", "과천시", "가평군", "양평군", "연천군",
    ],
  },
  {
    name: "인천",
    fullName: "인천광역시",
    weight: 0.058,
    districts: [
      "강화군", "계양구", "남동구", "동구", "미추홀구", "부평구", "서구", "연수구", "옹진군", "중구",
    ],
  },
  {
    name: "부산",
    fullName: "부산광역시",
    weight: 0.064,
    districts: [
      "강서구", "금정구", "기장군", "남구", "동구", "동래구", "부산진구", "북구",
      "사상구", "사하구", "서구", "수영구", "연제구", "영도구", "중구", "해운대구",
    ],
  },
  {
    name: "대구",
    fullName: "대구광역시",
    weight: 0.046,
    districts: ["군위군", "남구", "달서구", "달성군", "동구", "북구", "서구", "수성구", "중구"],
  },
  {
    name: "광주",
    fullName: "광주광역시",
    weight: 0.028,
    districts: ["광산구", "남구", "동구", "북구", "서구"],
  },
  {
    name: "대전",
    fullName: "대전광역시",
    weight: 0.028,
    districts: ["대덕구", "동구", "서구", "유성구", "중구"],
  },
  {
    name: "울산",
    fullName: "울산광역시",
    weight: 0.021,
    districts: ["남구", "동구", "북구", "울주군", "중구"],
  },
  {
    name: "세종",
    fullName: "세종특별자치시",
    weight: 0.0075,
    districts: [],
  },
  {
    name: "강원",
    fullName: "강원특별자치도",
    weight: 0.03,
    districts: [
      "춘천시", "원주시", "강릉시", "동해시", "태백시", "속초시", "삼척시",
      "홍천군", "횡성군", "영월군", "평창군", "정선군", "철원군", "화천군",
      "양구군", "인제군", "고성군", "양양군",
    ],
  },
  {
    name: "충북",
    fullName: "충청북도",
    weight: 0.031,
    districts: [
      "청주시", "충주시", "제천시", "보은군", "옥천군", "영동군", "증평군",
      "진천군", "괴산군", "음성군", "단양군",
    ],
  },
  {
    name: "충남",
    fullName: "충청남도",
    weight: 0.041,
    districts: [
      "천안시", "공주시", "보령시", "아산시", "서산시", "논산시", "계룡시", "당진시",
      "금산군", "부여군", "서천군", "청양군", "홍성군", "예산군", "태안군",
    ],
  },
  {
    name: "전북",
    fullName: "전북특별자치도",
    weight: 0.034,
    districts: [
      "전주시", "군산시", "익산시", "정읍시", "남원시", "김제시",
      "완주군", "진안군", "무주군", "장수군", "임실군", "순창군", "고창군", "부안군",
    ],
  },
  {
    name: "전남",
    fullName: "전라남도",
    weight: 0.035,
    districts: [
      "목포시", "여수시", "순천시", "나주시", "광양시",
      "담양군", "곡성군", "구례군", "고흥군", "보성군", "화순군", "장흥군", "강진군",
      "해남군", "영암군", "무안군", "함평군", "영광군", "장성군", "완도군", "진도군", "신안군",
    ],
  },
  {
    name: "경북",
    fullName: "경상북도",
    weight: 0.05,
    districts: [
      "포항시", "경주시", "김천시", "안동시", "구미시", "영주시", "영천시", "상주시",
      "문경시", "경산시", "의성군", "청송군", "영양군", "영덕군", "청도군", "고령군",
      "성주군", "칠곡군", "예천군", "봉화군", "울진군", "울릉군",
    ],
  },
  {
    name: "경남",
    fullName: "경상남도",
    weight: 0.063,
    districts: [
      "창원시", "진주시", "통영시", "사천시", "김해시", "밀양시", "거제시", "양산시",
      "의령군", "함안군", "창녕군", "고성군", "남해군", "하동군", "산청군", "함양군",
      "거창군", "합천군",
    ],
  },
  {
    name: "제주",
    fullName: "제주특별자치도",
    weight: 0.013,
    districts: ["제주시", "서귀포시"],
  },
];

/** 지역 선택 단위 — district가 없으면 해당 시·도 전체 */
export interface RegionPick {
  province: string;
  district?: string;
}

/** "전국" 선택의 표준 표현 */
export const NATIONWIDE: RegionPick = { province: "전국" };

export function isNationwide(picks: RegionPick[]): boolean {
  return picks.some((p) => p.province === "전국");
}

/** 선택 지역의 인구 비중 합 (전국=1). 시·군·구는 시·도 비중을 구 수로 균등 분할한 근사치 */
export function regionWeight(picks: RegionPick[]): number {
  if (picks.length === 0) return 0;
  if (isNationwide(picks)) return 1;
  let sum = 0;
  for (const province of KR_PROVINCES) {
    const provincePicks = picks.filter((p) => p.province === province.name);
    if (provincePicks.length === 0) continue;
    if (provincePicks.some((p) => !p.district)) {
      sum += province.weight;
    } else {
      const per = province.weight / Math.max(province.districts.length, 1);
      sum += per * provincePicks.length;
    }
  }
  return Math.min(sum, 1);
}

/** 태그·요약 표기: "서울 전체" / "경기 성남시" */
export function formatRegionPick(pick: RegionPick): string {
  if (pick.province === "전국") return "전국";
  return pick.district ? `${pick.province} ${pick.district}` : `${pick.province} 전체`;
}

/** 요약용 축약: "서울 전체, 경기 성남시 외 3곳" */
export function summarizeRegionPicks(picks: RegionPick[]): string {
  if (picks.length === 0) return "미선택";
  if (isNationwide(picks)) return "전국";
  const labels = picks.map(formatRegionPick);
  if (labels.length <= 2) return labels.join(", ");
  return `${labels.slice(0, 2).join(", ")} 외 ${labels.length - 2}곳`;
}

/**
 * 시·도 통칭 별칭 — "서울시"·"강원도"·"전라북도"처럼 일상 표기로 검색해도 매칭되게.
 * name+"시"/"도" 조합으로 대부분 커버되고, 행정구역 개편 전 명칭만 명시한다.
 */
const PROVINCE_ALIASES: Record<string, string[]> = {
  전북: ["전라북도"],
  강원: ["강원도"],
  세종: ["세종시"],
};

function provinceMatches(province: Province, q: string): boolean {
  if (province.name.includes(q) || province.fullName.includes(q)) return true;
  // "서울시" / "경기도" 류 통칭
  if (`${province.name}시`.includes(q) || `${province.name}도`.includes(q)) return true;
  return (PROVINCE_ALIASES[province.name] ?? []).some((alias) => alias.includes(q));
}

/** 검색 자동완성 — 시·도명(통칭 포함)/시·군·구명 부분 일치 (최대 limit개) */
export function searchRegions(query: string, limit = 8): RegionPick[] {
  const q = query.trim();
  if (!q) return [];
  const out: RegionPick[] = [];
  for (const province of KR_PROVINCES) {
    if (provinceMatches(province, q)) {
      out.push({ province: province.name });
    }
    for (const district of province.districts) {
      if (district.includes(q)) out.push({ province: province.name, district });
      if (out.length >= limit) return out.slice(0, limit);
    }
    if (out.length >= limit) break;
  }
  return out.slice(0, limit);
}
