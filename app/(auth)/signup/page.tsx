"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

/** 회원가입 — 목 인증, 가입 후 온보딩으로 이동 (PRD PART 5) */
export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;
    router.push("/onboarding");
  }

  return (
    <div className="mx-auto w-full max-w-md rounded-card border border-line bg-body p-8">
      <h1 className="text-2xl font-bold leading-tight">무료로 시작하기</h1>
      <p className="mt-1 text-[15px] text-fg-sub">신용카드 없이 시작할 수 있어요</p>

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
          <label htmlFor="signup-name" className="mb-1.5 block text-[13px] font-medium text-fg-sub">
            이름
          </label>
          <input
            id="signup-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="홍길동"
            autoComplete="name"
            className="h-10 w-full rounded-card border border-line bg-overlay px-3 text-[15px] text-fg placeholder:text-fg-faint transition-colors hover:border-line-strong focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
          />
        </div>
        <div>
          <label htmlFor="signup-email" className="mb-1.5 block text-[13px] font-medium text-fg-sub">
            이메일
          </label>
          <input
            id="signup-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            className="h-10 w-full rounded-card border border-line bg-overlay px-3 text-[15px] text-fg placeholder:text-fg-faint transition-colors hover:border-line-strong focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
          />
        </div>
        <Button type="submit" className="w-full" disabled={!name.trim() || !email.trim()}>
          가입하기
        </Button>
        <p className="text-center text-xs text-fg-faint">
          가입 시 이용약관과 개인정보처리방침에 동의하게 됩니다 (문서 준비 중)
        </p>
      </form>

      <p className="mt-6 text-center text-[13px] text-fg-sub">
        이미 계정이 있나요?{" "}
        <Link href="/login" className="font-semibold text-primary hover:text-primary-hover">
          로그인
        </Link>
      </p>
    </div>
  );
}
