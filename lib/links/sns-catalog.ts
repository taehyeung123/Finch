/*
  SNS 채널 카탈로그 — 리틀리 흡수 4단계(2026-08-22). 리틀리는 170+ 채널을 주는데, 그중 한국 크리에이터가
  실제로 쓰는 것 위주로 추렸다. 아이콘은 simple-icons(CC0) 의 path 를 **서버에서 정적 SVG** 로 그려
  방문자 JS 는 0 바이트다(components/sns-brand-icons.tsx). 상표 문제로 simple-icons 에 없는 것
  (링크드인·아마존·슬랙·토스·쿠팡…)은 일반 아이콘(lucide) 으로 대신한다.

  key 는 **영구 식별자** — 저장된 sns_links.kind 가 이 값을 가리킨다. 이름을 바꿔도 key 는 두고, 지우지 않는다.
*/
export interface SnsCatalogEntry {
  key: string;
  label: string;
  /** 편집기 placeholder */
  placeholder?: string;
  /** mailto:·tel:·sms: 처럼 주소가 아닌 것 */
  scheme?: "mailto" | "tel" | "sms";
  group: "기본" | "소셜" | "영상·방송" | "음악·팟캐스트" | "글·블로그" | "메신저·커뮤니티" | "쇼핑·판매" | "창작·개발" | "후원·결제" | "여행·장소";
}

export const SNS_CATALOG: readonly SnsCatalogEntry[] = [
  { key: "website", label: "웹사이트", placeholder: "https://", group: "기본" },
  { key: "email", label: "이메일", placeholder: "hello@example.com", scheme: "mailto", group: "기본" },
  { key: "phone", label: "전화", placeholder: "010-0000-0000", scheme: "tel", group: "기본" },
  { key: "sms", label: "문자 보내기", placeholder: "010-0000-0000", scheme: "sms", group: "기본" },

  { key: "instagram", label: "인스타그램", placeholder: "https://instagram.com/아이디", group: "소셜" },
  { key: "threads", label: "스레드", placeholder: "https://threads.net/@아이디", group: "소셜" },
  { key: "x", label: "X (트위터)", placeholder: "https://x.com/아이디", group: "소셜" },
  { key: "facebook", label: "페이스북", group: "소셜" },
  { key: "bluesky", label: "블루스카이", group: "소셜" },
  { key: "mastodon", label: "마스토돈", group: "소셜" },
  { key: "snapchat", label: "스냅챗", group: "소셜" },
  { key: "pinterest", label: "핀터레스트", group: "소셜" },
  { key: "tumblr", label: "텀블러", group: "소셜" },
  { key: "reddit", label: "레딧", group: "소셜" },
  { key: "linkedin", label: "링크드인", group: "소셜" },
  { key: "xiaohongshu", label: "샤오홍슈", group: "소셜" },
  { key: "weibo", label: "웨이보", group: "소셜" },
  { key: "vk", label: "VK", group: "소셜" },

  { key: "youtube", label: "유튜브", placeholder: "https://youtube.com/@채널", group: "영상·방송" },
  { key: "tiktok", label: "틱톡", placeholder: "https://tiktok.com/@아이디", group: "영상·방송" },
  { key: "twitch", label: "트위치", group: "영상·방송" },
  { key: "chzzk", label: "치지직", group: "영상·방송" },
  { key: "soop", label: "숲(SOOP)", group: "영상·방송" },
  { key: "kick", label: "킥", group: "영상·방송" },
  { key: "vimeo", label: "비메오", group: "영상·방송" },
  { key: "bilibili", label: "빌리빌리", group: "영상·방송" },
  { key: "navertv", label: "네이버 TV", group: "영상·방송" },

  { key: "spotify", label: "스포티파이", group: "음악·팟캐스트" },
  { key: "applemusic", label: "애플 뮤직", group: "음악·팟캐스트" },
  { key: "youtubemusic", label: "유튜브 뮤직", group: "음악·팟캐스트" },
  { key: "soundcloud", label: "사운드클라우드", group: "음악·팟캐스트" },
  { key: "melon", label: "멜론", group: "음악·팟캐스트" },
  { key: "genie", label: "지니", group: "음악·팟캐스트" },
  { key: "bugs", label: "벅스", group: "음악·팟캐스트" },
  { key: "applepodcasts", label: "애플 팟캐스트", group: "음악·팟캐스트" },
  { key: "podbbang", label: "팟빵", group: "음악·팟캐스트" },
  { key: "bandcamp", label: "밴드캠프", group: "음악·팟캐스트" },

  { key: "naverblog", label: "네이버 블로그", placeholder: "https://blog.naver.com/아이디", group: "글·블로그" },
  { key: "tistory", label: "티스토리", group: "글·블로그" },
  { key: "brunch", label: "브런치", group: "글·블로그" },
  { key: "velog", label: "벨로그", group: "글·블로그" },
  { key: "medium", label: "미디엄", group: "글·블로그" },
  { key: "substack", label: "서브스택", group: "글·블로그" },
  { key: "notion", label: "노션", group: "글·블로그" },
  { key: "naverpost", label: "네이버 포스트", group: "글·블로그" },

  { key: "kakao", label: "카카오톡", placeholder: "https://open.kakao.com/o/…", group: "메신저·커뮤니티" },
  { key: "kakaochannel", label: "카카오톡 채널", placeholder: "https://pf.kakao.com/…", group: "메신저·커뮤니티" },
  { key: "line", label: "라인", group: "메신저·커뮤니티" },
  { key: "telegram", label: "텔레그램", group: "메신저·커뮤니티" },
  { key: "discord", label: "디스코드", group: "메신저·커뮤니티" },
  { key: "whatsapp", label: "왓츠앱", group: "메신저·커뮤니티" },
  { key: "wechat", label: "위챗", group: "메신저·커뮤니티" },
  { key: "naverband", label: "네이버 밴드", group: "메신저·커뮤니티" },
  { key: "navercafe", label: "네이버 카페", group: "메신저·커뮤니티" },
  { key: "daumcafe", label: "다음 카페", group: "메신저·커뮤니티" },
  { key: "messenger", label: "페이스북 메신저", group: "메신저·커뮤니티" },

  { key: "smartstore", label: "스마트스토어", placeholder: "https://smartstore.naver.com/…", group: "쇼핑·판매" },
  { key: "coupang", label: "쿠팡", group: "쇼핑·판매" },
  { key: "kakaostore", label: "카카오톡 스토어", group: "쇼핑·판매" },
  { key: "kakaogift", label: "카카오톡 선물하기", group: "쇼핑·판매" },
  { key: "musinsa", label: "무신사", group: "쇼핑·판매" },
  { key: "oliveyoung", label: "올리브영", group: "쇼핑·판매" },
  { key: "idus", label: "아이디어스", group: "쇼핑·판매" },
  { key: "etsy", label: "엣시", group: "쇼핑·판매" },
  { key: "amazon", label: "아마존", group: "쇼핑·판매" },
  { key: "kmong", label: "크몽", group: "쇼핑·판매" },
  { key: "soomgo", label: "숨고", group: "쇼핑·판매" },
  { key: "class101", label: "클래스101", group: "쇼핑·판매" },
  { key: "wadiz", label: "와디즈", group: "쇼핑·판매" },
  { key: "tumblbug", label: "텀블벅", group: "쇼핑·판매" },
  { key: "googleplay", label: "구글 플레이", group: "쇼핑·판매" },
  { key: "appstore", label: "앱스토어", group: "쇼핑·판매" },

  { key: "github", label: "깃허브", group: "창작·개발" },
  { key: "behance", label: "비핸스", group: "창작·개발" },
  { key: "dribbble", label: "드리블", group: "창작·개발" },
  { key: "pixiv", label: "픽시브", group: "창작·개발" },
  { key: "artstation", label: "아트스테이션", group: "창작·개발" },
  { key: "unsplash", label: "언스플래시", group: "창작·개발" },
  { key: "notefolio", label: "노트폴리오", group: "창작·개발" },
  { key: "grafolio", label: "그라폴리오", group: "창작·개발" },

  { key: "toss", label: "토스", placeholder: "https://toss.me/…", group: "후원·결제" },
  { key: "kakaopay", label: "카카오페이", group: "후원·결제" },
  { key: "paypal", label: "페이팔", group: "후원·결제" },
  { key: "patreon", label: "패트리온", group: "후원·결제" },
  { key: "kofi", label: "Ko-fi", group: "후원·결제" },
  { key: "buymeacoffee", label: "Buy Me a Coffee", group: "후원·결제" },

  { key: "navermap", label: "네이버 지도", group: "여행·장소" },
  { key: "kakaomap", label: "카카오맵", group: "여행·장소" },
  { key: "googlemaps", label: "구글 지도", group: "여행·장소" },
  { key: "naverreservation", label: "네이버 예약", group: "여행·장소" },
  { key: "catchtable", label: "캐치테이블", group: "여행·장소" },
  { key: "airbnb", label: "에어비앤비", group: "여행·장소" },
  { key: "tripadvisor", label: "트립어드바이저", group: "여행·장소" },
  { key: "baemin", label: "배달의민족", group: "여행·장소" },
];

export const SNS_LABEL_MAP = new Map(SNS_CATALOG.map((s) => [s.key, s.label]));

/** 저장용 href — mailto:/tel:/sms: 은 주소가 아니라 스킴으로 만든다 */
export function snsHref(kind: string, value: string): string {
  const entry = SNS_CATALOG.find((s) => s.key === kind);
  const v = value.trim();
  if (entry?.scheme === "mailto") return v.startsWith("mailto:") ? v : `mailto:${v}`;
  if (entry?.scheme === "tel") return v.startsWith("tel:") ? v : `tel:${v.replace(/[^\d+]/g, "")}`;
  if (entry?.scheme === "sms") return v.startsWith("sms:") ? v : `sms:${v.replace(/[^\d+]/g, "")}`;
  return v;
}
