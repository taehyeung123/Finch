"use client";

import { useRef, useState } from "react";
import { FileDown, Paperclip, X } from "lucide-react";
import { createLinkFileUpload, finalizeLinkFileUpload } from "../actions";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { FinchLoader } from "@/components/ui/finch-loader";

/*
  파일 입력 — 「파일 공유」 블록(리틀리 흡수 4단계). 서버 액션이 경로·서명 토큰만 내주고
  **브라우저가 Storage 에 직접** 올린다(link-assets/files/) — 서버 액션 본문으로 보내면 base64 로 부풀어
  본문 상한에 걸렸다(감사2 C3). 20MB · PDF/ZIP/오피스/HWP/TXT/CSV/이미지(파일 이름의 확장자로 판정).

  ⚠️ 브라우저 Supabase 클라이언트(@/lib/supabase/client)는 **정적으로 import 하지 않는다.**
  이 파일이 링크 편집기(links-client)에 딸려 있어서, 최상위 import 한 줄이 /links 첫 번들에 supabase-js 전체
  (인증·실시간·스토리지, 약 240KB)를 끌고 들어갔다 — 「파일 공유」 블록에서 파일을 올릴 때만 쓰는데.
  업로드 순간에 동적으로 받고(pick), 파일 선택 버튼을 누를 때 미리 받아 둔다(선택창이 떠 있는 동안 도착한다).
*/

/** 업로드에만 쓰는 브라우저 Supabase 클라이언트 — 청크를 필요할 때 받는다(위 주석) */
const loadSupabaseClient = () => import("@/lib/supabase/client");
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
      setError("지금은 예시 화면이라 올릴 수 없어요.");
      return;
    }
    setBusy(true);
    try {
      const prep = await createLinkFileUpload(f.name, f.size);
      if (!prep.ok || !prep.path || !prep.token || !prep.url || !prep.contentType) {
        setError(prep.error ?? "업로드하지 못했어요.");
        return;
      }
      /* storage-js 는 Blob/File 을 multipart 로 보내며 contentType 옵션을 무시한다 — 파트의 Content-Type 은 File.type 이라
         서버가 정한 형식으로 감싼다. 안 그러면 윈도우의 .zip(x-zip-compressed)·.csv(vnd.ms-excel)·.hwp("") 가
         버킷 허용 목록(0059)에 걸린다(감사3 C1) */
      const body = new File([f], f.name, { type: prep.contentType });
      /* 청크 로드 실패(오프라인·배포 직후 옛 탭)도 이 try 의 catch 가 받는다 — 다른 경로로 다시 받는 폴백은 두지 않는다 */
      const { createClient } = await loadSupabaseClient();
      const { error: upErr } = await createClient().storage.from("link-assets").uploadToSignedUrl(prep.path, prep.token, body, { upsert: false });
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
          onClick={() => {
            /* 예열 — 실패해도 조용히 넘어간다. 본 경로(pick)의 await 가 다시 받는다(런타임이 실패한 청크를 캐시에서 지운다) */
            void loadSupabaseClient().catch(() => {});
            ref.current?.click();
          }}
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
