/**
 * 사업자 정보 — 단일 출처 (2026-09-03).
 *
 * 전자상거래법 §10 은 통신판매업자가 상호·대표자·주소·전화·이메일·사업자등록번호·통신판매업 신고번호를
 * 표시하도록 하고, 개인정보보호법 §31 은 개인정보 보호책임자 연락처 공개를 요구한다.
 * 그 값들이 이 파일 한 곳에만 있고 — 마케팅 푸터, 설정 > 사업자 정보, 개인정보처리방침 9조가 전부
 * 여기서 읽는다. 세 곳을 손으로 맞추다 어긋난 적이 있는 저장소라(사이드바 IA 주석 참고) 한 곳으로 못박는다.
 *
 * 출처: 사업자등록증(법인사업자, 청주세무서 2026-08-28 발급) · 통신판매업신고증(청주시 2026-09-03 발급,
 * 제 2026-충북청주-2193 호) — 사장님이 2026-09-03 전달.
 * ⚠️ null 은 «아직 없음»이다 — 화면은 항목별 안내 문구로 그리고, 마케팅 푸터는 null 항목을 아예 뺀다
 * (공개 화면에 «예정» 문구를 줄줄이 늘어놓지 않는다).
 *  · phone: 개인 휴대폰(010)은 싣지 않는다 — 0507 안심번호 또는 070 이 나오면 채운다(사장님 지시).
 */
export interface BusinessInfo {
  /** 상호(법인명) — 서비스 운영 주체 */
  company: string;
  /** 서비스명 — «주식회사 딥레드 (핀치)» 처럼 함께 적을 때 */
  serviceName: string;
  /** 대표자 성명 */
  ceo: string | null;
  /** 사업자등록번호 (000-00-00000) */
  registrationNo: string | null;
  /* 법인등록번호는 싣지 않는다 — 전자상거래법 §10 표시 의무 항목이 아니다(상호·대표자·주소·전화·이메일·사업자등록번호·
     통신판매업 신고번호만). 2026-09-03 사장님 지시로 화면에서 뺐다. 값이 필요하면 등기부(150111-0040623)에 있다. */
  /** 통신판매업 신고번호 (예: 2026-충북청주-00000) */
  ecommerceNo: string | null;
  /** 사업장 주소 */
  address: string | null;
  /** 대표 이메일(고객 문의) */
  contactEmail: string | null;
  /** 대표 전화 */
  phone: string | null;
  /** 개인정보 보호책임자 성명 */
  privacyOfficer: string | null;
  /** 개인정보 관련 문의 이메일 */
  privacyEmail: string;
  /** 서비스 주소 */
  siteUrl: string;
}

export const BUSINESS: BusinessInfo = {
  company: "주식회사 딥레드",
  serviceName: "핀치(Finch)",
  ceo: "권태형",
  registrationNo: "349-86-04259",
  /* 통신판매업신고증 «제 2026-충북청주-2193 호»(청주시, 2026-09-03) — 표기는 «호» 없이 번호만 */
  ecommerceNo: "2026-충북청주-2193",
  address: "충청북도 청주시 흥덕구 봉명로 218, 3층 에이13호(봉명동)",
  /* support@finch.ai.kr — 2026-09-03 개설 중(사장님). 개인정보 문의도 같은 주소로 받는다 —
     privacy@ 는 실재하지 않는 주소라 싣지 않는다(닿지 않는 연락처는 없는 것보다 나쁘다). */
  contactEmail: "support@finch.ai.kr",
  phone: null,
  privacyOfficer: "권태형",
  privacyEmail: "support@finch.ai.kr",
  siteUrl: "https://finch.ai.kr",
};

/** 화면 표기용 — 항목별로 «왜 아직 없는지»가 다르다 */
export const BUSINESS_PENDING = "준비 중";
export const PENDING_ECOMMERCE = "통신판매업 신고 후 게시 예정";

/** 푸터 두 줄용 — 있는 항목만 «라벨 값» 으로 이어 붙인다 */
export function businessFooterLines(b: BusinessInfo = BUSINESS): string[] {
  const first = [
    `${b.company} (${b.serviceName})`,
    b.ceo ? `대표 ${b.ceo}` : null,
    b.registrationNo ? `사업자등록번호 ${b.registrationNo}` : null,
    b.ecommerceNo ? `통신판매업신고 ${b.ecommerceNo}` : null,
  ].filter((v): v is string => Boolean(v));
  const second = [b.address, b.phone, b.contactEmail].filter((v): v is string => Boolean(v));
  return [first.join(" · "), second.join(" · ")].filter((line) => line.length > 0);
}
