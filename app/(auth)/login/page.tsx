"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

/** 로그인 — 목 인증, 실제 OAuth는 최후순위 (PRD PART 5) */
export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [demoNotice, setDemoNotice] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setDemoNotice(true);
    router.push("/dashboard");
  }

  return (
    <div className="mx-auto w-full max-w-md rounded-card border border-line bg-body p-8">
      <h1 className="text-2xl font-bold leading-tight">로그인</h1>
      <p className="mt-1 text-[15px] text-fg-sub">핀치 계정으로 계속하세요.</p>

      {/* 소셜 로그인 — 앱 심사 전 비활성 (목 UI) */}
      <div className="mt-6 space-y-2">
        <Button type="button" variant="secondary" className="w-full">
          Google로 계속하기
        </Button>
        <Button type="button" variant="secondary" className="w-full">
          Facebook으로 계속하기
        </Button>
        <p className="text-center text-xs text-fg-faint">
          소셜 로그인은 플랫폼 앱 심사 후 활성화됩니다
        </p>
      </div>

      <div className="my-6 flex items-center gap-3" aria-hidden>
        <span className="h-px flex-1 bg-line" />
        <span className="text-xs text-fg-faint">또는</span>
        <span className="h-px flex-1 bg-line" />
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label htmlFor="login-email" className="mb-1.5 block text-[13px] font-medium text-fg-sub">
            이메일
          </label>
          <input
            id="login-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            className="h-10 w-full rounded-card border border-line bg-overlay px-3 text-[15px] text-fg placeholder:text-fg-faint transition-colors hover:border-line-strong focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
          />
        </div>
        <Button type="submit" className="w-full" disabled={!email.trim()}>
          이메일로 계속하기
        </Button>
        {demoNotice ? (
          <p className="text-center text-xs text-fg-faint" role="status">
            데모 모드: 대시보드로 이동합니다
          </p>
        ) : null}
      </form>

      <p className="mt-6 text-center text-[13px] text-fg-sub">
        아직 계정이 없나요?{" "}
        <Link href="/signup" className="font-semibold text-primary hover:text-primary-hover">
          회원가입
        </Link>
      </p>
    </div>
  );
}
