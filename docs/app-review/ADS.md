# Meta App Review: Marketing API group (Facebook Login for ads)

Checked against `main` @ 65ddf9f on 2026-09-11. Every Korean label below was matched to the source. The file:line references are in §7.

## 0. Before recording

### 0.1 Scopes on main
`lib/meta/ads-oauth.ts:60-66` requests 5 scopes: `ads_read, ads_management, pages_show_list, pages_read_engagement, business_management`. The authorize URL adds `auth_type=rerequest` (line 140).
- `docs/APP_REVIEW.md` is out of date in three places, because the branch was merged in 69151b0:
  - §1 row «광고» (line 23: «지금 요청 4 + 빠진 business_management»);
  - §2 heading (line 68: «main 은 아직 4개»);
  - §3 (line 114: `business_management` «요청 안 함»).
- In the dashboard's Marketing API use case, confirm that `business_management` is listed and added to review.

### 0.2 Gaps to fix or accept before recording
1. **Reach is fetched but never shown.**
   - Meta's screencast steps for ads_read, ads_management and business_management all say: show ads data "such as Impressions, Conversions, Spend, Clicks, and Reach".
   - `fetchCampaignInsights` reads `reach` (`lib/meta/ads.ts:377`) and `LiveAdCampaign.reach` exists (`lib/data/ads.ts:77, 296`). But `live-campaign-table.tsx` and the «광고 관리» cards never display it.
   - **Add a per-campaign «도달» (Reach) column before recording.** Don't add an account-total reach card by summing campaigns: reach is de-duplicated per campaign, so the sum overstates it.
2. **The «임시오픈» pop-up comes back after Facebook Login.**
   - `components/layout/opening-notice.tsx` is mounted in `(app)/layout.tsx:94`.
   - «닫기» (Close) only hides it until the next full page load. Only «오늘 하루 종일 보지 않기» (Don't show again today) keeps it hidden, stored per browser for the KST day.
   - The Facebook redirect back to Finch is a full page load. So the pop-up reappears on top of the «광고 계정 1개를 연결했어요» result dialog: it sits at z-[60], and `ModalShell` sits at z-50.
   - Its text, «지금은 임시오픈 기간입니다 … 일부 기능은 계속 다듬어질 수 있습니다» ("temporary opening … some features may still be refined"), reads as an unfinished app.
   - Best fix: hide it for the review account in code. At minimum, click «오늘 하루 종일 보지 않기» off camera in the recording browser before the first take. Logging out of Finch does not reset it.
3. **The «AI 추천» card on «광고 관리» looks unfinished.**
   - In live mode it shows a «준비 중» (Coming soon) badge and «…기능을 만들고 있어요. 열리면 알려드릴게요.» ("we're building this") (`ads/page.tsx:294-327`).
   - Meta lists screens that look incomplete as a rejection reason. Hide the card, or don't scroll below «캠페인 성과» on camera.
4. **Three facts only the first real API call can confirm** (the code comments mark them UNVERIFIED). The owner's reconnect run (APP_REVIEW §4-2-4) settles all three:
   - whether `/{page}/posts` works without `pages_read_user_content` (`lib/meta/ads-pages.ts:138-139`);
   - whether the `AdAccount.business` field comes back (`lib/meta/ads.ts:193-195`);
   - whether the Page's Instagram account can be found without `instagram_basic` (`ads-pages.ts:216, 254-285`). Saving in the Page picker depends on this.
5. **Where metrics appear.**
   - The campaign detail page shows only structure: budget, bid, ad sets and ads. It has no metrics.
   - Rows on «광고 관리» are not clickable.
   - So every metrics scene is filmed on «광고 관리» (Ads) and on the Home card.
6. **Conversions are purchases only.**
   - «전환» counts one purchase action type, in this order: omni_purchase → purchase → pixel purchase (`lib/meta/ads.ts:345-364`).
   - A campaign with no purchase in the last 30 days shows «미추적» (Not tracked) even when a pixel is installed, and its «ROAS» shows «—».
   - Don't write captions that promise conversion numbers unless the demo campaign had purchases.

### 0.3 Recording prerequisites
**Accounts and assets**
- **Owner's Facebook account:**
  - It has a role on app 1709021066981985. The app stays in development mode.
  - The Facebook dialog will show the owner's Facebook name and photo [OWNER CONFIRM].
- **Ad account:** owned by a business portfolio (expected «주식회사 딥레드» [VERIFY actual name]).
  - It needs at least one campaign that delivered in the last 30 days, with non-zero spend, impressions and link clicks.
  - For the pause/resume demo, that campaign is «게재 중» (Active) with a small daily budget. Resuming spends real money.
- **Facebook Page:**
  - The owner has the ADVERTISE task on it.
  - It has at least one recent post with text and a photo.
  - It is linked to an Instagram professional account, which is required to save in the Page picker [VERIFY which account].
- **Recording account:** the review Google account.
  - It is in `OWNER_EMAIL` but not first. That opens the ads connection to it, and `isPrimaryOwner` hides the operator-only notice and raw error details.
  - It must already have finished onboarding and consent. Otherwise every screen redirects to `/onboarding/consent`.

**API calls**
- `pages_show_list`, `pages_read_engagement` and `business_management` had 0 calls on 09-11. Do the following at least 2 days before submitting, because calls take up to 2 days to show in the dashboard:
  1. Reconnect Meta Ads.
  2. Let the «비즈니스 포트폴리오» row load. That is the business_management call.
  3. Open «페이지 선택» (pages_show_list).
  4. **Click a Page** so «이 페이지의 최근 게시물» loads. That is the pages_read_engagement call.

**Browser setup**
- Desktop, window 1440 px wide or less. The sidebar renders only at 768 px or wider.
- Record at 1080p or higher, no audio, English captions over the Korean UI.
- Use a larger mouse cursor and click rather than type, as Meta's screen-recording guide asks.
- Sign in to Google and Facebook beforehand, so no password is typed on camera. Finch itself starts logged out.

**Before each take** (five takes, one per permission)
1. In Finch (review account): on the «Meta 광고» row, click «연결 해제» → «해제하기», then «확인».
   - This deletes Finch's connection. The delete cascades to `meta_ad_accounts`, so the saved Page is cleared too.
2. **Remove Finch from the Facebook account's business integrations** [VERIFY the Facebook menu path].
   - Finch's «연결 해제» does not revoke the app on Facebook (`settings/channels/actions.ts:87-92`).
   - Without this step, the next login will likely show a short "continue as…" screen instead of the permission screens [VERIFY]. Meta requires each video to show "an app user granting your app each permission".
   - ⚠️ Side effect: Meta then calls the deauthorize callback. It clears the token of **every** Finch connection with that Facebook user ID (`app/api/auth/meta-ads/deauthorize/route.ts:36-37`), including the owner's main Finch account. Reconnect Meta Ads on the main account after the last take.
3. Log out with the round initial button at the top right (aria-label «계정 메뉴») → «로그아웃».

**During the takes**
- **In the Facebook Login dialog:** select the ad account, the Page and the business when asked [VERIFY screens and wording]. Pause about 3 seconds on the screen that lists the permission the video is about.
- **Don't film «광고 만들기» (Create ad).** Creating a creative may fail in development mode (error 1885183 suspected).
- **Wait at least 3 seconds after any change before the next one** (pause → resume, resume → create). `WRITE_COOLDOWN_SECONDS = 3`; a faster click shows «요청이 너무 빨라요. 잠시 후 다시 시도해 주세요.»

### 0.4 Reviewer access (ads)
- **Finch login:** the review Google account. Its credentials go only in the submission's test-credentials field.
- **Facebook Login:** Meta's submission guide says reviewers test "using our own test accounts" and forbids sharing your personal account credentials. A fake Facebook account also gets the whole submission rejected.
  - While the app is in development mode, Facebook Login normally works only for accounts with an app role. Whether Meta's reviewers are exempt is not documented [VERIFY].
  - If Facebook refuses the account, the reviewer may stay on Facebook's error page, or come back to «이 계정에는 아직 연결 권한이 없어요» [VERIFY]. So the screencasts are the main evidence.
- **If the reviewer's Facebook account has no ad account:**
  - The result dialog reads «연결은 됐지만 쓸 수 있는 광고 계정이 없어요» ("Connected, but no usable ad account").
  - The row shows «광고 계정 없음».
  - The «비즈니스 포트폴리오» and «광고 게시 페이지» rows don't appear, because both need at least one ad account.
  - «광고 관리» shows «이 계정으로 볼 수 있는 광고 계정이 없어요».
- **[DECIDE] Pre-connect the review account.** The owner could connect their own Facebook ad account once, inside the review account's Finch session. `meta_ad_connections` is unique only on `user_id` (0077:42), so this works. The reviewer would then see live data, the portfolio row and the Page picker without their own Facebook login. The risks:
  - «게재 시작» (Start delivery) spends real money.
  - «다시 연결» or «연결 해제» by the reviewer replaces or removes the connection.
  - The token lasts about 60 days and cannot be refreshed.
  - Removing Finch on Facebook (0.3 step 2) disconnects it too, so this has to be the last step after all recordings.

### 0.5 Common reviewer steps C1–C8
Paste this once into the submission-level reviewer instructions.

> Finch's interface is in Korean only. Each step gives the Korean label followed by an English translation in parentheses.
>
> 1. C1. Open https://finch.ai.kr (logged out).
> 2. C2. Click «로그인» (Log in) at the top right.
> 3. C3. Click «Google로 계속하기» (Continue with Google) and sign in with the Google account from the test-credentials field. You land on «홈» (Home).
> 4. C4. If a notice titled «지금은 임시오픈 기간입니다» (Temporary opening period) appears, click «오늘 하루 종일 보지 않기» (Don't show again today) so it doesn't reappear after Facebook Login. If «채널을 연동해 볼까요?» (Connect your channels?) appears, click «다음에 할게요» (Maybe later).
> 5. C5. At the bottom of the left sidebar, click «계정 및 설정» (Account & Settings). In the group «연결» (Connections), click «SNS 계정 연결» (Connect social accounts).
> 6. C6. Scroll to the section «광고 계정» (Ad accounts). On the row «Meta 광고» (Meta Ads), click «연결하기» (Connect). If the row is already connected, click «다시 연결» (Reconnect).
> 7. C7. A dialog «Meta 광고로 이동하고 있어요» (Taking you to Meta Ads) appears, then Facebook Login opens. Log in and allow all requested permissions. When asked, select your business portfolio, your Facebook Page and your ad account.
> 8. C8. You return to «SNS 계정 연결» with the dialog «광고 계정 N개를 연결했어요» (Connected N ad account(s)). Click «확인» (OK). The row now shows «연결됨» (Connected) and your ad account name.
>
> At the bottom of this screen, the card «핀치가 요청하는 권한» (Permissions Finch requests) expands to list each Meta Ads permission in Korean. The ad screens need a Facebook account with access to an ad account (and, for the Page steps, a Page you can advertise on). Without them you will see the "no ad account" messages; the screencasts show the full flow with a real ad account.

---

## 1. ads_read

### How we use it
Finch is a dashboard where businesses track their Instagram and Threads results, and ads_read lets them see their paid Meta results on the same screens instead of switching to Ads Manager. After Facebook Login, Finch lists the ad accounts the person can access (`/me/adaccounts`) and, for the selected account, reads its campaigns and campaign-level Insights for the last 30 days: spend, impressions, reach, inline link clicks, and purchase actions and values. The «광고 관리» (Ads) screen shows account totals (amount spent, impressions, average CTR, average ROAS) and a per-campaign table with daily budget, spend, impressions, link clicks, CTR, CPC, conversions (purchases) and ROAS, while the Home card «광고 현황» (Ads overview) summarizes spend, active campaigns and ROAS. Metrics are requested from Meta each time a screen opens rather than stored, amounts use the ad account's own currency, and if the Insights request fails Finch shows «—» instead of zeros.

*If the «도달» column (0.2-1) ships, change "spend, impressions, link clicks, CTR" to "spend, impressions, reach, link clicks, CTR".*

### Reviewer test steps
1. Complete C1–C8.
2. In the sidebar under «SNS», click «광고 관리» (Ads). The subtitle reads «{ad account name} · 최근 30일» ({ad account} · Last 30 days).
3. Read the four cards: «집행 금액 (최근 30일)» (Amount spent, last 30 days), «노출수 (최근 30일)» (Impressions, last 30 days), «평균 CTR» (Avg. CTR) and «평균 ROAS» (Avg. ROAS).
4. Scroll to «캠페인 성과» (Campaign performance). The columns are:
   - «캠페인» (Campaign), «목표» (Objective), «상태» (Status);
   - «일 예산» (Daily budget), «집행액» (Spent), «노출» (Impressions), «링크 클릭» (Link clicks);
   - «CTR», «CPC», «전환» (Conversions) and «ROAS».

   With no campaigns, you see «아직 만든 캠페인이 없어요» (No campaigns yet). Campaigns with no delivery in the last 30 days show 0. «전환» reads «미추적» (Not tracked) when a campaign had no purchases.
5. Click «홈» (Home). The card «광고 현황» (Ads overview) on the right shows «집행 금액 (최근 30일)», «진행 중 캠페인» (Active campaigns) and «평균 ROAS», counted over active campaigns («진행 중 캠페인 기준»).

### Screencast script
| # | Screen / action | Caption |
|---|---|---|
| 1 | finch.ai.kr landing page, logged out | "Finch (finch.ai.kr), logged out. This recording shows how Finch uses ads_read." |
| 2 | «로그인» → «Google로 계속하기» → choose the review account | "Sign in to Finch with Google. Finch offers only Google and Kakao sign-in." |
| 3 | Sidebar «계정 및 설정» → «SNS 계정 연결»; scroll to «광고 계정»; row «Meta 광고» shows «미연결» | "Account & Settings › Connect social accounts. Meta Ads is not connected yet." |
| 4 | Expand «핀치가 요청하는 권한»; point at «광고 계정·캠페인 성과 조회» | "Finch lists every permission it asks for. ads_read = 'View ad accounts and campaign performance'." |
| 5 | «연결하기» → «Meta 광고로 이동하고 있어요» → Facebook Login | "Connect opens Facebook Login for the Finch app." |
| 6 | Facebook: select the assets; hold 3 s on the screen that lists ads access; confirm | "The user reviews the request and grants Finch access to their ads data (ads_read)." |
| 7 | «광고 계정 1개를 연결했어요» → «확인»; row shows «연결됨» and the account name | "Back in Finch: one ad account connected." |
| 8 | Sidebar «광고 관리»; subtitle «{account} · 최근 30일»; the four cards | "Ads screen: last-30-day totals from Meta Insights. Amount spent, impressions, average CTR, average ROAS." |
| 9 | «캠페인 성과»; move the cursor across the column headers. Stop here, don't scroll to «AI 추천». | "Per-campaign results: spend, impressions, link clicks, CTR, CPC, conversions (purchases) and ROAS." |
| 10 | «홈» → «광고 현황» card | "Home puts paid results next to organic ones: spend, active campaigns and ROAS." |
| 11 (optional) | Ads Manager tab set to "Last 30 days" | "The same campaign in Meta Ads Manager, for comparison." |

---

## 2. ads_management

### How we use it
Finch serves small businesses and the agencies that run Meta ads for them, and ads_management lets those advertisers act on what the dashboard shows. For example, they can pause a campaign whose cost per click has spiked and turn it back on once the landing page is fixed. On «캠페인 관리» (Campaign management) each campaign row has «일시중지» (Pause) or «게재 시작» (Start delivery), which change the campaign's status through the Marketing API; the «새 캠페인» (New campaign) form creates a campaign that is always saved as PAUSED, and a campaign's own page lets the user pause or turn on its ad sets and ads and build a new ad set, creative and ad. Every status change is confirmed in a dialog first, and starting delivery warns that charges will apply. Finch writes only to campaigns in the ad account selected in Finch, only workspace owners and editors can make changes, write controls stay closed if the person declined ads_management in Facebook Login, and each write is recorded in an audit log.

### Reviewer test steps
1. Complete C1–C8. Your ad account must let you edit campaigns.
2. In the sidebar, click «광고 관리» (Ads) and note the spend and impressions. Then click «캠페인 관리» (Campaign management) at the top right.
3. In the «캠페인» (Campaigns) table, find a campaign whose «상태» (Status) is «게재 중» (Active). In the «동작» (Actions) column, click «일시중지» (Pause).
4. In the dialog «캠페인 일시중지» (Pause campaign), click «일시중지».
   - A notice reads «캠페인을 일시중지했어요.» (Campaign paused.).
   - The status changes to «일시중지» (Paused).
5. Wait a few seconds, then click «게재 시작» (Start delivery) on the same row. The campaign's page opens with the dialog «게재 시작 — 비용이 발생해요» (Start delivery — charges will apply).
6. Click «게재 시작».
   - The notice reads «캠페인 게재를 시작했어요. 승인된 광고부터 노출이 시작되고 비용이 발생해요.» (Delivery started; approved ads begin serving and charges apply).
   - The status badge updates.
   - This spends money if the campaign has approved ads. You can click «취소» (Cancel) instead.
7. Optional, no cost:
   1. Click «캠페인 관리» at the top left to go back.
   2. Under «새 캠페인» (New campaign), enter «캠페인 이름» (Campaign name), choose a «캠페인 목표» (Objective) and enter «일 예산» (Daily budget).
   3. Under «특별 광고 카테고리» (Special ad categories), tick «해당 없음 — 아래 카테고리와 관련 없는 광고예요» (None — not a special ad category).
   4. Click «캠페인 만들기» (Create campaign). The form confirms «캠페인이 일시중지 상태로 만들어졌어요.» (Created as paused), and the new campaign is listed as «일시중지».

### Screencast script
| # | Screen / action | Caption |
|---|---|---|
| 1 | Landing page, logged out | "ads_management in Finch. The recording starts on finch.ai.kr, signed out." |
| 2 | Google login | "Log in to Finch using Google." |
| 3 | «SNS 계정 연결» → «핀치가 요청하는 권한»; point at «캠페인·광고 생성·수정·집행 상태 변경» | "Finch tells users it will create and edit campaigns and ads and change their delivery status." |
| 4 | «연결하기» → Facebook; hold 3 s on the screen that lists ad management; confirm | "Facebook Login: the user allows Finch to manage their ads (ads_management)." |
| 5 | «광고 계정 1개를 연결했어요» → «확인» | "Connection complete." |
| 6 | «광고 관리»: cards and the «캠페인 성과» table | "Before changing anything, the business checks its results: spend, impressions, clicks, CTR, conversions, ROAS." |
| 7 | «캠페인 관리» | "Campaign management lists each campaign with its status, daily budget and spend." |
| 8 | «일시중지» on a «게재 중» row → dialog «캠페인 일시중지» | "Pausing an active campaign. Finch asks for confirmation first." |
| 9 | Confirm → «캠페인을 일시중지했어요.»; status «일시중지» | "Paused through the Marketing API. The status now reads Paused." |
| 10 (optional) | Ads Manager tab: the campaign toggle is off | "Meta Ads Manager shows the same campaign switched off." |
| 11 | Wait 3 s or more → «게재 시작» on the same row → dialog «게재 시작 — 비용이 발생해요» | "To resume, Finch opens the campaign and warns that charges will apply." |
| 12 | «게재 시작» → notice «캠페인 게재를 시작했어요…»; badge updates | "Delivery resumed through the Marketing API." |
| 13 (optional) | Wait 3 s → «캠페인 관리» → «새 캠페인» → «캠페인 만들기» → the new row shows «일시중지» | "Finch can also create campaigns. They are always saved paused, so nothing is spent." |

---

## 3. pages_show_list (dependency of ads_management)

### How we use it
We request pages_show_list as a dependency of ads_management: a Meta ad has to run under a Facebook Page, so before a business can create ads in Finch it must choose which of its Pages will publish them. In «계정 및 설정 › SNS 계정 연결» (Account & Settings › Connect social accounts), the «광고 게시 페이지» (Ad publishing Page) row has a «페이지 선택» (Select Page) button that opens the list of Pages the person manages, read from `/me/accounts` with each Page's name, ID and tasks. Pages without the ADVERTISE task still appear but cannot be selected, so the user can see why a Page is unavailable instead of wondering where it went. The chosen Page's ID and name, plus the Instagram account linked to it, are saved for that ad account, shown in the row and reused by the ad-creation wizard, and the list is fetched from Meta again whenever the dialog opens.

### Reviewer test steps
1. Complete C1–C8. Your Facebook account needs an ad account and a Page you can advertise on. Select that Page in Facebook Login.
2. On «SNS 계정 연결», below «Meta 광고», find the row «광고 게시 페이지» (Ad publishing Page). It reads «아직 고르지 않았어요 — 광고를 만들려면 필요해요» (Not chosen yet — needed to create ads). Click «페이지 선택» (Select Page).
3. The dialog «광고를 게시할 페이지» (Page to publish ads) lists your Pages.
   - Pages marked «광고 권한 있음» (Can advertise) can be clicked.
   - «이 페이지에는 광고 권한이 없어요» (No ad permission on this Page) marks Pages you can't pick.
   - With no Pages at all, it reads «이 계정으로 관리하는 Facebook 페이지가 없어요…» (You don't manage any Facebook Page).
4. Click a Page. The dialog switches to «Instagram 계정» (Instagram account). If only one account is linked, it is already selected. Click «이 계정으로 저장» (Save with this account).
5. The row now shows «{Page name} · @{Instagram username}», and the button reads «변경» (Change).

If the Page has no linked Instagram account, step 4 shows «선택한 페이지에 연결된 Instagram 계정이 없어요…» (No Instagram account is linked to this Page), and it can't be saved. The Page list in step 3 is still the pages_show_list result.

### Screencast script
| # | Screen / action | Caption |
|---|---|---|
| 1 | Landing page, signed out | "pages_show_list demo, starting on finch.ai.kr while signed out." |
| 2 | Google login | "The user logs in to Finch with their Google account." |
| 3 | «핀치가 요청하는 권한»; point at «광고를 게시할 Facebook 페이지 목록 확인» | "Finch asks to see the user's Facebook Pages so they can pick the Page their ads run under." |
| 4 | «연결하기» → Facebook: select the Page; hold 3 s on the screen that lists Page access; confirm | "In Facebook Login the user selects their Page and lets Finch see the Pages they manage." |
| 5 | Back in Finch; «광고 게시 페이지» reads «아직 고르지 않았어요…» | "A new row asks for the ad publishing Page. Ads can't be created without it (ads_management)." |
| 6 | «페이지 선택» → «광고를 게시할 페이지» list | "Finch lists the Pages this user manages. Pages without ad permission can't be selected." |
| 7 | Click the Page → «Instagram 계정» → «이 계정으로 저장» | "The user picks a Page and its linked Instagram account, then saves." |
| 8 | Row shows «{Page} · @{ig}», button «변경» | "The Page is now connected as Finch's ad publishing Page." |

---

## 4. pages_read_engagement

### How we use it
Agencies often manage several Pages with similar names, so Finch shows a Page's own recent posts to let the user confirm they picked the right Page before ads run under its name. When a Page is clicked in the «광고를 게시할 페이지» (Page to publish ads) dialog, Finch gets that Page's access token within the same server request and calls `/{page-id}/posts` for the three most recent posts (`message`, `created_time`, `full_picture`, `permalink_url`). The dialog lists them under «이 페이지의 최근 게시물» (This Page's recent posts) with the first lines of text, a thumbnail, the date and a «Facebook에서 보기» (View on Facebook) link. The Page token never leaves the server and is not stored, the posts are not saved, and if they cannot be loaded the user can still choose the Page; Meta's permissions reference also lists pages_read_engagement as a dependency of ads_management.

### Reviewer test steps
1. Complete C1–C8. Select a Page that has at least one post in Facebook Login.
2. In the row «광고 게시 페이지» (Ad publishing Page), click «페이지 선택» (Select Page). If a Page is already saved, the button reads «변경» (Change).
3. Click your Page. While it loads, the dialog shows «Instagram 계정과 최근 게시물을 확인하는 중…» (Checking the Instagram account and recent posts…).
4. Below the Instagram account choice, the section «이 페이지의 최근 게시물» (This Page's recent posts) lists up to three posts with text, photo and date. It is subtitled «고른 페이지가 맞는지 확인해 보세요.» (Check that this is the right Page.).
5. Click «Facebook에서 보기» (View on Facebook) on a post to open it on facebook.com.
6. Close with «취소» (Cancel), or save with «이 계정으로 저장».

### Screencast script
| # | Screen / action | Caption |
|---|---|---|
| 1 | Landing page, logged out | "How Finch uses pages_read_engagement. The session begins logged out." |
| 2 | Google login | "Google sign-in to Finch." |
| 3 | «핀치가 요청하는 권한»; point at «광고 게시 페이지의 정보·최근 게시물 확인» | "Finch states that it reads the publishing Page's info and recent posts." |
| 4 | «연결하기» → Facebook: select the Page; hold 3 s on the screen that lists reading Page content; confirm | "The user signs in with Facebook and lets Finch read content on the selected Page." |
| 5 | Back in Finch; «페이지 선택» | "Open 'Select Page' in the Ad publishing Page row." |
| 6 | Click the Page → «이 페이지의 최근 게시물» with 3 posts | "Finch loads this Page's three latest posts and shows their text, photo and date." |
| 7 | «Facebook에서 보기» → new tab with the post | "The same post on Facebook. The content in Finch matches the Page." |
| 8 | Back → «이 계정으로 저장» | "The user confirms it's the right Page and saves it." |

---

## 5. business_management (requested with ads_read and ads_management)

### How we use it
Finch requests business_management alongside ads_read and ads_management under the Marketing API use case, and uses it for a single read-only feature that supports both: showing which business portfolio owns each connected ad account. Each time «SNS 계정 연결» (Connect social accounts) opens, Finch calls `/me/businesses` and reads the business field of the person's ad accounts (`/me/adaccounts?fields=business{id,name}`), then shows the result in the «비즈니스 포트폴리오» (Business portfolio) row, one line per ad account when there are several. Agencies and multi-brand companies often keep ad accounts in different portfolios, so this row tells them whose account the «광고 관리» (Ads) figures and campaign changes belong to before they act. Finch does not create, claim or edit business assets, people or permissions with this permission, and it reads portfolio names from Meta on each visit instead of storing them.

### Reviewer test steps
1. Complete C1–C8. Use a Facebook account whose ad account belongs to a business portfolio, and select that business in Facebook Login.
2. On «SNS 계정 연결», directly below «Meta 광고», the row «비즈니스 포트폴리오» (Business portfolio) may briefly read «확인하는 중…» (Checking…), then shows the portfolio name. Click the (i) icon beside the row title to read «광고 계정을 소유한 메타 비즈니스 포트폴리오예요…» (The Meta business portfolio that owns the ad account…).
3. What else the row can show:
   - With several ad accounts, each is listed as «{ad account} · {portfolio}».
   - An ad account outside any portfolio reads «포트폴리오에 속하지 않은 계정» in that list, or «비즈니스 포트폴리오에 속하지 않은 광고 계정이에요» when it is your only account.
   - If you declined the business permission, the row reads «다시 연결하면 광고 계정이 속한 포트폴리오를 보여 드려요» (Reconnect to see the portfolio).
4. In the sidebar, click «광고 관리» (Ads). The subtitle «{ad account name} · 최근 30일» and the metrics belong to that portfolio's ad account.

### Screencast script
| # | Screen / action | Caption |
|---|---|---|
| 1 | Landing page, not signed in | "business_management walkthrough: finch.ai.kr, not signed in." |
| 2 | Google login | "Signing in to Finch through Google." |
| 3 | «핀치가 요청하는 권한»; point at «광고 계정이 속한 비즈니스 포트폴리오 조회» | "Finch requests read access to the business portfolio that owns each ad account." |
| 4 | «연결하기» → Facebook: select the business; hold 3 s on the screen that lists business access; confirm | "Facebook Login: the user grants Finch access to their business portfolio." |
| 5 | «Meta 광고» shows the account; «비즈니스 포트폴리오» goes «확인하는 중…» → portfolio name; click (i) | "Finch looks up who owns the ad account: it belongs to the {portfolio name} portfolio." |
| 6 | «광고 관리»: subtitle, cards, «캠페인 성과» table | "Ad performance for that portfolio's ad account: spend, impressions, CTR, conversions and ROAS per campaign." |
| 7 (optional) | Meta Business settings › Ad accounts | "Meta's business settings show the same ad account in the same portfolio." |

---

## 6. Notes
- **public_profile.** Facebook Login grants it by default.
  - Finch reads only `id,name` from `/me` (`lib/meta/ads-oauth.ts:211`). That is enough to match Meta's deauthorize and data-deletion callbacks to the right connection.
  - The name is stored (`fb_name`) and never displayed.
  - On the submission screen, check whether "Increase access" for public_profile is included (APP_REVIEW §4-2-7) [VERIFY].
  - If a description is required: "Finch uses public_profile only to receive the Facebook user ID and name after Facebook Login, so it can match Meta's deauthorization and data-deletion callbacks to the right connection; nothing from the profile is shown or shared."
- **Marketing API Access Tier** is a feature, not a permission.
  - Full access requires "at least 500 Marketing API calls in the last 15 days" and "an error rate of less than 15% in the last 500 calls" (Meta authorization docs). Finch had 41 calls on 09-11.
  - Submit it with this group, or request it separately later.
- **Stale connections.** A Meta Ads connection made before 09-11 shows «다시 연결 필요» (Reconnect needed), with «비즈니스 포트폴리오 확인 권한이 추가됐어요 — 다시 연결해 주세요». Record only from fresh connections.

## 7. Label sources (file:line, relative to `C:\Users\rnjsr\Downloads\Finch\`)
| Label | Source |
|---|---|
| «홈» · «SNS» · «광고 관리» · «계정 및 설정» | `components/layout/sidebar.tsx:33, 51, 60, 87` |
| «연결» · «SNS 계정 연결» | `lib/settings/sections.ts:61, 63` |
| «로그인» (landing) · «Google로 계속하기» | `app/(finch)/(marketing)/layout.tsx:55` · `app/(finch)/(auth-split)/login/login-form.tsx:73` |
| «지금은 임시오픈 기간입니다» · «오늘 하루 종일 보지 않기» · «닫기» | `components/layout/opening-notice.tsx:101, 115, 118` |
| «채널을 연동해 볼까요?» · «다음에 할게요» | `components/dashboard/connect-channels-modal.tsx:121, 161` |
| «계정 메뉴» (aria-label) · «로그아웃» | `components/layout/topbar.tsx:167, 194` |
| «광고 계정» · «Meta 광고» · «연결하기» · «다시 연결» | `app/(finch)/(app)/settings/channels/page.tsx:605, 608, 651, 635` |
| «연결 해제» · «광고 계정 연결을 해제할까요?» · «해제하기» | `settings/channels/page.tsx:645, 641, 643` |
| «미연결» · «연결됨» · «광고 계정 없음» · «다시 연결 필요» · «비즈니스 포트폴리오 확인 권한이 추가됐어요…» | `settings/channels/_lib/derive-state.ts:82, 117, 100, 107, 111` |
| «비즈니스 포트폴리오» · «확인하는 중…» · (i) text | `settings/channels/page.tsx:344, 662, 329` |
| «포트폴리오에 속하지 않은 계정» · «비즈니스 포트폴리오에 속하지 않은 광고 계정이에요» · «다시 연결하면…» | `derive-state.ts:139, 175, 150` |
| «광고 게시 페이지» · «아직 고르지 않았어요 — 광고를 만들려면 필요해요» · «페이지 선택» / «변경» | `settings/channels/page.tsx:672, 681, 685` |
| «핀치가 요청하는 권한» · the 5 scope labels | `settings/channels/page.tsx:700` · `lib/meta/ads-oauth.ts:70-74` |
| «Meta 광고로 이동하고 있어요» | `components/ui/connect-link.tsx:99` (label «Meta 광고», `channels/page.tsx:650`) |
| «광고 계정 N개를 연결했어요» · «확인» | `app/api/auth/meta-ads/callback/route.ts:241` + `channels/page.tsx:314` · `components/ui/result-modal.tsx:114` |
| «연결은 됐지만 쓸 수 있는 광고 계정이 없어요» | `settings/channels/page.tsx:279` |
| «광고 관리» title · «캠페인 관리» button · 4 cards · «캠페인 성과» | `app/(finch)/(app)/ads/page.tsx:182, 190, 211-228, 241` |
| «AI 추천» · «준비 중» · «이 계정으로 볼 수 있는 광고 계정이 없어요» · «아직 만든 캠페인이 없어요» | `ads/page.tsx:294, 301, 74, 268` |
| Table columns · «미추적» | `ads/_components/live-campaign-table.tsx:39-49, 84` |
| «광고 현황» · «진행 중 캠페인 기준» · «집행 금액» · «진행 중 캠페인» · «평균 ROAS» | `dashboard/_components/dashboard-client.tsx:279, 280, 290, 296, 302` |
| «캠페인 관리» page · «캠페인» · «동작» · «새 캠페인» · «캠페인을 일시중지했어요.» | `ads/campaigns/page.tsx:55, 128, 150, 208, 27` |
| «캠페인 일시중지» · «일시중지» · «게재 시작» (row link) | `ads/campaigns/_components/campaign-row-actions.tsx:31, 36, 45` |
| «게재 시작 — 비용이 발생해요» · «취소» · «게재 시작» | `ads/campaigns/[campaignId]/_components/activate-tree-modal.tsx:103, 110, 114` |
| «캠페인 게재를 시작했어요…» · back link «캠페인 관리» | `ads/campaigns/[campaignId]/page.tsx:366, 440` |
| «게재 중» · «일시중지» · «처리 중» | `lib/ads/meta-labels.ts:50, 51, 56` |
| Form: «캠페인 이름» · «캠페인 목표» · «일 예산» · «특별 광고 카테고리» · «해당 없음…» · «캠페인 만들기» · success | `ads/campaigns/_components/campaign-form.tsx:69, 84, 111, 139, 152, 178, 58` |
| «요청이 너무 빨라요…» · «선택한 페이지에 연결된 Instagram 계정이 없어요…» | `lib/ads/campaign-rules.ts:96, 122-123` |
| «광고를 게시할 페이지» / «Instagram 계정» · «광고 권한 있음» / «이 페이지에는 광고 권한이 없어요» · loading text · «이 계정으로 저장» · «취소» · no-Pages text | `ads/_components/ad-publisher-picker.tsx:155, 213, 220, 179, 175, 196` |
| «이 페이지의 최근 게시물» · «고른 페이지가 맞는지 확인해 보세요.» · «Facebook에서 보기» | `ads/_components/page-recent-posts.tsx:47, 49, 75` |

API calls cited above:
- `/me/adaccounts` — `lib/meta/ads.ts:142`
- `/me/businesses` — `ads.ts:175`
- `business{id,name}` — `ads.ts:199`
- campaigns — `ads.ts:247`
- insights — `ads.ts:377, 387`
- `/me/accounts` — `lib/meta/ads-pages.ts:73`
- Page token and posts — `ads-pages.ts:145, 152`
- PAUSED on create — `lib/meta/ads-write.ts:251`
- owner/editor gate — `lib/data/ads.ts:436`
- Page picker owner-only — `app/(finch)/(app)/ads/publisher-actions.ts:57`
- scope gate — `lib/ads/write-gates.ts:61`, with "unknown" allowed through at `lib/meta/granted-scopes.ts:49-51`
- cooldown — `write-gates.ts:25, 73-85`

## Sources checked
- C:\Users\rnjsr\Downloads\Finch\docs\APP_REVIEW.md
- C:\Users\rnjsr\Downloads\Finch\lib\meta\ads-oauth.ts, ads.ts, ads-write.ts, ads-pages.ts, granted-scopes.ts
- C:\Users\rnjsr\Downloads\Finch\lib\ads\portfolio.ts, write-gates.ts, campaign-rules.ts, meta-labels.ts, finch-children.ts
- C:\Users\rnjsr\Downloads\Finch\lib\data\ads.ts, C:\Users\rnjsr\Downloads\Finch\lib\channel-availability.ts, C:\Users\rnjsr\Downloads\Finch\lib\settings\sections.ts
- C:\Users\rnjsr\Downloads\Finch\components\layout\sidebar.tsx, topbar.tsx, opening-notice.tsx
- C:\Users\rnjsr\Downloads\Finch\components\ui\connect-link.tsx, result-modal.tsx, modal-shell.tsx, info-tip.tsx
- C:\Users\rnjsr\Downloads\Finch\components\dashboard\connect-channels-modal.tsx
- C:\Users\rnjsr\Downloads\Finch\app\(finch)\(marketing)\layout.tsx, C:\Users\rnjsr\Downloads\Finch\app\(finch)\(auth-split)\login\login-form.tsx, C:\Users\rnjsr\Downloads\Finch\app\(finch)\(app)\layout.tsx
- C:\Users\rnjsr\Downloads\Finch\app\(finch)\(app)\dashboard\page.tsx, _components\dashboard-client.tsx
- C:\Users\rnjsr\Downloads\Finch\app\(finch)\(app)\settings\page.tsx, settings\channels\page.tsx, actions.ts, _lib\derive-state.ts
- C:\Users\rnjsr\Downloads\Finch\app\(finch)\(app)\ads\page.tsx, publisher-actions.ts, tree-status-actions.ts, _components\live-campaign-table.tsx, ad-publisher-picker.tsx, page-recent-posts.tsx
- C:\Users\rnjsr\Downloads\Finch\app\(finch)\(app)\ads\campaigns\page.tsx, actions.ts, _components\campaign-row-actions.tsx, campaign-form.tsx
- C:\Users\rnjsr\Downloads\Finch\app\(finch)\(app)\ads\campaigns\[campaignId]\page.tsx, _components\activate-tree-modal.tsx, child-status-button.tsx
- C:\Users\rnjsr\Downloads\Finch\app\api\auth\meta-ads\start\route.ts, callback\route.ts, deauthorize\route.ts
- C:\Users\rnjsr\Downloads\Finch\supabase\migrations\0077_meta_ad_accounts.sql, 0088_lock_ad_account_id.sql
- Meta, fetched 2026-09-11:
  - [Permissions reference](https://developers.facebook.com/docs/permissions/) — screencast steps and dependencies for all five permissions
  - [App Review submission guide](https://developers.facebook.com/docs/resp-plat-initiatives/individual-processes/app-review/submission-guide)
  - [Screen recordings](https://developers.facebook.com/docs/app-review/submission-guide/screen-recordings/)
  - [Marketing API authorization](https://developers.facebook.com/docs/marketing-api/get-started/authorization) — Access Tier criteria

---

## Changes made
1. **Hover → click.** The portfolio (i) tip opens on click (`info-tip.tsx:57`). Fixed in business_management step 2 and scene 5.
2. **Opening notice.** It shows on every full page load until «오늘 하루 종일 보지 않기», not once a day. It comes back after the Facebook redirect and covers the result dialog (z-[60] over z-50). C4 now says «오늘 하루 종일 보지 않기».
3. **New gap: the «AI 추천» card** shows «준비 중» and "we're building this" on «광고 관리» in live mode. Added to 0.2, and the ads_read script stops above it.
4. **New prerequisite: remove Finch on Facebook before each take.** «연결 해제» doesn't revoke the app on Facebook, so later takes would skip the permission screens. Also noted that the deauthorize callback then disconnects the owner's main account.
5. **Conversions.** «전환» counts purchases only, and shows «미추적» whenever there were no purchases, even with a pixel.
6. **"Never shown as zero" was wrong.** Campaigns with no delivery show 0. «—» appears only when the Insights call fails.
7. **ads_management wording:**
   - "Every change is confirmed" is now "every status change". Campaign creation has no dialog; it is PAUSED.
   - "Blocked unless actually granted" is now "blocked if declined". An unknown grant state passes (`granted-scopes.ts:49-51`).
8. **business_management.** Removed "required, non-removable permission of the use case" from the text Meta will read. Meta's Marketing API authorization page doesn't say it; it stays as a dashboard check in 0.1.
9. **API-call prerequisite.** You must click a Page to trigger the pages_read_engagement call, not just open «페이지 선택».
10. **Descriptions.**
    - Each is now 4 sentences.
    - Each has a concrete business example, as Meta asks ("specific examples … on behalf of other businesses").
    - The main permission is named for pages_show_list and business_management.
    - Wording is reworded so no two descriptions share phrasing.
11. **Facebook permission-screen scene.** Every script now holds on the Facebook screen for its own permission, as Meta requires.
12. **Browser tips.** Added a larger cursor and mouse-only clicking (Meta's screen-recording guide).
13. **Steps now match the code:**
    - A single linked IG account is already selected.
    - The no-Pages message is added.
    - The campaign-list empty state is added.
    - The account menu is the unlabeled round initial button.
    - The resume badge may briefly read «처리 중».
    - The Home card counts active campaigns only.
14. **Other additions:**
    - A "Korean-only UI" line at the top of the reviewer instructions.
    - The review account must have finished consent.
    - The Meta quote on reviewers' own test accounts.
    - The stale APP_REVIEW §1 row (line 23).
    - A file:line table for every label (§7).

## Remaining [VERIFY] / [OWNER CONFIRM]
- ~~[OWNER CONFIRM] Add a «도달» column~~ **Done 2026-09-11** — «도달» (Reach) is now a column in `live-campaign-table.tsx`, right after «노출».
- The «임시오픈» notice no longer shows for the review account (done 2026-09-11). [OWNER CONFIRM] Keep the «AI 추천 · 준비 중» card off camera.
- [OWNER CONFIRM] Does the demo ad account have a campaign with purchases in the last 30 days? Without one, «전환» shows «미추적».
- [VERIFY] Facebook Login dialog: which screens appear (business, Page, ad account selection), their wording, and whether a returning user skips the permission screens. Also the Facebook menu path for removing Finch from business integrations.
- [VERIFY] Can Meta reviewers use Facebook Login on a development-mode app? This decides the [DECIDE] pre-connect question in 0.4.
- [VERIFY] The portfolio's display name, and which Instagram account is linked to the Page.
- [VERIFY] The three first-call unknowns: `/posts` without `pages_read_user_content`, the `AdAccount.business` field, and the IG lookup without `instagram_basic`. Scene 8 of pages_show_list depends on the last one.
- [VERIFY] Dashboard: `business_management` added to the use case and to review. "Increase access" for business_management and public_profile included on the submission screen.
- [OWNER CONFIRM] The Facebook dialog shows the owner's Facebook name and photo on camera. Staying signed in to Facebook keeps the email and password off camera.
- [OWNER CONFIRM] Resuming the demo campaign spends real money. Use a small daily budget.
