"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAdsWriteContext } from "@/lib/data/ads";
import { isMissingColumnError } from "@/lib/publish-rules";
import { checkScope, REQUIRED_SCOPE } from "@/lib/meta/granted-scopes";
import {
  fetchPageRecentPosts,
  fetchPages,
  lookupInstagramForPage,
  type FbIgAccount,
  type FbPage,
  type FbPagePost,
  type IgLookup,
  type PagesFailReason,
} from "@/lib/meta/ads-pages";
import type { AdsWriteFailCode } from "@/lib/ads/campaign-rules";

/** 페이지 조회 실패 → 코드. 만료는 재연동, 권한은 스코프, 나머지는 «확인 못 함» */
function pagesFailCode(reason: PagesFailReason): AdsWriteFailCode {
  return reason === "expired" ? "token_expired" : reason === "denied" ? "scope_missing_pages" : "pages_unverified";
}
/** 최근 게시물 조회 실패 → 코드. 곁가지라 전부 «페이지 선택에는 영향이 없어요» 문구로 간다(만료만 재연동 안내) */
function postsFailCode(reason: PagesFailReason): AdsWriteFailCode {
  return reason === "expired" ? "token_expired" : reason === "denied" ? "page_posts_denied" : "page_posts_unverified";
}
function igFailCode(state: Exclude<IgLookup, { state: "found" }>["state"]): AdsWriteFailCode {
  return state === "none"
    ? "instagram_required"
    : state === "expired"
      ? "token_expired"
      : state === "denied"
        ? "scope_missing_pages"
        : "instagram_unverified";
}

/**
 * 광고 게시 주체(페이지 · Instagram 계정) 고르기 — 2단계 슬라이스 2.
 *
 * 흐름: 페이지 목록 → 페이지 하나 고르면 그 페이지의 IG 계정 목록 → 둘을 저장.
 * 저장 액션은 제출값을 믿지 않는다 — **지금 다시 조회한 목록에 있는 id 만** 저장한다(campaignId 규칙과 같다).
 *
 * ⚠️ 저장은 **소유자만**(0077 RLS 도 소유자만 update 를 허용). editor 에게는 page_owner_only 로 안내한다 —
 * 폼을 열어 두고 0행 갱신만 반복하게 두지 않는다(설계 검토 minor).
 * ⚠️ 페이지 토큰은 lib/meta/ads-pages.ts 안에서만 산다. 여기서는 만지지 않는다.
 */

export type PublisherActionFail = { ok: false; code: AdsWriteFailCode };

async function ownerContext(): Promise<
  | { ok: true; token: string; adAccountId: string; ownerId: string; grantedScopes: string[] | null }
  | PublisherActionFail
> {
  const ctx = await getAdsWriteContext();
  if (ctx.state === "blocked") return { ok: false, code: ctx.code };
  if (ctx.role !== "owner") return { ok: false, code: "page_owner_only" };
  /* 페이지 목록 권한 — 확실히 없을 때만 막는다(확인 불가는 통과, 0075 규칙) */
  const scope = checkScope(ctx.grantedScopes, REQUIRED_SCOPE.pagesList);
  if (scope.state === "missing") return { ok: false, code: "scope_missing_pages" };
  return { ok: true, token: ctx.accessToken, adAccountId: ctx.adAccountId, ownerId: ctx.ownerId, grantedScopes: ctx.grantedScopes };
}

export type LoadPagesResult = { ok: true; pages: FbPage[] } | PublisherActionFail;

/** 1단계 — 광고를 게시할 수 있는 페이지 목록. 실패는 pages_unverified, 권한은 scope_missing_pages. */
export async function loadAdPagesAction(): Promise<LoadPagesResult> {
  const c = await ownerContext();
  if (!c.ok) return c;
  const res = await fetchPages(c.token);
  if (!res.ok) return { ok: false, code: pagesFailCode(res.reason) };
  return { ok: true, pages: res.data };
}

export type LoadIgResult =
  | { ok: true; accounts: FbIgAccount[] }
  /** 세 경로 모두 성공했고 0건 — 진짜 «연결 안 됨» */
  | { ok: false; code: "instagram_required" }
  | PublisherActionFail;

/** 0건([])은 «아직 게시물이 없다»는 사실이다 — 실패와 다르다 */
export type LoadPagePostsResult = { ok: true; posts: FbPagePost[] } | PublisherActionFail;

export type LoadPageStepResult =
  /** ig 와 posts 는 **서로의 실패를 섞지 않는다** — 게시물을 못 읽어도 IG 선택·저장은 그대로 된다 */
  | { ok: true; ig: LoadIgResult; posts: LoadPagePostsResult }
  /** 둘 다 시작도 못 한 실패(권한·역할·연결) — 화면이 한 번만 말한다 */
  | PublisherActionFail;

/**
 * 2단계 — 고른 페이지의 Instagram 계정(저장에 필요)과 최근 게시물(«맞는 페이지인지» 확인용, 2026-09-11)을 **한 액션에서 나란히** 읽는다.
 * 둘로 나누지 않은 이유: Next 는 클라이언트의 서버 액션을 **한 번에 하나씩** 보낸다(문서 «Sequential dispatch on the client») —
 * 나누면 게시물 조회가 IG 조회(최대 수십 초)를 통째로 기다린다. 서버 안에서는 Promise.all 로 동시에 간다.
 *
 * 게시물은 pages_read_engagement 를 따로 본다 — **확실히 없을 때만** 안 부르고 «다시 연결하면 보여요»(0075 규칙).
 * IG 조회는 이 권한과 무관하게 그대로 한다(없는 권한 때문에 필요한 기능을 막지 않는다).
 */
export async function loadPageStepAction(pageId: string): Promise<LoadPageStepResult> {
  if (!/^\d{1,30}$/.test(pageId)) return { ok: false, code: "invalid_request" };
  const c = await ownerContext();
  if (!c.ok) return c;

  const loadIg = async (): Promise<LoadIgResult> => {
    const ig = await lookupInstagramForPage(pageId, c.adAccountId, c.token);
    return ig.state === "found" ? { ok: true, accounts: ig.accounts } : { ok: false, code: igFailCode(ig.state) };
  };
  const loadPosts = async (): Promise<LoadPagePostsResult> => {
    if (checkScope(c.grantedScopes, REQUIRED_SCOPE.pagesReadEngagement).state === "missing") {
      return { ok: false, code: "scope_missing_page_posts" };
    }
    const res = await fetchPageRecentPosts(pageId, c.token);
    return res.ok ? { ok: true, posts: res.data } : { ok: false, code: postsFailCode(res.reason) };
  };

  const [ig, posts] = await Promise.all([loadIg(), loadPosts()]);
  return { ok: true, ig, posts };
}

export type SavePublisherResult = { ok: true; pageName: string; igUsername: string | null } | PublisherActionFail;

/**
 * 3단계 — 저장. 제출된 page_id 는 **지금 조회한 페이지 목록**(ADVERTISE 과업 있는 것)에,
 * ig_user_id 는 **그 페이지의 IG 목록**에 있어야 한다. 0행 갱신은 실패다.
 */
export async function saveAdPublisherAction(input: { pageId: string; igUserId: string }): Promise<SavePublisherResult> {
  const { pageId, igUserId } = input;
  if (!/^\d{1,30}$/.test(pageId) || !/^\d{1,30}$/.test(igUserId)) return { ok: false, code: "invalid_request" };
  const c = await ownerContext();
  if (!c.ok) return c;

  const pages = await fetchPages(c.token);
  if (!pages.ok) return { ok: false, code: pagesFailCode(pages.reason) };
  const page = pages.data.find((p) => p.id === pageId);
  if (!page) return { ok: false, code: "invalid_request" };
  if (!page.canAdvertise) return { ok: false, code: "page_role_required" };

  const ig = await lookupInstagramForPage(pageId, c.adAccountId, c.token);
  if (ig.state !== "found") return { ok: false, code: igFailCode(ig.state) };
  const igAccount = ig.accounts.find((a) => a.id === igUserId);
  if (!igAccount) return { ok: false, code: "invalid_request" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("meta_ad_accounts")
    .update({
      ad_page_id: page.id,
      ad_page_name: page.name,
      ad_ig_user_id: igAccount.id,
      ad_ig_username: igAccount.username,
    })
    .eq("user_id", c.ownerId)
    .eq("ad_account_id", c.adAccountId)
    .select("id");
  if (error) {
    /* 0082 미적용 — 컬럼이 없다. «다시 시도»가 아니라 «준비 중»이다(게재 시작의 not_ready 와는 다른 문구 — 소넷 점검) */
    if (isMissingColumnError(error, /ad_page_id/i)) return { ok: false, code: "publisher_not_ready" };
    console.error("[ads-publisher] 게시 주체 저장 실패:", error.message);
    return { ok: false, code: "failed" };
  }
  if (!data || data.length === 0) {
    console.error("[ads-publisher] 게시 주체 저장 0행 — RLS(소유자만) 또는 계정 행 없음");
    return { ok: false, code: "page_owner_only" };
  }

  revalidatePath("/settings/channels");
  revalidatePath("/ads/campaigns");
  return { ok: true, pageName: page.name, igUsername: igAccount.username };
}
