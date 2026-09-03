"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";

/*
  프로필 사진 — 외부 OAuth CDN(구글 lh3·카카오 kakaocdn) 이미지 + 이니셜 폴백.

  왜 클라이언트 컴포넌트인가: 서버 컴포넌트의 <img> 에는 onError 를 달 수 없다. URL 은 있는데
  만료·차단·삭제로 안 열리면 깨진 이미지 사각형이 그대로 남는다(2026-09-03 소넷 점검).
  실패하면 이니셜로 물러난다 — 사진이 없는 계정과 같은 모습이다.

  next/image 를 안 쓰는 이유: 서명·리퍼러 제약이 있는 외부 CDN 이라 최적화 프록시를 거치지 않는다
  (채널 아바타와 같은 판단 — dashboard-client.tsx 주석). referrerPolicy=no-referrer 가 필요하다.
*/
export function AvatarImage({
  src,
  initial,
  sizeClass,
  textClass,
}: {
  src: string | null;
  /** 폴백 글자 — 이름·이메일 첫 글자 */
  initial: string;
  /** size-12 · size-14 등 — 사진과 폴백이 같은 칸을 차지한다 */
  sizeClass: string;
  /** 폴백 글자 크기 — text-[17px] · text-[20px] */
  textClass: string;
}) {
  const [failed, setFailed] = useState(false);

  if (src && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- 외부 OAuth 프로필 CDN, referrerPolicy 필요
      <img
        src={src}
        alt=""
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className={cn("shrink-0 rounded-chip bg-plate object-cover", sizeClass)}
      />
    );
  }
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-chip bg-primary-weak font-bold text-primary",
        sizeClass,
        textClass,
      )}
      aria-hidden
    >
      {initial}
    </span>
  );
}
