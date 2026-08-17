"use client";

import { useId, useState } from "react";
import { SubmitButton } from "@/components/ui/submit-button";
import { deleteAccount } from "../actions";
import { DELETE_PHRASE } from "../constants";

/*
  회원탈퇴 — 사장님 지시로 설정 **목록에서 빼서** 프로필 하단에 작게 둔다.
  "회원탈퇴는 빼놔 따로 개인정보나 다른부분에 작게 넣어놓게" (2026-08-15)

  왜 탭이 아니라 이 자리인가: 탈퇴는 설정 **항목**이 아니다. 항목은 자주 오가며
  바꾸는 것이고 탈퇴는 평생 한 번, 그것도 되돌릴 수 없다. 나란히 두면 오클릭
  거리가 다른 설정과 같아진다. 여기서는 접혀 있고, 펴야 보이고, 확인 문구를
  타이핑해야 버튼이 열린다.

  모달 대신 인라인 확인인 이유: 모달의 확인 버튼은 언제나 한 번의 클릭이다.
  여기 필요한 건 "한 번 더 물어보기"가 아니라 **손이 멈추는 마찰**이고,
  문구를 옮겨 적는 동안 사람은 자기가 뭘 하는지 인지한다.

  ⚠️ 링크는 작지만 **흐리지는 않다**(text-fg-sub, 5.0:1). fg-faint(4.0:1)로 두면
  개인정보처리방침이 보장한 유일한 동의 철회 경로가 WCAG AA 미달이 된다 —
  "안 보이게 설계했다"는 말을 들을 자리다. 무게는 크기·위치로만 낮춘다.
*/
export function DangerZone({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const inputId = useId();

  /* 카카오는 이메일 제공이 선택 동의라 user.email 이 비어 오는 계정이 실제로 있다.
     이메일만 받으면 그 사람들은 탈퇴가 영구히 막힌다 — 대체 문구를 둔다.
     서버(actions.ts)가 같은 규칙으로 다시 검증한다. */
  const expected = email.trim() || DELETE_PHRASE;
  const ready = typed.trim().toLowerCase() === expected.toLowerCase();

  return (
    <div className="pt-2">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="trans-state text-[12px] text-fg-sub underline underline-offset-2 hover:text-negative-strong"
        >
          회원탈퇴
        </button>
      ) : (
        <form action={deleteAccount} className="rounded-card border border-negative/40 bg-negative-weak p-4">
          <p className="text-[14px] font-semibold text-negative-strong">정말 탈퇴하시겠어요?</p>
          <p className="mt-1.5 text-[14px] leading-[1.6] text-fg">
            계정과 함께 연동한 SNS 계정, 예약·초안, 스크랩, 남은 크레딧, 팀 정보, 업로드한 이미지가 모두
            삭제됩니다.
            <strong className="font-semibold"> 되돌릴 수 없어요.</strong> 결제 내역은 법령에 따라 개인 식별
            정보를 지운 상태로 보관됩니다.
          </p>

          <label htmlFor={inputId} className="mt-3 block text-[12px] font-medium text-fg-sub">
            확인을 위해 <span className="font-semibold text-fg">{expected}</span> 을(를) 입력하세요
          </label>
          <input
            id={inputId}
            name="confirm"
            type="text"
            autoComplete="off"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            className="mt-1.5 h-10 w-full max-w-sm rounded-card border border-line bg-body px-3 text-[14px] text-fg placeholder:text-fg-faint focus:border-negative focus:outline-none"
            placeholder={expected}
          />

          <div className="mt-3 flex flex-wrap gap-2">
            <SubmitButton variant="danger" size="sm" disabled={!ready} pendingLabel="탈퇴 처리 중…">
              탈퇴하기
            </SubmitButton>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setTyped("");
              }}
              className="trans-state rounded-card px-3 py-1.5 text-[14px] font-medium text-fg-sub hover:bg-tint-hover hover:text-fg"
            >
              취소
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
