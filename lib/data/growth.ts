import "server-only";

/**
 * 성장 진단 데이터 (서버 전용) — 연동된 인스타 계정의 실제 게시물 성과를 집계한다.
 *
 * 핀치 고유 킬러 기능 "성장 루프"의 1단계(진단) 데이터 소스.
 * 게시물별 저장률(saved/reach)·참여율은 공식 API 값(saved·reach·total_interactions)에서
 * 직접 계산한 실측 비율이다(자체 추정치 아님). 도달 0인 게시물은 비율 계산에서 제외한다.
 *
 * API 호출 절제: 최근 미디어 중 상위 N개만 개별 인사이트를 조회한다(레이트리밋·쿼터 보호).
 */

import { getInstagramAccessContext } from "./live";
import { fetchRecentMedia, fetchMediaInsights, type MediaItem } from "@/lib/meta/instagram";
import { isDemoMode } from "@/lib/supabase/config";
import { recentPosts } from "@/lib/mock/data";

const INSIGHT_LIMIT = 12; // 개별 인사이트를 조회할 최근 게시물 수

export type PostKind = "릴스" | "피드" | "캐러셀" | "영상" | "스토리";

function toKind(m: MediaItem): PostKind {
  if (m.mediaProductType === "REELS") return "릴스";
  if (m.mediaProductType === "STORY") return "스토리";
  if (m.mediaType === "VIDEO") return "영상";
  if (m.mediaType === "CAROUSEL_ALBUM") return "캐러셀";
  return "피드";
}

export interface PostPerf {
  id: string;
  caption: string; // 첫 줄 요약
  kind: PostKind;
  publishedAt: string | null;
  permalink: string | null;
  thumbnailUrl: string | null;
  reach: number;
  saved: number;
  views: number;
  likes: number;
  comments: number;
  /** 저장률 % = saved / reach × 100 (공식 값에서 계산한 실측 비율) */
  saveRate: number;
  /** 참여율 % = total_interactions / reach × 100 */
  engagementRate: number;
}

export interface GrowthPerformance {
  posts: PostPerf[]; // 저장률 높은 순
  avgSaveRate: number;
  avgEngagementRate: number;
  avgReach: number;
  sampleSize: number;
}

const KIND_OF: Record<string, PostKind> = {
  reels: "릴스", video: "영상", carousel: "캐러셀", text: "피드", feed: "피드", story: "스토리",
};

/** 데모 성과표 — 목 게시물에서 합성. 실측이 아니라 화면 확인용 샘플이다. */
function demoPerformance(): GrowthPerformance {
  const posts: PostPerf[] = recentPosts
    .filter((p) => p.views > 0) // reach=0 → NaN 방지. 실경로의 reach<=0 제외와 대칭
    .map((p) => {
    /* 도달(순 계정 수) ≤ 조회수(반복 조회 포함)다 — 정의상 뒤집힐 수 없다.
       예전 계수 1.12 는 «평균 도달» 카드를 화면에 올리자마자 조회수보다 큰 값을 뱉었다. */
    const reach = Math.round(p.views * 0.82);
    const saved = Math.round(p.shares * 0.85 + p.likes * 0.04);
    const interactions = p.likes + p.comments + p.shares + saved;
    return {
      id: p.id,
      caption: p.caption,
      kind: KIND_OF[p.type] ?? "피드",
      publishedAt: p.publishedAt,
      permalink: null,
      thumbnailUrl: p.thumb ?? null,
      reach,
      saved,
      views: p.views,
      likes: p.likes,
      comments: p.comments,
      saveRate: Math.round((saved / reach) * 1000) / 10,
      engagementRate: Math.round((interactions / reach) * 1000) / 10,
    };
  }).sort((a, b) => b.saveRate - a.saveRate);

  const avg = (sel: (x: PostPerf) => number) =>
    Math.round((posts.reduce((s, x) => s + sel(x), 0) / posts.length) * 10) / 10;
  return {
    posts,
    avgSaveRate: avg((x) => x.saveRate),
    avgEngagementRate: avg((x) => x.engagementRate),
    avgReach: Math.round(posts.reduce((s, x) => s + x.reach, 0) / posts.length),
    sampleSize: posts.length,
  };
}

/** 연동 계정의 최근 게시물 성과 집계. 연동/토큰 없으면 null, 유효 표본 없으면 sampleSize 0. */
export async function getPostPerformance(): Promise<GrowthPerformance | null> {
  /* 데모 모드는 실 IG 컨텍스트가 없어 아래 조회가 null 을 반환한다. 그러면 이 탭만
     "연동해 주세요"로 비고, 개요·링크 탭은 샘플이 나와 위화감이 생긴다.
     목 게시물에서 성과표를 합성해 다른 탭과 결을 맞춘다(공식 값 없는 목이라
     reach·saved 는 views·shares 에서 그럴듯하게 유도한다). */
  if (isDemoMode()) return demoPerformance();

  const ctx = await getInstagramAccessContext();
  if (!ctx) return null;

  const media = await fetchRecentMedia(ctx.igUserId, ctx.token, 24);
  if (media.length === 0) {
    return { posts: [], avgSaveRate: 0, avgEngagementRate: 0, avgReach: 0, sampleSize: 0 };
  }

  const targets = media.slice(0, INSIGHT_LIMIT);
  const insights = await Promise.all(
    targets.map((m) => fetchMediaInsights(m.id, m.mediaProductType, ctx.token)),
  );

  const posts: PostPerf[] = [];
  targets.forEach((m, i) => {
    const ins = insights[i];
    if (!ins || ins.reach <= 0) return; // 도달 0/조회 실패는 비율 계산 불가 — 제외
    posts.push({
      id: m.id,
      caption: m.caption?.split("\n")[0]?.slice(0, 60) || "(캡션 없음)",
      kind: toKind(m),
      publishedAt: m.timestamp,
      permalink: m.permalink,
      thumbnailUrl: m.thumbnailUrl ?? m.mediaUrl,
      reach: ins.reach,
      saved: ins.saved,
      views: ins.views,
      likes: ins.likes,
      comments: ins.comments,
      saveRate: Number(((ins.saved / ins.reach) * 100).toFixed(2)),
      engagementRate: Number(((ins.totalInteractions / ins.reach) * 100).toFixed(2)),
    });
  });

  posts.sort((a, b) => b.saveRate - a.saveRate);

  const n = posts.length;
  const avg = (sel: (p: PostPerf) => number) => (n > 0 ? posts.reduce((s, p) => s + sel(p), 0) / n : 0);

  return {
    posts,
    avgSaveRate: Number(avg((p) => p.saveRate).toFixed(2)),
    avgEngagementRate: Number(avg((p) => p.engagementRate).toFixed(2)),
    avgReach: Math.round(avg((p) => p.reach)),
    sampleSize: n,
  };
}
