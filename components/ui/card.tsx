import { cn } from "@/lib/cn";

/*
  카드 표면 — 2026-08-15 개편. 지면이 순백이 되면서 "테두리만"으로는 카드가
  지면에서 안 떨어진다(흰 판 위 흰 판). 그래서 헤어라인 + 미세 2겹 그림자를
  묶은 .card-face 로 간다. 다크는 --shadow-card 가 none 이라 테두리만 남는다
  — 밝기 단차가 이미 깊이를 만들기 때문이고, 이건 PART 7.2 그대로다.

  호버는 여전히 **요소를 움직이지 않는다**(translate/scale 금지). 선이 진해지고
  그림자가 한 칸 뜬다.
*/
export function Card({
  className,
  hover = false,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { hover?: boolean }) {
  return (
    <div
      className={cn(
        "card-face rounded-card",
        hover && "card-hover",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    /* 모바일에서는 동작 버튼을 아래로 내린다 — 제목 옆에 두면 좁은 폭에서 버튼이 눌려 찌그러지고,
       **화면 오른쪽 아래 구석**에 놓여 떠 있는 AI 버튼과 겹쳤다(2026-08-29 실측: 성장 진단의
       «AI 진단 받기» 가 통째로 가려짐). sm 부터는 원래대로 한 줄에 나란히. */
    <div className={cn("flex flex-col items-start gap-2.5 p-4 pb-0 sm:flex-row sm:items-start sm:justify-between sm:gap-3", className)}>
      <div className="min-w-0">
        <h3 className="text-[17px] font-semibold leading-snug">{title}</h3>
        {description ? <p className="mt-0.5 text-[14px] text-fg-sub">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function CardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-4", className)} {...props} />;
}
