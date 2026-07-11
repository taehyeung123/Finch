import { FolderKanban, Link2, UserPlus } from "lucide-react";
import { PageHeader } from "@/components/ui/section-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SettingsNav } from "../_components/settings-nav";

/*
  팀 워크스페이스 (PRD PART 4.10)
  - 멤버·역할(소유자/에디터/뷰어) 목록은 목데이터
  - 프로젝트 분리·뷰어 링크는 Pro·Agency 플랜 예정 기능으로 소개만 노출
*/

const MEMBERS = [
  { name: "김민지", email: "minji@finch.kr", role: "소유자" },
  { name: "이재현", email: "jaehyun@finch.kr", role: "에디터" },
  { name: "박소연", email: "soyeon@finch.kr", role: "뷰어" },
] as const;

export default function TeamSettingsPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="설정"
        description="팀 멤버와 역할을 관리하고 클라이언트와 협업하세요."
      />
      <SettingsNav />

      {/* 멤버 목록 */}
      <Card>
        <CardHeader
          title="팀 멤버"
          description={`${MEMBERS.length}명이 이 워크스페이스에 참여 중`}
          action={
            <Button size="sm" variant="primary">
              <UserPlus className="size-4" aria-hidden />
              멤버 초대
            </Button>
          }
        />
        <CardBody>
          <ul className="divide-y divide-line">
            {MEMBERS.map((member) => (
              <li key={member.email} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className="flex size-9 shrink-0 items-center justify-center rounded-chip bg-primary-weak text-[13px] font-bold text-primary"
                    aria-hidden
                  >
                    {member.name.slice(0, 1)}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-semibold">{member.name}</p>
                    <p className="truncate text-[13px] text-fg-faint">{member.email}</p>
                  </div>
                </div>
                <Badge tone={member.role === "소유자" ? "primary" : "neutral"}>{member.role}</Badge>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>

      {/* 예정 기능 소개 (PART 4.10) */}
      <section aria-label="팀 예정 기능" className="grid gap-3 md:grid-cols-2">
        <Card className="p-5">
          <div className="flex items-start justify-between gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-card bg-primary-weak text-primary">
              <FolderKanban className="size-4" aria-hidden />
            </span>
            <Badge tone="neutral">Pro·Agency 플랜 예정</Badge>
          </div>
          <h3 className="mt-3 text-[15px] font-bold">클라이언트별 프로젝트 분리</h3>
          <p className="mt-1 text-[13px] leading-relaxed text-fg-sub">
            클라이언트마다 채널·경쟁사·리포트를 독립된 프로젝트로 나눠 관리하고, 멤버별 접근 권한을
            프로젝트 단위로 지정할 수 있어요.
          </p>
        </Card>

        <Card className="p-5">
          <div className="flex items-start justify-between gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-card bg-primary-weak text-primary">
              <Link2 className="size-4" aria-hidden />
            </span>
            <Badge tone="neutral">Pro·Agency 플랜 예정</Badge>
          </div>
          <h3 className="mt-3 text-[15px] font-bold">클라이언트 공유용 뷰어 링크</h3>
          <p className="mt-1 text-[13px] leading-relaxed text-fg-sub">
            로그인 없이 성과를 열람할 수 있는 만료시간 있는 보안 URL을 발급해 클라이언트에게
            리포트 화면을 그대로 공유할 수 있어요.
          </p>
        </Card>
      </section>
    </div>
  );
}
