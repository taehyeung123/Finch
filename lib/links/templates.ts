import type { BlockType } from "./blocks";

/*
  프로필 링크 템플릿 — 링크팜의 "템플릿 적용하기"에 해당.

  왜 필요한가: 빈 캔버스는 "뭘 만들어야 하지"에서 멈춘다. 링크팜은 업종별 템플릿으로
  그 지점을 넘긴다. 우리도 같은 문법을 쓰되 **핀치 사용자의 업종**에 맞춘다
  (핀치는 인스타·틱톡·스레드 운영자와 메타광고 광고주가 쓴다).

  템플릿은 **블록을 깔아줄 뿐 내용은 비워두지 않는다** — 자리표시자 텍스트와
  **주소까지** 넣어 적용 즉시 화면에 완성된 페이지가 보이게 한다. 주소를 비워두면
  미리보기·공개 페이지 규칙(주소 없는 블록은 숨김)에 걸려 템플릿이 빈 것처럼
  보였다(2026-08-20 실계정 지적). 주소는 각 서비스 홈 — 사용자가 자기 것으로 바꾼다.

  카피 원칙(2026-08-27 전면 재설계): 문구는 **사람이 쓴 것처럼 구체적으로**
  (무엇·언제·왜가 들어가야 광고 문구가 된다), 이모지는 넣지 않는다(링크 아이콘
  영역 폐기와 한 몸). 경쟁사 이름 금지.

  ⚠️ 적용은 **기존 블록을 지우고 덮어쓴다.** 섞으면 순서가 엉키고 되돌릴 수도 없다 —
  화면이 확인을 받는다.
*/

export interface LinkTemplate {
  key: string;
  name: string;
  hint: string;
  /** 이 템플릿이 어울리는 테마(적용 시 함께 바뀐다) */
  theme: string;
  /** 테마 위에 얹는 직접 꾸미기(예: 파스텔 배경) — 없으면 적용 시 비운다.
      themes.ts 의 sanitizeThemeCustom 관문을 지나므로 그 스키마 안의 값만 살아남는다 */
  custom?: Record<string, unknown>;
  /** 스트립 카드 바탕 틴트 — 앱 UI 틴트 토큰 쌍(bg-tint-* / text-tint-*-ink):
      반투명이라 라이트·다크 어느 지면 위에서도 같은 구조로 읽힌다.
      고정 hex 는 다크에서 흰 카드 넉 장으로 박혀 폐기했다(2026-08-25 비평). */
  tint: string;
  blocks: Array<{ type: BlockType; data: Record<string, unknown> }>;
}

export const LINK_TEMPLATES: LinkTemplate[] = [
  {
    key: "creator",
    name: "크리에이터",
    hint: "구독 유도 + 최근 콘텐츠",
    theme: "aurora",
    /* 오로라 테마에 파스텔 무리(배경 군데군데 은은한 색) — 크리에이터 페이지의 시그니처 룩 */
    custom: { bgPastel: true },
    tint: "bg-tint-blue text-tint-blue-ink",
    blocks: [
      { type: "notice", data: { text: "이번 주 금요일 밤 9시 라이브 — 채널에서 만나요", tone: "primary" } },
      { type: "link", data: { label: "채널 구독하고 새 영상 알림 받기", url: "https://www.youtube.com/", emphasis: "primary" } },
      { type: "heading", data: { text: "요즘 올린 콘텐츠" } },
      { type: "social_feed", data: { channel: "instagram", count: 6 } },
      { type: "divider", data: { style: "line" } },
      { type: "link", data: { label: "지난 영상 몰아보기", url: "https://www.youtube.com/" } },
      {
        type: "card_row",
        data: { items: [{ title: "협업·광고 문의", subtitle: "제안서는 여기로 보내 주세요", url: "https://www.instagram.com/" }] },
      },
      {
        type: "subscribe",
        data: { title: "새 영상 알림 받기", description: "업로드할 때만 알려드려요. 스팸은 없어요.", buttonLabel: "알림 신청" },
      },
    ],
  },
  {
    key: "shop",
    name: "공구·판매",
    hint: "진행 중 공구를 맨 위에",
    theme: "cream",
    tint: "bg-tint-coral text-tint-coral-ink",
    blocks: [
      { type: "notice", data: { text: "가을 신상 공구 오픈 — 일요일 밤 12시 마감", tone: "primary" } },
      {
        type: "image_card",
        data: {
          title: "포근한 니트 가디건",
          subtitle: "이번 주말까지만 공구가로 만나요",
          price: "29,000원",
          url: "https://smartstore.naver.com/",
          ctaLabel: "지금 구매하기",
        },
      },
      { type: "heading", data: { text: "지난 공구 다시 보기" } },
      {
        type: "grid",
        data: {
          columns: 2,
          items: [
            { title: "볼륨 헤어 브러시", url: "https://smartstore.naver.com/" },
            { title: "데일리 텀블러", url: "https://smartstore.naver.com/" },
          ],
        },
      },
      { type: "divider", data: { style: "line" } },
      {
        type: "subscribe",
        data: { title: "다음 공구 미리 알림", description: "오픈 몇 시간 만에 마감돼요 — 미리 신청해 두세요.", buttonLabel: "알림 신청" },
      },
    ],
  },
  {
    key: "brand",
    name: "브랜드·매장",
    hint: "매장 안내 + 문의받기",
    theme: "sky",
    tint: "bg-tint-amber text-tint-amber-ink",
    blocks: [
      { type: "text", data: { text: "방문해 주셔서 감사합니다. 매장 소식과 온라인 스토어를 한곳에 모았어요.", align: "center" } },
      { type: "link", data: { label: "온라인 스토어 바로가기", url: "https://smartstore.naver.com/", emphasis: "primary" } },
      {
        type: "card_row",
        data: { items: [{ title: "이번 시즌 신제품", subtitle: "가을 컬렉션 먼저 보기", url: "https://smartstore.naver.com/" }] },
      },
      { type: "map", data: { address: "서울특별시 강남구 테헤란로 1", detail: "2층", label: "매장 오시는 길" } },
      { type: "divider", data: { style: "line" } },
      {
        type: "contact",
        data: {
          title: "문의하기",
          description: "궁금한 점을 남겨 주시면 영업일 기준 하루 안에 답해 드려요.",
          fields: ["name", "email", "message"],
        },
      },
    ],
  },
  {
    key: "simple",
    name: "심플",
    hint: "링크 몇 개만 깔끔하게",
    theme: "notion",
    tint: "bg-tint-slate text-tint-slate-ink",
    blocks: [
      { type: "link", data: { label: "인스타그램", url: "https://www.instagram.com/" } },
      { type: "link", data: { label: "유튜브", url: "https://www.youtube.com/" } },
      { type: "divider", data: { style: "line" } },
      { type: "link", data: { label: "문의하기", url: "https://www.instagram.com/" } },
    ],
  },
];
