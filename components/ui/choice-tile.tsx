import { Check, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

/*
  선택 타일 — 라디오 하나를 카드처럼 그린다(화면 테마·팀 역할). 2026-09-03 설정 재설계.
  네이티브 <input type=radio> 를 sr-only 로 두어 화살표 이동·그룹당 탭 1회·폼 제출을 공짜로 얻는다.
  선택 표시는 :has(:checked) — 선택(primary-weak)이 호버(tint)보다 항상 이기게 has 변형에도 배경을 건다.
*/
export function ChoiceTile({
  name,
  value,
  checked,
  onChange,
  title,
  hint,
  icon: Icon,
  disabled,
  className,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: () => void;
  title: string;
  hint?: string;
  icon?: LucideIcon;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <label
      className={cn(
        "trans-state relative flex min-w-0 cursor-pointer items-center gap-3 rounded-card border border-line p-3",
        "hover:bg-tint-hover has-[:checked]:border-primary has-[:checked]:bg-primary-weak has-[:checked]:hover:bg-primary-weak",
        "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-primary has-[:focus-visible]:outline-offset-2",
        disabled && "cursor-not-allowed opacity-60",
        className,
      )}
    >
      <input type="radio" name={name} value={value} checked={checked} onChange={onChange} disabled={disabled} className="peer sr-only" />
      {Icon ? (
        <span className="flex size-9 shrink-0 items-center justify-center rounded-card bg-plate text-fg-sub peer-checked:text-primary-ink" aria-hidden>
          <Icon className="size-4" />
        </span>
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="block break-keep text-[15px] font-semibold text-fg">{title}</span>
        {hint ? <span className="mt-0.5 block break-keep text-[14px] text-fg-sub">{hint}</span> : null}
      </span>
      <span className="hidden size-5 shrink-0 items-center justify-center rounded-chip bg-primary text-on-primary peer-checked:inline-flex" aria-hidden>
        <Check className="size-3" strokeWidth={3} />
      </span>
    </label>
  );
}
