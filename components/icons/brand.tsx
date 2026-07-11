import { cn } from "@/lib/cn";

/*
  채널 브랜드 글리프 — 랜딩 전용 심볼 (PART 7.5 채널 컬러 토큰 사용)
  정확한 공식 로고가 아닌 "누가 봐도 그 앱" 수준의 단순화 심볼.
  색상은 currentColor 또는 @theme 토큰(var(--color-*))만 사용한다.
*/

export function InstagramGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* 둥근 사각형 바디 + 렌즈 + 우상단 플래시 점 */}
      <rect x="3.2" y="3.2" width="17.6" height="17.6" rx="5" />
      <circle cx="12" cy="12" r="4.1" />
      <circle cx="17.15" cy="6.85" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

/* 틱톡 음표 — 시안/레드 오프셋 레이어 위에 밝은 본체를 얹는 듀오톤 표현 */
const TIKTOK_NOTE = "M14.6 4.6v9.9a4.35 4.35 0 1 1-4.35-4.35";
const TIKTOK_WAVE = "M14.6 4.6c.35 2.5 2.3 4.45 4.8 4.8";

export function TiktokGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <g stroke="var(--color-tiktok-cyan)" transform="translate(-0.75 -0.75)">
        <path d={TIKTOK_NOTE} />
        <path d={TIKTOK_WAVE} />
      </g>
      <g stroke="var(--color-tiktok-red)" transform="translate(0.75 0.75)">
        <path d={TIKTOK_NOTE} />
        <path d={TIKTOK_WAVE} />
      </g>
      <g stroke="var(--color-fg)">
        <path d={TIKTOK_NOTE} />
        <path d={TIKTOK_WAVE} />
      </g>
    </svg>
  );
}

/* 쓰레드 — 바깥 고리가 안쪽으로 말려 들어가는 @류 곡선 */
export function ThreadsGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M17.1 8.4c-.9-2.7-2.9-4.2-5.4-4.2C8 4.2 5.5 7.4 5.5 12s2.5 7.8 6.2 7.8c3.1 0 5.4-1.9 5.4-4.5 0-2.3-1.8-3.9-4.3-3.9-2 0-3.5 1.1-3.5 2.6 0 1.3 1.1 2.2 2.7 2.2" />
    </svg>
  );
}

/* 메타 — 무한 루프 심볼 */
export function MetaGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 12c-1.9-2.6-3.8-3.9-5.7-3.9a3.9 3.9 0 1 0 0 7.8c1.9 0 3.8-1.3 5.7-3.9Z" />
      <path d="M12 12c1.9 2.6 3.8 3.9 5.7 3.9a3.9 3.9 0 0 0 0-7.8c-1.9 0-3.8 1.3-5.7 3.9Z" />
    </svg>
  );
}

export type BrandApp = "instagram" | "tiktok" | "threads" | "meta";

/*
  앱 아이콘 타일 — 글리프를 감싸는 홈스크린 앱 아이콘 형태.
  rounded-[22%]는 앱 아이콘 관례상 예외적으로 허용된 라운드.
  배경: 인스타=bg-ig, 틱톡/쓰레드=bg-surface(+테두리), 메타=bg-meta
*/
const TILE_STYLE: Record<BrandApp, string> = {
  instagram: "bg-ig text-fg",
  tiktok: "border border-line-strong bg-surface",
  threads: "border border-line-strong bg-surface text-fg",
  meta: "bg-meta text-fg",
};

const TILE_GLYPH: Record<BrandApp, (props: { className?: string }) => React.ReactNode> = {
  instagram: InstagramGlyph,
  tiktok: TiktokGlyph,
  threads: ThreadsGlyph,
  meta: MetaGlyph,
};

export function AppIconTile({
  app,
  size = 56,
  className,
}: {
  app: BrandApp;
  size?: number;
  className?: string;
}) {
  const Glyph = TILE_GLYPH[app];
  return (
    <span
      className={cn("flex shrink-0 items-center justify-center rounded-[22%]", TILE_STYLE[app], className)}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <Glyph className="size-[58%]" />
    </span>
  );
}
