import { BUSINESS } from "./business";
import type { LegalBlock } from "./doc-types";
import {
  PREVIOUS_PRIVACY_VERSION,
  PREVIOUS_TERMS_VERSION,
  PRIVACY_VERSION,
  TERMS_ANNOUNCED,
  TERMS_VERSION,
  koDate,
} from "./versions";

/*
  개정 공지 — /privacy/changes(방침 변경 전후 비교) · /terms/changes(이용약관 개정·운영정책 제정 안내).

  약관 제3조③(개정 내용·사유·비교 게시)과 방침 제22조②(변경 비교)가 가리키는 페이지다.
  같은 문구를 기존 회원 안내 메일로도 보낸다(발송은 사장님 — docs/LEGAL_REVIEW_2026-09.md «공지·발송»).
  본문은 문서(lib/legal/documents.ts)가 정본이고, 여기는 «무엇이 바뀌었나»의 요약이다.
*/

export interface LegalNotice {
  key: "terms" | "privacy";
  title: string;
  /** 게시일(ISO) */
  postedAt: string;
  blocks: readonly LegalBlock[];
}

const MAIL = BUSINESS.contactEmail ?? BUSINESS.privacyEmail;

export const PRIVACY_NOTICE: LegalNotice = {
  key: "privacy",
  title: `개인정보처리방침 개정 안내 (${koDate(PRIVACY_VERSION)} 시행)`,
  postedAt: PRIVACY_VERSION,
  blocks: [
    { p: `핀치 개인정보처리방침을 ${koDate(PRIVACY_VERSION)}자로 개정했습니다.` },
    {
      p: "이번 개정으로 처리 방식이 바뀌지는 않습니다. 다만 그동안 방침에 빠져 있거나 실제와 다르게 적혀 있던 내용을 고쳤고, 그 결과 AI 제공자에게 가는 정보와 보관 기간 등은 이전 방침보다 넓거나 길게 적혔습니다. 아래 표에서 확인해 주세요.",
    },
    {
      table: {
        head: ["항목", "이전", "개정"],
        rows: [
          ["저장 위치", "Supabase·Vercel «미국»", "저장·처리 위치는 서울. 해외 접근 가능성과 이전받는 자 연락처·근거·이전 시기 명시"],
          [
            "AI 제공자에게 가는 정보",
            "입력한 내용, 처리 후 즉시 삭제",
            "입력 내용에 더해 연동 계정 지표, 게시물 캡션, 댓글 내용(작성자 정보 제외) 등. 30일 안에 삭제",
          ],
          ["자동 DM 기록", "탈퇴 시까지", "수신 기록 90일, 발송 기록 1년, 수신거부 기록은 탈퇴 시까지"],
          ["비회원 정보(방문자·폼·방명록·신고자·공개 계정)", "일부만 기재", "항목·목적·보유 기간 추가"],
          ["방문 통계 쿠키", "«개인을 식별하지 않음»", "180일 유지되는 방문자 구분값(해시)임을 명시. 방문 기록은 1년 보관"],
          ["이용 통계(Google Analytics)", "서비스 이용 통계", "로그인 전 공개 화면에서만 수집, 로그인 뒤 서비스 화면에서는 수집하지 않음"],
          ["수탁자", "결제대행사 «페이앱»", "결제 기능을 운영할 때 기재. ScrapeCreators·업스테이지 추가"],
          ["신설", "—", "생성형 AI 안내, 자동화된 결정, 추적 도구, 권리 행사 기한(10일), 유출 통지, 광고성 정보 수신 동의 처리 결과 통지"],
        ],
      },
    },
    { p: `문의: ${MAIL}` },
    {
      links: [
        { label: "개정 방침 전문", href: "/privacy" },
        { label: "이전 방침 보기", href: `/privacy/archive/${PREVIOUS_PRIVACY_VERSION}` },
      ],
    },
  ],
};

export const TERMS_NOTICE: LegalNotice = {
  key: "terms",
  title: `이용약관 개정 및 운영정책 제정 안내 (${koDate(TERMS_VERSION)} 시행)`,
  postedAt: TERMS_ANNOUNCED,
  blocks: [
    {
      p: `시행일: ${koDate(TERMS_VERSION)}. ${koDate(TERMS_ANNOUNCED)} 이후 가입하는 분에게는 가입할 때부터 적용합니다.`,
      strong: true,
    },
    {
      p: "개정 사유: 정식 운영에 맞춰 유료 서비스와 게시물 운영 기준을 구체화했습니다. 전자상거래법·정보통신망법·저작권법·인공지능기본법 등 관계 법령의 요구 사항도 반영했습니다.",
    },
    { p: "주요 내용" },
    {
      list: [
        "이용계약·탈퇴·팀 워크스페이스 조항을 새로 두었습니다. 탈퇴하면 정보를 바로 삭제하고, 주소는 90일 동안 다른 사람이 쓰지 못합니다.",
        {
          text: "유료 서비스",
          sub: [
            "1개월 자동 갱신과 결제 3일 전 안내",
            "요금제 변경",
            "요금 인상 시 30일 전 동의",
            "크레딧: 이월 없음, 양도 불가, 해지 후에도 유지",
            "청약철회 7일과 이용분 계산식, 서비스가 안내와 다를 때의 철회(3개월), 환불 사유",
          ],
        },
        {
          text: "기능별 이용 기준",
          sub: [
            "예약 발행: 영상 파일 보관 기간",
            "자동 DM: 안전장치와 회원의 책임, 법 위반 전송에 쓰일 때의 중단 조치",
            "메타 광고: 광고비는 메타가 직접 청구",
            "AI 기능: 생성형 AI 사용 고지, 결과 확인 책임, AI 생성 표시",
            "프로필 링크, 레퍼런스 라이브러리",
          ],
        },
        "방문자·댓글 작성자 정보의 처리 위탁 조항",
        "운영정책 제정: 금지 게시물, 주소 정책, 신고·임시조치·저작권 게시 중단 절차, 이용 제한과 이의 제기(14일)",
        "약관 변경 절차(7일·30일 공지, 거부하면 해지하고 환불), 손해배상·책임 제한(회사의 고의·과실 책임 명시), 분쟁 조정 기관, 관할",
      ],
      ordered: true,
    },
    { p: "회원에게 불리할 수 있는 변경", strong: true },
    {
      list: [
        "탈퇴하면 남은 크레딧이 바로 소멸합니다(제9조, 제27조).",
        "크레딧은 다음 달로 이월되지 않고, 다른 사람에게 넘기거나 현금으로 바꿀 수 없습니다(제27조).",
        "7일 안에 청약철회하더라도 크레딧이나 유료 기능을 이용했다면, 이용일수 금액과 사용 크레딧 금액 중 큰 금액을 빼고 환불합니다(제28조).",
        "운영정책에 따라 게시물 삭제·임시조치, 주소 변경, 기능 제한, 이용 정지·해지를 할 수 있습니다(제31조, 제32조, 운영정책).",
        "팀원이 워크스페이스에서 한 작업의 결과는 소유자 계정에 반영됩니다(제10조).",
        "자동 DM이 법령·정책 위반 전송에 쓰이면 발송을 즉시 중단하고 기능 제공을 거부할 수 있습니다(제16조).",
      ],
    },
    {
      p: `동의: 기존 회원에게는 ${koDate(TERMS_VERSION)} 이후 처음 이용할 때 동의를 받습니다. 그 전에도 미리 동의할 수 있습니다. 동의하지 않으면 서비스를 이용할 수 없으며, 회원 탈퇴를 할 수 있습니다. 유료 이용 중이면 남은 기간 요금을 일할로 환불합니다. 시행일부터 30일이 지나도록 동의 여부를 밝히지 않은 회원에게는 이메일로 따로 알리고, 알린 날부터 30일이 지나도록 거부 의사를 밝히지 않으면 동의한 것으로 봅니다(부칙 제2조).`,
    },
    { p: `문의: ${MAIL}` },
    {
      links: [
        { label: "새 이용약관", href: "/terms" },
        { label: "운영정책", href: "/terms/operation" },
        { label: "환불정책", href: "/terms/refund" },
        { label: "종전 약관", href: `/terms/archive/${PREVIOUS_TERMS_VERSION}` },
      ],
    },
  ],
};
