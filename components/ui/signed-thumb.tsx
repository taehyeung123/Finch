"use client";

import { useState, type ReactNode } from "react";

/*
  서명 URL 썸네일 — 열리지 않으면 fallback 으로 물러난다 (2026-09-12 점검).

  발행 목록의 썸네일은 비공개 버킷(publish-media)의 한 시간짜리 서명 URL 이다(lib/publish/thumbs.ts). 탭을 오래 켜 두고
  보기를 바꾸거나(목록↔달력·달 넘기기) 라우터가 옛 화면 조각을 다시 쓰면 만료된 주소로 <img> 가 새로 그려지는데,
  onError 가 없으면 깨진 그림 칸이 그대로 남는다. 실패하면 «썸네일 없음»과 같은 모습(종류 아이콘)으로 물러난다 —
  avatar-image.tsx·ads/page-recent-posts.tsx 와 같은 수법이다.

  · 깨진 **주소**만 기억한다 — 새로고침으로 새 서명 URL 이 오면 다시 그려 본다.
  · overlay(영상 ▶ 칩 등)는 사진이 실제로 보일 때만 그린다 — 아이콘 위에 ▶ 가 겹치지 않게.
  · 서버 컴포넌트(스튜디오 작업 목록)도 쓴다 — 서버의 <img> 에는 onError 를 달 수 없어서 이 컴포넌트가 따로 있다.
*/
export function SignedThumb({
  src,
  fallback,
  overlay = null,
  className,
}: {
  src: string | null;
  /** 썸네일이 없거나 깨졌을 때 — 종류 아이콘 */
  fallback: ReactNode;
  /** 사진이 보일 때만 위에 얹는 것 */
  overlay?: ReactNode;
  className?: string;
}) {
  const [brokenSrc, setBrokenSrc] = useState<string | null>(null);
  if (!src || src === brokenSrc) return <>{fallback}</>;
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- 만료되는 Storage 서명·공개 URL 이라 이미지 최적화 프록시를 거치지 않는다 */}
      <img src={src} alt="" className={className} onError={() => setBrokenSrc(src)} />
      {overlay}
    </>
  );
}
