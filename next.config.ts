import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      /* 발행 컴포저(post-composer.tsx)가 이미지를 base64 data URL 로 서버 액션에
         넘긴다. 기본 1MB 로는 사진 한 장도 못 들어간다 — 컴포저가 클라이언트에서
         1440px JPEG 로 축소해 장당 ~1.5MB(base64 ~2MB), 캐러셀 10장이면 ~20MB 라
         25mb 로 잡는다. 컴포저의 축소 상수(MAX_DIMENSION)와 짝이다 — 한쪽만
         바꾸면 저장이 프레임워크 단에서 조용히 막힌다. */
      bodySizeLimit: "25mb",
    },
  },
};

export default nextConfig;
