"use client";

import { useRef, useState } from "react";
import { FileDown, Paperclip, X } from "lucide-react";
import { uploadLinkFile } from "../actions";
import { FinchLoader } from "@/components/ui/finch-loader";

/*
  파일 입력 — 「파일 공유」 블록(리틀리 흡수 4단계). 서버 액션이 Storage(link-assets/files/)에 올리고
  공개 URL 을 돌려준다. 20MB · PDF/ZIP/오피스/HWP/TXT/CSV/이미지.
*/
export function FileField({
  value,
  fileName,
  onChange,
}: {
  value: string;
  fileName: string;
  onChange: (next: { url: string; fileName: string; fileSize?: number }) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setError(null);
    if (f.size > 20 * 1024 * 1024) {
      setError("파일은 20MB 이하만 올릴 수 있어요.");
      return;
    }
    const r = new FileReader();
    r.onerror = () => setError("파일을 읽지 못했어요.");
    r.onload = async () => {
      setBusy(true);
      try {
        const res = await uploadLinkFile(String(r.result), f.name);
        if (!res.ok || !res.url) setError(res.error ?? "업로드하지 못했어요.");
        else onChange({ url: res.url, fileName: f.name, fileSize: res.size });
      } catch {
        setError("업로드하지 못했어요.");
      } finally {
        setBusy(false);
      }
    };
    r.readAsDataURL(f);
  }

  return (
    <div>
      <p className="text-[12px] font-medium text-fg-sub">파일</p>
      {value ? (
        <div className="mt-1.5 flex items-center gap-2 rounded-card border border-line bg-plate px-3 py-2">
          <FileDown className="size-4 shrink-0 text-fg-sub" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-[14px]">{fileName || value}</span>
          <button type="button" onClick={() => onChange({ url: "", fileName: "" })} aria-label="파일 제거" className="trans-state rounded-card p-1 text-fg-faint hover:bg-tint-hover hover:text-negative">
            <X className="size-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => ref.current?.click()}
          disabled={busy}
          className="trans-state mt-1.5 flex min-h-[96px] w-full flex-col items-center justify-center gap-1.5 rounded-card border border-dashed border-line bg-plate text-fg-sub hover:border-primary hover:text-fg"
        >
          {busy ? (
            <FinchLoader label="올리는 중…" />
          ) : (
            <>
              <Paperclip className="size-5" aria-hidden />
              <span className="text-[14px] font-medium">파일 올리기</span>
              <span className="text-[11px]">PDF·ZIP·DOCX·PPTX·XLSX·HWP·TXT·CSV · 20MB 이하</span>
            </>
          )}
        </button>
      )}
      <input ref={ref} type="file" hidden onChange={pick} accept=".pdf,.zip,.docx,.pptx,.xlsx,.hwp,.txt,.csv,image/png,image/jpeg,image/webp" />
      {error ? (
        <p role="alert" className="mt-1 text-[12px] text-negative-strong">
          {error}
        </p>
      ) : null}
    </div>
  );
}
