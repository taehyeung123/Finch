import type { BlockType } from "./blocks";

/*
  프로필 링크 템플릿 — 링크팜의 "✨ 템플릿 적용하기"에 해당.

  왜 필요한가: 빈 캔버스는 "뭘 만들어야 하지"에서 멈춘다. 링크팜은 업종별 템플릿
  5종(공구/정보 11블록, 유튜버 4블록, 뷰티/패션 9블록, 게이머 6블록, 여행 5블록)으로
  그 지점을 넘긴다. 우리도 같은 문법을 쓰되 **핀치 사용자의 업종**에 맞춘다
  (핀치는 인스타·틱톡·스레드 운영자와 메타광고 광고주가 쓴다).

  템플릿은 **블록을 깔아줄 뿐 내용은 비워두지 않는다** — 자리표시자 텍스트를 넣어
  적용 즉시 화면에 뭔가 보이게 한다. 빈 블록만 쌓이면 템플릿을 적용한 의미가 없다.

  ⚠️ 적용은 **기존 블록을 지우고 덮어쓴다.** 섞으면 순서가 엉키고 되돌릴 수도 없다 —
  화면이 확인을 받는다.
*/

export interface LinkTemplate {
  key: string;
  name: string;
  hint: string;
  /** 이 템플릿이 어울리는 테마(적용 시 함께 바뀐다) */
  theme: string;
  blocks: Array<{ type: BlockType; data: Record<string, unknown> }>;
}

export const LINK_TEMPLATES: LinkTemplate[] = [
  {
    key: "creator",
    name: "크리에이터",
    hint: "채널 구독 유도 + 최근 게시물",
    theme: "basic",
    blocks: [
      { type: "link", data: { label: "채널 구독하기", url: "", emoji: "🔔", emphasis: "primary" } },
      { type: "heading", data: { text: "요즘 올린 것" } },
      { type: "social_feed", data: { channel: "instagram", count: 6 } },
      { type: "link", data: { label: "유튜브 채널", url: "", emoji: "▶️" } },
      { type: "link", data: { label: "협업 문의", url: "", emoji: "✉️" } },
    ],
  },
  {
    key: "shop",
    name: "공구·판매",
    hint: "진행 중 공구를 맨 위에",
    theme: "coral",
    blocks: [
      { type: "notice", data: { text: "이번 주 공구 진행 중! 아래에서 확인하세요", tone: "primary" } },
      { type: "image_card", data: { title: "진행 중인 공구", subtitle: "마감까지 얼마 안 남았어요", url: "" } },
      { type: "heading", data: { text: "지난 공구" } },
      { type: "grid", data: { columns: 2, items: [{ title: "상품 1", url: "" }, { title: "상품 2", url: "" }] } },
      { type: "link", data: { label: "공구 알림 받기", url: "", emoji: "🔔", emphasis: "outline" } },
      { type: "subscribe", data: { title: "다음 공구 알림 받기", description: "새 공구가 열리면 가장 먼저 알려드려요.", buttonLabel: "신청하기" } },
    ],
  },
  {
    key: "brand",
    name: "브랜드·매장",
    hint: "매장 안내 + 문의받기",
    theme: "porcelain",
    blocks: [
      { type: "text", data: { text: "찾아주셔서 고맙습니다. 아래에서 원하는 정보를 확인하세요.", align: "center" } },
      { type: "link", data: { label: "온라인 스토어", url: "", emoji: "🛍️", emphasis: "primary" } },
      { type: "card_row", data: { items: [{ title: "신제품 소개", subtitle: "이번 시즌 신상", url: "" }] } },
      { type: "map", data: { address: "", label: "매장 위치" } },
      { type: "divider", data: { style: "line" } },
      { type: "contact", data: { title: "문의하기", description: "궁금한 점을 남겨주세요.", fields: ["name", "email", "message"] } },
    ],
  },
  {
    key: "simple",
    name: "심플",
    hint: "링크 몇 개만 깔끔하게",
    theme: "notion",
    blocks: [
      { type: "link", data: { label: "인스타그램", url: "", emoji: "📷" } },
      { type: "link", data: { label: "유튜브", url: "", emoji: "▶️" } },
      { type: "link", data: { label: "문의하기", url: "", emoji: "✉️" } },
    ],
  },
];
