import type { LinkBlock } from "./blocks";

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
  align: string;
  avatarPath: string | null;
  coverPath: string | null;
  snsLinks: Array<{ kind: string; url: string }>;
  seoTitle: string;
  seoDesc: string;
  /** 마지막 라이브 반영 시각. null 이면 한 번도 발행 안 함 */
  publishedAt: string | null;
  /** 초안이 마지막 발행본과 다른가 — "라이브 반영" 버튼의 상태를 정한다 */
  dirty: boolean;
}

export interface LinkStats {
  days: number;
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

/** /links 화면 한 벌 — 실제 모드는 DB 에서, 데모 모드는 샘플에서 온다 */
export interface LinkWorkspace {
  page: LinkPageView | null;
  blocks: LinkBlock[];
  stats: LinkStats;
  leads: LinkLead[];
}
