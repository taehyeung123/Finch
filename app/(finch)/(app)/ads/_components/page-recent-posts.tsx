"use client";

import { useState } from "react";
import { ExternalLink, FileText } from "lucide-react";
import type { FbPagePost } from "@/lib/meta/ads-pages";

/*
  광고 게시 페이지 고르기 ② 단계의 «이 페이지의 최근 게시물» (2026-09-11).

  하는 일: 고른 페이지의 최근 게시물 3개(글 앞부분·사진·날짜·페이스북 링크)를 보여 준다 — 이름이 비슷한 페이지가
  여럿일 때 «이 페이지가 맞는지» 눈으로 확인하는 자리다. 메타 앱 심사의 pages_read_engagement 녹화 장면이기도 하다
  (docs/APP_REVIEW.md §4-1-3).

  - 곁가지다: 못 읽어도 페이지·Instagram 계정 선택과 저장은 그대로 된다 — 문구가 그렇게 말한다(campaign-rules.ts).
  - 실패는 «없음»이 아니다: 조회 실패(error)는 «불러오지 못했어요», 0건은 «아직 게시물이 없어요»로 가른다.
  - 사진은 메타 CDN 주소를 그대로 연다(서버가 fbcdn.net https 만 통과시킨다 — ads-pages.ts). 서명 URL 이라
    만료되면 깨지므로 onError 에서 아이콘 칸으로 물러난다(avatar-image.tsx 와 같은 이유로 클라이언트 컴포넌트).
*/

const DATE_FMT = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "long", day: "numeric" });

function PostThumb({ src }: { src: string | null }) {
  const [failed, setFailed] = useState(false);
  if (src && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- 메타 CDN 서명 URL 이라 이미지 최적화 프록시를 거치지 않는다(캠페인 상세의 소재 썸네일과 같다)
      <img
        src={src}
        alt=""
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className="size-12 shrink-0 rounded-card bg-plate object-cover"
      />
    );
  }
  return (
    <span className="flex size-12 shrink-0 items-center justify-center rounded-card bg-plate text-fg-faint" aria-hidden>
      <FileText className="size-4" />
    </span>
  );
}

export function PageRecentPosts({ posts, error }: { posts: FbPagePost[]; error: string | null }) {
  return (
    <section aria-labelledby="page-recent-posts-title" className="mt-4 border-t border-line pt-4">
      <h3 id="page-recent-posts-title" className="text-[14px] font-semibold">
        이 페이지의 최근 게시물
      </h3>
      <p className="mt-0.5 text-[12px] text-fg-sub">고른 페이지가 맞는지 확인해 보세요.</p>
      {error ? (
        <p className="mt-2 rounded-card bg-plate p-3 text-[14px] text-fg-sub">{error}</p>
      ) : posts.length === 0 ? (
        <p className="mt-2 rounded-card bg-plate p-3 text-[14px] text-fg-sub">이 페이지에는 아직 게시물이 없어요.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {posts.map((p) => (
            <li key={p.id} className="flex items-start gap-3 rounded-card border border-line p-2.5">
              <PostThumb src={p.pictureUrl} />
              <div className="min-w-0 flex-1">
                {p.message ? (
                  <p className="line-clamp-2 break-keep text-[14px] text-fg">{p.message}</p>
                ) : (
                  <p className="text-[14px] text-fg-sub">글 없이 올린 게시물</p>
                )}
                <p className="tnum mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[12px] text-fg-sub">
                  {p.createdTime ? <time dateTime={p.createdTime}>{DATE_FMT.format(new Date(p.createdTime))}</time> : null}
                  {p.createdTime && p.permalinkUrl ? <span aria-hidden>·</span> : null}
                  {p.permalinkUrl ? (
                    <a
                      href={p.permalinkUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-0.5 font-medium text-fg underline underline-offset-2"
                    >
                      Facebook에서 보기
                      <ExternalLink className="size-3" aria-hidden />
                    </a>
                  ) : null}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
