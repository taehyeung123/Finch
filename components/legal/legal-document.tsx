import Link from "next/link";
import { AppLink } from "@/components/ui/app-link";
import type { LegalBlock, LegalDoc, LegalListItem, LegalSection } from "@/lib/legal/doc-types";
import { koDate } from "@/lib/legal/versions";
import { cn } from "@/lib/cn";

/*
  약관·방침 본문 렌더러 — 마케팅(/terms·/privacy·/terms/operation·/terms/refund)과 앱(/settings/legal/*)이 같은 컴포넌트를 쓴다.
  페이지가 h1 을 그리고, 이 컴포넌트는 공고·시행일 줄 + 목차 + 장(h2)·조항(h3, 장이 없으면 h2)을 담당한다.
  variant: marketing 은 디스플레이 스케일(조항 제목 19~20px), app 은 앱 타입 스케일(카드 안).

  2026-09 정식본: «초안» 안내 상자를 뗐다. 본문은 문단 문자열에서 블록(문단·목록·표·보조 설명·링크)으로 바뀌었다
  (lib/legal/doc-types.ts). 표는 좁은 화면에서 가로로 스크롤된다 — 페이지 전체가 옆으로 밀리지 않게.
*/

type Variant = "marketing" | "app";

/* 앱 안에서 본문 링크를 누르면 앱 안 사본으로 간다 — 로그인 화면에서 마케팅 지면으로 튕겨 나가지 않게.
   목록에 없는 공개 페이지(개정 안내·이전 문서·신고)는 새 창으로 연다. */
const APP_HREF: Readonly<Record<string, string>> = {
  "/terms": "/settings/legal/terms",
  "/terms/operation": "/settings/legal/operation",
  "/terms/refund": "/settings/legal/refund",
  "/privacy": "/settings/legal/privacy",
};

const linkCls =
  "trans-state -my-2 inline-block py-2 text-[14px] font-medium text-fg-sub underline underline-offset-2 hover:text-fg";

function DocLink({ href, label, variant }: { href: string; label: string; variant: Variant }) {
  if (variant === "app") {
    const inApp = APP_HREF[href];
    if (inApp) {
      return (
        <AppLink href={inApp} className={linkCls}>
          {label}
        </AppLink>
      );
    }
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={linkCls}>
        {label}
      </a>
    );
  }
  return (
    <Link href={href} className={linkCls}>
      {label}
    </Link>
  );
}

/* 한글은 단어 중간에서 끊기지 않게(break-keep), 긴 주소·영문 토큰은 필요하면 끊는다(wrap-anywhere) — 모바일 기본기 */
const textCls = "break-keep wrap-anywhere";

function ListItems({ items, ordered, nested = false }: { items: readonly LegalListItem[]; ordered?: boolean; nested?: boolean }) {
  const Tag = ordered ? "ol" : "ul";
  return (
    <Tag
      className={cn(
        "space-y-1.5 pl-5",
        ordered ? "list-decimal" : nested ? "list-[circle]" : "list-disc",
        "marker:text-fg-faint",
        nested && "mt-1.5",
      )}
    >
      {items.map((item, i) => {
        const text = typeof item === "string" ? item : item.text;
        return (
          <li key={`${i}-${text.slice(0, 24)}`} className={textCls}>
            {text}
            {typeof item === "string" ? null : <ListItems items={item.sub} nested />}
          </li>
        );
      })}
    </Tag>
  );
}

function Block({ block, variant }: { block: LegalBlock; variant: Variant }) {
  if ("p" in block) {
    return <p className={cn(textCls, block.strong && "font-semibold text-fg")}>{block.p}</p>;
  }
  if ("list" in block) {
    return <ListItems items={block.list} ordered={block.ordered} />;
  }
  if ("table" in block) {
    const { head, rows } = block.table;
    return (
      /* 넓은 표는 이 상자 안에서만 가로로 스크롤된다 — 본문 폭은 그대로 */
      <div className="overflow-x-auto rounded-card border border-line bg-body">
        <table className={cn("w-full border-collapse text-left text-[14px] leading-relaxed", head.length >= 5 ? "min-w-[56rem]" : head.length >= 3 ? "min-w-[36rem]" : "")}>
          <thead className="bg-plate">
            <tr>
              {head.map((h) => (
                <th key={h} scope="col" className="break-keep px-3 py-2 font-semibold text-fg">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={`${ri}-${row[0]}`} className="border-t border-line align-top">
                {row.map((cell, ci) => (
                  <td key={ci} className={cn(textCls, "px-3 py-2", ci === 0 ? "font-medium text-fg" : "text-fg-sub")}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  if ("note" in block) {
    return <p className={cn(textCls, "border-l-2 border-line pl-3 text-[14px] text-fg-sub")}>{block.note}</p>;
  }
  return (
    <p className="flex flex-wrap gap-x-5 gap-y-1">
      {block.links.map((l) => (
        <DocLink key={l.href} href={l.href} label={l.label} variant={variant} />
      ))}
    </p>
  );
}

/** 블록 묶음 — 개정 안내·환불정책 머리말처럼 조항 없이 블록만 그릴 때도 쓴다 */
export function LegalBlocks({ blocks, variant = "marketing", className }: { blocks: readonly LegalBlock[]; variant?: Variant; className?: string }) {
  return (
    <div className={cn("space-y-3 text-[15px] leading-relaxed text-fg-sub", className)}>
      {blocks.map((b, i) => (
        <Block key={i} block={b} variant={variant} />
      ))}
    </div>
  );
}

/** 조항 목록 — 장(chapter)이 있으면 장 제목(h2) 아래 조항(h3), 없으면 조항이 h2 */
export function LegalSections({ sections, variant = "marketing", className }: { sections: readonly LegalSection[]; variant?: Variant; className?: string }) {
  const app = variant === "app";
  const hasChapters = sections.some((s) => s.chapter);
  const Article = hasChapters ? "h3" : "h2";
  return (
    <div className={cn(app ? "space-y-7" : "space-y-10", className)}>
      {sections.map((s) => (
        <section key={s.id} id={s.id} className="scroll-mt-24">
          {s.chapter ? (
            <h2 className={cn("border-t border-line pt-6 font-bold", app ? "mb-4 text-[17px]" : "mb-6 text-xl md:text-2xl")}>{s.chapter}</h2>
          ) : null}
          <Article
            className={cn(
              hasChapters ? (app ? "text-[15px] font-semibold" : "text-[19px] font-bold") : app ? "text-[17px] font-semibold" : "text-[19px] font-bold md:text-xl",
            )}
          >
            {s.title}
          </Article>
          <LegalBlocks blocks={s.blocks} variant={variant} className={app ? "mt-2" : "mt-3"} />
        </section>
      ))}
    </div>
  );
}

/** 공고일·시행일 줄 */
export function LegalMeta({ doc, variant = "marketing" }: { doc: Pick<LegalDoc, "announcedAt" | "effectiveAt" | "effectiveNote">; variant?: Variant }) {
  return (
    <p className={cn("break-keep text-fg-sub", variant === "app" ? "text-[14px]" : "text-[15px]")}>
      {doc.announcedAt ? <>공고 {koDate(doc.announcedAt)} · </> : null}
      시행 {koDate(doc.effectiveAt)}
      {doc.effectiveNote ? <> ({doc.effectiveNote})</> : null}
    </p>
  );
}

/** 목차 — 조항이 38개라 원하는 조로 바로 가는 길이 필요하다. 접힌 채로 둔다(스크립트 없이 details). */
function LegalToc({ sections, variant }: { sections: readonly LegalSection[]; variant: Variant }) {
  return (
    <details className={cn("rounded-card border border-line bg-body", variant === "app" ? "mt-4" : "mt-6")}>
      <summary className="cursor-pointer select-none px-4 py-3 text-[14px] font-semibold text-fg">목차</summary>
      <ol className="columns-1 gap-6 border-t border-line px-4 py-3 text-[14px] sm:columns-2 [&>li:first-child>p]:mt-0">
        {sections.map((s) => (
          <li key={s.id} className="break-inside-avoid">
            {s.chapter ? <p className="mt-3 break-keep text-[12px] font-semibold text-fg-sub">{s.chapter}</p> : null}
            <a href={`#${s.id}`} className="-my-0.5 inline-block break-keep py-1.5 text-fg-sub underline-offset-2 hover:text-fg hover:underline">
              {s.title}
            </a>
          </li>
        ))}
      </ol>
    </details>
  );
}

/** 문서 한 벌 — 공고·시행일, 머리말, 목차, 조항 */
export function LegalDocument({ doc, variant = "marketing", className }: { doc: LegalDoc; variant?: Variant; className?: string }) {
  const app = variant === "app";
  return (
    <div className={className}>
      <LegalMeta doc={doc} variant={variant} />
      {doc.intro ? <LegalBlocks blocks={doc.intro} variant={variant} className="mt-4" /> : null}
      <LegalToc sections={doc.sections} variant={variant} />
      <LegalSections sections={doc.sections} variant={variant} className={app ? "mt-6" : "mt-10"} />
    </div>
  );
}
