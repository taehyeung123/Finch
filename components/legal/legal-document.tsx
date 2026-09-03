import { LEGAL_DRAFT_NOTICE, type LegalSection } from "@/lib/legal/documents";
import { cn } from "@/lib/cn";

/*
  약관·방침 본문 렌더러 — 마케팅(/terms·/privacy)과 앱(/settings/legal/*) 이 같은 컴포넌트를 쓴다.
  페이지가 h1 을 그리고, 이 컴포넌트는 고지 + 조항(h2) 만 담당한다.
  variant: marketing 은 디스플레이 스케일(19~20px 조항 제목), app 은 앱 타입 스케일(17px, 카드 안).
*/
export function LegalDocument({
  sections,
  variant = "marketing",
  className,
}: {
  sections: LegalSection[];
  variant?: "marketing" | "app";
  className?: string;
}) {
  const app = variant === "app";
  return (
    <div className={className}>
      <div
        className={cn(
          "flex items-start gap-2.5 rounded-card border border-warning/40 bg-warning-weak p-4 leading-relaxed text-fg-sub",
          app ? "text-[14px]" : "text-[13px]",
        )}
      >
        <span aria-hidden className="mt-0.5 shrink-0 font-semibold text-warning">
          안내
        </span>
        <p>{LEGAL_DRAFT_NOTICE}</p>
      </div>

      <div className={cn(app ? "mt-6 space-y-7" : "mt-10 space-y-10")}>
        {sections.map((s) => (
          <section key={s.title}>
            <h2 className={cn("font-bold", app ? "text-[17px] font-semibold" : "text-[19px] md:text-xl")}>{s.title}</h2>
            <div className={cn("space-y-2.5 leading-relaxed text-fg-sub", app ? "mt-2 text-[15px]" : "mt-3 text-[15px]")}>
              {s.body.map((p) => (
                <p key={p}>{p}</p>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
