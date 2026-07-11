import { Check, ExternalLink, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/ui/section-header";
import { Card } from "@/components/ui/card";
import { Badge, ChannelBadge } from "@/components/ui/badge";
import { AppIconTile } from "@/components/icons/brand";
import { Button } from "@/components/ui/button";
import { accounts } from "@/lib/data";
import { SettingsNav } from "./_components/settings-nav";

/*
  계정 연동 관리 (PRD PART 4.2)
  - 채널 3개(accounts) + Meta 광고 계정 연동 상태를 카드로 표시
  - 토큰 만료 임박(14일 이하) 경고, 권한(scope) 투명성 고지 포함
  - 실제 OAuth 연동은 플랫폼 앱 심사 후 활성화 (목 처리)
*/

const SCOPES = [
  "프로필 기본 정보 조회",
  "게시물 목록·인사이트 조회",
  "댓글 조회·답글",
];

function ConnectActions({ connected }: { connected: boolean }) {
  if (connected) {
    return (
      <div className="flex items-center gap-2">
        <Button size="sm" variant="secondary">
          재연동
        </Button>
        <Button size="sm" variant="danger">
          해제
        </Button>
      </div>
    );
  }
  return (
    <Button size="sm" variant="primary">
      연동하기
    </Button>
  );
}

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="설정"
        description="채널 계정과 Meta 광고 계정의 연동 상태를 관리하세요."
      />
      <SettingsNav />

      {/* 채널별 연동 카드 */}
      <section aria-label="계정 연동 상태" className="space-y-3">
        {accounts.map((account) => (
          <Card key={account.channel} className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3.5">
                <AppIconTile app={account.channel} size={44} className="mt-0.5" />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <ChannelBadge channel={account.channel} />
                    {account.connected ? (
                      <Badge tone="positive">연동됨</Badge>
                    ) : (
                      <Badge tone="neutral">미연동</Badge>
                    )}
                  </div>
                  <p className="mt-2 text-[14px] text-fg-sub">
                    {account.handle}
                    <span className="ml-2 text-fg-faint">{account.displayName}</span>
                  </p>
                  {account.tokenExpiresInDays !== null ? (
                    account.tokenExpiresInDays <= 14 ? (
                      <p className="mt-1 text-[13px] font-semibold text-warning">
                        토큰 <span className="tnum">{account.tokenExpiresInDays}</span>일 후 만료 — 재연동 필요
                      </p>
                    ) : (
                      <p className="mt-1 text-[13px] text-fg-faint">
                        토큰 <span className="tnum">{account.tokenExpiresInDays}</span>일 후 만료
                      </p>
                    )
                  ) : null}
                </div>
              </div>
              <ConnectActions connected={account.connected} />
            </div>

            {account.channel === "instagram" ? (
              <div className="mt-4 rounded-card bg-warning-weak p-3 text-[13px] leading-relaxed text-warning">
                개인 계정은 연동할 수 없어요. 비즈니스/크리에이터 계정 전환이 필요합니다.
                <a
                  href="#"
                  className="ml-1.5 inline-flex items-center gap-1 font-semibold underline underline-offset-2"
                >
                  전환 방법 안내
                  <ExternalLink className="size-3" aria-hidden />
                </a>
              </div>
            ) : null}
          </Card>
        ))}

        {/* Meta 광고 계정 — 채널 계정과 별도 연동 (PART 4.2) */}
        <Card className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3.5">
              <AppIconTile app="meta" size={44} className="mt-0.5" />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-chip border border-line bg-overlay px-2.5 py-0.5 text-xs font-semibold leading-5 whitespace-nowrap text-fg-sub">
                    <span className="size-1.5 rounded-full bg-meta" aria-hidden />
                    Meta 광고
                  </span>
                  <Badge tone="positive">연동됨</Badge>
                </div>
                <p className="mt-2 text-[14px] text-fg-sub">
                  핀치 마케팅
                  <span className="ml-2 text-fg-faint">광고 계정 act-2048</span>
                </p>
              </div>
            </div>
            <ConnectActions connected />
          </div>
        </Card>
      </section>

      {/* 권한(scope) 투명성 (PART 4.2) */}
      <Card className="p-5">
        <h3 className="flex items-center gap-2 text-[19px] font-bold leading-snug">
          <ShieldCheck className="size-5 text-fg-sub" aria-hidden />
          핀치가 접근하는 권한
        </h3>
        <ul className="mt-3 space-y-2">
          {SCOPES.map((scope) => (
            <li key={scope} className="flex items-center gap-2 text-[14px] text-fg-sub">
              <Check className="size-4 text-positive" aria-hidden />
              {scope}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[13px] text-fg-faint">
          핀치는 기능에 필요한 최소 권한만 요청합니다.
        </p>
      </Card>

      {/* 목 연동 안내 */}
      <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
        <p className="text-[14px] text-fg-sub">
          실제 OAuth 연동은 개발 마지막 단계에 활성화됩니다.
        </p>
        <Badge tone="neutral">예정</Badge>
      </Card>
    </div>
  );
}
