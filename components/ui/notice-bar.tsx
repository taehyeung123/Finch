import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/cn";

/*
  안내 띠 — 결과(저장했어요·실패했어요)와 주의(불러오지 못했어요)를 한 벌로 그린다(2026-09-03 설정 재설계).
  전에는 설정 페이지 6곳이 `rounded-card border border-{tone}/40 bg-{tone}-weak p-4 …` 를 손으로 반복했다.
  서버 컴포넌트에서도 쓴다(훅 없음). 쿼리 결과를 URL 에서 지우는 일은 ResultBanner(client)가 맡는다.

  · md(15px) — 방금 한 일의 결과. 문장 하나.
  · sm(14px, text-fg) — 조회 실패 같은 «아래 내용이 실제와 다를 수 있다» 주의. 아이콘만 톤 색.
*/
export type NoticeTone = "positive" | "warning" | "negative";

const TONE: Record<NoticeTone, { box: string; icon: typeof CheckCircle2; iconColor: string }> = {
  positive: { box: "border-positive/40 bg-positive-weak text-positive-strong", icon: CheckCircle2, iconColor: "text-positive" },
  warning: { box: "border-warning/40 bg-warning-weak text-warning-strong", icon: AlertTriangle, iconColor: "text-warning" },
  negative: { box: "border-negative/40 bg-negative-weak text-negative-strong", icon: XCircle, iconColor: "text-negative" },
};

export function NoticeBar({
  tone,
  role,
  size = "md",
  action,
  className,
  children,
}: {
  tone: NoticeTone;
  /** 기본: negative 는 alert, 나머지는 status */
  role?: "status" | "alert";
  size?: "md" | "sm";
  /** 오른쪽 링크·버튼 하나 */
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  const t = TONE[tone];
  const Icon = t.icon;
  return (
    <div
      role={role ?? (tone === "negative" ? "alert" : "status")}
      className={cn(
        "flex items-start gap-2.5 rounded-card border leading-snug break-keep",
        size === "sm" ? "px-4 py-3 text-[14px] text-fg" : "p-4 text-[15px]",
        size === "sm" ? t.box.replace(/ text-\S+$/, "") : t.box,
        className,
      )}
    >
      <Icon className={cn("mt-0.5 size-4 shrink-0", size === "sm" && t.iconColor)} aria-hidden />
      <div className="min-w-0 flex-1">{children}</div>
      {action ? <div className="shrink-0 text-[14px]">{action}</div> : null}
    </div>
  );
}
