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

/* ══════════════════════════════════════════════════════════════════
   링크 버튼 자동 브랜드 로고(2026-08-28 «리틀리처럼 컬러로») — 주소의 호스트로 채널을 알아낸다.

   규칙:
   · **구체적인 서브도메인이 먼저다** — music.youtube.com 이 youtube.com 보다 위에 있어야 한다
     (검사가 위에서부터 순서대로라 배열 순서가 곧 우선순위다).
   · naver.com·kakao.com·google.com 통짜 매칭은 두지 않는다 — 네이버 뉴스 링크에
     지도 아이콘이 붙는 오인식이 «없음»보다 나쁘다. 서브도메인 단위로만 안다.
   · 모르는 호스트는 null — 버튼은 지금처럼 텍스트로만 남는다.
   ══════════════════════════════════════════════════════════════════ */
const HOST_KINDS: ReadonlyArray<readonly [string, string]> = [
  /* 서브도메인 구분이 필요한 큰 집들 먼저 */
  ["music.youtube.com", "youtubemusic"],
  ["podcasts.apple.com", "applepodcasts"],
  ["music.apple.com", "applemusic"],
  ["apps.apple.com", "appstore"],
  ["play.google.com", "googleplay"],
  ["maps.google.com", "googlemaps"],
  ["maps.app.goo.gl", "googlemaps"],
  ["blog.naver.com", "naverblog"],
  ["post.naver.com", "naverpost"],
  ["cafe.naver.com", "navercafe"],
  ["tv.naver.com", "navertv"],
  ["map.naver.com", "navermap"],
  ["naver.me", "navermap"],
  ["smartstore.naver.com", "smartstore"],
  ["brand.naver.com", "smartstore"],
  ["booking.naver.com", "naverreservation"],
  ["chzzk.naver.com", "chzzk"],
  ["grafolio.naver.com", "grafolio"],
  ["open.kakao.com", "kakao"],
  ["pf.kakao.com", "kakaochannel"],
  ["store.kakao.com", "kakaostore"],
  ["gift.kakao.com", "kakaogift"],
  ["map.kakao.com", "kakaomap"],
  ["kakaopay.com", "kakaopay"],
  ["cafe.daum.net", "daumcafe"],
  /* 소셜 */
  ["instagram.com", "instagram"],
  ["threads.net", "threads"],
  ["threads.com", "threads"],
  ["x.com", "x"],
  ["twitter.com", "x"],
  ["facebook.com", "facebook"],
  ["fb.com", "facebook"],
  ["messenger.com", "messenger"],
  ["m.me", "messenger"],
  ["bsky.app", "bluesky"],
  ["snapchat.com", "snapchat"],
  ["pinterest.com", "pinterest"],
  ["pin.it", "pinterest"],
  ["tumblr.com", "tumblr"],
  ["reddit.com", "reddit"],
  ["linkedin.com", "linkedin"],
  ["xiaohongshu.com", "xiaohongshu"],
  ["xhslink.com", "xiaohongshu"],
  ["weibo.com", "weibo"],
  ["vk.com", "vk"],
  /* 영상·방송 */
  ["youtube.com", "youtube"],
  ["youtu.be", "youtube"],
  ["tiktok.com", "tiktok"],
  ["twitch.tv", "twitch"],
  ["sooplive.co.kr", "soop"],
  ["afreecatv.com", "soop"],
  ["kick.com", "kick"],
  ["vimeo.com", "vimeo"],
  ["bilibili.com", "bilibili"],
  ["b23.tv", "bilibili"],
  /* 음악·팟캐스트 */
  ["spotify.com", "spotify"],
  ["soundcloud.com", "soundcloud"],
  ["melon.com", "melon"],
  ["genie.co.kr", "genie"],
  ["bugs.co.kr", "bugs"],
  ["podbbang.com", "podbbang"],
  ["bandcamp.com", "bandcamp"],
  /* 글·블로그 */
  ["tistory.com", "tistory"],
  ["brunch.co.kr", "brunch"],
  ["velog.io", "velog"],
  ["medium.com", "medium"],
  ["substack.com", "substack"],
  ["notion.site", "notion"],
  ["notion.so", "notion"],
  /* 메신저·커뮤니티 */
  ["band.us", "naverband"],
  ["line.me", "line"],
  ["t.me", "telegram"],
  ["telegram.me", "telegram"],
  ["discord.gg", "discord"],
  ["discord.com", "discord"],
  ["wa.me", "whatsapp"],
  ["whatsapp.com", "whatsapp"],
  ["weixin.qq.com", "wechat"],
  /* 쇼핑·판매 */
  ["coupang.com", "coupang"],
  ["musinsa.com", "musinsa"],
  ["oliveyoung.co.kr", "oliveyoung"],
  ["idus.com", "idus"],
  ["etsy.com", "etsy"],
  ["amazon.com", "amazon"],
  ["amzn.to", "amazon"],
  ["kmong.com", "kmong"],
  ["soomgo.com", "soomgo"],
  ["class101.net", "class101"],
  ["wadiz.kr", "wadiz"],
  ["tumblbug.com", "tumblbug"],
  /* 창작·개발 */
  ["github.com", "github"],
  ["github.io", "github"],
  ["behance.net", "behance"],
  ["dribbble.com", "dribbble"],
  ["pixiv.net", "pixiv"],
  ["artstation.com", "artstation"],
  ["unsplash.com", "unsplash"],
  ["notefolio.net", "notefolio"],
  /* 후원·결제 */
  ["toss.me", "toss"],
  ["paypal.com", "paypal"],
  ["paypal.me", "paypal"],
  ["patreon.com", "patreon"],
  ["ko-fi.com", "kofi"],
  ["buymeacoffee.com", "buymeacoffee"],
  /* 여행·장소 */
  ["airbnb.com", "airbnb"],
  ["airbnb.co.kr", "airbnb"],
  ["tripadvisor.com", "tripadvisor"],
  ["tripadvisor.co.kr", "tripadvisor"],
  ["catchtable.co.kr", "catchtable"],
  ["baemin.com", "baemin"],
];

/** 주소 → 채널 키. 모르면 null(버튼은 텍스트로만 — 오인식이 없음보다 나쁘다) */
export function detectSnsKind(url: string): string | null {
  let host: string;
  /* 스킴 없는 붙여넣기(instagram.com/foo)가 흔하다 — 저장 관문(normalizeUrl)이 https:// 를
     붙이는 것과 같은 보정을 해야 편집 초안과 발행본의 로고가 갈리지 않는다(쏘넷 점검) */
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(url.trim()) ? url.trim() : `https://${url.trim()}`;
  try {
    host = new URL(withScheme).hostname.toLowerCase();
  } catch {
    return null;
  }
  host = host.replace(/^www\./, "");
  for (const [h, k] of HOST_KINDS) {
    if (host === h || host.endsWith(`.${h}`)) return k;
  }
  return null;
}
