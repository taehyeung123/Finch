import {
  AtSign,
  BookOpen,
  Coffee,
  Globe,
  GraduationCap,
  HandHeart,
  Headphones,
  Mail,
  MapPin,
  MessageCircle,
  MessageSquare,
  Music2,
  Palette,
  Phone,
  Radio,
  ShoppingBag,
  Sparkles,
  Store,
  Users,
  UtensilsCrossed,
  Video,
  Wallet,
} from "lucide-react";
import {
  siAirbnb,
  siApplemusic,
  siApplepodcasts,
  siAppstore,
  siArtstation,
  siBandcamp,
  siBehance,
  siBilibili,
  siBluesky,
  siBuymeacoffee,
  siDiscord,
  siDribbble,
  siEtsy,
  siFacebook,
  siGithub,
  siGoogleplay,
  siGooglemaps,
  siInstagram,
  siKakao,
  siKakaotalk,
  siKick,
  siKofi,
  siLine,
  siMastodon,
  siMedium,
  siMessenger,
  siNaver,
  siNotion,
  siPatreon,
  siPaypal,
  siPinterest,
  siPixiv,
  siReddit,
  siSinaweibo,
  siSnapchat,
  siSoundcloud,
  siSpotify,
  siSubstack,
  siTelegram,
  siThreads,
  siTiktok,
  siTistory,
  siTripadvisor,
  siTumblr,
  siTwitch,
  siUnsplash,
  siVelog,
  siVimeo,
  siVk,
  siWechat,
  siWhatsapp,
  siX,
  siXiaohongshu,
  siYoutube,
  siYoutubemusic,
} from "simple-icons";

/*
  SNS 채널 아이콘 — 공개 프로필 링크의 SNS 칩과 편집 미리보기·SNS 선택기가 함께 쓴다.
  리틀리 흡수 4단계(2026-08-22): lib/links/sns-catalog.ts 의 채널 키와 1:1.

  브랜드 로고는 simple-icons(CC0) 의 **path 문자열**만 가져와 24 뷰박스 SVG 로 그린다 —
  "use client" 가 없어 서버 컴포넌트에서는 정적 SVG 로 렌더되고 방문자에게 JS 를 보내지 않는다.
  상표 문제로 simple-icons 에 없는 브랜드(링크드인·아마존·토스·쿠팡·치지직 …)는 lucide 일반 아이콘.
  전부 currentColor 라 사용자 테마 위에 그대로 얹힌다(카카오 공식 노란 배경은 쓰지 않는다).
*/

type IconProps = { className?: string };
type Si = { path: string };

function brand(icon: Si) {
  return function BrandIcon({ className }: IconProps) {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
        <path d={icon.path} />
      </svg>
    );
  };
}
const lucide = (Icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>) =>
  function LucideIcon({ className }: IconProps) {
    return <Icon className={className} aria-hidden />;
  };

const ICONS: Record<string, (p: IconProps) => React.ReactNode> = {
  /* 기본 */
  website: lucide(Globe),
  email: lucide(Mail),
  phone: lucide(Phone),
  sms: lucide(MessageSquare),
  /* 소셜 */
  instagram: brand(siInstagram),
  threads: brand(siThreads),
  x: brand(siX),
  facebook: brand(siFacebook),
  bluesky: brand(siBluesky),
  mastodon: brand(siMastodon),
  snapchat: brand(siSnapchat),
  pinterest: brand(siPinterest),
  tumblr: brand(siTumblr),
  reddit: brand(siReddit),
  linkedin: lucide(Users),
  xiaohongshu: brand(siXiaohongshu),
  weibo: brand(siSinaweibo),
  vk: brand(siVk),
  /* 영상·방송 */
  youtube: brand(siYoutube),
  tiktok: brand(siTiktok),
  twitch: brand(siTwitch),
  chzzk: lucide(Radio),
  soop: lucide(Radio),
  kick: brand(siKick),
  vimeo: brand(siVimeo),
  bilibili: brand(siBilibili),
  navertv: brand(siNaver),
  /* 음악·팟캐스트 */
  spotify: brand(siSpotify),
  applemusic: brand(siApplemusic),
  youtubemusic: brand(siYoutubemusic),
  soundcloud: brand(siSoundcloud),
  melon: lucide(Music2),
  genie: lucide(Music2),
  bugs: lucide(Music2),
  applepodcasts: brand(siApplepodcasts),
  podbbang: lucide(Headphones),
  bandcamp: brand(siBandcamp),
  /* 글·블로그 */
  naverblog: brand(siNaver),
  tistory: brand(siTistory),
  brunch: lucide(BookOpen),
  velog: brand(siVelog),
  medium: brand(siMedium),
  substack: brand(siSubstack),
  notion: brand(siNotion),
  naverpost: brand(siNaver),
  /* 메신저·커뮤니티 */
  kakao: brand(siKakaotalk),
  kakaochannel: brand(siKakaotalk),
  line: brand(siLine),
  telegram: brand(siTelegram),
  discord: brand(siDiscord),
  whatsapp: brand(siWhatsapp),
  wechat: brand(siWechat),
  naverband: brand(siNaver),
  navercafe: brand(siNaver),
  daumcafe: lucide(MessageCircle),
  messenger: brand(siMessenger),
  /* 쇼핑·판매 */
  smartstore: brand(siNaver),
  coupang: lucide(ShoppingBag),
  kakaostore: brand(siKakao),
  kakaogift: brand(siKakao),
  musinsa: lucide(ShoppingBag),
  oliveyoung: lucide(Sparkles),
  idus: lucide(Store),
  etsy: brand(siEtsy),
  amazon: lucide(ShoppingBag),
  kmong: lucide(Store),
  soomgo: lucide(Store),
  class101: lucide(GraduationCap),
  wadiz: lucide(HandHeart),
  tumblbug: lucide(HandHeart),
  googleplay: brand(siGoogleplay),
  appstore: brand(siAppstore),
  /* 창작·개발 */
  github: brand(siGithub),
  behance: brand(siBehance),
  dribbble: brand(siDribbble),
  pixiv: brand(siPixiv),
  artstation: brand(siArtstation),
  unsplash: brand(siUnsplash),
  notefolio: lucide(Palette),
  grafolio: lucide(Palette),
  /* 후원·결제 */
  toss: lucide(Wallet),
  kakaopay: brand(siKakao),
  paypal: brand(siPaypal),
  patreon: brand(siPatreon),
  kofi: brand(siKofi),
  buymeacoffee: brand(siBuymeacoffee),
  /* 여행·장소 */
  navermap: brand(siNaver),
  kakaomap: brand(siKakao),
  googlemaps: brand(siGooglemaps),
  naverreservation: brand(siNaver),
  catchtable: lucide(UtensilsCrossed),
  airbnb: brand(siAirbnb),
  tripadvisor: brand(siTripadvisor),
  baemin: lucide(UtensilsCrossed),
  /* 예전 키 — 저장된 값과 호환 */
  video: lucide(Video),
  coffee: lucide(Coffee),
  at: lucide(AtSign),
  map: lucide(MapPin),
};

/** 채널 키 → 아이콘. 모르는 키면 지구본(링크는 링크다) */
export function SnsIcon({ kind, className }: { kind: string; className?: string }) {
  /* 자기 키만 — 프로토타입 이름("constructor")이 Object 를 꺼내 렌더를 터뜨리지 않게(감사 L2) */
  const Icon = Object.hasOwn(ICONS, kind) ? ICONS[kind] : ICONS.website;
  return <>{Icon({ className })}</>;
}
