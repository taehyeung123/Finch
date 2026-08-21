import type { BlockType } from "./blocks";

/*
  프로필 링크 템플릿 — 링크팜의 "✨ 템플릿 적용하기"에 해당.

  왜 필요한가: 빈 캔버스는 "뭘 만들어야 하지"에서 멈춘다. 링크팜은 업종별 템플릿
  5종(공구/정보 11블록, 유튜버 4블록, 뷰티/패션 9블록, 게이머 6블록, 여행 5블록)으로
  그 지점을 넘긴다. 우리도 같은 문법을 쓰되 **핀치 사용자의 업종**에 맞춘다
  (핀치는 인스타·틱톡·스레드 운영자와 메타광고 광고주가 쓴다).

  템플릿은 **블록을 깔아줄 뿐 내용은 비워두지 않는다** — 자리표시자 텍스트와
  **주소까지** 넣어 적용 즉시 화면에 완성된 페이지가 보이게 한다. 주소를 비워두면
  미리보기·공개 페이지 규칙(주소 없는 블록은 숨김)에 걸려 템플릿이 빈 것처럼
  보였다(2026-08-20 실계정 지적). 주소는 각 서비스 홈 — 사용자가 자기 것으로 바꾼다.

  ⚠️ 적용은 **기존 블록을 지우고 덮어쓴다.** 섞으면 순서가 엉키고 되돌릴 수도 없다 —
  화면이 확인을 받는다.
*/

export interface LinkTemplate {
  key: string;
  name: string;
  hint: string;
  /** 이 템플릿이 어울리는 테마(적용 시 함께 바뀐다) */
  theme: string;
  /** 스트립 카드 아이콘·바탕 틴트 — 링크팜 템플릿 카드 카피. 틴트는 앱 UI 토큰이
      아니라 템플릿 고유색(LINK_THEMES 와 같은 콘텐츠 팔레트 예외)이며 카드 안 글자는
      테마와 무관하게 항상 어두운 on-primary 를 쓴다. */
  emoji: string;
  tint: string;
  blocks: Array<{ type: BlockType; data: Record<string, unknown> }>;
}

export const LINK_TEMPLATES: LinkTemplate[] = [
  {
    key: "creator",
    name: "크리에이터",
    hint: "채널 구독 유도 + 최근 게시물",
    theme: "basic",
    emoji: "🎬",
    tint: "#EAF3FF",
    blocks: [
      { type: "link", data: { label: "채널 구독하기", url: "https://www.youtube.com/", emoji: "🔔", emphasis: "primary" } },
      { type: "heading", data: { text: "요즘 올린 것" } },
      { type: "social_feed", data: { channel: "instagram", count: 6 } },
      { type: "link", data: { label: "유튜브 채널", url: "https://www.youtube.com/", emoji: "▶️" } },
      { type: "link", data: { label: "협업 문의", url: "https://www.instagram.com/", emoji: "✉️" } },
    ],
  },
  {
    key: "shop",
    name: "공구·판매",
    hint: "진행 중 공구를 맨 위에",
    theme: "coral",
    emoji: "🛒",
    tint: "#FFEFE8",
    blocks: [
      { type: "notice", data: { text: "이번 주 공구 진행 중! 아래에서 확인하세요", tone: "primary" } },
      {
        type: "image_card",
        data: { title: "진행 중인 공구", subtitle: "마감까지 얼마 안 남았어요", url: "https://smartstore.naver.com/", ctaLabel: "구매하기" },
      },
      { type: "heading", data: { text: "지난 공구" } },
      {
        type: "grid",
        data: {
          columns: 2,
          items: [
            { title: "상품 1", url: "https://smartstore.naver.com/" },
            { title: "상품 2", url: "https://smartstore.naver.com/" },
          ],
        },
      },
      { type: "link", data: { label: "공구 알림 받기", url: "https://www.instagram.com/", emoji: "🔔", emphasis: "outline" } },
      { type: "subscribe", data: { title: "다음 공구 알림 받기", description: "새 공구가 열리면 가장 먼저 알려드려요.", buttonLabel: "신청하기" } },
    ],
  },
  {
    key: "brand",
    name: "브랜드·매장",
    hint: "매장 안내 + 문의받기",
    theme: "porcelain",
    emoji: "🏪",
    tint: "#F4EFE7",
    blocks: [
      { type: "text", data: { text: "찾아주셔서 고맙습니다. 아래에서 원하는 정보를 확인하세요.", align: "center" } },
      { type: "link", data: { label: "온라인 스토어", url: "https://smartstore.naver.com/", emoji: "🛍️", emphasis: "primary" } },
      {
        type: "card_row",
        data: { items: [{ title: "신제품 소개", subtitle: "이번 시즌 신상", url: "https://smartstore.naver.com/" }] },
      },
      { type: "map", data: { address: "서울특별시 강남구 테헤란로 1", label: "매장 위치" } },
      { type: "divider", data: { style: "line" } },
      { type: "contact", data: { title: "문의하기", description: "궁금한 점을 남겨주세요.", fields: ["name", "email", "message"] } },
    ],
  },
  {
    key: "simple",
    name: "심플",
    hint: "링크 몇 개만 깔끔하게",
    theme: "notion",
    emoji: "✨",
    tint: "#EEF0F3",
    blocks: [
      { type: "link", data: { label: "인스타그램", url: "https://www.instagram.com/", emoji: "📷" } },
      { type: "link", data: { label: "유튜브", url: "https://www.youtube.com/", emoji: "▶️" } },
      { type: "link", data: { label: "문의하기", url: "https://www.instagram.com/", emoji: "✉️" } },
    ],
  },
];
