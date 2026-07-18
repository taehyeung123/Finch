import { FolderKanban, Link2, UserPlus } from "lucide-react";
import { PageHeader } from "@/components/ui/section-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { isDemoMode } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { SettingsNav } from "../_components/settings-nav";

/*
  팀 워크스페이스 (PRD PART 4.10)
  - 실 모드: 현재 로그인 사용자 1명(소유자)만 표시 — 멀티멤버는 팀 스키마 도입 후
  - 데모 모드: 샘플 멤버로 화면 미리보기
  - 프로젝트 분리·뷰어 링크는 Pro·Agency 플랜 예정 기능으로 소개만 노출
*/

const SAMPLE_MEMBERS = [
  { name: "김민지", email: "minji@finch.ai.kr", role: "소유자" },
  { name: "이재현", email: "jaehyun@finch.ai.kr", role: "에디터" },
  { name: "박소연", email: "soyeon@finch.ai.kr", role: "뷰어" },
] as const;

interface Member {
  name: string;
  email: string;
  role: string;
}

async function loadMembers(): Promise<Member[]> {
  if (isDemoMode()) return [...SAMPLE_MEMBERS];
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const email = user.email ?? "";
  const name =
    (typeof user.user_metadata?.full_name === "string" && user.user_metadata.full_name) ||
    (typeof user.user_metadata?.name === "string" && user.user_metadata.name) ||
    email.split("@")[0] ||
    "나";
  return [{ name, email, role: "소유자" }];
}

export default async function TeamSettingsPage() {
  const members = await loadMembers();

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="설정"
        description="팀 멤버와 역할을 관리하고 클라이언트와 협업하세요."
      />
      <SettingsNav />

      {/* 멤버 목록 — 실 모드는 본인(소유자)만, 초대는 팀 기능 오픈 시 활성화 */}
      <Card>
        <CardHeader
          title="팀 멤버"
          description={`${members.length}명이 이 워크스페이스에 참여 중`}
          action={
            <Button size="sm" variant="primary" disabled title="팀 멤버 초대는 Pro·Agency 플랜 기능 오픈 시 제공됩니다">
              <UserPlus className="size-4" aria-hidden />
              멤버 초대
            </Button>
          }
        />
        <CardBody>
          <ul className="divide-y divide-line">
            {members.map((member) => (
              <li key={member.email} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className="flex size-9 shrink-0 items-center justify-center rounded-chip bg-primary-weak text-[13px] font-bold text-primary"
                    aria-hidden
                  >
                    {member.name.slice(0, 1).toUpperCase()}
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
          {!isDemoMode() ? (
            <p className="mt-4 text-[13px] text-fg-faint">
              멤버 초대·역할 관리는 팀 기능 오픈과 함께 제공될 예정입니다.
            </p>
          ) : null}
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
