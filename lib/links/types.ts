import type { LinkThemeCustom } from "./themes";
import type { LinkBlock } from "./blocks";
import type { LinkPageSettings } from "./settings";

/*
  프로필 링크 **화면 모델** — 서버(page.tsx)가 만들고 클라이언트가 그리는 형태.

  왜 컴포넌트가 아니라 여기 있나: 데모 모드 샘플(lib/mock/data.ts)이 같은 모양을
  만들어야 한다. 타입이 app/(app)/links 안에 갇혀 있으면 lib 가 app 을 import 하는
  거꾸로 된 의존이 생긴다.
*/

export interface LinkPageView {
  id: string;
  slug: string;
  title: string;
  bio: string;
  published: boolean;
  layout: string;
  theme: string;
  /** 직접 꾸미기 오버라이드(0056) — null 이면 프리셋 그대로 */
  themeCustom: LinkThemeCustom | null;
  align: string;
  avatarPath: string | null;
  coverPath: string | null;
  snsLinks: Array<{ kind: string; url: string }>;
  seoTitle: string;
  seoDesc: string;
  /** SNS 줄 위치: profile(소개 아래) | links(블록 목록 위) */
  snsPlacement: string;
  /** 프로필 타이틀 크기: sm | md | lg */
  titleSize: string;
  /** 마지막 라이브 반영 시각. null 이면 한 번도 발행 안 함 */
  publishedAt: string | null;
  /** 초안이 마지막 발행본과 다른가 — "라이브 반영" 버튼의 상태를 정한다 */
  dirty: boolean;
  /** 페이지 설정(0058) — 발행과 무관하게 즉시 적용. 미적용 DB 면 기본값 */
  settings: LinkPageSettings;
}

/**
 * 발행본(published_snapshot)의 화면 모델 — 「라이브」 미리보기가 그린다.
 *
 * 초안(LinkPageView + LinkBlock[])과 **따로** 내려보내는 이유: 초안과 발행본은
 * 프로필·테마까지 전부 다를 수 있다. 발행본 미리보기가 초안의 테마로 그려지면
 * "라이브에 지금 뭐가 걸려 있나"라는 질문에 거짓으로 답하게 된다.
 */
export interface LinkSnapshotView {
  title: string;
  bio: string;
  layout: string;
  theme: string;
  align: string;
  avatarPath: string | null;
  coverPath: string | null;
  snsLinks: Array<{ kind: string; url: string }>;
  /** SNS 줄 위치 — 0051 이후. 없으면 profile */
  snsPlacement?: string;
  /** 프로필 타이틀 크기 — 0051 이후. 없으면 md */
  titleSize?: string;
  themeCustom?: LinkThemeCustom | null;
  blocks: Array<{ id: string; type: string; data: Record<string, unknown> }>;
}

export interface LinkStats {
  days: number;
  /**
   * 집계 자체가 실패했는가.
   *
   * 없으면 0 이 "성과 0" 과 구분되지 않는다 — 클릭 수천 건이 쌓인 사장님이
   * 조회 0·클릭 0·"아직 데이터가 없어요"를 보고 멀쩡한 페이지를 갈아엎는다.
   */
  failed: boolean;
  /** 페이지가 열린 횟수 */
  views: number;
  /** 사람 수(쿠키를 지운 방문은 셀 수 없어 빠진다) */
  uniques: number;
  clicks: number;
  ctr: number;
  returning: number;
  daily: Array<{ date: string; views: number; clicks: number }>;
  /** removed=true 는 초안에서 지웠지만 라이브에서 눌린 블록 */
  blocks: Array<{ id: string; label: string; removed: boolean; clicks: number }>;
  regions: Array<{ country: string; region: string; views: number }>;
  /** 유입 채널(?src=) — null 은 직접·표식 없는 링크. 0055 미적용 서버는 빈 배열 */
  sources: Array<{ src: string | null; views: number }>;
  /** 기기(0058) — null 은 판정 불가·0058 이전 기록. 미적용 서버는 빈 배열 */
  devices: Array<{ device: string | null; views: number }>;
  /** 유입 리퍼러 호스트(0058) — null 은 직접 입력·앱 내부 브라우저. 미적용 서버는 빈 배열 */
  referrers: Array<{ host: string | null; views: number }>;
  /** 평균 체류(0058) — 비콘이 닿은 방문(n)만. n=0 이면 모름 */
  dwell: { avgMs: number; n: number };
}

export interface LinkLead {
  id: number;
  kind: "contact" | "subscribe";
  name: string | null;
  email: string | null;
  phone: string | null;
  message: string | null;
  createdAt: string;
}

/** 방명록 글(주인용 — 숨김 포함). 0057 */
export interface LinkGuestbookEntry {
  id: number;
  name: string;
  message: string;
  reply: string | null;
  hidden: boolean;
  createdAt: string;
}

/** /links 화면 한 벌 — 실제 모드는 DB 에서, 데모 모드는 샘플에서 온다 */
export interface LinkWorkspace {
  page: LinkPageView | null;
  blocks: LinkBlock[];
  /** 마지막 발행본. null 이면 한 번도 발행 안 함 */
  snapshot: LinkSnapshotView | null;
  stats: LinkStats;
  leads: LinkLead[];
  /** 방명록 최근 50건(숨김 포함). 0057 미적용이면 빈 배열 */
  guestbook?: LinkGuestbookEntry[];
  /**
   * 페이지·블록 조회 자체가 실패했다 — "페이지 없음"과 **구분**한다.
   * 뭉개면 생성 폼이 떠서 23505 로 영원히 실패하거나, 빈 캔버스가 "블록이 다 날아갔다"로 읽힌다(감사 #10·#11).
   */
  loadFailed?: boolean;
}
