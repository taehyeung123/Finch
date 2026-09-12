import Link from "next/link";
import { cn } from "@/lib/cn";

/*
  공개 약관 페이지의 틀 — /terms · /terms/operation · /terms/refund · /privacy 와 개정 안내·이전 문서가 같은 폭·제목·문서 목록을 쓴다.
  예전엔 두 페이지가 section·h1 을 각자 손으로 짰다. 문서가 넷으로 늘어 한 곳에 모았다.
*/

export type LegalDocKey = "terms" | "operation" | "refund" | "privacy";

const DOCS: ReadonlyArray<{ key: LegalDocKey; label: string; href: string }> = [
  { key: "terms", label: "이용약관", href: "/terms" },
  { key: "operation", label: "운영정책", href: "/terms/operation" },
  { key: "refund", label: "환불정책", href: "/terms/refund" },
  /* 개인정보처리방침은 다른 문서와 구분되게 굵게(개인정보 처리방침 작성지침의 권고) */
  { key: "privacy", label: "개인정보처리방침", href: "/privacy" },
];

/** 문서 사이를 오가는 줄 — 지금 문서는 링크가 아니라 표시만 */
export function LegalDocNav({ current }: { current?: LegalDocKey }) {
  return (
    <nav aria-label="약관 및 정책" className="mt-4 flex flex-wrap gap-2">
      {DOCS.map((d) =>
        d.key === current ? (
          <span key={d.key} aria-current="page" className="rounded-chip border border-fg bg-body px-3 py-1.5 text-[14px] font-semibold text-fg">
            {d.label}
          </span>
        ) : (
          <Link
            key={d.key}
            href={d.href}
            className={cn(
              "trans-state rounded-chip border border-line bg-body px-3 py-1.5 text-[14px] text-fg-sub hover:border-fg-faint hover:text-fg",
              d.key === "privacy" && "font-semibold",
            )}
          >
            {d.label}
          </Link>
        ),
      )}
    </nav>
  );
}

export function MarketingLegalPage({
  title,
  current,
  children,
}: {
  title: string;
  /** 문서 목록에서 지금 문서를 표시한다. 개정 안내·이전 문서처럼 목록 밖이면 비운다 */
  current?: LegalDocKey;
  children: React.ReactNode;
}) {
  return (
    <section className="mx-auto max-w-3xl px-4 py-16 md:px-6">
      <h1 className="break-keep text-3xl font-bold tracking-tight md:text-4xl">{title}</h1>
      <LegalDocNav current={current} />
      <div className="mt-6">{children}</div>
    </section>
  );
}
