import { ExternalLink } from "lucide-react";
import { Card } from "@/components/ui/card";
import { SettingsShell } from "../../_components/settings-shell";

/*
  앱 안 약관 문서 틀 — 이용약관·운영정책·환불정책·개인정보처리방침 네 화면이 같은 틀을 쓴다.
  본문은 공개 페이지와 같은 lib/legal/documents.ts. 공유·인쇄는 공개 페이지가 맡는다(새 창에서 열기).
*/
export function LegalDocShell({
  title,
  description,
  publicHref,
  children,
}: {
  title: string;
  description: string;
  publicHref: string;
  children: React.ReactNode;
}) {
  return (
    <SettingsShell
      title={title}
      description={description}
      action={
        <a
          href={publicHref}
          target="_blank"
          rel="noopener noreferrer"
          className="trans-state relative inline-flex items-center gap-1 py-2 text-[14px] font-medium text-fg-sub underline underline-offset-2 after:absolute after:-inset-x-2 after:inset-y-0 after:content-[''] hover:text-fg"
        >
          새 창에서 열기 <ExternalLink className="size-3.5" aria-hidden />
        </a>
      }
    >
      <Card className="p-4">{children}</Card>
    </SettingsShell>
  );
}
