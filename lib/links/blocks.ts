/*
  프로필 링크 블록 — 타입·기본값·검증의 단일 출처.

  2026-08-17. 링크팜(app.linkfarm.ai) 빌더를 실측 조사해 블록 모델로 재설계했다.
  링크팜은 블록 18종을 갖고 있었고 우리는 「링크 버튼」 하나였다.

  ⚠️ 여기 BLOCK_TYPES 를 바꾸면 **0048 마이그레이션의 check 제약도 같이 바꾼다.**
  DB 가 모르는 타입이 들어오면 저장은 되는데 공개 페이지가 렌더를 못 해 조용히 사라진다.

  링크팜에서 **안 가져온 것**과 이유:
   · 예약받기·캘린더 — 예약 백엔드가 필요하다. 화면만 만들면 "누르면 아무 일도
     안 나는 버튼"이 된다(이번 개편에서 계속 걷어낸 그것). 연동 뒤에 연다.
   · 쿠팡 파트너스·후원하기는 0048 때 같은 이유로 미뤘다가 2026-08-20 재실측에서
     **둘 다 링크 아웃**(제휴 링크 / 송금 링크)임을 확인하고 0054 로 열었다 —
     백엔드 없이 온전히 동작한다.
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
  "coupang",
  "donation",
  /* 리틀리 흡수 4단계(0057) */
  "gallery",
  "music",
  "vcard",
  "search",
  "file",
  "guestbook",
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
  /** 텍스트 크기 — 기본 md. 공개 15px 기준 sm 13 / lg 17 */
  textSize?: "sm" | "md" | "lg";
  /** 텍스트 굵기 — 기본 semibold */
  textWeight?: "medium" | "semibold" | "bold";
  /** 텍스트 색 — #rrggbb. 비우면 테마가 정한다 */
  textColor?: string;
  /* ── 리틀리 흡수 2단계(2026-08-22): 썸네일·레이아웃·강조 태그·가격 ── */
  /** 썸네일 — 카드 레이아웃에서 보인다 */
  imagePath?: string;
  /** button(기본 버튼) | small(썸네일 작은 카드) | medium(중간 카드) | large(이미지 위 큰 카드) */
  layout?: "button" | "small" | "medium" | "large";
  /** 강조 태그 — 최대 3개, 16자. 버튼 아래 작은 칩 */
  tags?: string[];
  /** 표시용 문자열("29,000원") — 계산에 쓰지 않는다 */
  price?: string;
  /** 정가 — 있으면 취소선으로 옆에 */
  originalPrice?: string;
}

/** 단일 링크 레이아웃 — 편집기 칩과 렌더러가 같은 목록 */
export const LINK_LAYOUTS = [
  { key: "button", label: "버튼" },
  { key: "small", label: "작은 카드" },
  { key: "medium", label: "중간 카드" },
  { key: "large", label: "큰 카드" },
] as const;

/** 그룹(가로 카드·그리드) 접기 — 처음 N개만 보이고 「더보기」. 0 = 전부 */
export const COLLAPSE_OPTIONS = [0, 2, 3, 4, 6] as const;

/** 링크 버튼 텍스트 색 스와치 — 링크팜 편집기의 8색 카피.
    ⚠️ 앱 UI 토큰 아님: 방문자 페이지에 찍히는 **사용자 콘텐츠 팔레트**라
    LINK_THEMES 와 같은 이유로 hex 가 맞다(테마 토큰과 무관해야 한다). */
export const LINK_TEXT_COLORS = [
  "#111827",
  "#FFFFFF",
  "#64748B",
  "#22C55E",
  "#3B82F6",
  "#EC4899",
  "#F59E0B",
  "#8B5CF6",
] as const;

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

/**
 * 이미지 + 제목/부제 카드 — 링크팜 "이미지 카드".
 *
 * price·ctaLabel 은 **제품 카드**를 겸하기 위한 것이다(2026-08-19). 링크팜에는
 * 별도 「제품 카드」 블록이 있는데, 새 타입을 만드는 대신 여기에 두 필드를 얹었다 —
 * 공구 셀러에게 필요한 건 사진·상품명·가격·「구매하기」이고, 그건 이 카드의
 * 변형이지 다른 블록이 아니다. 새 타입을 늘리면 DB check 제약·렌더러·미리보기가
 * 전부 따라 늘어난다.
 */
export interface ImageCardBlockData {
  imagePath?: string;
  title: string;
  subtitle?: string;
  /** 표시용 문자열 그대로 — 통화·단위가 나라마다 다르고 계산에 쓰지 않는다 */
  price?: string;
  /** 기본은 버튼 없음. 값이 있으면 카드 아래 채움 버튼이 붙는다 */
  ctaLabel?: string;
  url?: string;
}

/** 유튜브·틱톡 임베드. 원본 URL 만 받고 렌더러가 임베드 주소로 바꾼다 */
export interface VideoBlockData {
  url: string;
  title?: string;
}

/** 가로 카드(썸네일 좌측 + 텍스트) 여러 장 — 링크팜 "가로 카드". 리틀리 「그룹 링크」의 기본 배치 */
export interface CardRowBlockData {
  items: Array<{ imagePath?: string; title: string; subtitle?: string; url: string; price?: string; originalPrice?: string }>;
  /** list(세로 목록, 기본) | carousel(가로 스크롤 카드) */
  layout?: "list" | "carousel";
  /** 처음 N개만 보이고 「더보기」. 0/없음 = 전부 */
  collapse?: 0 | 2 | 3 | 4 | 6;
}

/** 2·3열 그리드 — 링크팜 "그리드" */
export interface GridBlockData {
  columns?: 2 | 3;
  items: Array<{ imagePath?: string; title: string; url: string; price?: string; originalPrice?: string }>;
  collapse?: 0 | 2 | 3 | 4 | 6;
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

/** 문의받기 — 이름·연락처를 받아 link_leads 로 넣는다 */
export interface ContactBlockData {
  title?: string;
  description?: string;
  /** 어떤 필드를 받을지 */
  fields?: Array<"name" | "email" | "phone" | "message">;
}

/** 문의받기가 받을 수 있는 항목 — 편집기 체크박스와 공개 폼이 같은 목록을 쓴다 */
export const CONTACT_FIELDS: ReadonlyArray<{ key: "name" | "email" | "phone" | "message"; label: string }> = [
  { key: "name", label: "이름" },
  { key: "email", label: "이메일" },
  { key: "phone", label: "연락처" },
  { key: "message", label: "내용" },
];

/** 구독신청 — 이메일만 받는다. 자동 DM·뉴스레터로 이어붙일 자리 */
export interface SubscribeBlockData {
  title?: string;
  description?: string;
  buttonLabel?: string;
}

/** 지도/주소 — 좌표가 아니라 주소 문자열 + 지도 앱 링크. 임베드는 방문자 추적을 붙인다 */
/** 쿠팡 파트너스 상품 — 제휴 링크 카드. 공개 렌더러가 법정 고지 문구를 항상 붙인다 */
export interface CoupangBlockData {
  url: string;
  title: string;
  price?: string;
  imagePath?: string;
}

/** 후원하기 — 토스·카카오페이 송금 링크 등으로 응원받기. 링크 아웃이라 결제 백엔드가 필요 없다 */
export interface DonationBlockData {
  url: string;
  label?: string;
  message?: string;
  emoji?: string;
}

/** 쿠팡 파트너스 법정 고지 — 공정위 추천·보증 심사지침상 대가관계 표시 의무. 렌더러가 항상 붙이고 끌 수 없다 */
export const COUPANG_DISCLOSURE =
  "이 게시물은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.";

/* ── 리틀리 흡수 4단계 블록 ── */

/** 갤러리 — 이미지 여러 장. items 키를 쓴다(sanitize 의 items 경로를 그대로 탄다) */
export interface GalleryBlockData {
  items: Array<{ imagePath: string; alt?: string; url?: string }>;
  /** grid(썸네일) | list(목록) | slide(한 장씩) | carousel | masonry(자유) */
  layout?: "grid" | "list" | "slide" | "carousel" | "masonry";
  /** square(정사각) | intrinsic(개별 비율) */
  aspect?: "square" | "intrinsic";
}

/** 음악 — 스포티파이·사운드클라우드·유튜브 뮤직 임베드 */
export interface MusicBlockData {
  url: string;
  title?: string;
}

/** 연락처 — vCard 내려받기 버튼 */
export interface VcardBlockData {
  name: string;
  phone?: string;
  email?: string;
  org?: string;
  role?: string;
  website?: string;
  label?: string;
}

/** 페이지 내부 검색 — 입력하면 블록을 글자로 거른다 */
export interface SearchBlockData {
  placeholder?: string;
}

/** 파일 공유 — Storage 에 올린 파일. url 이 파일 주소라 /go 집계를 그대로 탄다 */
export interface FileBlockData {
  title: string;
  url: string;
  fileName?: string;
  fileSize?: number;
  description?: string;
}

/** 방명록 — 글은 link_guestbook 표에 쌓인다(0057) */
export interface GuestbookBlockData {
  title?: string;
  placeholder?: string;
}

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
  | ({ type: "map" } & MapBlockData)
  | ({ type: "coupang" } & CoupangBlockData)
  | ({ type: "donation" } & DonationBlockData)
  | ({ type: "gallery" } & GalleryBlockData)
  | ({ type: "music" } & MusicBlockData)
  | ({ type: "vcard" } & VcardBlockData)
  | ({ type: "search" } & SearchBlockData)
  | ({ type: "file" } & FileBlockData)
  | ({ type: "guestbook" } & GuestbookBlockData);

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
  group: "수익" | "기본" | "콘텐츠" | "레이아웃" | "받기";
}> = [
  /* 수익 — 링크로 돈이 되는 블록을 맨 앞에(링크팜은 쿠팡 CTA 를 카탈로그 최상단에 고정한다) */
  { type: "coupang", label: "쿠팡 파트너스 상품", hint: "제휴 링크 카드 — 고지 문구는 자동으로 붙어요", group: "수익" },
  { type: "donation", label: "후원하기", hint: "토스·카카오페이 송금 링크로 응원받기", group: "수익" },

  { type: "link", label: "링크 버튼", hint: "가장 기본. 어디로든 보냅니다", group: "기본" },
  { type: "image_card", label: "이미지·제품 카드", hint: "썸네일·가격·구매 버튼까지", group: "기본" },
  { type: "card_row", label: "가로 카드", hint: "썸네일과 설명을 나란히", group: "기본" },
  { type: "grid", label: "그리드", hint: "2·3열로 여러 개를 한눈에", group: "기본" },

  { type: "image", label: "이미지", hint: "배너·포스터 한 장", group: "콘텐츠" },
  { type: "gallery", label: "갤러리", hint: "사진 여러 장 — 썸네일·캐러셀·자유 배치", group: "콘텐츠" },
  { type: "music", label: "음악", hint: "스포티파이·사운드클라우드·유튜브 뮤직", group: "콘텐츠" },
  { type: "file", label: "파일 공유", hint: "PDF·자료를 올리고 내려받게", group: "콘텐츠" },
  /* 임베드는 유튜브만 된다 — 틱톡·인스타는 임베드 정책이 자주 바뀌어
     block-renderer 가 링크 버튼으로 폴백한다. 힌트가 그걸 그대로 말한다. */
  { type: "video", label: "동영상", hint: "유튜브는 바로 재생, 나머지는 링크로", group: "콘텐츠" },
  { type: "social_feed", label: "최근 게시물", hint: "연동한 채널의 최신 글을 자동으로", group: "콘텐츠" },
  { type: "notice", label: "공지·배너", hint: "지금 알릴 것을 맨 위에", group: "콘텐츠" },

  { type: "heading", label: "소제목", hint: "링크를 묶어 구분합니다", group: "레이아웃" },
  { type: "text", label: "텍스트", hint: "짧은 설명 문단", group: "레이아웃" },
  { type: "divider", label: "구분선", hint: "섹션을 나눕니다", group: "레이아웃" },
  { type: "spacer", label: "빈 공간", hint: "간격을 넓힙니다", group: "레이아웃" },
  { type: "map", label: "지도·주소", hint: "오프라인 매장 위치", group: "레이아웃" },
  { type: "search", label: "검색", hint: "페이지 안에서 링크 찾기", group: "레이아웃" },

  { type: "contact", label: "문의받기", hint: "이름·연락처를 받습니다", group: "받기" },
  { type: "subscribe", label: "구독신청", hint: "이메일을 모읍니다", group: "받기" },
  { type: "vcard", label: "연락처 저장", hint: "내 연락처를 방문자 폰에 바로", group: "받기" },
  { type: "guestbook", label: "방명록", hint: "방문자 한마디 + 내 답글", group: "받기" },
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
    case "coupang":
      return { url: "", title: "", price: "", imagePath: "" };
    case "donation":
      return { url: "", label: "후원하기", emoji: "💛", message: "" };
    case "gallery":
      return { items: [], layout: "grid", aspect: "square" };
    case "music":
      return { url: "", title: "" };
    case "vcard":
      return { name: "", phone: "", email: "", org: "", label: "연락처 저장" };
    case "search":
      return { placeholder: "무엇을 찾으세요?" };
    case "file":
      return { title: "", url: "", fileName: "", description: "" };
    case "guestbook":
      return { title: "방명록", placeholder: "한마디 남겨 주세요" };
    default:
      return {};
  }
}

/**
 * 이 블록이 지금 상태로 발행되면 공개 페이지에 **안 나오는가.** 이유 문자열 또는 null.
 *
 * ⚠️ 이 판정은 `app/p/[slug]/_components/block-renderer.tsx` 의 "null 을 돌려주는
 * 조건"과 **한 몸이어야 한다.** 두 곳이 갈리면 미리보기가 "공개 페이지와 같은 렌더"라는
 * 약속을 어긴다 — 편집기에는 멀쩡히 보이는데 발행하면 사라지는 블록이 생긴다.
 * 그래서 렌더러가 아니라 여기에 둔다. 목록 뱃지·미리보기 유령칸이 같은 함수를 쓴다.
 */
export function hiddenReason(type: BlockType, data: Record<string, unknown>): string | null {
  const s = (k: string) => (typeof data[k] === "string" ? (data[k] as string) : "");
  const items = Array.isArray(data.items) ? (data.items as Record<string, unknown>[]) : [];
  const withUrl = items.filter((it) => typeof it.url === "string" && it.url.trim()).length;
  switch (type) {
    case "link":
    case "coupang":
    case "donation":
      return s("url") ? null : "주소가 비어 공개되지 않아요";
    case "image":
      return s("imagePath") ? null : "이미지가 없어 공개되지 않아요";
    case "video":
      return s("url") ? null : "영상 주소가 없어 공개되지 않아요";
    case "map":
      return s("address") ? null : "주소가 비어 공개되지 않아요";
    case "card_row":
    case "grid":
      return withUrl > 0 ? null : "링크가 있는 항목이 없어 공개되지 않아요";
    case "gallery":
      return items.some((it) => typeof it.imagePath === "string" && it.imagePath.trim()) ? null : "이미지가 없어 공개되지 않아요";
    case "music":
      return musicEmbed(s("url")) ? null : "스포티파이·사운드클라우드·유튜브 뮤직 주소가 있어야 공개돼요";
    case "vcard":
      return s("name").trim() ? null : "이름이 비어 공개되지 않아요";
    case "file":
      return s("url") ? null : "파일을 올리면 공개돼요";
    case "social_feed":
      /* 발행 시 인스타그램이 아니면 빈 배열이 구워지고, 렌더러가 그 블록을 통째로 숨긴다 */
      return s("channel") && s("channel") !== "instagram"
        ? "인스타그램만 채워져요 — 지금은 공개되지 않아요"
        : null;
    default:
      return null;
  }
}

/**
 * 항목 **일부**만 공개에서 빠지는 사유 — 가로 카드·그리드에서 주소 없는 항목은 공개
 * 렌더러가 그 칸만 제거한다. hiddenReason 은 전부 빠질 때만 말하므로, 캔버스에 4칸이
 * 보이는데 발행본엔 3칸인 불일치를 아무도 알려주지 않았다(감사 #17).
 */
export function partialReason(type: BlockType, data: Record<string, unknown>): string | null {
  if (type !== "card_row" && type !== "grid") return null;
  const items = Array.isArray(data.items) ? (data.items as Record<string, unknown>[]) : [];
  const missing = items.filter((it) => !(typeof it.url === "string" && it.url.trim())).length;
  return missing > 0 && missing < items.length ? `주소 없는 항목 ${missing}개는 공개되지 않아요` : null;
}

/* ── 블록 공통 기능(리틀리 흡수 1단계, 2026-08-22) — data 에 담는다(마이그레이션 없음).
   emphasized : 페이지 하단 고정 CTA. 페이지당 하나 — 서버 액션이 다른 블록의 것을 지운다.
   openAt / closeAt : 예약 공개·숨김(ISO). 공개 페이지가 **요청 시점**에 판정한다(force-dynamic). */

/** 강조(하단 고정 CTA)가 가능한 타입 — 주소 하나로 가는 버튼형만 */
export const EMPHASIS_TYPES: readonly BlockType[] = ["link", "coupang", "donation", "image_card"];

export function blockSchedule(data: Record<string, unknown>): { openAt: string | null; closeAt: string | null } {
  const iso = (v: unknown) => (typeof v === "string" && !Number.isNaN(Date.parse(v)) ? v : null);
  return { openAt: iso(data.openAt), closeAt: iso(data.closeAt) };
}

/** 지금 시각 기준으로 예약 때문에 숨겨지는가 */
export function isScheduledHidden(data: Record<string, unknown>, now: number = Date.now()): boolean {
  const { openAt, closeAt } = blockSchedule(data);
  if (openAt && now < Date.parse(openAt)) return true;
  if (closeAt && now > Date.parse(closeAt)) return true;
  return false;
}

/** 캔버스 캡션용 한 줄 — "8/25 09:00 공개 예정" / "9/1 18:00 까지 공개" / null */
export function scheduleCaption(data: Record<string, unknown>, now: number = Date.now()): string | null {
  const { openAt, closeAt } = blockSchedule(data);
  const fmt = (iso: string) => {
    const d = new Date(iso);
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm}`;
  };
  if (openAt && now < Date.parse(openAt)) return `예약 — ${fmt(openAt)} 공개 예정`;
  if (closeAt && now > Date.parse(closeAt)) return `예약 — ${fmt(closeAt)} 에 숨겨졌어요`;
  if (closeAt) return `예약 — ${fmt(closeAt)} 까지 공개`;
  return null;
}

/** 강조 CTA 로 그릴 라벨·주소 — 없으면 null(타입이 아니거나 주소가 비었거나) */
export function emphasizedCta(type: BlockType, data: Record<string, unknown>): { label: string } | null {
  if (!EMPHASIS_TYPES.includes(type) || data.emphasized !== true) return null;
  const s = (k: string) => (typeof data[k] === "string" ? (data[k] as string).trim() : "");
  if (!s("url")) return null;
  const label = s("label") || s("title") || s("buttonText") || (type === "donation" ? "후원하기" : type === "coupang" ? "상품 보기" : "바로가기");
  return { label };
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
    case "coupang":
      return s("title") || "쿠팡 상품";
    case "donation":
      return s("label") || "후원하기";
    case "contact":
      return s("title") || "문의받기";
    case "subscribe":
      return s("title") || "구독신청";
    case "map":
      return s("address") || "(주소 없음)";
    /* 고정 문자열로 두면 구분선 3개가 목록에서 **글자까지 똑같아진다** —
       어느 걸 지우는지 알 수 없다. 설정값을 붙여 서로 구분되게 한다. */
    case "divider":
      return `구분선 · ${s("style") === "dot" ? "점" : "선"}`;
    case "spacer":
      return `빈 공간 · ${typeof data.size === "number" ? data.size : 24}px`;
    case "image":
      return s("alt") || (s("imagePath") ? "이미지" : "(이미지 없음)");
    case "gallery":
      return `사진 ${n("items")}장`;
    case "music":
      return s("title") || s("url") || "(주소 없음)";
    case "vcard":
      return s("name") || "(이름 없음)";
    case "search":
      return "페이지 검색";
    case "file":
      return s("title") || s("fileName") || "(파일 없음)";
    case "guestbook":
      return s("title") || "방명록";
    default:
      return "";
  }
}


/* ── 음악 임베드 주소 — 스포티파이 / 사운드클라우드 / 유튜브 뮤직 ──
   공개 렌더러·미리보기·hiddenReason 이 같은 함수를 쓴다. 모르는 주소면 null(임베드하지 않는다). */
export function musicEmbed(raw: string): { src: string; provider: "spotify" | "soundcloud" | "youtube"; height: number } | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:") return null;
  const host = u.hostname.replace(/^www\./, "");
  if (host === "open.spotify.com") {
    const m = /^\/(?:intl-[a-z]+\/)?(track|album|playlist|episode|show|artist)\/([A-Za-z0-9]+)/.exec(u.pathname);
    if (!m) return null;
    return { src: `https://open.spotify.com/embed/${m[1]}/${m[2]}`, provider: "spotify", height: m[1] === "track" || m[1] === "episode" ? 152 : 352 };
  }
  if (host === "soundcloud.com" || host === "on.soundcloud.com") {
    return { src: `https://w.soundcloud.com/player/?url=${encodeURIComponent(u.toString())}&color=%23ff5a36&auto_play=false&show_comments=false&visual=false`, provider: "soundcloud", height: 166 };
  }
  if (host === "music.youtube.com" || host === "youtube.com" || host === "youtu.be" || host === "m.youtube.com") {
    const id = host === "youtu.be" ? u.pathname.slice(1).split("/")[0] : u.searchParams.get("v");
    const list = u.searchParams.get("list");
    if (list && !id) return { src: `https://www.youtube-nocookie.com/embed/videoseries?list=${encodeURIComponent(list)}`, provider: "youtube", height: 200 };
    if (!id || !/^[A-Za-z0-9_-]{6,}$/.test(id)) return null;
    return { src: `https://www.youtube-nocookie.com/embed/${id}`, provider: "youtube", height: 200 };
  }
  return null;
}
