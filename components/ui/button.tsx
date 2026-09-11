import { AppLink } from "@/components/ui/app-link";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

/* 2026-08-14 감사 반영:
   - disabled:pointer-events-none 제거 — 비활성 사유를 담은 title 툴팁이 hover에서 절대 안 뜨던
     문제 수리. <button disabled>는 어차피 클릭이 무효라 pointer-events를 살려도 안전하다.
   - after 의사요소로 히트 영역을 상하좌우 6px 확장 — sm(32px) 버튼도 44px 터치 타깃을 채운다.
     시각 크기는 그대로, 클릭 판정만 넓어진다. */
const base =
  "relative inline-flex items-center justify-center gap-1.5 font-medium rounded-card trans-state cursor-pointer focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap after:absolute after:-inset-1.5 after:content-['']";

/* 코랄 배경 위 텍스트는 항상 다크 (PART 7.3 확정) */
const variants: Record<Variant, string> = {
  /* 눌린 표시는 변형마다 두지 않는다 — globals.css 의 누름 반응 한 규칙이 앱의 모든 버튼·링크에 똑같이 건다(2026-09-11) */
  primary: "bg-primary text-on-primary hover:bg-primary-hover font-semibold",
  secondary: "bg-overlay text-fg border border-line hover:border-line-strong",
  /* 호버 배경은 **틴트 토큰**이다 — bg-overlay 는 라이트에서 카드·사이드바와 같은 흰색이라
     ghost 버튼의 호버 반응이 통째로 안 보였다(면 역할표: bg-tint-hover 가 호버 틴트다) */
  ghost: "text-fg-sub hover:text-fg hover:bg-tint-hover",
  danger: "bg-negative-weak text-negative border border-transparent hover:border-negative",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-[14px]",
  md: "h-10 px-4 text-[15px]",
  lg: "h-12 px-6 text-base",
};

/** 버튼과 동일한 시각을 앵커(<a>) 등에 입힐 때 사용 — 라우트 핸들러로의 전체 이동 링크 등 */
export function buttonClasses(variant: Variant = "primary", size: Size = "md", className?: string): string {
  return cn(base, variants[variant], sizes[size], className);
}

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export function Button({ variant = "primary", size = "md", className, ...props }: ButtonProps) {
  return <button className={cn(base, variants[variant], sizes[size], className)} {...props} />;
}

interface ButtonLinkProps extends React.ComponentProps<typeof AppLink> {
  variant?: Variant;
  size?: Size;
  className?: string;
}

/** 버튼 모양의 화면 이동 링크 — AppLink 라 누르는 즉시 «이동 중» 화면이 덮인다(components/layout/nav-pending.tsx) */
export function ButtonLink({ variant = "primary", size = "md", className, ...props }: ButtonLinkProps) {
  return <AppLink className={cn(base, variants[variant], sizes[size], className)} {...props} />;
}
