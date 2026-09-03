/**
 * 미리보기 노출 위치(ad_format) — 순수 상수. 클라이언트(탭)와 서버(generatepreviews 어댑터)가 같이 쓴다.
 * ⚠️ 서버 전용 모듈(lib/meta/ads-preview.ts)에 두면 클라이언트 번들이 server-only 를 물고 빌드가 깨진다.
 *
 * 공식 정의문 있는 IG 3종 확인, FB 피드 값은 이름·예제 근거 추정(스펙 §5.1).
 * INSTAGRAM_EXPLORE_CONTEXTUAL 은 v26 에서 Explore 게재가 사라져 후보에서 뺐다.
 */
export const AD_PREVIEW_FORMATS = {
  INSTAGRAM_STANDARD: "Instagram 피드",
  INSTAGRAM_STORY: "Instagram 스토리",
  INSTAGRAM_REELS: "Instagram 릴스",
  MOBILE_FEED_STANDARD: "Facebook 피드",
} as const;
export type AdPreviewFormat = keyof typeof AD_PREVIEW_FORMATS;
export const AD_PREVIEW_FORMAT_KEYS = Object.keys(AD_PREVIEW_FORMATS) as AdPreviewFormat[];
