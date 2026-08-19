/*
  프로필 링크 블록 — 타입·기본값·검증의 단일 출처.

  2026-08-17. 링크팜(app.linkfarm.ai) 빌더를 실측 조사해 블록 모델로 재설계했다.
  링크팜은 블록 18종을 갖고 있었고 우리는 「링크 버튼」 하나였다.

  ⚠️ 여기 BLOCK_TYPES 를 바꾸면 **0048 마이그레이션의 check 제약도 같이 바꾼다.**
  DB 가 모르는 타입이 들어오면 저장은 되는데 공개 페이지가 렌더를 못 해 조용히 사라진다.

  링크팜에서 **안 가져온 것**과 이유:
   · 쿠팡 파트너스 상품 — 그들의 제휴 비즈니스다. 우리 제품 맥락이 아니다.
   · 후원하기·예약받기·캘린더 — 결제·예약 백엔드가 필요하다. 화면만 만들면
     "누르면 아무 일도 안 나는 버튼"이 된다(이번 개편에서 계속 걷어낸 그것).
     결제 연동 뒤에 연다.
  대신 **우리에게만 있는 것**을 넣었다: social_feed 가 연동된 채널의 실제 최근
  게시물을 끌어온다(링크팜은 사용자가 URL 을 손으로 넣어야 한다).
*/

export const BLOCK_TYPES = [
  "link",
  "heading",
  "text",
  "divider",
  "spacer",
  "image",
  "image_card",
  "video",
  "card_row",
  "grid",
  "notice",
  "social_feed",
  "contact",
  "subscribe",
  "map",
] as const;

export type BlockType = (typeof BLOCK_TYPES)[number];

/** 링크 버튼 — 가장 기본. 링크팜의 "링크 버튼" */
export interface LinkBlockData {
  label: string;
  url: string;
  /** 왼쪽 아이콘(선택) — 이모지 한 글자. 아이콘 라이브러리를 열면 방문자 번들이 커진다 */
  emoji?: string;
  /** 강조 스타일 — 대표 버튼 하나를 눈에 띄게 */
  emphasis?: "normal" | "primary" | "outline";
}

/** 소제목 — 링크 묶음을 구분한다(링크팜에는 없다. 링크 10개 넘으면 반드시 필요해진다) */
export interface HeadingBlockData {
  text: string;
}

export interface TextBlockData {
  text: string;
  align?: "left" | "center";
}

export interface DividerBlockData {
  style?: "line" | "dot";
}

export interface SpacerBlockData {
  /** 8의 배수만 — 임의 값이 들어오면 페이지 리듬이 깨진다 */
  size?: 8 | 16 | 24 | 40;
}

export interface ImageBlockData {
  imagePath: string;
  alt?: string;
  /** 이미지 자체가 링크가 될 수 있다 */
  url?: string;
}

/** 이미지 + 제목/부제 카드 — 링크팜 "이미지 카드" */
export interface ImageCardBlockData {
  imagePath?: string;
  title: string;
  subtitle?: string;
  url?: string;
}

/** 유튜브·틱톡 임베드. 원본 URL 만 받고 렌더러가 임베드 주소로 바꾼다 */
export interface VideoBlockData {
  url: string;
  title?: string;
}

/** 가로 카드(썸네일 좌측 + 텍스트) 여러 장 — 링크팜 "가로 카드" */
export interface CardRowBlockData {
  items: Array<{ imagePath?: string; title: string; subtitle?: string; url: string }>;
}

/** 2·3열 그리드 — 링크팜 "그리드" */
export interface GridBlockData {
  columns?: 2 | 3;
  items: Array<{ imagePath?: string; title: string; url: string }>;
}

/** 공지/배너 — 링크팜 "공지/배너" */
export interface NoticeBlockData {
  text: string;
  tone?: "info" | "primary" | "warning";
}

/**
 * SNS 피드 — **핀치 고유.**
 * 링크팜은 사용자가 게시물 URL 을 손으로 넣어야 하지만, 우리는 이미 채널이 연동돼
 * 있으므로 최근 게시물을 자동으로 끌어온다. 발행 시점에 스냅샷으로 굽는다
 * (공개 페이지가 방문자마다 플랫폼 API 를 치면 레이트리밋에 즉시 걸린다).
 */
export interface SocialFeedBlockData {
  channel: "instagram" | "tiktok" | "threads";
  /** 몇 개를 보여줄지 */
  count?: 3 | 6 | 9;
  /** 발행 시 구워지는 값 — 편집 화면에서는 비어 있을 수 있다 */
  cached?: Array<{ thumbUrl: string | null; permalink: string | null }>;
}

/** 문의받기 — 이름·연락처를 받아 inquiries 로 넣는다(이미 있는 표를 쓴다) */
export interface ContactBlockData {
  title?: string;
  description?: string;
  /** 어떤 필드를 받을지 */
  fields?: Array<"name" | "email" | "phone" | "message">;
}

/** 구독신청 — 이메일만 받는다. 자동 DM·뉴스레터로 이어붙일 자리 */
export interface SubscribeBlockData {
  title?: string;
  description?: string;
  buttonLabel?: string;
}

/** 지도/주소 — 좌표가 아니라 주소 문자열 + 지도 앱 링크. 임베드는 방문자 추적을 붙인다 */
export interface MapBlockData {
  address: string;
  label?: string;
}

export type BlockData =
  | ({ type: "link" } & LinkBlockData)
  | ({ type: "heading" } & HeadingBlockData)
  | ({ type: "text" } & TextBlockData)
  | ({ type: "divider" } & DividerBlockData)
  | ({ type: "spacer" } & SpacerBlockData)
  | ({ type: "image" } & ImageBlockData)
  | ({ type: "image_card" } & ImageCardBlockData)
  | ({ type: "video" } & VideoBlockData)
  | ({ type: "card_row" } & CardRowBlockData)
  | ({ type: "grid" } & GridBlockData)
  | ({ type: "notice" } & NoticeBlockData)
  | ({ type: "social_feed" } & SocialFeedBlockData)
  | ({ type: "contact" } & ContactBlockData)
  | ({ type: "subscribe" } & SubscribeBlockData)
  | ({ type: "map" } & MapBlockData);

export interface LinkBlock {
  id: string;
  type: BlockType;
  data: Record<string, unknown>;
  sortOrder: number;
  active: boolean;
}

/** 블록 추가 패널에 뜨는 목록 — 순서가 곧 화면 순서다 */
export const BLOCK_CATALOG: Array<{
  type: BlockType;
  label: string;
  hint: string;
  group: "기본" | "콘텐츠" | "레이아웃" | "받기";
}> = [
  { type: "link", label: "링크 버튼", hint: "가장 기본. 어디로든 보냅니다", group: "기본" },
  { type: "image_card", label: "이미지 카드", hint: "썸네일 + 제목으로 눈에 띄게", group: "기본" },
  { type: "card_row", label: "가로 카드", hint: "썸네일과 설명을 나란히", group: "기본" },
  { type: "grid", label: "그리드", hint: "2·3열로 여러 개를 한눈에", group: "기본" },

  { type: "image", label: "이미지", hint: "배너·포스터 한 장", group: "콘텐츠" },
  { type: "video", label: "동영상", hint: "유튜브·틱톡을 바로 재생", group: "콘텐츠" },
  { type: "social_feed", label: "최근 게시물", hint: "연동한 채널의 최신 글을 자동으로", group: "콘텐츠" },
  { type: "notice", label: "공지·배너", hint: "지금 알릴 것을 맨 위에", group: "콘텐츠" },

  { type: "heading", label: "소제목", hint: "링크를 묶어 구분합니다", group: "레이아웃" },
  { type: "text", label: "텍스트", hint: "짧은 설명 문단", group: "레이아웃" },
  { type: "divider", label: "구분선", hint: "섹션을 나눕니다", group: "레이아웃" },
  { type: "spacer", label: "빈 공간", hint: "간격을 넓힙니다", group: "레이아웃" },
  { type: "map", label: "지도·주소", hint: "오프라인 매장 위치", group: "레이아웃" },

  { type: "contact", label: "문의받기", hint: "이름·연락처를 받습니다", group: "받기" },
  { type: "subscribe", label: "구독신청", hint: "이메일을 모읍니다", group: "받기" },
];

/** 새 블록의 기본값 — 추가하자마자 화면에 뭔가 보여야 한다(빈 블록은 실수처럼 보인다) */
export function defaultBlockData(type: BlockType): Record<string, unknown> {
  switch (type) {
    case "link":
      return { label: "새 링크", url: "", emphasis: "normal" };
    case "heading":
      return { text: "소제목" };
    case "text":
      return { text: "설명을 입력하세요.", align: "left" };
    case "divider":
      return { style: "line" };
    case "spacer":
      return { size: 24 };
    case "image":
      return { imagePath: "", alt: "" };
    case "image_card":
      return { title: "카드 제목", subtitle: "", url: "" };
    case "video":
      return { url: "" };
    case "card_row":
      return { items: [{ title: "항목 1", url: "" }] };
    case "grid":
      return { columns: 2, items: [{ title: "항목 1", url: "" }] };
    case "notice":
      return { text: "공지 내용을 입력하세요.", tone: "info" };
    case "social_feed":
      return { channel: "instagram", count: 6 };
    case "contact":
      return { title: "문의하기", description: "", fields: ["name", "email", "message"] };
    case "subscribe":
      return { title: "새 소식 받기", description: "", buttonLabel: "구독하기" };
    case "map":
      return { address: "", label: "" };
    default:
      return {};
  }
}

/** 블록 목록을 한 줄 요약으로 — 편집 화면 목록에서 무슨 블록인지 알아야 한다 */
export function blockSummary(type: BlockType, data: Record<string, unknown>): string {
  const s = (k: string) => (typeof data[k] === "string" ? (data[k] as string) : "");
  const n = (k: string) => (Array.isArray(data[k]) ? (data[k] as unknown[]).length : 0);
  switch (type) {
    case "link":
      return s("label") || "(이름 없음)";
    case "heading":
    case "text":
    case "notice":
      return s("text") || "(내용 없음)";
    case "image_card":
      return s("title") || "(제목 없음)";
    case "video":
      return s("url") || "(주소 없음)";
    case "card_row":
    case "grid":
      return `항목 ${n("items")}개`;
    case "social_feed":
      return `${s("channel") || "instagram"} 최근 게시물`;
    case "contact":
      return s("title") || "문의받기";
    case "subscribe":
      return s("title") || "구독신청";
    case "map":
      return s("address") || "(주소 없음)";
    case "divider":
      return "구분선";
    case "spacer":
      return "빈 공간";
    default:
      return "";
  }
}
