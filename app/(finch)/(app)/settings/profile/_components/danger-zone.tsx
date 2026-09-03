"use client";

import { useId, useState } from "react";
import { SubmitButton } from "@/components/ui/submit-button";
import { Button } from "@/components/ui/button";
import { FieldLabel, inputClass } from "@/components/ui/field";
import { deleteAccount } from "../actions";
import { DELETE_PHRASE } from "../constants";

/*
  회원탈퇴 — 사장님 지시로 설정 **목록에서 빼서** 개인정보 하단에 작게 둔다("회원탈퇴는 빼놔 따로 개인정보나 다른부분에 작게", 2026-08-15).
  탈퇴는 설정 항목이 아니다 — 평생 한 번, 되돌릴 수 없다. 접혀 있고, 펴야 보이고, 확인 문구를 타이핑해야 버튼이 열린다.
  모달이 아니라 인라인 확인인 이유: 필요한 건 «한 번 더 물어보기»가 아니라 **손이 멈추는 마찰**이다.
  ⚠️ 링크는 작지만 흐리지 않다(text-fg-sub) — fg-faint 로 두면 방침이 보장한 동의 철회 경로가 AA 미달이 된다.
  2026-09-03: 표적을 36px 로(after 확장), 입력은 공용 inputClass, 확인 문구는 code 칩으로 복사하기 쉽게.
*/
export function DangerZone({ email }: { email: string }) {
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
          회원탈퇴
        </button>
      ) : (
        <form action={deleteAccount} className="rounded-card border border-negative/40 bg-negative-weak p-4">
          <p className="text-[15px] font-semibold text-negative-strong">정말 탈퇴하시겠어요?</p>
          <p className="mt-1.5 break-keep text-[14px] leading-[1.6] text-fg">
            연동한 SNS 계정, 예약·초안, 스크랩, 남은 크레딧, 팀 정보, 업로드한 이미지가 모두 삭제되고
            <strong className="font-semibold"> 되돌릴 수 없어요.</strong>
          </p>
          <p className="mt-1 text-[12px] text-fg-sub">결제 내역은 법령에 따라 개인 식별 정보를 지운 상태로 보관됩니다.</p>

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
