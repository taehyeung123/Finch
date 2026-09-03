"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FolderKanban, Link2, UserPlus, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AvatarImage } from "@/components/ui/avatar-image";
import { ChoiceTile } from "@/components/ui/choice-tile";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { EmptyState } from "@/components/ui/empty-state";
import { FieldLabel, inputClass } from "@/components/ui/field";
import { InfoTip } from "@/components/ui/info-tip";
import { LoadFailed } from "@/components/ui/load-failed";
import { ModalShell } from "@/components/ui/modal-shell";
import { NoticeBar } from "@/components/ui/notice-bar";
import { StateChip } from "@/components/ui/state-chip";
import { SubmitButton } from "@/components/ui/submit-button";
import { formatDate } from "@/lib/format";
import { SettingsGroup, SettingsRow } from "../../_components/settings-row";
import { SummaryCard } from "../../_components/summary-card";
import { inviteMember, revokeMember, updateMemberRole } from "../actions";

export type TeamRole = "owner" | "editor" | "viewer";
export type TeamStatus = "invited" | "active";

export interface TeamRowVM {
  id: string;
  email: string;
  role: TeamRole;
  status: TeamStatus;
  isSelf: boolean;
  /** 초대 행이 만들어진 시각 — «{날짜} 초대» 메타 */
  invitedAt: string | null;
}

const ROLE_LABEL: Record<TeamRole | "unknown", string> = { owner: "소유자", editor: "에디터", viewer: "뷰어", unknown: "확인 못 함" };

/*
  팀 화면(클라이언트) — 요약 카드 → 멤버 그룹 → 준비 중인 기능. 초대는 첫 화면의 폼이 아니라 모달(«초대하기» 버튼 하나).
  로컬 사본을 따로 들지 않는다 — 서버 액션 후 router.refresh() 가 새 initialRows 로 다시 그린다.
  진행 중인 행만 잠근다(pendingId) — 전역 pending 이 모든 행을 비활성하던 문제(감사)의 수리 유지.
  액션 3종·ConfirmSubmit 문구는 재설계 전과 같다(초대 폼의 필드명 email/role 도 그대로).
*/
export function TeamClient({
  initialRows,
  role,
  demoMode,
}: {
  /** null = 조회 실패 */
  initialRows: TeamRowVM[] | null;
  role: TeamRole | "unknown";
  demoMode: boolean;
}) {
  const router = useRouter();
  const rows = initialRows;
  const isOwner = role === "owner";
  const [notice, setNotice] = useState<{ tone: "positive" | "negative" | "warning"; text: string } | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startRowTransition] = useTransition();
  const [inviteOpen, setInviteOpen] = useState(false);

  async function handleRevoke(memberId: string) {
    if (demoMode) return;
    setNotice(null);
    setPendingId(memberId);
    const res = await revokeMember(memberId);
    if (!res.ok) setNotice({ tone: "negative", text: res.error });
    else router.refresh();
    setPendingId(null);
  }

  function handleRoleChange(memberId: string, nextRole: Exclude<TeamRole, "owner">) {
    if (demoMode) return;
    setNotice(null);
    setPendingId(memberId);
    startRowTransition(async () => {
      const res = await updateMemberRole(memberId, nextRole);
      if (!res.ok) setNotice({ tone: "negative", text: res.error });
      /* 실패 시에도 refresh 로 서버 상태(원래 역할)를 다시 그려 화면과 DB 를 일치시킨다 */
      router.refresh();
      setPendingId(null);
    });
  }

  const active = (rows ?? []).filter((r) => r.status === "active").length;
  const invited = (rows ?? []).filter((r) => r.status === "invited").length;
  const alone = rows !== null && rows.length <= 1 && isOwner;

  const sub: { text: React.ReactNode; tone: "sub" | "warning" } = demoMode
    ? { text: "지금은 예시 화면이라 팀 초대·관리를 할 수 없어요", tone: "sub" }
    : role === "unknown"
      ? { text: "역할을 불러오지 못했어요 — 새로고침해 주세요", tone: "warning" }
      : isOwner
        ? alone
          ? { text: "아직 혼자예요 — 이메일로 초대할 수 있어요", tone: "sub" }
          : {
              text: (
                <>
                  <span className="tnum">멤버 {active}명</span> · <span className="tnum">초대 대기 {invited}명</span>
                </>
              ),
              tone: "sub",
            }
        : { text: "초대와 역할 변경은 소유자만 할 수 있어요", tone: "sub" };

  return (
    <>
      {notice ? (
        <NoticeBar tone={notice.tone}>
          {notice.text}
        </NoticeBar>
      ) : null}

      <SummaryCard
        leading={
          <span className="flex size-12 shrink-0 items-center justify-center rounded-card bg-plate text-fg-sub" aria-hidden>
            <Users className="size-5" />
          </span>
        }
        eyebrow="내 역할"
        title={ROLE_LABEL[role]}
        chips={
          <>
            {role === "unknown" ? <StateChip tone="unknown" /> : null}
            <InfoTip label="역할 설명">소유자는 초대·역할 변경·제거를, 에디터는 분석 보기에 더해 광고 게재 켜고 끄기를, 뷰어는 분석 보기만 할 수 있어요.</InfoTip>
          </>
        }
        sub={sub.text}
        subTone={sub.tone}
        aside={
          demoMode ? (
            <Badge tone="neutral">예시 화면</Badge>
          ) : isOwner && rows !== null ? (
            <Button size="sm" onClick={() => setInviteOpen(true)}>
              <UserPlus className="size-4" aria-hidden />
              초대하기
            </Button>
          ) : undefined
        }
      />

      <SettingsGroup
        id="members"
        label="멤버"
        footer={
          rows === null ? (
            <div className="p-4">
              <LoadFailed dense title="멤버 목록을 불러오지 못했어요" description="목록이 빈 게 아니라 잠시 못 읽은 거예요. 다시 시도해 주세요." />
            </div>
          ) : alone && !demoMode ? (
            <div className="p-4">
              <EmptyState
                dense
                icon={UserPlus}
                title="아직 초대한 멤버가 없어요"
                description="이메일로 초대하면 내 채널 분석을 함께 볼 수 있어요."
                action={
                  <Button size="sm" variant="secondary" onClick={() => setInviteOpen(true)}>
                    초대하기
                  </Button>
                }
              />
            </div>
          ) : undefined
        }
      >
        {(rows ?? []).map((member) => {
          const busy = pendingId === member.id;
          const canManage = isOwner && member.role !== "owner";
          return (
            <SettingsRow
              key={member.id}
              leading={<AvatarImage src={null} initial={(member.email.charAt(0) || "?").toUpperCase()} sizeClass="size-9" textClass="text-[14px]" />}
              label={member.email || "이메일 없음"}
              chip={
                <>
                  {member.isSelf ? <Badge tone="neutral">나</Badge> : null}
                  {member.status === "active" ? <StateChip tone="ok">참여 중</StateChip> : <StateChip tone="pending">초대 대기</StateChip>}
                </>
              }
              hint={member.status === "invited" && member.invitedAt ? <span className="tnum">{formatDate(member.invitedAt)} 초대</span> : ROLE_LABEL[member.role]}
              busy={busy}
              trailing={
                canManage ? (
                  <>
                    <select
                      aria-label={`${member.email} 역할`}
                      value={member.role}
                      disabled={demoMode || busy}
                      onChange={(e) => handleRoleChange(member.id, e.target.value === "editor" ? "editor" : "viewer")}
                      className={inputClass("sm", "max-w-[7.5rem]")}
                    >
                      <option value="viewer">뷰어</option>
                      <option value="editor">에디터</option>
                    </select>
                    {demoMode ? (
                      <Button type="button" variant="ghost" size="sm" disabled>
                        {member.status === "invited" ? "초대 취소" : "제거"}
                      </Button>
                    ) : member.status === "invited" ? (
                      <ConfirmSubmit
                        action={() => handleRevoke(member.id)}
                        title="초대를 취소할까요?"
                        description={`${member.email} 님에게 보낸 초대 링크가 더 이상 열리지 않아요. 나중에 다시 초대할 수 있어요.`}
                        confirmLabel="초대 취소"
                        pendingLabel="취소 중…"
                        trigger="초대 취소"
                        triggerVariant="ghost"
                        triggerSize="sm"
                      />
                    ) : (
                      <ConfirmSubmit
                        action={() => handleRevoke(member.id)}
                        title="멤버를 제거할까요?"
                        description={`${member.email}님의 워크스페이스 접근 권한이 바로 해제돼요. 다시 참여하려면 초대를 새로 보내 상대가 수락해야 해요.`}
                        confirmLabel="제거하기"
                        pendingLabel="제거 중…"
                        trigger="제거"
                        triggerVariant="ghost"
                        triggerSize="sm"
                        triggerClassName="text-negative-strong hover:text-negative-strong"
                      />
                    )}
                  </>
                ) : (
                  <Badge tone={member.role === "owner" ? "primary" : "neutral"}>{ROLE_LABEL[member.role]}</Badge>
                )
              }
            />
          );
        })}
      </SettingsGroup>

      {/* 예정 기능(PART 4.10) — 정적 행 두 개, 꺾쇠 없음 */}
      <SettingsGroup id="upcoming" label="준비 중인 기능">
        <SettingsRow icon={FolderKanban} label="클라이언트별 프로젝트 분리" hint="클라이언트마다 채널·리포트를 따로 관리해요" trailing={<Badge tone="neutral">준비 중</Badge>} />
        <SettingsRow icon={Link2} label="클라이언트용 열람 링크" hint="로그인 없이 리포트만 볼 수 있는 만료되는 링크" trailing={<Badge tone="neutral">준비 중</Badge>} />
      </SettingsGroup>

      {inviteOpen ? (
        <InviteModal
          onClose={() => setInviteOpen(false)}
          onDone={(email) => {
            setInviteOpen(false);
            setNotice({ tone: "positive", text: `${email} 님에게 초대 메일을 보냈어요.` });
            router.refresh();
          }}
        />
      ) : null}
    </>
  );
}

function InviteModal({ onClose, onDone }: { onClose: () => void; onDone: (email: string) => void }) {
  const [role, setRole] = useState<Exclude<TeamRole, "owner">>("viewer");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const emailId = useId();

  async function submit(formData: FormData) {
    setError(null);
    setSubmitting(true);
    try {
      const res = await inviteMember(formData);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onDone(String(formData.get("email") ?? "").trim());
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalShell label="멤버 초대" title="멤버 초대" description="초대 메일의 링크로 수락하면 참여가 시작돼요" size="sm" busy={submitting} onClose={onClose}>
      <form action={submit} className="space-y-4">
        <div>
          <FieldLabel htmlFor={emailId}>이메일</FieldLabel>
          <input id={emailId} type="email" name="email" required autoFocus placeholder="초대할 이메일 주소" className={inputClass("md", "mt-1.5")} />
        </div>
        <fieldset>
          <legend className="text-[12px] font-medium text-fg-sub">역할</legend>
          <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
            <ChoiceTile name="role" value="viewer" checked={role === "viewer"} onChange={() => setRole("viewer")} title="뷰어" hint="분석 화면을 보기만 해요" />
            <ChoiceTile name="role" value="editor" checked={role === "editor"} onChange={() => setRole("editor")} title="에디터" hint="보기에 더해 광고 게재를 켜고 끌 수 있어요" />
          </div>
        </fieldset>
        {error ? (
          <p role="alert" className="text-[14px] text-negative-strong">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={onClose} disabled={submitting}>
            취소
          </Button>
          <SubmitButton size="sm" pendingLabel="보내는 중…">
            <UserPlus className="size-4" aria-hidden />
            초대 메일 보내기
          </SubmitButton>
        </div>
      </form>
    </ModalShell>
  );
}
