# Finch: shared Meta App Review texts (checked against the code at `65ddf9f`, 2026-09-11)

- **[VERIFY]**: the code can't settle this. It's a dashboard or runtime fact.
- **[OWNER CONFIRM]**: the owner has to supply the fact or make the decision.
- I didn't change any files or git state. HEAD has moved since the draft (`1b679ac` → `65ddf9f`, the auto-DM «지금 확인» and ads-scope branches were merged). All line numbers below are for `65ddf9f`.
- 2026-09-12: the publishing text was re-checked against `40355b5` (the new publish composer merged in `3366fe1`, plus its publishing overlay): section 3 «발행», section 5 (both content_publish lines), section 6 «Publishing», the label table's «Publish buttons and states» and «인스타그램 예약 발행» rows, the publishing details in B1, B6 and B7, and the 0093 rows in (c). Line numbers in those places are for `40355b5`.

---

## 0. Fix before pasting (found while checking)

| # | Problem | Evidence | Why it matters |
|---|---|---|---|
| 1 | **The «지금은 임시오픈 기간입니다» ("We are in an early-access period") notice opens on the first app screen of every visit, for every account including the reviewer's.** It says the official launch is "planned for September" and that "some features may still be refined". «닫기» (Close) hides it only until the next full page load, so it comes back after every return from Instagram, Threads or Facebook. It also sits above the connection result dialog: the notice is z-60 and the result dialog is z-50. | `components/layout/opening-notice.tsx:101-106` (text), `:45` (close state isn't saved), `:68` (z-60); `components/ui/modal-shell.tsx:65` (z-50); mounted at `app/(finch)/(app)/layout.tsx:94` | Meta lists "incomplete-looking app" as a rejection reason (APP_REVIEW §5). The notice would pop up in all 13 screencasts right after login, and it covers the «…계정을 연결했어요» (…connected) dialog. The text also goes out of date on Oct 1. Stop rendering it, at least for `OWNER_EMAIL` accounts, before recording. |
| 2 | **The public privacy policy and terms show a yellow «안내» (Notice) box** that calls them a draft written before launch and legal review. Privacy §13 and the terms both say «초안의 시행일» (draft effective date). | `components/legal/legal-document.tsx:21-31`; `lib/legal/documents.ts:25-27` (notice), `:127` (terms), `:263` (privacy) | The reviewer opens the privacy policy URL and reads the word "draft". |
| 3 | **Instagram and Threads access tokens sit unencrypted in the Next.js fetch cache.** `graphGet` puts `access_token` in the URL and caches the response with `revalidate: 300`. That cache keeps entries, request URL included, after they go stale. Entries are replaced only when the same URL is requested again, so URLs carrying an old token can stay until they're evicted. | `lib/meta/instagram.ts:33-39`, `lib/meta/threads.ts:15-22`. The ads adapter uses `no-store` for this exact reason: `lib/meta/ads.ts:59-67`. Next docs: `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/fetch.md:6-8,56` | Until this is fixed, don't say "tokens are stored only encrypted" without a qualifier (§B8). |
| 4 | **Google Analytics is live in production and loads on logged-in screens.** Page addresses there can carry an Instagram handle (`/settings/channels?connect=success&handle=@…`, sent before the result dialog clears the query) and campaign IDs (`/ads/campaigns/{campaignId}`). | `app/(finch)/layout.tsx:46,73`. The production HTML of `finch.ai.kr` includes the gtag script, and the CSP allows google-analytics.com. The query is cleared at `components/ui/result-modal.tsx:79-80`, and that races the GA page_view. | Either stop loading GA on `(app)` routes, or list Google as a processor of Platform Data (§B1). Privacy §6/§8 already names Google Analytics, but only for usage statistics. |
| 5 | **The privacy policy doesn't match the code.** | See §B9 | Reviewers compare the policy against what the app does. |
| 6 | **The reviewer can reproduce auto-DM only with a fresh comment, and each comment works once.** The comment must be top-level, written by another account, less than 6.5 days old, and not yet processed. Its author must not have received a DM from this account in the last 24 hours. «지금 확인» (Check now) also needs migration **0092** in production, or it fails closed. | `lib/auto-dm/check-now.ts:46,236-270`; `lib/auto-dm/pipeline.ts:48`; `supabase/migrations/0092_auto_dm_manual_checks.sql:141-146,186-196`; `docs/AUTO_DM_SETUP.md` §3-1 | Plan it this way: (a) post a fresh test comment from a second tester account every ~5 days during review, (b) don't press «지금 확인» on it yourself, (c) don't use the same commenter for your own recordings within 24 hours of handing it over. [OWNER CONFIRM] |
| 7 | `docs/DEPLOY.md:128` and `docs/API_ROADMAP.md:108` call the `/api/auth/*/data-deletion` endpoints "Data Deletion **Instructions** URL". They're **POST-only callbacks** (every route exports only `POST`). | `app/api/auth/{instagram,threads,meta-ads}/{data-deletion,deauthorize}/route.ts` | Enter them only in callback fields. In Settings › Basic, choose "Data deletion callback URL" (§c). |
| 8 | The Threads row hint says «연결하면 게시물·답글 지표를 불러와요» (…post and **reply** metrics). | `app/(finch)/(app)/settings/channels/_lib/derive-state.ts:32` | Low risk. A reviewer could link "replies" to the reply scopes you removed. Rewording is optional. |
| 9 | **Resend receives Platform Data.** The draft said it didn't. Token-expiry emails name the Instagram/Threads username (email is on by default). Follower-change alerts include the username and follower count (email is off by default). | `app/api/cron/refresh-tokens/route.ts:408-414,439,447,505-511`; `lib/notify.ts:81-87`; `lib/notify-defaults.ts` (`token_expiry` email: true) | Must be declared in §B1. |
| 10 | Two small "unfinished" labels on screens the reviewer will visit. «성과 분석» › «링크 분석» always shows «분석 기록 저장은 준비 중이에요» (Saving analysis history is coming soon) under the history table. The «AI 에이전트» (AI agent) panel has a «베타» (Beta) chip. | `app/(finch)/(app)/insights/link/page.tsx:231`; `components/layout/agent-panel.tsx:161` | Low risk, same reason as #1. Hide the empty history table in live mode, or keep it out of the recordings. |

---

## (a) Platform Settings: reviewer instructions (paste-ready)

[VERIFY the field's character limit. If it's too long, shorten section 5 first, then section 3.]

```text
FINCH — HOW TO ACCESS AND TEST

About the app
Finch (https://finch.ai.kr) is a web app for Instagram professional accounts, Threads profiles and Meta ad accounts. It provides account analytics, post publishing and scheduling, comment-triggered DMs, and ad campaign management. The interface is Korean only. Below, every on-screen label is quoted exactly in «Korean», followed by an English translation in parentheses. Each permission screencast has English captions.

1. Open the site and log in
1) Use a desktop browser window at least 768 px wide (narrower windows replace the left sidebar with a bottom tab bar). Please keep automatic page translation turned off; it can stop Korean pages from responding.
2) Open https://finch.ai.kr and click «로그인» (Log in) at the top right.
3) Click «Google로 계속하기» (Continue with Google). A dialog «Google로 이동하고 있어요» (Taking you to Google) appears, then Google sign-in opens.
4) Sign in with the Google account from the test credentials we supplied. Finch offers only Google and Kakao sign-in, so there is no separate Finch password.
5) You arrive at «홈» (Home).

2. Screens that may appear the first time
The test account has already completed these. If one appears anyway:
- «서비스 이용 동의» (Service consent): tick «전체 동의 (선택 항목 포함)» (Agree to all, including optional), then click «동의하고 시작하기» (Agree and start). Please do NOT use «동의하지 않고 나가기» (Decline and leave); its confirmation deletes the shared test account.
- «핀치에 오신 걸 환영해요» (Welcome to Finch): click «건너뛰기» (Skip) at the top right.

3. Where each feature is (left sidebar)
- «홈» (Home): profile cards and key numbers for the connected Instagram and Threads accounts, plus an ad summary once Meta Ads is connected.
- Group «SNS»:
  - «발행» (Publish): write, schedule or immediately publish Instagram and Threads posts with photos or videos. «새 게시물 포스팅» (New post) opens the editor: add files with the «추가» (Add) tile under «사진·영상» (Photos & videos), then choose «지금 발행» (Publish now), «예약 발행» (Scheduled publishing) or «초안으로 저장» (Save as draft).
  - «자동 DM» (Auto DM): rules that send a DM to people who comment on a chosen Instagram post. Buttons: «자동화 만들기» (Create automation), and «지금 확인» (Check now) on each rule marked «실행 중» (Running).
  - «프로필 링크» (Profile link): link-in-bio page builder. Its «최근 게시물» (Recent posts) block shows the connected Instagram account's latest posts.
  - «광고 관리» (Ad management): ad account performance. «캠페인 관리» (Campaign management) creates campaigns and turns delivery on or off.
  - «성과 분석» (Performance analytics): tabs «개요» (Overview), «내 게시물» (My posts), «링크 분석» (Link analysis).
  - «리포트» (Reports): downloadable reports built from live metrics.
- «계정 및 설정» (Account & Settings), at the bottom of the sidebar: account connections, legal documents, account deletion.
- The «레퍼런스» (References) group uses no Meta permission. In «AI 스튜디오» (AI Studio), only «인스타그램 예약 발행» (Schedule to Instagram) uses one: the same publishing permission as «발행».

4. Connect the test accounts
Open «계정 및 설정» (Account & Settings), then «SNS 계정 연결» (Connect social accounts) in the «연결» (Connections) section. Finch has not opened these connections to the general public yet; they are enabled for this test account so you can review them. The channel rows are Instagram, TikTok and Threads, followed by Meta Ads.

Instagram
1) Under «채널 계정» (Channel accounts), the «Instagram» row shows «미연결» (Not connected). Click «연결하기» (Connect).
2) A dialog «Instagram로 이동하고 있어요» (Taking you to Instagram) appears, then Instagram's login and permission screen opens.
3) Log in with the Instagram test account from the test credentials and allow the requested permissions.
4) Back in Finch, the dialog «@<username> 계정을 연결했어요» (Account @<username> connected) confirms the connection, and the row shows «연결됨» (Connected).

Threads
1) On the «Threads» row, click «연결하기» (Connect). «Threads로 이동하고 있어요» (Taking you to Threads) appears.
2) Log in to Threads with the same Instagram test account and allow access.
3) The same «@<username> 계정을 연결했어요» dialog appears, and the row shows «연결됨» (Connected).

Meta Ads
1) Under «광고 계정» (Ad accounts), on the «Meta 광고» (Meta Ads) row, click «연결하기» (Connect). «Meta 광고로 이동하고 있어요» (Taking you to Meta Ads) appears, then Facebook Login asks for the ads, Pages and business portfolio permissions.
2) After approval, the dialog «광고 계정 N개를 연결했어요» (N ad accounts connected) appears. Two rows are added: «비즈니스 포트폴리오» (Business portfolio) and «광고 게시 페이지» (Ad publishing Page). The second has a «페이지 선택» (Select Page) button, which reads «변경» (Change) once a Page is chosen.
[OWNER CONFIRM — how a reviewer gets a Facebook account with an ad account and an app role while the app is in development mode. If they can't, add: "The Meta Ads screencasts show this flow end to end with our own business account."]

At the bottom of the page, «핀치가 요청하는 권한» (Permissions Finch requests) expands to list every requested permission and its purpose.
To disconnect, use «연결 해제» (Disconnect), then «해제하기» (Disconnect). Please don't delete the Finch test account; it is shared.

5. Where each permission can be tested
Instagram
- instagram_business_basic: connecting Instagram; the Instagram card on «홈»; the «최근 게시물» block in «프로필 링크».
- instagram_business_manage_insights: Instagram numbers on «홈», «성과 분석» and «리포트».
- instagram_business_content_publish: «발행» → «새 게시물 포스팅» → channel «인스타그램» → add one photo with «추가» (Add) → write the «캡션» (Caption) → «지금 발행» (Publish now) → «지금 발행하기» (Publish now). The post then appears under «발행완료» (Published) with a «게시물 보기» (View post) link that opens it on Instagram.
- instagram_business_manage_comments: «자동 DM» → a running rule → «지금 확인», which reads the post's comments and sends the private reply.
- instagram_business_manage_messages: the DM sent by «자동 DM» appears in the Instagram inbox; opt-out replies («수신거부», STOP, UNSUBSCRIBE) are received through the messages webhook once the app is Live.
Threads
- threads_basic: connecting Threads; the Threads card and recent posts on «홈».
- threads_manage_insights: Threads numbers on «홈», «성과 분석» and «리포트».
- threads_content_publish: «발행» → «새 게시물 포스팅» → channel «스레드» → write in «글» (Text); a photo is optional → «지금 발행» → «지금 발행하기». The post appears under «발행완료» with «게시물 보기».
Meta Ads
- ads_read: «광고 관리», «캠페인 관리» and each campaign's detail page.
- ads_management: «캠페인 관리» → create a campaign and turn its delivery on or off.
- pages_show_list: «광고 게시 페이지» → «페이지 선택» lists your Facebook Pages.
- pages_read_engagement: after you pick a Page, «이 페이지의 최근 게시물» (This Page's recent posts) shows its latest posts.
- business_management: the «비즈니스 포트폴리오» row shows which business portfolio owns each ad account.

6. Notes for testing
- Auto DM: Instagram sends comment webhooks only to apps that are Live and have Advanced Access, so each running rule has «지금 확인» (Check now). It reads the post's 50 most recent top-level comments and processes them with the same code as the webhook. A comment triggers a DM only if (a) a different Instagram account wrote it (Finch skips the connected account's own comments), (b) it is less than 6.5 days old (Instagram accepts private replies only within 7 days), (c) it contains the rule's keyword, when the rule uses keywords, and (d) it has not been handled before and its author has not received a DM from this account in the past 24 hours. Each rule can be checked once every 30 seconds. On success the dialog reads «DM 1개를 보냈어요» (1 DM sent) with «댓글 N개 확인 · DM M개 보냄 · 건너뜀 K개» (N comments checked · M DMs sent · K skipped). [OWNER CONFIRM: "A fresh comment containing «…» from our second test account is on post …; please press «지금 확인» on the rule «…»."]
- Publishing: «지금 발행» (Publish now) posts to the real test account immediately. Finch cannot undo it. A photo or text post usually goes live within 10–30 seconds. Videos also work, but Meta processes them for a few minutes: the post shows «처리 중» (Processing) under «발행예약» (Scheduled) and is published automatically.
- Ads: Finch creates every new campaign, ad set and ad paused. Nothing spends money until delivery is turned on.
- The «TikTok» row is not part of this submission.
```

**Where each label comes from (all checked in code at `65ddf9f`):**

| Label | Source |
|---|---|
| «로그인» | `app/(finch)/(marketing)/layout.tsx:55` |
| «Google로 계속하기» | `app/(finch)/(auth-split)/login/login-form.tsx:73` |
| «Google로 이동하고 있어요» | `components/auth/use-oauth-start.tsx:56`. It uses `euroRo`, where a label that doesn't end in Hangul takes «로», so the code produces «Instagram로», not «Instagram으로» (`lib/josa.ts:39-45`) |
| Consent screen | `app/(finch)/(auth)/onboarding/consent/consent-form.tsx:85,97,139,151-155`. The decline path opens a «계정 삭제하고 나가기» (Delete account and leave) confirmation. |
| Welcome wizard | `app/(finch)/(auth)/onboarding/onboarding-form.tsx:86,93` |
| Sidebar | `components/layout/sidebar.tsx:33` (홈), `:48-89` (groups), `:92-95` (계정 및 설정). The sidebar is hidden below 768 px (`:222`, `md:flex`). |
| «연결» › «SNS 계정 연결» | `lib/settings/sections.ts:60,63` |
| Channel-row names | `CHANNEL_LABEL`, the English «Instagram»/«TikTok»/«Threads» (`lib/channels.ts:4-8`). Row order: `channels/page.tsx:57` |
| Row buttons and groups | `app/(finch)/(app)/settings/channels/page.tsx:520,579,587,589,595,605,608,634-651` |
| Portfolio and Page rows | `channels/page.tsx:344,672,685`; «변경» at `ads/_components/ad-publisher-picker.tsx:149` |
| Permissions card | `channels/page.tsx:700` |
| Leaving dialog | `components/ui/connect-link.tsx:97-101` |
| Success titles | `channels/page.tsx:313-314`. Ads handle «광고 계정 N개»: `app/api/auth/meta-ads/callback/route.ts:241` |
| Chips and hints | `channels/_lib/derive-state.ts:30-62` |
| Auto DM buttons and status | `auto-dm/_components/auto-dm-client.tsx:46,292,502` |
| Check-now result text | `lib/auto-dm/check-now-types.ts:88-90`; cooldown `:9` |
| Publish buttons and states (at `40355b5`) | `publish/_components/publish-list.tsx:460` («새 게시물 포스팅»), `:787,879` (row «지금 발행»), `:895` (draft «예약하기»), `:430-431` («발행예약»/«발행완료»), `:1001` («게시물 보기»); composer `post-composer.tsx:462` («사진·영상»), `:588,606,636` (the three modes), `:658` («지금 발행하기»); «추가» `media-tiles.tsx:268`; «처리 중» `components/ui/status-pill.tsx:27` |
| «캠페인 관리» | `ads/page.tsx:190` |
| Analytics tabs | `insights/tabs.tsx:13-15` |
| «최근 게시물» block | `lib/links/blocks.ts:373` |
| «이 페이지의 최근 게시물» | `ads/_components/page-recent-posts.tsx:47` |
| «인스타그램 예약 발행» | `studio/_components/schedule-publish.tsx:85` (it calls `publishGate` in `app/api/studio/schedule/route.ts:101`) |
| Everything created paused | `ads/campaigns/page.tsx:18`; `lib/meta/ads-write.ts:251`; `lib/ads/adset-rules.ts:258`; `lib/ads/creative-rules.ts:194` |
| Opt-out words | `lib/auto-dm/match.ts:57-60` |

**What was checked about the flow:**
- **Login landing:** login redirects to `/dashboard` (`lib/auth/safe-next.ts:18`, `app/auth/callback/route.ts:33`).
- **Consent gate:** a missing consent redirects to `/onboarding/consent` (`app/(finch)/(app)/layout.tsx:40`). Saving consent goes to the `/onboarding` wizard (`consent/actions.ts:82`).
- **Connect prompt:** the dashboard's «채널을 연동해 볼까요?» (Shall we connect your channels?) pop-up will **not** appear for the reviewer. `dashboard/page.tsx:41` calls `isChannelClosed(c)` without an email, so with `CHANNELS_OPEN` empty no channel counts as open. This is harmless, and it's why the instructions point to Settings.
- **Channels open for this account:** the reviewer can connect because `isChannelOpen` and `isChannelClosed` check the whole `OWNER_EMAIL` list (`lib/channel-availability.ts:59-63,91-99`). The same check runs again in each start route (`app/api/auth/{instagram,threads,meta-ads}/start/route.ts`). The operator notice, the raw error text and the dev-token fallback go only to the first address (`isPrimaryOwner`, `:75-80`).
- **Opening notice:** it's left out of the paste text on purpose (flag #1). If you keep it, add to section 2: «지금은 임시오픈 기간입니다» → click «오늘 하루 종일 보지 않기» (Don't show again today). **Not** «닫기» (Close): Close brings the notice back after every return from Instagram, Threads or Facebook.
- **Google verification [OWNER CONFIRM]:** a new Google account may challenge a sign-in from abroad. Decide how to handle it (for example, sign in beforehand from another network, or add backup codes to the credentials field). Never put passwords in these texts.

---

## (b) Data handling questionnaire: draft answers (English)

The questions below follow Meta's published Data Handling Questions (developers.facebook.com/docs/resp-plat-initiatives/data-handling-questions/questions-preview).

### B1. Q1 "Do you have data processors or service providers … that will have access to the Platform Data that you obtain from Meta?"

**Yes.** For each processor, Meta also asks Q2 (category: pick from Meta's list) and Q3 (countries where it processes Platform Data).

| Processor | Q2 category | Q3 countries | Platform Data it can access | Evidence |
|---|---|---|---|---|
| Supabase, Inc. | IT solutions and services, including cloud storage and processing | Republic of Korea (AWS ap-northeast-2, Seoul) [VERIFY whether to also list the United States for Supabase's own support access] | **Connections:** platform user ID, Instagram professional account ID, username, display name, bio, profile-picture URL, follower and post counts (refreshed daily), granted scopes, token expiry. **Tokens:** Instagram, Threads and Meta access tokens, encrypted by Finch with AES-256-GCM before storage. **Ads:** Facebook user ID and name; ad account ID, name, currency, time zone and status; the chosen Facebook Page's ID and name, and the linked Instagram account's ID and username; a log of campaign changes (IDs, request parameters, Meta error text; no tokens). **Auto DM:** the rule's post ID, caption, type, view count and thumbnail URL; comment IDs, media IDs, hashed commenter IDs, send status, message IDs, opt-out flags. **Publishing:** media IDs, container IDs and permalinks returned for posts published through Finch. **Profile link:** published pages keep up to 9 Instagram thumbnail URLs and permalinks, plus the source account ID. **In-app notifications:** username and follower-count changes. | `docs/DEPLOY.md:7-13`; migrations 0001, 0002, 0010, 0077, 0081, 0082, 0091, 0093; `app/api/auth/instagram/callback/route.ts:133-157`; `links/actions.ts:2140-2170` |
| Vercel Inc. | IT solutions and services, including cloud storage and processing | Republic of Korea (functions in `icn1`). Published profile pages are also served from Vercel's global edge cache [VERIFY which countries to list] | All API traffic passes through its functions, and function logs contain IDs and error text. Instagram and Threads Graph responses are stored in the Next.js persistent fetch cache together with their token-bearing request URL, and treated as fresh for 300 seconds (flag #3). Published profile-link pages, with Instagram thumbnails, are cached up to 1 day. | `vercel.json:3`; `lib/meta/instagram.ts:33-39`; `lib/meta/threads.ts:15-22`; `docs/PROFILE_CACHE.md` |
| Anthropic, PBC | Other: AI text generation that the user starts [OWNER CONFIRM category] | United States [VERIFY] | Only when the user runs an AI feature. **«AI 에이전트» (AI agent):** Instagram username, follower and post counts, 7-day reach, views, accounts engaged, interactions, profile-link taps. **«성과 분석» › «내 게시물» › «AI 진단 받기» (Get AI diagnosis):** captions and save, engagement and reach figures for up to 8 posts. **«링크 분석» › «분석하기» (Analyze):** up to 50 comment texts (200 characters each), without commenter names or IDs, for «댓글 감성 요약» (comment sentiment summary). By default, the Anthropic API deletes inputs and outputs within 30 days. | `lib/actions/agent-chat.ts:72-97`; `insights/posts/actions.ts:38-52`; `insights/link/actions.ts:49-80,182-186`; privacy.claude.com (API retention) |
| Functional Software, Inc. (Sentry) | IT solutions and services, including cloud storage and processing | United States (`ingest.us.sentry.io`, per the production CSP) | Server error events. PII sending, cookie/header/body collection and outgoing-request breadcrumbs are all off, and a scrubber masks emails and token-shaped strings. Because `console.error` output becomes events, they can contain Instagram media IDs and Graph API error text (e.g. `lib/meta/instagram.ts:383`). | `sentry.server.config.ts:23-48`; `sentry.edge.config.ts:16,32` |
| Resend [VERIFY legal entity name] | IT solutions and services (email delivery) | [VERIFY the sending region in the Resend dashboard] | Emails to the account owner. Token-expiry notices name the Instagram/Threads username (email on by default). Follower-change alerts add the follower count (email off by default). Publish results give the channel and failure reason (email off by default). | flag #9 |
| Google LLC (Analytics) | Analytics and measurements | United States [VERIFY] | **Only if flag #4 isn't fixed:** addresses of logged-in pages, which can include an Instagram username or ad campaign ID. [OWNER CONFIRM: fix, or declare] | `app/(finch)/layout.tsx:46,73` |

Services that **don't** receive Platform Data:
- **Upstash:** profile-link visit counters only (`lib/kv/upstash.ts`, `lib/links/views.ts`).
- **Toss / PayApp:** payments, currently switched off.
- **ScrapeCreators / Apify:** the public-data reference library. It's a separate pipeline with no connected-account data (`lib/reference/*`).

### B2. Q4 "Who is the person or entity that will be responsible for all Platform Data Meta shares with you?"
- **Entity:** 주식회사 딥레드. English legal name [OWNER CONFIRM, e.g. "Deepred Co., Ltd."]. Country: Republic of Korea.
- **Business registration no.:** 349-86-04259
- **Address:** 충청북도 청주시 흥덕구 봉명로 218, 3층 에이13호(봉명동). English version [OWNER CONFIRM].
- **Privacy officer:** 권태형 (romanized spelling [OWNER CONFIRM]), support@finch.ai.kr
- Source: `lib/legal/business.ts:42-56`.

### B3. Q5 Personal data given to public authorities for national-security requests in the past 12 months?
**"No"** [OWNER CONFIRM].

### B4. Q6 Policies for requests from public authorities
[OWNER CONFIRM] The repo has no written policy. The privacy policy says only that data isn't provided to third parties unless the law requires it or the user consents (§6, `lib/legal/documents.ts:181-195`). Meta's options, verbatim:
- "Required review of the legality of these requests"
- "Provisions for challenging these requests if they are considered unlawful"
- "Data minimization policy—the ability to disclose the minimum information necessary"
- "Documentation of these requests, including your responses to the requests and the legal reasoning and actors involved"
- "We are prohibited by law or company policy from answering this question"
- "None of the above"

Tick only what the company commits to in writing. Recommendation: adopt a one-page internal policy covering the first four before ticking them. Otherwise answer "None of the above".

### B5. Purpose and onward transfer (for any free-text field)
Finch uses Platform Data only to deliver features to the Finch user who connected the account: their own analytics, the posts they ask Finch to publish, the auto-DM rules they set up, and management of their own ad accounts. Finch does not sell Platform Data. It doesn't pass it to ad networks, data brokers or any third party other than the service providers in B1, and it doesn't use it for any purpose beyond serving that user (privacy policy §4, `lib/legal/documents.ts:163-170`).

### B6. What is stored, and for how long

| Data | Where | Retention and deletion trigger | Evidence |
|---|---|---|---|
| Instagram/Threads connection: username, name, bio, profile-picture URL, follower and post counts, platform and Instagram account IDs, scopes, encrypted token | `connected_accounts` | Counts are refreshed daily. The row is deleted by in-app «연결 해제» (Disconnect), Meta's data-deletion callback, or account deletion. Meta-side deauthorization wipes the tokens and marks the row disconnected. | `settings/channels/actions.ts:31-41`; `app/api/cron/refresh-tokens/route.ts:515-531`; `api/auth/{instagram,threads}/{data-deletion,deauthorize}` |
| Meta Ads connection: Facebook user ID and name, encrypted token, scopes; ad accounts; chosen Page and Instagram account | `meta_ad_connections` → cascades to `meta_ad_accounts` | Same triggers as above | migrations 0077 and 0082; `actions.ts:83-94`; `api/auth/meta-ads/*` |
| Ad change log: ad account ID, campaign ID, action, request parameters, Meta error text; no token | `meta_ad_write_log` | Until account deletion | migration 0081 |
| Auto-DM rule: the chosen post's media ID, caption, type, view count, thumbnail URL | `auto_dm_rules` | Until the rule is deleted, or account deletion | migration 0002 (+0038 thumbnail) |
| Auto-DM sends: comment ID, hashed commenter ID, status, message ID | `dm_sends` | 1 year from sending (daily purge, added 2026-09-12), and at account deletion (kept even if the rule is deleted, 0092) | migrations 0002, 0092; `api/cron/retention/route.ts` |
| Auto-DM webhook log: comment ID, media ID, hashed commenter ID | `webhook_events` | 90 days (daily purge), and at account deletion | `api/cron/retention/route.ts:27-31`; `webhooks/instagram/route.ts:191-201` |
| Opt-outs: hashed commenter ID | `commenter_consent` | Until account deletion. Incoming DM text is checked for the opt-out word and **not** stored. | `webhooks/instagram/route.ts:153-172` |
| Comment text | **Not stored.** Used in memory for keyword matching only. | — | `webhooks/instagram/route.ts:183-189`; `lib/auto-dm/check-now.ts:309-313` |
| Published posts: media ID, container IDs and permalink returned by Instagram/Threads | `scheduled_posts` | Until the user deletes the post, or account deletion | migrations 0010, 0093 |
| Published profile link «최근 게시물»: thumbnail URLs, permalinks, source account ID | `link_pages` published snapshot | Until the page is republished without the block, deleted, or the account is deleted | `links/actions.ts:2140-2170` |
| In-app notifications: username, follower-count changes | `notifications` | Until account deletion | `app/api/cron/refresh-tokens/route.ts:408-414` |
| Insights, post lists, campaign performance, Page lists and Page posts, business portfolios | **Not stored.** Fetched when viewed. Instagram/Threads responses sit in the fetch cache (flag #3); ads requests use `no-store`. Reports build CSVs from live data at download time. | — | `lib/meta/ads.ts:59-75`; `reports/actions.ts:7-11` |
| Deletion-request log: confirmation code, channel, SHA-256 hash of the platform user ID, row count, status | `data_deletion_requests` | 1 year from the request (daily purge, added 2026-09-12 — privacy policy art. 4) | `lib/legal/deletion-log.ts:15-29`; `api/cron/retention/route.ts` |

### B7. How users delete their data
1. **In the app, per account:** «계정 및 설정» (Account & Settings) › «SNS 계정 연결» (Connect social accounts) › «연결 해제» (Disconnect) › «해제하기» (Disconnect).
   - This deletes the stored connection and its encrypted token.
   - Posts scheduled on that channel, and posts still processing that Finch hasn't tried to publish yet, are marked failed (`settings/channels/actions.ts:49-74`).
2. **In the app, whole account:** «계정 및 설정» › «개인정보» (Personal info) › «회원탈퇴» (Delete account) at the bottom of the page. The user types their email and clicks «탈퇴하기» (Delete account) (`settings/profile/_components/danger-zone.tsx:34,62`).
   - This deletes the user row, and every table cascades from it.
   - The user's storage folders are emptied (`lib/account/delete.ts:40-66`).
   - Payment records are kept without identity links, as Korean e-commerce law requires (`settings/profile/actions.ts:14-30`).
3. **From Meta's side:** signed data-deletion callbacks exist for Instagram, Threads and Meta Ads.
   - Each one verifies `signed_request` with HMAC-SHA256 using a timing-safe comparison (`lib/meta/signed-request.ts:57-61`).
   - It deletes the connection and returns `{url, confirmation_code}`.
   - The URL opens a public status page (`/{instagram|threads|meta-ads}/data-deletion-status?id=`). The page reports done, failed or not found by looking up the log, and never claims success without checking (`components/legal/deletion-status.tsx:84-135`).
4. **Automatic:** webhook events are purged after 90 days.

**Caveat [OWNER CONFIRM]:** the Meta-side callbacks remove only the connection row. These stay until the Finch account itself is deleted:
- auto-DM rules (post caption, view count, thumbnail) and send records
- the ad change log
- media IDs of published posts
- in-app notifications
- published profile-link thumbnails and permalinks

If Meta's form asks whether "all data" is deleted, answer precisely, or extend the callbacks first.

**Update 2026-09-12:** the privacy policy (art. 9 ① 4) now promises to delete these leftovers within 10 days of a Meta deletion request. Until the callbacks are extended, that is a manual step: each callback now records the affected Finch account(s) in `data_deletion_followups` (migration 0095; several accounts for one Facebook login are all recorded, and a connection that was already removed in Finch is traced through published posts), the daily retention cron raises an alert while any row is open, and the public status page shows the 10-day deadline instead of «done» until the row is cleared (docs/LEGAL_REVIEW_2026-09.md §13-4).

### B8. Security measures (for Data Protection Assessment-style questions)
- **In transit:** HTTPS only. HSTS is set for 2 years with `includeSubDomains`, plus `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff` and `Referrer-Policy: strict-origin-when-cross-origin` (`vercel.json:5-17`).
- **Tokens at rest:** encrypted in the app with AES-256-GCM. Version 2 binds each ciphertext to its user and column (AAD), so a copied ciphertext can't be decrypted anywhere else (`lib/crypto/tokens.ts:8-38`). ⚠️ Fix flag #3 before stating this without a qualifier.
- **Database at rest:** Supabase states: "All customer data is encrypted at rest with AES-256 and in transit via TLS" (supabase.com/security).
- **Access control:** row-level security isolates each user's rows. Migration 0085 removed the token columns from logged-in client access, so only server code using the service key can read them. Modules that read secrets start with `import "server-only"`, so the build fails if one reaches the browser.
- **Minimization:**
  - Commenter IDs are stored as HMAC-SHA256 hashes keyed with a server-held secret (`DM_HASH_PEPPER`), once that secret is set [VERIFY it's set in production]. Older rows use unkeyed SHA-256 (`lib/auto-dm/recipient-hash.ts:26-40`).
  - Raw webhook payloads are not stored.
  - Sentry has cookie, header and body collection turned off, outgoing-request breadcrumbs off (so token-bearing URLs aren't sent), and a scrubber on.
- **Integrity of incoming calls:** the webhook's `X-Hub-Signature-256` is checked with a timing-safe comparison (`webhooks/instagram/route.ts:60,244`). Deletion and deauthorize callbacks verify `signed_request` (`lib/meta/signed-request.ts:57-61`).
- **Staff access, incident response, vulnerability testing:** [OWNER CONFIRM]. The repo shows internal code audits (for example 2026-09-07) but no formal program.

### B9. Privacy policy fixes to make before submitting (`lib/legal/documents.ts`)

**Done 2026-09-12** — the policy was rewritten (version 2026-09-12 — published and effective the same day, draft notice removed). (a)–(e) and (g) are applied; for (f) GA was taken off the logged-in screens (`components/analytics/google-analytics.tsx`). Details: docs/LEGAL_REVIEW_2026-09.md. The list below is kept for the record.
- **(a) Anthropic: scope and retention.** §6/§7 (`:190,205`) say Anthropic receives «이용자가 AI 기능에 입력한 내용» (what the user types). The code also sends Instagram captions, metrics and comment texts, so say so. «처리 후 즉시» (deleted right after processing) is also wrong: the Anthropic API default is deletion within 30 days. [OWNER CONFIRM if there's a zero-retention agreement]
- **(b) Transfer destinations.** §7 (`:200-201`) lists «Supabase(미국)» and «Vercel(미국)», but storage and compute are in Seoul (`docs/DEPLOY.md:7-13`). Give both the provider's country and the processing region.
- **(c) Meta Ads items.** §2 (`:146`) doesn't mention:
  - the chosen Facebook Page's ID and name, and the linked Instagram account (stored)
  - Page lists and recent Page posts (shown, not stored)
  - business portfolios (read on each view)
  - ad account time zone
  - the ad change log
- **(d) Retention.** §5 (`:176`) says auto-DM operational logs, webhook events included, are kept until account deletion. The code purges webhook events after 90 days. §5 also doesn't say that auto-DM rules keep the chosen post's caption, view count and thumbnail, or that published profile-link snapshots keep Instagram thumbnails and permalinks.
- **(e) Email notices.** §6 names Resend only for «알림·안내 메일 발송» (sending notification emails). Add that these emails can include the connected account's username and follower counts.
- **(f) Google Analytics.** If GA stays on logged-in screens (flag #4), §6/§8 should say that page addresses there can include an Instagram username or ad campaign ID. The better fix is to take GA off those screens.
- **(g)** Remove the draft notice and both «초안의 시행일» (draft effective date) lines (flag #2).

---

## (c) App basic settings checklist

| Dashboard location | Field | Value | Checked in code | Status |
|---|---|---|---|---|
| Settings › Basic | Display name | Finch. Meta forbids "Instagram"/"Facebook" in app names. | — | [OWNER CONFIRM] |
| Settings › Basic | App icon | `https://finch.ai.kr/brand/finch-app-icon-1024.png`: PNG, 1024×1024, RGBA with transparent rounded corners, 42 KB. A dark variant also exists. | ✅ `public/brand/finch-app-icon-1024.png` (colour type 6; corners from `finch-app-icon.svg` `rx="115"`) | Upload [VERIFY Meta accepts transparency] |
| Settings › Basic | App domains | `finch.ai.kr` | `lib/legal/business.ts:55` siteUrl; domain verified 2026-09-08 (APP_REVIEW §1) | [VERIFY] |
| Settings › Basic | Privacy policy URL | `https://finch.ai.kr/privacy`. Public, indexable, Korean only. | ✅ `(marketing)/privacy/page.tsx:10` (`index: true`); reserved slug `lib/links/reserved.ts:18` | Remove the draft notice first (flag #2) |
| Settings › Basic | Terms of Service URL | `https://finch.ai.kr/terms` | ✅ `(marketing)/terms/page.tsx` | Same draft notice (`documents.ts:127`) |
| Settings › Basic | User data deletion | Choose **"Data deletion callback URL"**: `https://finch.ai.kr/api/auth/meta-ads/data-deletion`. It verifies with the Facebook app secret (`META_ADS_APP_SECRET` \|\| `META_APP_SECRET`). There's no human-readable instructions page; if Meta insists on one, it has to be built (/privacy §9 only lists user rights). | ✅ `api/auth/meta-ads/data-deletion/route.ts` (POST only) | [VERIFY registered] |
| Settings › Basic | Category | Suggest **"Business and pages"** | — | [OWNER CONFIRM from the dropdown] |
| Settings › Basic | Contact email | `support@finch.ai.kr` | ✅ `lib/legal/business.ts:52,55` | Confirm the inbox actually receives mail (APP_REVIEW §7) |
| Settings › Basic | Data protection officer (optional) | 권태형 / support@finch.ai.kr | ✅ `business.ts:54-55` | [OWNER CONFIRM] |
| Settings › Basic › Platform | Website: Site URL | `https://finch.ai.kr/` | — | [VERIFY] |
| Instagram › API setup with Instagram business login | OAuth redirect URI | `https://finch.ai.kr/api/auth/instagram/callback` | ✅ `lib/meta/instagram-oauth.ts:81,90`. Built from `NEXT_PUBLIC_SITE_URL`, which must be `https://finch.ai.kr`. | [VERIFY] |
| same | Deauthorize callback URL | `https://finch.ai.kr/api/auth/instagram/deauthorize` | ✅ Verifies with `INSTAGRAM_APP_SECRET` \|\| `META_APP_SECRET` (`instagram-oauth.ts:72`) | [VERIFY registered] |
| same | Data deletion request URL | `https://finch.ai.kr/api/auth/instagram/data-deletion`. Status page: `/instagram/data-deletion-status?id=` | ✅ both routes | [VERIFY registered] |
| Instagram › Webhooks | Callback URL / verify token / fields | `https://finch.ai.kr/api/webhooks/instagram`. Verify token = the value of `IG_WEBHOOK_VERIFY_TOKEN`. Fields: `comments`, `messages`. | ✅ `webhooks/instagram/route.ts:35-41` | Subscribed, per APP_REVIEW §3 |
| Threads use case › Settings | Redirect callback URL | `https://finch.ai.kr/api/auth/threads/callback` | ✅ `lib/meta/threads-oauth.ts:60` | [VERIFY] |
| same | Uninstall callback URL | `https://finch.ai.kr/api/auth/threads/deauthorize` | ✅ Uses `THREADS_APP_SECRET` (`threads-oauth.ts:51`) | [VERIFY registered] |
| same | Delete callback URL | `https://finch.ai.kr/api/auth/threads/data-deletion`. Status page: `/threads/data-deletion-status?id=` | ✅ | [VERIFY registered] |
| Facebook Login settings for the ads use case | Valid OAuth redirect URI | `https://finch.ai.kr/api/auth/meta-ads/callback` | ✅ `lib/meta/ads-oauth.ts:107,116`. The code uses the classic `dialog/oauth` with `scope=` (no `config_id`). | [VERIFY the product name shown in the dashboard] |
| same | Deauthorize callback URL | `https://finch.ai.kr/api/auth/meta-ads/deauthorize` | ✅ | [VERIFY registered] |
| same | Data deletion request URL | `https://finch.ai.kr/api/auth/meta-ads/data-deletion`. Status page: `/meta-ads/data-deletion-status?id=` | ✅ | [VERIFY registered] |
| App roles › Testers | Instagram testers | `sding.kr`, `__taaae_h` | APP_REVIEW §3 | Is `sding.kr` also a Threads tester with a Threads profile? Otherwise Threads connect fails with «이 계정에는 아직 연결 권한이 없어요» (This account doesn't have connection access yet). [OWNER CONFIRM] |
| App Review › Permissions | Requested scopes | **Instagram (5):** `instagram_business_basic`, `_manage_insights`, `_manage_comments`, `_manage_messages`, `_content_publish`. **Threads (3):** `threads_basic`, `threads_content_publish`, `threads_manage_insights`. **Ads (5):** `ads_read`, `ads_management`, `pages_show_list`, `pages_read_engagement`, `business_management`, plus the Marketing API Access Tier feature. | ✅ `instagram-oauth.ts:28-34`, `threads-oauth.ts:29-33`, `ads-oauth.ts:60-66`. Main already has 5 ads scopes, so APP_REVIEW §2's "main still has 4" is out of date. | Don't add the Threads reply scopes. Before submitting: press «앱 검수에 추가» (Add to App Review) for the 2 Threads scopes, and get at least 1 successful call within 30 days for `pages_*` and `business_management` (0 today, APP_REVIEW §3). Access Tier needs 500 successful calls in 15 days (41 today). Check that `business_management` and `public_profile` "액세스 늘리기" (increase access) requests are included (APP_REVIEW §4-2-7). |
| Vercel environment variables | `OWNER_EMAIL` | `<owner account>,<reviewer Google account>`. The owner account must be first. | ✅ `lib/channel-availability.ts:43-80` | [OWNER CONFIRM] + redeploy |
| Vercel environment variables | `CHANNELS_OPEN` | Leave empty until approval is granted and the app is Live | ✅ `channel-availability.ts:29-36` | Keep closed |
| Vercel environment variables | `DM_HASH_PEPPER` | Set (never change it once set) | `lib/auto-dm/recipient-hash.ts:26-40` | [VERIFY] (B8 relies on it) |
| Vercel environment variables | App secrets match each product | `INSTAGRAM_APP_SECRET`, `THREADS_APP_SECRET`, `META_APP_SECRET`/`META_ADS_APP_SECRET` | Deletion and deauthorize callbacks return 400 `invalid_signature` on a mismatch | [VERIFY] |
| Supabase (SQL Editor) | Migration 0092 | Applied | Without it «지금 확인» fails closed (`lib/auto-dm/check-now.ts:220-227`) | [OWNER CONFIRM] |
| Supabase (SQL Editor) | Migration 0093 | Applied **before** the new publishing code (`3366fe1`) serves traffic | Without it the composer can't upload files or save any post: `create_publish_post` (`app/(finch)/(app)/publish/actions.ts:506`), `claim_publish_uploads` and the `publish-media` bucket (`lib/publish/uploads.ts:62,79`) | [OWNER CONFIRM], then one rehearsal «지금 발행» per channel (`docs/PUBLISH_VIDEO_PLAN.md` tests B-5 and C-10) |
| Supabase › Storage › Settings | Global file size limit | 300 MB or more, set **after** 0093 | Only video needs it; photos are at most 8 MB (`lib/publish-rules.ts:111`). Order and reason: `docs/PUBLISH_VIDEO_PLAN.md` «사장님이 할 일» 2 | Optional for the review (the screencasts use photos) |

---

## (d) Rules shared by all 13 screencasts (for recording; not pasted)

1. **Start logged out and film the whole login.** Open `https://finch.ai.kr` → «로그인» → «Google로 계속하기» → Google sign-in → «홈». Meta: "Capture the entire login flow, from logged-out to logged-in." Never show a password; cut or mask the Google password step.
2. **Film the permission grant.** Show the Instagram, Threads or Facebook authorization screen for that video's product. If the account is already connected, use «다시 연결» (Reconnect) so the grant is on camera.
3. **Format:** window ≤1440 px wide (and ≥768 px so the sidebar shows), 1080p, no audio, enlarged cursor, mouse rather than keyboard.
4. **Captions:** English captions over the Korean UI. Quote each label as «Korean» (English), using the exact strings from (a).
5. **One permission per video.** Don't reuse footage, and don't copy caption text between videos.
6. **Before recording:** remove the opening notice (flag #1), or click «오늘 하루 종일 보지 않기» the first time it appears. Otherwise it returns after each OAuth round-trip and covers the result dialog. Turn off browser auto-translation, and keep the «링크 분석» history note and the «베타» chip out of frame (flag #10).
7. **Don't show** passwords, the Vercel or Supabase dashboards, or personal details. Whether to blur the owner's personal Facebook profile in the Ads videos is [OWNER CONFIRM].

---

### Changes made
- **New flag #1 details.** Added that «닫기» doesn't persist, the notice stacks above the result dialog (z-60 vs z-50), and it appears in every screencast. The fallback instruction now says «오늘 하루 종일 보지 않기», not «닫기».
- **Flag #2:** added the terms' «초안의 시행일» line (`documents.ts:127`).
- **Flag #3:** corrected "kept up to 5 minutes". Next's fetch cache is persistent and stale entries aren't deleted.
- **Flag #4:** confirmed GA is live in production. Noted the policy already names GA, but only for usage statistics.
- **Flag #6:** added the missing conditions: top-level comment, 24-hour per-recipient cooldown, keyword match, 30-second cooldown, and migration 0092.
- **New flags #9 (Resend receives usernames and follower counts) and #10 ("coming soon" / «베타» labels).**
- **Fixed a false statement:** «AI 스튜디오» does use a permission; «인스타그램 예약 발행» goes through `publishGate`.
- **Added section 5 "Where each permission can be tested"** to the reviewer text, with every label verified. Added «예약 발행»/«초안으로 저장», «실행 중», the check-now result wording, opt-out words, the «변경» state of the Page button, and the channel row order.
- **Changed "Ads manager" to "Ad management"**, so it isn't confused with Meta's Ads Manager.
- **Consent decline:** it opens a confirmation that deletes the account; it doesn't delete on the first click.
- **Webhook statement** now cites Meta's rule: Live + Advanced Access.
- **Corrected line citations:** `use-oauth-start.tsx:56` (was 60), `connect-link.tsx:97-101` (was 129-133), `channels/page.tsx:313-314` (was 307-310), `(app)/layout.tsx:40` (was 35), `sidebar.tsx` ranges, `lib/josa.ts:39-45`.
- **B1** restructured to match Meta's Q1–Q3 (category and countries per processor). Added to Supabase: bio, follower/post counts, IG account ID, rule post data, media IDs, notifications. Sentry's region confirmed as US, and its data (media IDs, Graph error text) confirmed from code. Anthropic's 30-day retention added. Resend moved from "no Platform Data" to processor.
- **B4:** options replaced with Meta's verbatim list, including "prohibited by law" and "None of the above".
- **B6:** removed the false claim that metrics aren't stored (follower/post counts are). Added rows for auto-DM rules, published media IDs and notifications.
- **B7:** caveat extended to the ad change log and notifications. **B8:** Supabase's at-rest statement replaces the [VERIFY]; added Sentry hardening and the pepper caveat.
- **B9:** added Anthropic retention, the §5 webhook-log contradiction, and the Resend and GA wording. Dropped the PayApp/Toss item: PayApp is the confirmed PG, and it doesn't affect Meta.
- **(c):** added rows for `DM_HASH_PEPPER` and migration 0092, the call-count prerequisites, and the Threads tester failure mode. The ads login product name is marked [VERIFY] because the code uses `scope=`, not `config_id`.
- **New (d):** shared screencast rules, based on Meta's screen-recording page (full login flow, show the grant, ≤1440 px, no audio).
- Checked for passwords, personal phone numbers and competitor names: none present.
- **2026-09-12, new publish composer (`3366fe1`):** section 3 «발행», section 5 (both content_publish lines) and section 6 «Publishing» now describe the photo and video composer, the «추가» tile, «처리 중» (Processing) and «게시물 보기» (View post). The label table's publish rows and the «인스타그램 예약 발행» citation were re-cited. (c) gained rows for migration 0093 and the Storage file size limit. B1 and B6 now list the container IDs and permalinks that 0093 stores, and B7 covers processing posts on disconnect.

### Remaining [VERIFY] / [OWNER CONFIRM]
- **[OWNER CONFIRM]**
  - Hide the opening notice (flag #1), and decide on GA: fix or declare (flag #4).
  - Test-comment plan for auto-DM (post, keyword, second tester account, 24-hour gap after your own recordings), and whether migration 0092 is applied.
  - Migration 0093 is applied in production, and one rehearsal «지금 발행» per channel succeeds before recording ((c)).
  - How the reviewer gets a Facebook account with an ad account and app role, or whether to rely on the screencasts.
  - The reviewer Google account is in `OWNER_EMAIL` (second) and has finished consent and onboarding. How to handle Google's sign-in-from-abroad challenge.
  - `sding.kr` is a Threads tester with a Threads profile.
  - English legal name and address, romanized officer name, B3/B4 answers, deletion-log retention period, staff-access and incident-response programme, Anthropic zero-retention status and category choice.
  - Whether to blur the owner's Facebook profile in the Ads videos.
- **[VERIFY]**
  - Character limit of the reviewer-instructions field.
  - Dashboard registration of all 9 callback URLs and the Site URL.
  - Exact name of the Facebook Login product in the ads use case.
  - Meta accepting a transparent icon.
  - Countries to list for Supabase (support access), Vercel (edge), Anthropic, Resend and Google, plus Resend's legal entity and sending region.
  - `DM_HASH_PEPPER` set in production.
  - Whether a private reply reaches a commenter with no app role while the app is in development mode, and whether the sent DM shows in `sding.kr`'s own inbox.
  - Whether creating an ad creative fails in development mode (error 1885183 is only presumed, APP_REVIEW §5).
- **Docs to update separately:** APP_REVIEW §2 header ("main still has 4" ads scopes), and `docs/DEPLOY.md:128` / `docs/API_ROADMAP.md:108` ("Instructions URL").

Sources used: [Meta: Screen Recordings](https://developers.facebook.com/docs/app-review/submission-guide/screen-recordings/), [Meta: Data Handling Questions](https://developers.facebook.com/docs/resp-plat-initiatives/data-handling-questions/questions-preview/), [Meta: Data Deletion Callback](https://developers.facebook.com/docs/development/create-an-app/app-dashboard/data-deletion-callback/), [Meta: Instagram Webhooks](https://developers.facebook.com/docs/instagram-platform/webhooks/), [Supabase Security](https://supabase.com/security), [Anthropic Privacy Center: data retention](https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data).
