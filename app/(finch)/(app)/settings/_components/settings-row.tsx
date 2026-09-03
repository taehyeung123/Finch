import Link from "next/link";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";

/*
  설정 행 문법 — «항목 하나 = 행 하나»(링크팜 계정 화면 문법, 2026-09-03 재설계로 hub-row 를 일반화).

  설정에는 행이 **둘뿐**이다: 여기 SettingsRow(항목 행)와 field-row.tsx 의 FieldRow(사실 행).
  허브·SNS 계정 연결·로그인 계정·알림·팀·플랜·결제 내역·약관 목록이 전부 이 행으로 그려진다 —
  페이지마다 li 를 손으로 짜던 것(legal docRow, team li, logins li, payment 주문 행)을 이 하나로 옮겼다.

  구조: [타일 | 라벨(+칩·팁) / 힌트 / 메타 | 오른쪽 슬롯]
   · 타일 size-9 rounded-card bg-plate — 카드 **안**의 중첩 면이라 plate 다(면 역할표).
   · 라벨 15/semibold 옆에 StateChip·Badge 가 flex-wrap 으로 붙는다 — 상태는 절대 truncate 뒤로 밀리지 않는다.
   · 힌트 14 fg-sub(한 줄, truncate) · 메타 12 tnum(선택). 힌트를 안 주는 행은 없다 — 행 높이가 통일된다(≈60~65px).
   · 오른쪽: 링크 행은 꺾쇠(fg-faint → hover fg-sub) · 동작 행은 버튼 하나 · 컨트롤 행은 Switch/select 하나.
   · 모바일: 꺾쇠만 있는 행은 3열 그대로, 버튼·컨트롤이 있는 행은 슬롯이 **본문 열 아래 왼쪽**으로 내려온다(타일 밑이 아니다).
   · 호버 틴트·포커스 링은 링크·버튼 행에만. 링은 카드 overflow-hidden 안쪽(-outline-offset-2)에 그린다.
*/

type Tone = "sub" | "warning" | "negative";
const HINT_TONE: Record<Tone, string> = {
  sub: "text-fg-sub",
  warning: "text-warning-strong",
  negative: "text-negative-strong",
};

export interface SettingsRowProps {
  /** 링크 행 */
  href?: string;
  /** 새 창(공개 요금제 등) */
  external?: boolean;
  /** 버튼 행(로그아웃 폼 제출 등) — form 안에서 type=submit 으로 쓴다 */
  asButton?: boolean;
  type?: "button" | "submit";
  onClick?: () => void;
  /** 타일 아이콘 — leading 을 주면 무시된다 */
  icon?: LucideIcon;
  /** 아바타·브랜드 타일처럼 타일을 직접 그릴 때 */
  leading?: React.ReactNode;
  label: string;
  /** 라벨 옆 StateChip / Badge */
  chip?: React.ReactNode;
  /** 라벨 줄 끝 InfoTip */
  tip?: React.ReactNode;
  hint?: React.ReactNode | null;
  hintTone?: Tone;
  /** 힌트 앞 글리프 스택(연결된 채널 아이콘 등) */
  hintLeading?: React.ReactNode;
  /** 12px tnum 줄 — 날짜·만료 등 */
  meta?: React.ReactNode;
  metaTone?: Tone;
  /** 오른쪽 슬롯. undefined 면 링크·버튼 행에 꺾쇠, null 이면 없음 */
  trailing?: React.ReactNode | null;
  busy?: boolean;
  className?: string;
  /** 행 아래 펼침 영역(인라인 편집 폼 등) */
  children?: React.ReactNode;
}

export function SettingsRow({
  href,
  external,
  asButton,
  type = "button",
  onClick,
  icon: Icon,
  leading,
  label,
  chip,
  tip,
  hint,
  hintTone = "sub",
  hintLeading,
  meta,
  metaTone = "sub",
  trailing,
  busy,
  className,
  children,
}: SettingsRowProps) {
  const interactive = Boolean(href || asButton);
  const hasLeading = Boolean(leading || Icon);
  const chevronOnly = trailing === undefined && interactive;
  const slot = trailing === undefined ? (interactive ? <ChevronRight className="size-4 shrink-0 text-fg-faint trans-state group-hover:text-fg-sub" aria-hidden /> : null) : trailing;

  const rootClass = cn(
    "group grid w-full items-center gap-x-3 gap-y-2 px-4 py-3 text-left",
    /* 꺾쇠뿐이면 좁은 화면에서도 오른쪽에 둔다. 버튼·컨트롤은 sm 미만에서 본문 아래로 내린다 */
    hasLeading
      ? chevronOnly
        ? "grid-cols-[auto_minmax(0,1fr)_auto]"
        : "grid-cols-[auto_minmax(0,1fr)] sm:grid-cols-[auto_minmax(0,1fr)_auto]"
      : chevronOnly
        ? "grid-cols-[minmax(0,1fr)_auto]"
        : "grid-cols-[minmax(0,1fr)] sm:grid-cols-[minmax(0,1fr)_auto]",
    interactive &&
      "trans-state hover:bg-tint-hover focus-visible:bg-tint-hover focus-visible:outline-2 focus-visible:outline-primary focus-visible:-outline-offset-2",
    busy && "opacity-60",
    className,
  );

  const body = (
    <>
      {hasLeading ? (
        leading ?? (
          <span className="flex size-9 shrink-0 items-center justify-center rounded-card bg-plate text-fg-sub" aria-hidden>
            {Icon ? <Icon className="size-4" /> : null}
          </span>
        )
      ) : null}
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="break-keep text-[15px] font-semibold leading-snug text-fg">{label}</span>
          {chip}
          {tip}
        </span>
        {hint ? (
          <span className={cn("mt-0.5 flex items-center gap-1.5 text-[14px] leading-snug", HINT_TONE[hintTone])}>
            {hintLeading}
            <span className="min-w-0 truncate">{hint}</span>
          </span>
        ) : null}
        {meta ? <span className={cn("tnum mt-0.5 block text-[12px] leading-snug", HINT_TONE[metaTone])}>{meta}</span> : null}
      </span>
      {slot ? (
        <span
          className={cn(
            "flex items-center gap-1.5",
            chevronOnly
              ? "justify-self-end"
              : hasLeading
                ? "col-start-2 sm:col-start-3 sm:justify-self-end"
                : "col-start-1 sm:col-start-2 sm:justify-self-end",
          )}
        >
          {slot}
        </span>
      ) : null}
    </>
  );

  let root: React.ReactNode;
  if (href && external) {
    root = (
      <a href={href} target="_blank" rel="noopener noreferrer" className={rootClass} aria-busy={busy || undefined}>
        {body}
      </a>
    );
  } else if (href) {
    root = (
      <Link href={href} className={rootClass} aria-busy={busy || undefined}>
        {body}
      </Link>
    );
  } else if (asButton) {
    root = (
      <button type={type} onClick={onClick} disabled={busy} className={rootClass} aria-busy={busy || undefined}>
        {body}
      </button>
    );
  } else {
    root = <div className={rootClass}>{body}</div>;
  }

  return (
    <li>
      {root}
      {children ? <div className={cn("px-4 pb-4", hasLeading && "sm:pl-16")}>{children}</div> : null}
    </li>
  );
}

/** 행 묶음 — 12px 그룹 라벨 + 카드 한 장(행 사이 헤어라인). overflow-hidden 은 호버 틴트를 모서리에 맞춰 자르기 위함 */
export function SettingsGroup({
  id,
  label,
  head,
  footer,
  children,
}: {
  id: string;
  label?: string;
  /** 카드 상단 — 열 머리(알림 매트릭스) 같은 것 */
  head?: React.ReactNode;
  /** 카드 하단 — 빈 상태·실패 상태 */
  footer?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const headingId = `settings-${id}`;
  return (
    <section aria-labelledby={label ? headingId : undefined}>
      {label ? (
        <h2 id={headingId} className="mb-2 px-1 text-[12px] font-semibold text-fg-sub">
          {label}
        </h2>
      ) : null}
      <Card className="overflow-hidden">
        {head}
        {children ? <ul className="divide-y divide-line">{children}</ul> : null}
        {footer}
      </Card>
    </section>
  );
}

/* ── 옛 이름(hub-row.tsx) 호환 — 허브 재작성 뒤 지운다 ── */
export const hubRowClass =
  "group flex w-full items-center gap-3 px-4 py-3.5 text-left trans-state hover:bg-tint-hover focus-visible:bg-tint-hover focus-visible:outline-none";

export function HubRowBody({
  icon: Icon,
  label,
  hint,
  hintTone = "sub",
}: {
  icon: LucideIcon;
  label: string;
  hint?: string | null;
  hintTone?: "sub" | "warning";
}) {
  return (
    <>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-card bg-plate text-fg-sub" aria-hidden>
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold text-fg">{label}</span>
        {hint ? <span className={cn("mt-0.5 block truncate text-[14px]", hintTone === "warning" ? "text-warning-strong" : "text-fg-sub")}>{hint}</span> : null}
      </span>
      <ChevronRight className="size-4 shrink-0 text-fg-faint trans-state group-hover:text-fg-sub" aria-hidden />
    </>
  );
}

export function HubRow(props: { href: string; icon: LucideIcon; label: string; hint?: string | null; hintTone?: "sub" | "warning" }) {
  return <SettingsRow href={props.href} icon={props.icon} label={props.label} hint={props.hint} hintTone={props.hintTone} />;
}

export function HubGroup({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <SettingsGroup id={id} label={label}>
      {children}
    </SettingsGroup>
  );
}
