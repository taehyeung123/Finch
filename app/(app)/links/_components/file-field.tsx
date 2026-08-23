"use client";

import { useRef, useState } from "react";
import { FileDown, Paperclip, X } from "lucide-react";
import { createLinkFileUpload, finalizeLinkFileUpload } from "../actions";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { FinchLoader } from "@/components/ui/finch-loader";

/*
  파일 입력 — 「파일 공유」 블록(리틀리 흡수 4단계). 서버 액션이 경로·서명 토큰만 내주고
  **브라우저가 Storage 에 직접** 올린다(link-assets/files/) — 서버 액션 본문으로 보내면 base64 로 부풀어
  본문 상한에 걸렸다(감사2 C3). 20MB · PDF/ZIP/오피스/HWP/TXT/CSV/이미지(파일 이름의 확장자로 판정).
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

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setError(null);
    if (f.size > 20 * 1024 * 1024) {
      setError("파일은 20MB 이하만 올릴 수 있어요.");
      return;
    }
    if (!isSupabaseConfigured()) {
      setError("데모 모드에서는 올릴 수 없어요.");
      return;
    }
    setBusy(true);
    try {
      const prep = await createLinkFileUpload(f.name, f.size);
      if (!prep.ok || !prep.path || !prep.token || !prep.url) {
        setError(prep.error ?? "업로드하지 못했어요.");
        return;
      }
      const { error: upErr } = await createClient()
        .storage.from("link-assets")
        .uploadToSignedUrl(prep.path, prep.token, f, { contentType: prep.contentType, upsert: false });
      if (upErr) {
        setError(/size|limit|large|too/i.test(upErr.message) ? "파일은 20MB 이하만 올릴 수 있어요." : "업로드하지 못했어요. 잠시 후 다시 시도해 주세요.");
        return;
      }
      /* 서버가 실제 크기를 다시 본다 — 상한을 넘겼으면 지우고 거절한다 */
      const done = await finalizeLinkFileUpload(prep.path);
      if (!done.ok) {
        setError(done.error ?? "업로드하지 못했어요.");
        return;
      }
      onChange({ url: prep.url, fileName: f.name, fileSize: done.size ?? f.size });
    } catch {
      setError("업로드하지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
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
      <input ref={ref} type="file" hidden onChange={pick} accept=".pdf,.zip,.docx,.pptx,.xlsx,.hwp,.txt,.csv,.png,.jpg,.jpeg,.webp" />
      {error ? (
        <p role="alert" className="mt-1 text-[12px] text-negative-strong">
          {error}
        </p>
      ) : null}
    </div>
  );
}
