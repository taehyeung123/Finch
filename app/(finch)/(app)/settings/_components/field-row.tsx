import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";

/*
  사실 행(dl) — «라벨 : 값» 으로 읽는 정보(개인정보·사업자 정보·동의 기록·결제 카드). 2026-09-03 재설계.
  SettingsRow(항목 행)와 함께 설정의 행 문법 둘 중 하나다.
  데스크톱: [라벨 9rem | 값(+힌트) | 액션] · 모바일: 라벨 12px 위 / 값 아래 두 줄, 액션은 오른쪽.
  빈 값은 fg-sub 로 «—» 또는 호출부가 준 문구(«준비 중»처럼 항목마다 «왜 없는지»가 다르다).
*/
export function FieldRow({
  label,
  value,
  empty = "—",
  hint,
  tip,
  action,
  tnum,
  children,
}: {
  label: string;
  value?: React.ReactNode;
  /** 값이 없을 때 대신 적을 문구 */
  empty?: React.ReactNode;
  hint?: React.ReactNode;
  tip?: React.ReactNode;
  /** 오른쪽 슬롯 하나(버튼·링크) */
  action?: React.ReactNode;
  tnum?: boolean;
  /** 행 아래 펼침 영역(인라인 편집 폼) */
  children?: React.ReactNode;
}) {
  const hasValue = value !== undefined && value !== null && value !== "";
  return (
    <div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 px-4 py-3 sm:grid-cols-[9rem_minmax(0,1fr)_auto]">
        <dt className="flex items-center gap-1 text-[12px] font-medium text-fg-sub sm:text-[14px] sm:font-normal">
          {label}
          {tip}
        </dt>
        <dd className="row-start-2 min-w-0 sm:row-start-auto">
          <div className={cn("break-keep text-[15px] text-fg", tnum && "tnum")}>{hasValue ? value : <span className="text-fg-sub">{empty}</span>}</div>
          {hint ? <p className="mt-0.5 text-[12px] text-fg-sub">{hint}</p> : null}
        </dd>
        {action ? <div className="col-start-2 row-span-2 self-center sm:col-start-3 sm:row-span-1">{action}</div> : null}
      </div>
      {children ? <div className="px-4 pb-4 sm:pl-[calc(9rem+1rem)]">{children}</div> : null}
    </div>
  );
}

/** dl 판 SettingsGroup — 12px 그룹 라벨 + 카드 + 행 사이 헤어라인 */
export function FieldList({
  id,
  label,
  description,
  footer,
  children,
}: {
  id: string;
  label?: string;
  /** 라벨 아래 한 줄(14px) — 근거·범위 설명 */
  description?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  const headingId = `fields-${id}`;
  return (
    <section aria-labelledby={label ? headingId : undefined}>
      {label ? (
        <div className="mb-2 px-1">
          <h2 id={headingId} className="text-[12px] font-semibold text-fg-sub">
            {label}
          </h2>
          {description ? <p className="mt-0.5 text-[14px] text-fg-sub">{description}</p> : null}
        </div>
      ) : null}
      <Card className="overflow-hidden">
        <dl className="divide-y divide-line">{children}</dl>
        {footer}
      </Card>
    </section>
  );
}
