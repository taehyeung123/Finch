"use client";

import { useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { uploadLinkImage } from "../actions";

/*
  이미지 입력 — 업로드 또는 주소 붙여넣기.

  둘 다 두는 이유: 업로드가 실사용의 기본이지만, 이미 다른 곳(노션·드롭박스·기존
  사이트)에 올려둔 이미지를 쓰는 경우가 많다. 링크팜은 업로드만 준다.

  업로드는 서버 액션(uploadLinkImage)이 Storage 에 올리고 공개 URL 을 돌려준다 —
  화면은 그 URL 을 값으로 들고 있을 뿐이라, 저장 로직이 블록·프로필에서 동일해진다.
*/
export function ImageField({
  value,
  onChange,
  label,
  hint,
  aspect = "aspect-[16/9]",
}: {
  value: string;
  onChange: (url: string) => void;
  label: string;
  hint?: string;
  /** 미리보기 비율 — 프로필은 정사각, 커버는 3:1 */
  aspect?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    /* 같은 파일을 다시 고를 수 있게 즉시 비운다 — 안 그러면 onChange 가 안 뜬다 */
    e.target.value = "";
    if (!f) return;
    setError(null);
    setBusy(true);

    const r = new FileReader();
    r.onerror = () => {
      setError("파일을 읽지 못했어요.");
      setBusy(false);
    };
    r.onload = async () => {
      try {
        const res = await uploadLinkImage(String(r.result));
        if (!res.ok || !res.url) setError(res.error ?? "업로드하지 못했어요.");
        else onChange(res.url);
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
      <p className="text-[12px] font-medium text-fg-sub">{label}</p>

      {value ? (
        <div className="mt-1.5 space-y-2">
          <div className={`relative overflow-hidden rounded-card border border-line bg-plate ${aspect}`}>
            {/* eslint-disable-next-line @next/next/no-img-element -- Storage 공개 URL·외부 URL 혼용 */}
            <img src={value} alt="" className="size-full object-cover" />
            <button
              type="button"
              onClick={() => onChange("")}
              aria-label="이미지 제거"
              className="trans-state absolute right-2 top-2 rounded-card bg-scrim p-1.5 text-on-scrim hover:opacity-80"
            >
              <X className="size-3.5" />
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className={`trans-state mt-1.5 flex w-full flex-col items-center justify-center gap-1.5 rounded-card border border-dashed border-line bg-plate text-fg-sub hover:border-primary hover:text-fg disabled:opacity-50 ${aspect}`}
        >
          <ImagePlus className="size-5" aria-hidden />
          <span className="text-[13px] font-medium">{busy ? "올리는 중…" : "이미지 올리기"}</span>
          <span className="text-[11px]">PNG·JPG·WEBP · 2MB 이하</span>
        </button>
      )}

      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" hidden onChange={pick} />

      {/* 주소 붙여넣기 — 이미 다른 곳에 올려둔 이미지를 쓰는 경우가 많다 */}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="또는 이미지 주소 붙여넣기"
        aria-label={`${label} 주소`}
        className="mt-2 h-9 w-full rounded-card border border-line bg-body px-2.5 text-[13px] text-fg placeholder:text-fg-faint focus:border-primary focus:outline-none"
      />

      {error ? (
        <p role="alert" className="mt-1 text-[12px] text-negative-strong">
          {error}
        </p>
      ) : null}
      {hint && !error ? <p className="mt-1 text-[12px] text-fg-sub">{hint}</p> : null}
    </div>
  );
}
