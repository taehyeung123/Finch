import { cn } from "@/lib/cn";

/*
  입력 필드 공통 클래스 — 설정 폼(이름·초대 이메일·역할 select·탈퇴 확인)이 같은 모양을 쓴다(2026-09-03).
  cn() 은 tailwind-merge 가 아니라 단순 합치기라, 높이는 size 인자로 고른다(h-9/h-10 을 겹쳐 쓰지 않는다).
  포커스는 공용 Button 과 같은 outline 링 — 1px 테두리 색만 바뀌던 약한 포커스 표시를 통일한다.
  글자 16px 하한(모바일 확대 방지)은 globals 의 base 레이어가 건다.
*/
export function inputClass(size: "md" | "sm" = "md", className?: string): string {
  return cn(
    "w-full rounded-card border border-line bg-body text-fg placeholder:text-fg-faint trans-state",
    "focus:border-primary focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2",
    "disabled:opacity-60",
    size === "sm" ? "h-9 px-3 text-[14px]" : "h-10 px-3 text-[15px]",
    className,
  );
}

export function FieldLabel({
  htmlFor,
  srOnly = false,
  className,
  children,
}: {
  htmlFor?: string;
  srOnly?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className={cn(srOnly ? "sr-only" : "block text-[12px] font-medium text-fg-sub", className)}>
      {children}
    </label>
  );
}
