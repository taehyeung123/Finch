import { AtSign, Globe, MessageCircle } from "lucide-react";

/*
  SNS 채널 아이콘 — 공개 프로필 링크의 SNS 칩과 편집 미리보기가 함께 쓴다.

  lucide 1.24 는 브랜드 아이콘(instagram·youtube·tiktok…)을 전량 제거했다.
  그래서 **필요한 4개만 손으로 그렸다** — 아이콘 팩을 새로 들이면 방문자 번들이
  커진다(lib/links/blocks.ts 의 방침). 나머지 셋은 lucide 의 일반 아이콘으로 충분하다:
  threads 로고는 @ 모양이고(AtSign), website 는 지구본(Globe), kakao 는 말풍선
  (MessageCircle)이 브랜드 로고보다 낫다 — 카카오 공식 로고는 노란 배경을 요구하는데
  이 칩은 사용자 테마 색 위에 얹힌다.

  전부 currentColor + lucide 와 같은 24 뷰박스·스트로크 문법이라 한 줄에 섞여도
  이질감이 없다. "use client" 없음 — 서버 컴포넌트에서는 정적 SVG 로 렌더돼
  방문자에게 JS 를 한 바이트도 보내지 않는다.
*/

type IconProps = { className?: string };

function InstagramIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <line x1="17.2" y1="6.8" x2="17.21" y2="6.8" strokeWidth={2.6} />
    </svg>
  );
}

function YoutubeIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <rect x="2.5" y="5.5" width="19" height="13" rx="3.5" />
      <polygon points="10.4,9.2 15.2,12 10.4,14.8" fill="currentColor" stroke="none" />
    </svg>
  );
}

function TiktokIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" stroke="none" className={className} aria-hidden>
      <path d="M13.7 2.5h3c.3 2 1.6 3.6 3.8 3.9v3c-1.4 0-2.7-.4-3.8-1.2v6.2a5.7 5.7 0 1 1-5.7-5.7c.3 0 .7 0 1 .1v3.1a2.7 2.7 0 1 0 1.7 2.5V2.5z" />
    </svg>
  );
}

function XIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" className={className} aria-hidden>
      <path d="M4.5 4.5l15 15" />
      <path d="M19.5 4.5l-15 15" />
    </svg>
  );
}

const ICONS: Record<string, (p: IconProps) => React.ReactNode> = {
  instagram: InstagramIcon,
  youtube: YoutubeIcon,
  tiktok: TiktokIcon,
  x: XIcon,
  threads: ({ className }) => <AtSign className={className} aria-hidden />,
  website: ({ className }) => <Globe className={className} aria-hidden />,
  kakao: ({ className }) => <MessageCircle className={className} aria-hidden />,
};

/** 채널 키 → 아이콘. 모르는 키면 지구본(링크는 링크다) */
export function SnsIcon({ kind, className }: { kind: string; className?: string }) {
  const Icon = ICONS[kind] ?? ICONS.website;
  return <>{Icon({ className })}</>;
}
