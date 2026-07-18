import { Film, Image as ImageIcon, Images, Link2, Lock, Play } from "lucide-react";
import { cn } from "@/lib/cn";
import type { ChannelAccount, PostType, ProfileGridPost } from "@/lib/types";
import { CHANNEL_LABEL } from "@/lib/channels";
import { formatCompact, formatDeltaCompact, formatPercent } from "@/lib/format";
import { AppIconTile } from "@/components/icons/brand";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";

/*
  채널 프로필 미러링 패널 — 특정 채널 선택 시 대시보드 우측에 그 채널의 앱 프로필 화면을 재현한다.
  아바타·통계 바·bio·3×3 게시물 그리드로 모바일 프로필처럼 구성.
  숫자는 목데이터 기준이며, 실제 연동 시 각 채널 공식 API 프로필 응답으로 교체된다.
*/

/** 게시물 유형별 그리드 아이콘 */
const TYPE_ICON: Record<PostType, typeof Film> = {
  reels: Film,
  video: Play,
  carousel: Images,
  feed: ImageIcon,
  story: ImageIcon,
  text: ImageIcon,
};

/** 채널별 아바타 링 색 — 브랜드 정체성 */
const RING: Record<ChannelAccount["channel"], string> = {
  instagram: "ring-ig",
  tiktok: "ring-tiktok-cyan",
  threads: "ring-fg",
};

export function ChannelProfilePanel({
  account,
  grid,
  className,
}: {
  account: ChannelAccount;
  grid: ProfileGridPost[];
  className?: string;
}) {
  const initial = (account.displayName || account.handle.replace(/^@/, "") || "?").charAt(0);
  const connected = account.connected;

  return (
    <Card className={cn("overflow-hidden p-0", className)}>
      {/* 헤더 — 핸들 + 채널 아이콘 */}
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <span className="truncate text-[14px] font-semibold">{account.handle}</span>
        <AppIconTile app={account.channel} size={24} />
      </div>

      <div className="p-4">
        {/* 아바타 + 통계 3분할 (앱 프로필 상단 레이아웃) — 실 연동 시 프로필 사진 */}
        <div className="flex items-center gap-4">
          {account.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- 서명 만료되는 IG CDN URL이라 이미지 최적화 프록시를 거치지 않는다
            <img
              src={account.avatarUrl}
              alt=""
              referrerPolicy="no-referrer"
              className={cn(
                "size-16 shrink-0 rounded-chip object-cover ring-2 ring-offset-2 ring-offset-body",
                RING[account.channel],
              )}
              aria-hidden
            />
          ) : (
            <span
              className={cn(
                "flex size-16 shrink-0 items-center justify-center rounded-chip bg-primary-weak text-2xl font-bold text-primary ring-2 ring-offset-2 ring-offset-body",
                RING[account.channel],
              )}
              aria-hidden
            >
              {initial}
            </span>
          )}
          <div className="grid flex-1 grid-cols-3 text-center">
            <ProfileStat label="게시물" value={connected ? account.posts.toLocaleString("ko-KR") : "—"} />
            <ProfileStat label="팔로워" value={connected ? formatCompact(account.followers) : "—"} />
            <ProfileStat label="참여율" value={connected ? formatPercent(account.avgEngagementRate) : "—"} />
          </div>
        </div>

        {/* 이름 + 7일 증감 + bio */}
        <div className="mt-3">
          <p className="flex items-center gap-2 text-[15px] font-bold">
            {account.displayName}
            <span className="text-xs font-normal text-fg-faint">· {CHANNEL_LABEL[account.channel]}</span>
          </p>
          {connected ? (
            <p
              className={cn(
                "tnum mt-0.5 text-xs font-semibold",
                account.followersDelta7d > 0
                  ? "text-positive"
                  : account.followersDelta7d < 0
                    ? "text-negative"
                    : "text-fg-faint",
              )}
            >
              팔로워 {formatDeltaCompact(account.followersDelta7d)} <span className="font-normal text-fg-faint">· 최근 7일</span>
            </p>
          ) : null}
          <p className="mt-1.5 text-[13px] leading-relaxed text-fg-sub">{account.bio}</p>
        </div>

        {/* 토큰 만료 경고 */}
        {connected && account.tokenExpiresInDays !== null && account.tokenExpiresInDays <= 14 ? (
          <p className="mt-3 rounded-card bg-warning-weak px-3 py-2 text-xs font-medium text-warning">
            연동 토큰이 {account.tokenExpiresInDays}일 후 만료돼요. 설정에서 재연동해 주세요.
          </p>
        ) : null}
      </div>

      {/* 게시물 그리드 (3×3) — 연동·데이터 있을 때만 */}
      {connected && grid.length > 0 ? (
        <div className="grid grid-cols-3 gap-0.5 border-t border-line" aria-hidden>
          {grid.map((post) => {
            const Icon = TYPE_ICON[post.type];
            return (
              <div
                key={post.id}
                className="group relative flex aspect-square items-center justify-center overflow-hidden bg-overlay transition-colors hover:bg-surface"
              >
                {post.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- 서명 만료되는 IG CDN URL이라 이미지 최적화 프록시를 거치지 않는다
                  <img
                    src={post.thumbnailUrl}
                    alt=""
                    referrerPolicy="no-referrer"
                    loading="lazy"
                    className="absolute inset-0 size-full object-cover"
                  />
                ) : (
                  <Icon className="size-5 text-fg-faint" />
                )}
                <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-surface/80 py-1 text-[11px] font-semibold text-fg opacity-0 transition-opacity group-hover:opacity-100">
                  <Play className="size-3" aria-hidden />
                  <span className="tnum">{formatCompact(post.views)}</span>
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        /* 미연동 — 잠금 상태 */
        <div className="flex flex-col items-center gap-3 border-t border-line px-4 py-8 text-center">
          <span className="flex size-10 items-center justify-center rounded-chip bg-overlay text-fg-faint">
            {connected ? <ImageIcon className="size-5" aria-hidden /> : <Lock className="size-5" aria-hidden />}
          </span>
          <p className="text-[13px] text-fg-sub">
            {connected
              ? "표시할 게시물이 아직 없어요."
              : `${CHANNEL_LABEL[account.channel]} 계정을 연동하면 프로필과 게시물을 볼 수 있어요.`}
          </p>
          {!connected ? (
            <ButtonLink href="/settings" size="sm" variant="secondary" className="gap-1.5">
              <Link2 className="size-4" aria-hidden />
              연동하기
            </ButtonLink>
          ) : null}
        </div>
      )}
    </Card>
  );
}

function ProfileStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="tnum text-[17px] font-bold leading-tight">{value}</p>
      <p className="mt-0.5 text-xs text-fg-faint">{label}</p>
    </div>
  );
}
