"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { DangerZone } from "@/app/(finch)/(app)/settings/profile/_components/danger-zone";
import {
  JOIN_DECLINE_CONFIRM,
  JOIN_MARKETING_SUMMARY,
  JOIN_PRIVACY_SUMMARY,
  UPDATE_CHANGES,
  UPDATE_LEAD,
} from "@/lib/legal/consent-copy";
import { declineConsent, saveConsent, withdrawFromConsent, type ConsentFormState } from "./actions";

/*
  가입 필수 동의 폼 — 첫 로그인 직후 (app) 레이아웃 게이트가 여기로 보낸다.

  항목을 **구분해서** 각각 받는다(개인정보보호법 §22 — 묶음 문구 한 줄은 동의가 아니다).
  광고성 정보 수신은 선택임을 표기하고, 미동의로 가입을 막지 않는다(정보통신망법 §50). 미리 체크하지 않는다.

  «동의하지 않기»가 반드시 있어야 한다 — 첫 로그인 순간 이메일이 이미 저장돼 있는데
  탈퇴 화면은 게이트 뒤라, 이 화면에 삭제 경로가 없으면 거부자가 순환에 갇힌다(감사 적발).

  2026-09 약관 개정: 옛 약관에 동의한 기존 회원에게는 update 모양을 그린다(바뀐 약관 동의 하나만).
  그 회원에게 «동의하지 않고 나가기(즉시 삭제)»를 보이면 안 된다 — 확인 없이 쌓아 온 채널·페이지·크레딧이 지워진다.
  대신 공고 기간엔 «나중에 할게요», 시행일 뒤엔 로그아웃과 확인 문구를 타이핑하는 회원 탈퇴를 둔다.
*/

const INITIAL: ConsentFormState = { error: null };

const ERROR_TEXT: Record<string, string> = {
  decline_failed: "계정 삭제 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요.",
  withdraw_confirm: "확인 문구가 맞지 않아 탈퇴하지 않았어요. 다시 입력해 주세요.",
  withdraw_failed: "탈퇴 처리 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요.",
};

const docLink = "-my-2 inline-block py-2.5 underline underline-offset-2 hover:text-fg";

function Tag({ required }: { required: boolean }) {
  /* 원색 코랄은 흰 지면 대비 2.8:1 — 글자는 primary-ink 다(globals.css 토큰 규칙) */
  return <span className={required ? "font-semibold text-primary-ink" : "font-semibold"}>[{required ? "필수" : "선택"}]</span>;
}

function Row({
  name,
  required,
  checked,
  onChange,
  children,
}: {
  name: string;
  required: boolean;
  checked: boolean;
  onChange: (v: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-card px-4 py-2.5 trans-state hover:bg-tint-hover">
      <input
        type="checkbox"
        name={name}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-5 shrink-0 accent-primary"
      />
      <span className="break-keep text-[15px] text-fg-sub">
        <Tag required={required} /> {children}
      </span>
    </label>
  );
}

/** 펼쳐 보는 안내 — 체크박스 label 밖에 둔다(label 안의 summary 를 누르면 체크가 같이 바뀐다) */
function Details({ summary, children }: { summary: string; children: React.ReactNode }) {
  return (
    <details className="ml-12 mr-4 text-[14px] text-fg-sub">
      <summary className="-my-1 cursor-pointer select-none py-1 underline underline-offset-2 hover:text-fg">{summary}</summary>
      <div className="mt-1.5 space-y-1 break-keep rounded-card border border-line bg-plate p-3 leading-relaxed">{children}</div>
    </details>
  );
}

function ErrorBox({ text }: { text: string }) {
  return (
    <p role="alert" className="mt-4 rounded-card bg-negative-weak p-3 text-[14px] text-negative-strong">
      {text}
    </p>
  );
}

/* ── 첫 가입 ── */
function JoinForm({ error }: { error: string | null }) {
  const [checked, setChecked] = useState({ over14: false, terms: false, privacy: false, marketing: false });
  const [state, formAction, pending] = useActionState(saveConsent, INITIAL);
  const allChecked = checked.over14 && checked.terms && checked.privacy && checked.marketing;
  const requiredOk = checked.over14 && checked.terms && checked.privacy;
  const set = (k: keyof typeof checked) => (v: boolean) => setChecked((c) => ({ ...c, [k]: v }));

  return (
    <div className="rounded-card border border-line bg-body p-8">
      <h1 className="text-2xl font-bold leading-tight">서비스 이용 동의</h1>
      <p className="mt-1 text-[15px] text-fg-sub">핀치를 이용하려면 아래 필수 항목이 필요해요.</p>

      <form action={formAction}>
        {/* 전체 동의 — 관행상 편의 스위치일 뿐, 실제 제출값은 개별 체크박스다 */}
        <label className="mt-6 flex cursor-pointer items-center gap-3 rounded-card border border-line bg-overlay px-4 py-3.5">
          <input
            type="checkbox"
            checked={allChecked}
            onChange={() => {
              const next = !allChecked;
              setChecked({ over14: next, terms: next, privacy: next, marketing: next });
            }}
            className="size-5 shrink-0 accent-primary"
          />
          <span className="text-[15px] font-semibold">전체 동의 (선택 항목 포함)</span>
        </label>

        <div className="mt-2 space-y-1">
          <Row name="over14" required checked={checked.over14} onChange={set("over14")}>
            만 14세 이상이에요
          </Row>
          <Row name="terms" required checked={checked.terms} onChange={set("terms")}>
            <Link href="/terms" target="_blank" onClick={(e) => e.stopPropagation()} className={docLink}>
              이용약관
            </Link>
            (
            <Link href="/terms/operation" target="_blank" onClick={(e) => e.stopPropagation()} className={docLink}>
              운영정책
            </Link>{" "}
            포함)에 동의해요
          </Row>
          <Row name="privacy" required checked={checked.privacy} onChange={set("privacy")}>
            개인정보 수집·이용 안내를 확인했어요
          </Row>
          <Details summary="자세히">
            {JOIN_PRIVACY_SUMMARY.map((l) => (
              <p key={l.label}>
                <span className="font-semibold text-fg">{l.label}</span> {l.text}
              </p>
            ))}
            <p>
              <Link href="/privacy" target="_blank" className="underline underline-offset-2 hover:text-fg">
                개인정보처리방침 전문 보기
              </Link>
            </p>
          </Details>
          <Row name="marketing" required={false} checked={checked.marketing} onChange={set("marketing")}>
            광고성 정보(이메일) 수신에 동의해요
          </Row>
          <Details summary="내용 보기">
            {JOIN_MARKETING_SUMMARY.map((t) => (
              <p key={t}>{t}</p>
            ))}
          </Details>
        </div>

        {state.error ? <ErrorBox text={state.error} /> : null}
        {error && ERROR_TEXT[error] ? <ErrorBox text={ERROR_TEXT[error]} /> : null}

        <Button type="submit" disabled={!requiredOk || pending} className="mt-6 w-full" size="lg">
          {pending ? "저장 중…" : "동의하고 시작하기"}
        </Button>
      </form>

      <p className="mt-3 text-center text-xs text-fg-sub">선택 항목에 동의하지 않아도 모든 기능을 쓸 수 있어요.</p>

      {/* 거부 경로 — 이미 저장된 가입 정보(이메일 등)까지 지우고 나간다 */}
      <div className="mt-5 flex justify-center border-t border-line pt-4">
        <ConfirmSubmit
          action={declineConsent}
          title="동의하지 않고 나가기"
          description={JOIN_DECLINE_CONFIRM}
          confirmLabel="계정 삭제하고 나가기"
          pendingLabel="삭제 중…"
          trigger="동의하지 않고 나가기"
          triggerVariant="ghost"
        />
      </div>
    </div>
  );
}

/* ── 약관 개정 재동의(기존 회원) ── */
function UpdateForm({
  phase,
  marketingOn,
  email,
  error,
}: {
  phase: "notice" | "gate";
  marketingOn: boolean;
  email: string;
  error: string | null;
}) {
  const [agreed, setAgreed] = useState(false);
  const [state, formAction, pending] = useActionState(saveConsent, INITIAL);

  return (
    <div className="rounded-card border border-line bg-body p-8">
      <h1 className="text-2xl font-bold leading-tight">이용약관이 바뀌었어요</h1>
      <p className="mt-2 break-keep text-[15px] leading-relaxed text-fg-sub">{UPDATE_LEAD}</p>
      <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-[15px] leading-relaxed text-fg-sub marker:text-fg-faint">
        {UPDATE_CHANGES.map((t) => (
          <li key={t} className="break-keep">
            {t}
          </li>
        ))}
      </ol>
      <p className="mt-3 flex flex-wrap gap-x-4 text-[14px] font-medium text-fg-sub">
        <a href="/terms/changes" target="_blank" rel="noopener noreferrer" className={docLink}>
          변경 내용 자세히 보기
        </a>
        <a href="/terms" target="_blank" rel="noopener noreferrer" className={docLink}>
          새 이용약관
        </a>
        <a href="/terms/operation" target="_blank" rel="noopener noreferrer" className={docLink}>
          운영정책
        </a>
      </p>

      <form action={formAction}>
        <div className="mt-5 rounded-card border border-line bg-plate">
          <Row name="terms" required checked={agreed} onChange={setAgreed}>
            바뀐 이용약관(운영정책 포함)에 동의해요
          </Row>
        </div>
        {/* 광고성 정보 수신은 여기서 다시 묻지 않는다 — 미리 체크된 칸의 «동의»는 새 동의로 인정받기 어렵다(2026-09-12 검토).
            지금 상태만 보여 준다. 이 화면의 저장은 marketing_email_at 을 바꾸지 않는다(actions.ts). */}
        <p className="mt-3 break-keep px-1 text-[14px] text-fg-sub">
          광고성 정보(이메일) 수신: <span className="font-semibold text-fg">{marketingOn ? "동의함" : "동의 안 함"}</span> — 알림 설정에서 언제든 바꿀 수 있어요.
        </p>

        {state.error ? <ErrorBox text={state.error} /> : null}
        {error && ERROR_TEXT[error] ? <ErrorBox text={ERROR_TEXT[error]} /> : null}

        <Button type="submit" disabled={!agreed || pending} className="mt-6 w-full" size="lg">
          {pending ? "저장 중…" : "동의하고 계속하기"}
        </Button>
      </form>

      {phase === "notice" ? (
        /* 공고 기간 — 아직 시행 전이라 막지 않는다. 시행일 뒤 처음 이용할 때 다시 묻는다 */
        <p className="mt-4 text-center text-[14px] text-fg-sub">
          <Link href="/dashboard" className={docLink}>
            나중에 할게요
          </Link>
        </p>
      ) : (
        <div className="mt-5 border-t border-line pt-4">
          <p className="break-keep px-1 text-[14px] text-fg-sub">
            동의하기 전에는 서비스를 이용할 수 없어요. 동의하지 않으면 로그아웃하거나 회원 탈퇴를 할 수 있어요.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-4">
            <form action="/auth/signout" method="post">
              <Button type="submit" variant="ghost" size="sm">
                로그아웃
              </Button>
            </form>
          </div>
          {/* 탈퇴는 설정의 탈퇴와 같은 폼 — 확인 문구(이메일)를 타이핑해야 열린다. 오류는 이 화면으로 돌아온다 */}
          <DangerZone email={email} action={withdrawFromConsent} triggerLabel="회원 탈퇴" />
        </div>
      )}
    </div>
  );
}

export function ConsentForm({
  mode,
  phase,
  marketingOn,
  email,
  error,
}: {
  mode: "join" | "update";
  phase: "notice" | "gate";
  marketingOn: boolean;
  email: string;
  error: string | null;
}) {
  return mode === "join" ? (
    <JoinForm error={error} />
  ) : (
    <UpdateForm phase={phase} marketingOn={marketingOn} email={email} error={error} />
  );
}
