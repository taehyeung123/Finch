"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { unlockLinkPage } from "../actions";
import type { LpText } from "@/lib/links/i18n";

/*
  비밀번호 페이지 잠금 화면(리틀리 「공개/비공개: 비밀번호」 카피, 5단계).
  맞으면 서버가 HttpOnly 열림 쿠키를 심고, 여기선 router.refresh() 로 같은 주소를 다시 그린다.
  색은 테마 변수(--lp-*)만 — 방문자의 브랜드 화면이다.
*/
export function LockScreen({ slug, message, t }: { slug: string; message: string; t: LpText["lock"] }) {
  const [pw, setPw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const r = await unlockLinkPage(slug, pw);
          if (!r.ok) setError(r.error ?? t.wrong);
          else router.refresh();
        });
      }}
      className="w-full max-w-[360px] rounded-[var(--lp-radius)] border border-[var(--lp-border)] bg-[var(--lp-card)] p-6 text-center shadow-[var(--lp-shadow)]"
    >
      <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-[var(--lp-accent)] text-[var(--lp-on-accent)]" aria-hidden>
        <Lock className="size-5" />
      </span>
      <h1 className="mt-4 text-[20px] font-bold leading-[1.3] tracking-normal text-[var(--lp-fg)]">{t.title}</h1>
      {message ? <p className="mt-1.5 whitespace-pre-wrap text-[14px] leading-[1.6] text-[var(--lp-muted)]">{message}</p> : null}
      <input
        type="password"
        value={pw}
        onChange={(e) => setPw(e.target.value)}
        placeholder={t.placeholder}
        aria-label={t.placeholder}
        autoComplete="off"
        maxLength={32}
        required
        className="mt-5 h-12 w-full rounded-[var(--lp-radius)] border border-[var(--lp-border)] bg-[var(--lp-bg)] px-3 text-center text-[16px] text-[var(--lp-fg)] placeholder:text-[var(--lp-muted)] focus:border-[var(--lp-accent)] focus:outline-none"
      />
      {error ? (
        <p role="alert" className="mt-2 text-[13px] text-[var(--lp-fg)]">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="mt-3 flex min-h-[48px] w-full items-center justify-center rounded-[var(--lp-radius-btn)] bg-[var(--lp-accent)] text-[15px] font-semibold text-[var(--lp-on-accent)] transition-opacity hover:opacity-85 disabled:opacity-60"
      >
        {pending ? t.checking : t.submit}
      </button>
    </form>
  );
}
