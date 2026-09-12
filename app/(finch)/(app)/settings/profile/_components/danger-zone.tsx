"use client";

import { useId, useState } from "react";
import { SubmitButton } from "@/components/ui/submit-button";
import { Button } from "@/components/ui/button";
import { FieldLabel, inputClass } from "@/components/ui/field";
import { BUSINESS } from "@/lib/legal/business";
import { deleteAccount } from "../actions";
import { DELETE_PHRASE } from "../constants";

/*
  회원탈퇴 — 사장님 지시로 설정 **목록에서 빼서** 개인정보 하단에 작게 둔다("회원탈퇴는 빼놔 따로 개인정보나 다른부분에 작게", 2026-08-15).
  탈퇴는 설정 항목이 아니다 — 평생 한 번, 되돌릴 수 없다. 접혀 있고, 펴야 보이고, 확인 문구를 타이핑해야 버튼이 열린다.
  모달이 아니라 인라인 확인인 이유: 필요한 건 «한 번 더 물어보기»가 아니라 **손이 멈추는 마찰**이다.
  ⚠️ 링크는 작지만 흐리지 않다(text-fg-sub) — fg-faint 로 두면 방침이 보장한 동의 철회 경로가 AA 미달이 된다.
  2026-09-03: 표적을 36px 로(after 확장), 입력은 공용 inputClass, 확인 문구는 code 칩으로 복사하기 쉽게.
  2026-09-12: 약관 재동의 화면(onboarding/consent)도 같은 탈퇴 폼을 쓴다 — 동의를 거부한 기존 회원의 출구다.
  그 화면은 설정(게이트 뒤)으로 돌아올 수 없어 오류를 자기 화면으로 돌려받는 서버 액션을 따로 넘긴다(action).
*/
export function DangerZone({
  email,
  action = deleteAccount,
  triggerLabel = "회원탈퇴",
  paidNote,
}: {
  email: string;
  /** 탈퇴 서버 액션 — 기본은 설정 > 개인정보의 deleteAccount. 확인 문구 대조는 액션이 서버에서 다시 한다 */
  action?: (formData: FormData) => Promise<void>;
  triggerLabel?: string;
  /**
   * 유료 이용 중인 회원 안내를 바꿔 끼운다 — 약관 재동의 화면은 «회사가 일할 환불»(약관 제3조⑤)이라
   * 설정의 «탈퇴 전에 이메일로 환불 신청»과 말이 다르다(lib/legal/consent-copy.ts CONSENT_WITHDRAW_PAID_NOTE).
   */
  paidNote?: string;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const inputId = useId();

  /* 카카오는 이메일 제공이 선택 동의라 user.email 이 비어 오는 계정이 실제로 있다 — 대체 문구를 둔다(서버가 같은 규칙으로 재검증) */
  const expected = email.trim() || DELETE_PHRASE;
  const ready = typed.trim().toLowerCase() === expected.toLowerCase();

  return (
    <div className="px-1 pt-2">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="trans-state relative -my-1.5 inline-block py-2.5 text-[12px] text-fg-sub underline underline-offset-2 after:absolute after:inset-y-0 after:-inset-x-2 after:content-[''] hover:text-negative-strong"
        >
          {triggerLabel}
        </button>
      ) : (
        <form action={action} className="rounded-card border border-negative/40 bg-negative-weak p-4">
          <p className="text-[15px] font-semibold text-negative-strong">정말 탈퇴하시겠어요?</p>
          <p className="mt-1.5 break-keep text-[14px] leading-[1.6] text-fg">
            연결한 SNS 계정, 예약·초안, 프로필 링크 페이지(공개 중인 페이지 포함), 스크랩, 남은 크레딧, 팀 정보, 업로드한 이미지가 모두 삭제되고
            <strong className="font-semibold"> 되돌릴 수 없어요.</strong>
          </p>
          <p className="mt-1 break-keep text-[12px] text-fg-sub">
            {paidNote ??
              `유료 이용 중이면 탈퇴 전에 ${BUSINESS.contactEmail ?? BUSINESS.privacyEmail}로 환불을 신청해 주세요. 결제 내역은 법령에 따라 개인 식별 정보를 지운 상태로 보관됩니다.`}
          </p>

          <FieldLabel htmlFor={inputId} className="mt-3">
            확인을 위해 아래 문구를 그대로 입력해 주세요
          </FieldLabel>
          <code className="mt-1 inline-block select-all rounded-card border border-line bg-body px-2 py-0.5 text-[14px] font-semibold">{expected}</code>
          <input
            id={inputId}
            name="confirm"
            type="text"
            autoComplete="off"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={expected}
            className={inputClass("md", "mt-2 sm:max-w-sm focus:border-negative focus-visible:outline-negative")}
          />

          <div className="mt-3 flex flex-wrap gap-2">
            <SubmitButton variant="danger" size="sm" disabled={!ready} pendingLabel="탈퇴 처리 중…">
              탈퇴하기
            </SubmitButton>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setOpen(false);
                setTyped("");
              }}
            >
              취소
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
