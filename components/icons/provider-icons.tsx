/*
 * 소셜 로그인 브랜드 심볼.
 * GoogleIcon의 fill 하드코딩은 예외 허용 — Google 브랜드 가이드의 공식 4색(G) 고증용으로,
 * 디자인 토큰으로 치환하면 브랜드 규정을 위반하게 된다. (hex 하드코딩 금지 규칙의 유일한 예외)
 */

export function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true" focusable="false">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

/**
 * 로그인 제공자 타일 — 설정 화면의 행·요약 카드가 같은 모양을 쓴다(2026-09-03).
 * 구글은 흰 판(plate) 위 4색 G, 카카오는 노란 판 위 말풍선. 겹침 미니 타일(≤20px)은 border-2 border-body 로 분리한다.
 */
export function ProviderTile({
  provider,
  size = 40,
  className,
}: {
  provider: "google" | "kakao";
  size?: number;
  className?: string;
}) {
  const round = size <= 20 ? "rounded-[35%]" : "rounded-card";
  const face = provider === "google" ? "bg-plate" : "bg-kakao text-on-kakao";
  return (
    <span
      className={["flex shrink-0 items-center justify-center", round, face, className ?? ""].join(" ")}
      style={{ width: size, height: size }}
      aria-hidden
    >
      {provider === "google" ? <GoogleIcon className="size-[50%]" /> : <KakaoIcon className="size-[55%]" />}
    </span>
  );
}

/** 카카오 말풍선 심볼 — 버튼의 text-on-kakao 색을 currentColor로 상속 */
export function KakaoIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M12 3C6.48 3 2 6.54 2 10.9c0 2.8 1.86 5.26 4.66 6.65-.15.52-.96 3.33-.99 3.55 0 0-.02.17.09.23.11.06.24.01.24.01.31-.04 3.61-2.36 4.18-2.77.59.08 1.2.13 1.82.13 5.52 0 10-3.54 10-7.9S17.52 3 12 3z" />
    </svg>
  );
}
