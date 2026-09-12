# 제출서 붙여넣기 모음

> 2026-09-12 작성 · 코드 기준 `e88470f`(비동기 「지금 발행」·계정 칩 반영). 영어 문장은 [INSTAGRAM.md](INSTAGRAM.md)·[THREADS.md](THREADS.md)·[ADS.md](ADS.md)·[SHARED.md](SHARED.md) 의 검증된 초안을 **3~5문장으로 줄이고** 새 발행 흐름과 지금 화면 글자에 맞춰 고친 최종본이다.
> **회색 상자 안의 영어를 그대로 복사해 붙인다.** 상자 안의 «…»는 화면 글자 그대로(파일:줄은 맨 아래 부록과 [RECORDING_GUIDE_KO.md](RECORDING_GUIDE_KO.md) 부록).
> **[사장님 확인]** = 붙이기 전에 사장님이 채우거나 확인할 곳. 상자 안에 있으면 **대괄호째 지우고** 알맞은 말로 바꾼다.
> 비밀번호는 이 문서 어디에도 적지 않는다 — 제출 화면의 비밀번호 칸에 사장님이 직접 넣는다.

---

## 0. 어디에 무엇을 붙이나

| 메타 앱 대시보드의 칸 | 이 문서 |
|---|---|
| 앱 검수 › 권한마다 "이 권한을 어떻게 쓰는지" 설명 칸 | §1 (권한 13개 — 권한마다 **다른 문장**, 복붙 금지) |
| 앱 검수 › 권한마다 영상 올리는 칸 | 녹화 가이드의 파일 `01_…mp4` ~ `13_…mp4` |
| 앱 검수 › 심사자 안내(Platform settings / reviewer instructions) | §2 |
| 앱 검수 › 테스트 계정(자격 증명) 칸 | §3 |
| 앱 설정 › 기본 설정, 각 제품의 설정 화면 | §4 |

칸 이름은 대시보드 언어(한국어/영어)에 따라 다르게 보일 수 있다. [사장님 확인]

---

## 1. 권한별 "How we use it" 설명 (13개)

### 1-1. instagram_business_basic — 영상 `01_instagram_business_basic.mp4`

```text
Finch uses instagram_business_basic to let a creator connect their own Instagram professional account through Instagram Login, started from «계정 및 설정» (Account & Settings) › «SNS 계정 연결» (Connect social accounts) › «Instagram» › «연결하기» (Connect). Right after authorization Finch calls GET /me for the account ID, username, name, profile picture, biography, website and follower, following and media counts; the username, name and photo appear on that settings row and on the Instagram card on «홈» (Home) so the user can confirm which account is linked, and the same «@username» labels each post in «발행» (Publish) with the account it was sent to. When Home or the «자동 DM» (Auto DM) post picker opens, Finch calls GET /{ig-user-id}/media for the account's recent posts (caption, media type, permalink, thumbnail or media URL, timestamp, like and comment counts) to draw the profile grid and to let the user choose which of their own posts to automate. Finch reads only the one account the user connected, shows it only inside that user's Finch workspace, and deletes the stored access token when the user clicks «연결 해제» (Disconnect) or removes Finch in Instagram's settings.
```

### 1-2. instagram_business_manage_insights — 영상 `02_instagram_business_manage_insights.mp4`

```text
We request instagram_business_manage_insights so that creators can follow their own Instagram performance inside Finch instead of switching to Instagram's professional dashboard. Finch calls GET /{ig-user-id}/insights for reach, views, accounts_engaged, total_interactions and profile_links_taps (totals for the last 7 days and the 7 days before, plus 14 days of daily reach and follower_count), and GET /{ig-media-id}/insights for views, reach, likes, saved, shares, comments and total_interactions on the 10–12 newest posts. «홈» (Home) turns these into weekly views, an average engagement rate and the 14-day «성과 추이» (Performance trend) chart; «성과 분석» (Performance analytics) › «개요» (Overview) compares reach, «참여 계정» (accounts engaged), «팔로워 순증감» (net follower change) and «프로필 링크 클릭» (profile-link taps) with the previous period; and «내 게시물» (My posts) ranks recent posts by save rate with each post's engagement rate, reach and saves. Every rate is a plain ratio of Instagram's own numbers, explained in a "?" tooltip, and insights are requested only for the account the user connected and shown only in that user's workspace.
```

### 1-3. instagram_business_content_publish — 영상 `03_instagram_business_content_publish.mp4`

```text
Finch uses instagram_business_content_publish so a user can post to their own connected Instagram professional account from «발행» (Publish): in «새 게시물 포스팅» (New post) they select «인스타그램», add photos or videos with the «추가» (Add) tile, write the «캡션» (Caption) and choose «지금 발행» (Publish now), «예약 발행» (Schedule) or «초안으로 저장» (Save as draft). The files are uploaded to Finch's own storage, and nothing reaches Instagram until the user clicks «지금 발행하기» (Publish now) or the scheduled time arrives. Finch then gives Instagram a URL for each file, creates a container with POST /{ig-user-id}/media (a photo post, a Reel, a carousel of 2–10 items, or a story when «스토리로 올리기» is on), waits for status_code FINISHED, calls POST /{ig-user-id}/media_publish and reads the new post's permalink. This runs on Finch's server after the click, so the editor closes at once with the notice «인스타그램에 올리기 시작했어요» (Started posting to Instagram), and the post's row, labeled with the «@username» it goes to, changes from «올리는 중» (Posting) to «발행 완료» (Published) with a «게시물 보기» (View post) link; a video Instagram is still processing shows «처리 중» (Processing), is completed automatically and is confirmed by an in-app notification. Scheduled posts go through the same calls within five minutes of the chosen time, and Finch never edits or deletes posts on Instagram.
```

### 1-4. instagram_business_manage_comments — 영상 `04_instagram_business_manage_comments.mp4`

```text
instagram_business_manage_comments powers «자동 DM» (Auto DM): the account owner picks one of their own posts, the keywords to react to, a private message and optional public replies, and Finch then answers matching comments on that post only. For each new comment Finch reads id, text, timestamp, username and from (GET /{ig-media-id}/comments, or the comments webhook), sends one Private Reply to the commenter with POST /{ig-user-id}/messages and recipient.comment_id, and, if the owner turned it on, posts one of the owner's prepared replies under the comment with POST /{ig-comment-id}/replies. The «지금 확인» (Check now) button on a running automation runs the same pipeline on the post's 50 newest top-level comments, so the owner can trigger it on demand. Each comment is answered at most once, the owner's own comments and comments older than about 6.5 days are skipped, comment text is not stored, and Finch never hides, edits or deletes comments. The same read access lets «성과 분석» (Performance analytics) › «링크 분석» (Link analysis) summarize the comments on the user's own post as positive, neutral or negative with an AI model.
```

### 1-5. instagram_business_manage_messages — 영상 `05_instagram_business_manage_messages.mp4`

```text
An Auto DM private reply opens an Instagram Direct conversation between the commenter and the business account, and Finch requests instagram_business_manage_messages for the messaging side of that conversation. When an account is connected, Finch subscribes it to the messages webhook (POST /me/subscribed_apps with subscribed_fields=comments,messages), so a recipient's reply to an automated DM reaches Finch and is checked only for an opt-out word («수신거부», "stop" or "unsubscribe"); on a match Finch stores a one-way hash of the sender's Instagram-scoped ID and sends that person no further automated messages from this account. The message itself is written by the account owner in the «DM 메시지를 작성해주세요» (Write your DM) step, is sent with POST /{ig-user-id}/messages only to people who commented on the owner's post, and appears in the recipient's Instagram inbox like any other Direct message. Incoming message text is never stored, and sending is limited to once per comment, once per person every 24 hours and 300 per automation per day, so Finch never starts cold conversations or sends bulk messages.
```

### 1-6. threads_basic — 영상 `06_threads_basic.mp4`

```text
Finch uses threads_basic so a creator can link their own Threads profile through Threads Login, from «계정 및 설정» (Account & Settings) › «SNS 계정 연결» (Connect social accounts) › «Threads» › «연결하기» (Connect). Right after consent Finch reads the profile's ID, username, display name, profile picture and bio (GET /me) and shows them on that settings row and on the Threads profile card on «홈» (Home), so the user can see which profile is linked; the same «@username» marks every Threads post in «발행» (Publish). When the user selects «Threads» on Home, Finch retrieves the profile's own recent threads (GET /{threads-user-id}/threads: text, media type, media URL and publish time) and shows them as the «최근 게시물» (Recent posts) list and a photo grid, so the user can review what they have posted without switching apps. These posts are visible only inside the user's own Finch workspace and never on a public page, and the stored token is deleted when the user clicks «연결 해제» (Disconnect).
```

### 1-7. threads_content_publish — 영상 `07_threads_content_publish.mp4`

```text
Finch requests threads_content_publish for a single feature: posting what the user writes in «발행» (Publish) to their own Threads profile. In the «새 게시물 포스팅» (New post) editor the user chooses «스레드» (Threads), types up to 500 characters in «글» (Text), may attach up to 20 photos or videos with «추가» (Add), and selects «지금 발행» (Publish now) or «예약 발행» (Schedule) with a date and time; attached files are kept in Finch's own storage and Threads receives a URL for each. Finch creates a TEXT, IMAGE, VIDEO or CAROUSEL container with POST /{threads-user-id}/threads, checks that its status is FINISHED, and calls POST /{threads-user-id}/threads_publish, either on the server right after «지금 발행하기» (Publish now) is clicked or within five minutes of the scheduled time. The editor closes immediately with «스레드에 올리기 시작했어요» (Started posting to Threads), the post's row, tagged with the «@username» it is going to, moves from «올리는 중» (Posting) to «발행 완료» (Published) with a «게시물 보기» (View post) link to the live thread, and an in-app notification confirms it; if Threads rejects the post, Finch shows the reason and keeps the post so the user can retry or delete it. Nothing reaches the user's Threads profile unless they wrote it and chose to publish or schedule it.
```

### 1-8. threads_manage_insights — 영상 `08_threads_manage_insights.mp4`

```text
Finch uses threads_manage_insights to show a creator how their own Threads profile is performing on «홈» (Home) after they pick «Threads» in the channel selector. From GET /{threads-user-id}/threads_insights it reads followers_count and the profile's views, likes, replies, reposts and quotes for the last 7 days and the 7 days before, which fill the «팔로워» (Followers), «이번 주 조회수» (Views this week, with the change vs. last week) and «평균 참여율» (Average engagement rate) cards and a 14-day daily-views line in «성과 추이» (Performance trend). Per-thread insights (GET /{threads-media-id}/insights: views, likes, replies, reposts, quotes and shares) for the 10 newest threads supply the «조회수» (Views), «좋아요» (Likes) and «댓글» (Replies) columns of «최근 게시물» (Recent posts), and a daily background check sends an in-app alert when the follower count moves by at least 30 and 3% in one day. The engagement rate is Finch's own ratio, (likes + replies + reposts + quotes) ÷ views, and all of these numbers stay inside the user's Finch workspace.
```

### 1-9. ads_read — 영상 `09_ads_read.mp4`

```text
Finch is a dashboard where businesses track their Instagram and Threads results, and ads_read lets them see their paid Meta results on the same screens instead of switching to Ads Manager. After Facebook Login, Finch lists the ad accounts the person can access (GET /me/adaccounts) and, for the selected account, reads its campaigns and campaign-level Insights for the last 30 days: spend, impressions, reach, inline link clicks, and purchase actions and values. «광고 관리» (Ad management) shows account totals (amount spent, impressions, average CTR, average ROAS) and a «캠페인 성과» (Campaign performance) table with each campaign's daily budget, spend, impressions, reach, link clicks, CTR, CPC, conversions and ROAS, while the «광고 현황» (Ads overview) card on «홈» (Home) summarizes spend, active campaigns and ROAS. Metrics are requested from Meta each time a screen opens rather than stored, use the ad account's own currency, and show «—» instead of zeros if the Insights request fails.
```

### 1-10. ads_management — 영상 `10_ads_management.mp4`

```text
Finch serves small businesses and the agencies that run Meta ads for them, and ads_management lets them act on what the dashboard shows, for example pausing a campaign whose cost per click has spiked and turning it back on once the landing page is fixed. In «캠페인 관리» (Campaign management) each campaign row has «일시중지» (Pause) or «게재 시작» (Start delivery), which change the campaign's status through the Marketing API only after a confirmation dialog, and starting delivery warns «게재 시작 — 비용이 발생해요» (Start delivery — charges will apply). The «새 캠페인» (New campaign) form creates campaigns that are always saved as PAUSED, and a campaign's own page lets the user pause or turn on its ad sets and ads and build a new ad set, creative and ad under the Facebook Page chosen in settings. Finch writes only to the ad account selected in Finch, only workspace owners and editors can make changes, write controls stay closed if the person declined ads_management in Facebook Login, and every write is recorded in an audit log.
```

### 1-11. pages_show_list — 영상 `11_pages_show_list.mp4`

```text
We request pages_show_list as a dependency of ads_management: a Meta ad runs under a Facebook Page, so before a business creates ads in Finch it has to choose which of its Pages will publish them. In «계정 및 설정» (Account & Settings) › «SNS 계정 연결» (Connect social accounts), the «광고 게시 페이지» (Ad publishing Page) row has a «페이지 선택» (Select Page) button that opens «광고를 게시할 페이지» (Page to publish ads), listing the Pages the person manages from GET /me/accounts with each Page's name, ID and tasks. Pages without the ADVERTISE task are shown with «이 페이지에는 광고 권한이 없어요» (No ad permission on this Page) and cannot be selected, so the user can see why a Page is unavailable instead of wondering where it went. The chosen Page's ID and name, plus the Instagram account linked to it, are saved for that ad account, shown in the row and reused by the ad-creation wizard, and the list is fetched from Meta again every time the dialog opens.
```

### 1-12. pages_read_engagement — 영상 `12_pages_read_engagement.mp4`

```text
Agencies often manage several Pages with similar names, so Finch shows a Page's own recent posts to let the user confirm they picked the right Page before ads run under its name. When a Page is clicked in «광고를 게시할 페이지» (Page to publish ads), Finch obtains that Page's access token within the same server request and calls GET /{page-id}/posts for the three most recent posts (message, created_time, full_picture, permalink_url). The dialog lists them under «이 페이지의 최근 게시물» (This Page's recent posts) with the first lines of text, a thumbnail, the date and a «Facebook에서 보기» (View on Facebook) link. The Page token never leaves the server and is not stored, the posts are not saved, and the user can still choose the Page if they cannot be loaded; Meta's permission reference also lists pages_read_engagement as a dependency of ads_management.
```

### 1-13. business_management — 영상 `13_business_management.mp4`

```text
Finch requests business_management alongside ads_read and ads_management in the Marketing API use case and uses it for one read-only feature: showing which business portfolio owns each connected ad account. Each time «SNS 계정 연결» (Connect social accounts) opens, Finch calls GET /me/businesses and reads the business field of the person's ad accounts (GET /me/adaccounts?fields=business{id,name}), then shows the result in the «비즈니스 포트폴리오» (Business portfolio) row: one line per ad account when there are several, and «비즈니스 포트폴리오에 속하지 않은 광고 계정이에요» (This ad account isn't in a business portfolio) when it has none. Agencies and multi-brand companies often keep ad accounts in different portfolios, so this row tells them whose account the «광고 관리» (Ad management) figures and campaign changes belong to before they act. Finch does not create, claim or edit business assets, people or permissions, and it reads portfolio names from Meta on each visit instead of storing them.
```

### 1-14. (칸이 뜰 때만) public_profile

페이스북 로그인이 기본으로 주는 권한이다. 제출 화면에 "액세스 늘리기(Increase access)" 칸과 설명 칸이 뜨면 붙인다. [사장님 확인: 칸이 뜨는지]

```text
Finch uses public_profile only to receive the Facebook user ID and name after Facebook Login for Meta Ads, so that Meta's deauthorization and data-deletion callbacks can be matched to the right connection. Nothing from the profile is shown to other users or shared.
```

### 1-15. (기능) Marketing API Access Tier

권한이 아니라 «기능»이다. Full 신청 조건은 최근 15일 성공 호출 500회 이상 + 최근 500회 오류율 15% 미만(2026-09-11 기준 41회). 이번 제출에 같이 넣을지, 조건을 채운 뒤 따로 낼지 정한다. [사장님 확인]

---

## 2. 심사자 안내문 (Platform settings / reviewer instructions)

칸의 글자 수 한도를 넘으면 5절(Notes)부터 줄인다. [사장님 확인: 한도]
상자 안 대괄호 두 곳(Meta Ads 접근, 테스트 댓글)은 사장님이 정한 뒤 바꾸거나 지운다.

```text
FINCH: HOW TO ACCESS AND TEST

About the app
Finch (https://finch.ai.kr) is a web app for Instagram professional accounts, Threads profiles and Meta ad accounts: account analytics, post publishing and scheduling, comment-triggered DMs and ad campaign management. The interface is in Korean only. Every on-screen label below is quoted exactly as «Korean», followed by an English translation in parentheses, and each permission's screencast has English captions.

1. Log in
1) Use a desktop browser window at least 768 px wide (narrower windows hide the left sidebar). Please keep automatic page translation turned off.
2) Open https://finch.ai.kr and click «로그인» (Log in) at the top right.
3) Click «Google로 계속하기» (Continue with Google). The dialog «Google로 이동하고 있어요» (Taking you to Google) appears, then Google sign-in opens.
4) Sign in with the Google account from the test credentials. Finch offers only Google and Kakao sign-in, so there is no separate Finch password.
5) You arrive at «홈» (Home).

2. Screens that may appear the first time
The test account has already completed these. If one appears anyway:
- «서비스 이용 동의» (Service consent): tick «전체 동의 (선택 항목 포함)» (Agree to all, including optional) and click «동의하고 시작하기» (Agree and start). Please do not use «동의하지 않고 나가기» (Decline and leave): its confirmation deletes the shared test account.
- «핀치에 오신 걸 환영해요» (Welcome to Finch): click «건너뛰기» (Skip).
- «채널을 연동해 볼까요?» (Connect your channels?): click «다음에 할게요» (Maybe later).

3. Connect the test accounts
Open «계정 및 설정» (Account & Settings) at the bottom of the left sidebar, then «SNS 계정 연결» (Connect social accounts) in the «연결» (Connections) group. These connections are enabled for this test account so you can review them.

Instagram
1) Under «채널 계정» (Channel accounts), on the «Instagram» row, click «연결하기» (Connect). If the row already shows «연결됨» (Connected), click «다시 연결» (Reconnect).
2) The dialog «Instagram로 이동하고 있어요» (Taking you to Instagram) appears, then Instagram's login and permission screen opens. Log in with the Instagram test account and allow all requested permissions.
3) Back in Finch, the dialog «@<username> 계정을 연결했어요» (@<username> is connected) appears. Click «확인» (OK).

Threads
1) On the «Threads» row, click «연결하기» (Connect). «Threads로 이동하고 있어요» (Taking you to Threads) appears.
2) Log in to Threads with the same Instagram test account and allow access.
3) The same «@<username> 계정을 연결했어요» dialog appears. Click «확인» (OK).

Meta Ads
1) Under «광고 계정» (Ad accounts), on the «Meta 광고» (Meta Ads) row, click «연결하기» (Connect). «Meta 광고로 이동하고 있어요» (Taking you to Meta Ads) appears, then Facebook Login asks for the ads, Pages and business portfolio permissions. Select your business portfolio, Facebook Page and ad account when asked.
2) The dialog «광고 계정 N개를 연결했어요» (N ad account(s) connected) appears. Click «확인» (OK). Two rows appear under «Meta 광고»: «비즈니스 포트폴리오» (Business portfolio) and «광고 게시 페이지» (Ad publishing Page).
[사장님 확인: if reviewers cannot use a Facebook account with an ad account while the app is in development mode, keep this sentence, otherwise delete it: "If your Facebook account has no ad account, Finch shows «연결은 됐지만 쓸 수 있는 광고 계정이 없어요» (Connected, but no usable ad account). The Meta Ads screencasts show every step end to end with our own business account."]

At the bottom of the page, «핀치가 요청하는 권한» (Permissions Finch requests) expands to list every permission and its purpose. To disconnect, click «연결 해제» (Disconnect), then «해제하기» (Disconnect). Please do not delete the Finch test account; it is shared.

4. Where to test each permission
Instagram
- instagram_business_basic: the connected «Instagram» row (photo, @username, name); on «홈» (Home), the Instagram card under «내 계정» (My accounts), and the «Instagram» chip at the top of Home, which shows the profile and a grid of recent posts.
- instagram_business_manage_insights: «홈» (Home) with the «Instagram» chip: «팔로워» (Followers), «이번 주 조회수» (Views this week), «평균 참여율» (Avg. engagement rate), «성과 추이» (Performance trend) › «도달» (Reach) and «최근 게시물» (Recent posts). Then the left sidebar «성과 분석» (Performance analytics) › «개요» (Overview) and «내 게시물» (My posts).
- instagram_business_content_publish: left sidebar «발행» (Publish) › «새 게시물 포스팅» (New post) › channel «인스타그램» › add one photo with the «추가» (Add) tile › write the «캡션» (Caption) › select «지금 발행» (Publish now) › click «지금 발행하기» (Publish now). The editor closes right away and the notice «인스타그램에 올리기 시작했어요» (Started posting to Instagram) appears. In today's list on the right, the post shows «올리는 중» (Posting) with the account «@<username>», then «발행 완료» (Published), usually within seconds. Click the row's arrow icon «게시물 보기» (View post) to open the post on Instagram.
- instagram_business_manage_comments: left sidebar «자동 DM» (Auto DM) › «첫 자동화 만들기» (Create your first automation) › «현재 게시물에서 선택할게요» (Choose from my current posts), pick a post › «다음» (Next) › «특정 키워드에 발송할게요» (Send for specific keywords), type a keyword, «추가» (Add) › «다음» › type the message in «메시지 입력» (Message) and set «메시지 버튼» (Message buttons) to «없음» (None) › «다음» › «네, 답글을 남기고 싶어요» (Yes, leave a reply) › «다음» › «확인» (Confirm). From the second test Instagram account, comment the keyword on that post, then click «지금 확인» (Check now) on the automation. The result reads «DM 1개를 보냈어요» (1 DM sent), and the public reply appears under the comment on Instagram.
- instagram_business_manage_messages: the private reply sent above appears in the commenter's Instagram Direct inbox (possibly under Requests). A reply of «수신거부», "stop" or "unsubscribe" opts that person out; Finch receives such replies through the messages webhook once the app is Live.
Threads
- threads_basic: the connected «Threads» row; «홈» (Home) with the «Threads» chip: profile card, photo grid and «최근 게시물» (Recent posts).
- threads_manage_insights: «홈» (Home) with the «Threads» chip: «팔로워» (Followers), «이번 주 조회수» (Views this week), «평균 참여율» (Avg. engagement rate), «성과 추이» (Performance trend) › «도달» (for Threads it plots daily views), and the «조회수» / «좋아요» / «댓글» (Views / Likes / Replies) columns of «최근 게시물».
- threads_content_publish: «발행» (Publish) › «새 게시물 포스팅» (New post) › channel «스레드» (Threads) › write in «글» (Text); a photo is optional › «지금 발행» (Publish now) › «지금 발행하기». The notice «스레드에 올리기 시작했어요» (Started posting to Threads) appears, and the row moves from «올리는 중» (Posting) to «발행 완료» (Published) with «게시물 보기» (View post).
Meta Ads
- ads_read: left sidebar «광고 관리» (Ad management): «집행 금액» (Amount spent), «노출수» (Impressions), «평균 CTR», «평균 ROAS» and the «캠페인 성과» (Campaign performance) table; also the «광고 현황» (Ads overview) card on «홈».
- ads_management: «광고 관리» › «캠페인 관리» (Campaign management): «일시중지» (Pause) on a campaign marked «게재 중» (Active), then «게재 시작» (Start delivery), which opens «게재 시작 — 비용이 발생해요» (Start delivery — charges will apply). «새 캠페인» (New campaign) › «캠페인 만들기» (Create campaign) creates a paused campaign at no cost.
- pages_show_list: «SNS 계정 연결» › «광고 게시 페이지» (Ad publishing Page) › «페이지 선택» (Select Page) lists your Facebook Pages.
- pages_read_engagement: in that dialog, click a Page. «이 페이지의 최근 게시물» (This Page's recent posts) shows its three latest posts with «Facebook에서 보기» (View on Facebook).
- business_management: the «비즈니스 포트폴리오» (Business portfolio) row under «Meta 광고» shows which business portfolio owns the ad account.

5. Notes for testing
- Auto DM: Instagram sends comment webhooks only to Live apps with Advanced Access, so each running automation has «지금 확인» (Check now). It reads the post's 50 most recent top-level comments and processes them with the same code as the webhook. A comment gets a DM only if a different Instagram account wrote it, it is less than about 6.5 days old, it contains the keyword, it has not been handled before, and its author has not received a DM from this account in the past 24 hours. «지금 확인» can be pressed once every 30 seconds per automation. The free plan allows one automation; if one already exists, delete it with its trash icon first.
- [사장님 확인: e.g. "Please comment from the second test Instagram account in the credentials on any recent post of the test account." Delete this line if not needed.]
- Publishing: «지금 발행» (Publish now) posts to the real test account, and Finch cannot undo it. Publishing continues on Finch's server even if you leave the page, and you also receive the in-app notification «게시물이 발행됐어요» (Your post was published). Videos take a few minutes: the row shows «처리 중» (Processing) and completes automatically.
- Ads: new campaigns, ad sets and ads are always created paused. Turning delivery on can spend money.
- TikTok, including the composer chip «틱톡» marked «준비 중» (coming soon), is not part of this submission. The «레퍼런스» (References) menu uses no Meta permission.
```

---

## 3. 테스트 계정 (자리만 — 비밀번호는 쓰지 않는다)

| 칸 | 넣을 값 |
|---|---|
| 핀치 로그인용 구글 계정 | «[여기에 심사용 구글 계정]» |
| 그 비밀번호 | 제출 화면의 비밀번호 칸에 사장님이 직접 입력 |
| 인스타·스레드 테스트 프로페셔널 계정 | «[여기에 테스트 인스타 계정]» (지금 `sding.kr` — 이름을 바꿀지 [사장님 확인]) |
| 그 비밀번호 | 제출 화면에 사장님이 직접 입력 |
| 댓글용 인스타 테스트 계정 | «[여기에 댓글용 테스트 인스타 계정]» (앱 테스터 수락된 계정) |
| 페이스북(광고) | [사장님 확인] — 심사자에게 줄 수 있는 광고 계정 딸린 페이스북 계정이 없으면 비워 두고 §2의 대괄호 문장을 쓴다. 가짜 페이스북 계정·사장님 개인 계정은 넣지 않는다(제출 전체가 거절된다). |

제출서의 메모 칸에 붙일 영어(대괄호는 실제 아이디로 바꾼다):

```text
Test credentials
- Finch sign-in (Google account): [여기에 심사용 구글 계정]. Password: in the password field.
- Instagram professional test account, also used for Threads: [여기에 테스트 인스타 계정]. Password: provided with this submission.
- Second Instagram test account, for commenting on the test account's posts (Auto DM test): [여기에 댓글용 테스트 인스타 계정]. Password: provided with this submission.
- Both Instagram accounts have accepted the tester role on this app.
```

- 새 구글 계정·인스타 계정은 해외 로그인에 본인확인을 걸 수 있다 — 심사자가 못 들어오면 **제출 전체가 거절된다.** 미리 해외 로그인 확인을 끄거나 정리해 둔다. [사장님 확인]
- 심사용 구글 계정은 Vercel `OWNER_EMAIL` 의 **두 번째 이후** 주소여야 한다(첫 번째는 사장님 본계정). 그리고 로그인 → 동의 → 첫 안내까지 한 번 끝내 둔다. [사장님 확인]

---

## 4. 앱 기본 설정 값

코드로 주소가 실제 있는지 확인한 값이다. 대시보드에 **등록돼 있는지**는 코드로 알 수 없어 전부 [사장님 확인].

| 대시보드 위치 | 칸 | 넣을 값 | 코드 확인 |
|---|---|---|---|
| 앱 설정 › 기본 설정 | 표시 이름 | `Finch` (앱 이름에 «Instagram»·«Facebook» 금지) | [사장님 확인] |
| 〃 | 앱 아이콘 | `public/brand/finch-app-icon-1024.png` (1024×1024) | 파일 있음 |
| 〃 | 앱 도메인 | `finch.ai.kr` | 도메인 인증 완료(2026-09-08, APP_REVIEW §1) |
| 〃 | 개인정보처리방침 URL | `https://finch.ai.kr/privacy` | `app/(finch)/(marketing)/privacy/page.tsx` 있음 · 예약어 `lib/links/reserved.ts:18` |
| 〃 | 서비스 약관 URL | `https://finch.ai.kr/terms` | `app/(finch)/(marketing)/terms/page.tsx` 있음 · 예약어 `lib/links/reserved.ts:18` |
| 〃 | 사용자 데이터 삭제 | "Data deletion callback URL"(데이터 삭제 콜백 URL)을 고르고 `https://finch.ai.kr/api/auth/meta-ads/data-deletion` (사람이 읽는 안내 페이지 방식은 아님) | `app/api/auth/meta-ads/data-deletion/route.ts` — POST 전용 |
| 〃 | 카테고리 | 추천 "Business and pages"(비즈니스 및 페이지). 드롭다운에 없으면 가장 가까운 업무·생산성 분류 | [사장님 확인] |
| 〃 | 연락처 이메일 | `support@finch.ai.kr` | `lib/legal/business.ts:52` — 실제로 메일이 오는지 [사장님 확인] |
| 〃 › 플랫폼 «웹사이트» | 사이트 URL | `https://finch.ai.kr/` | — |
| 인스타그램 › 인스타 로그인 API 설정 | OAuth 리디렉션 URI | `https://finch.ai.kr/api/auth/instagram/callback` | `lib/meta/instagram-oauth.ts:81` |
| 〃 | 승인 취소(Deauthorize) 콜백 | `https://finch.ai.kr/api/auth/instagram/deauthorize` | `app/api/auth/instagram/deauthorize/route.ts` — POST |
| 〃 | 데이터 삭제 요청 콜백 | `https://finch.ai.kr/api/auth/instagram/data-deletion` | `app/api/auth/instagram/data-deletion/route.ts` — POST · 결과 페이지 `/instagram/data-deletion-status` 있음 |
| 인스타그램 › 웹훅 | 콜백 URL · 구독 필드 | `https://finch.ai.kr/api/webhooks/instagram` · `comments`, `messages` | `app/api/webhooks/instagram/` 있음 · 구독 중(APP_REVIEW §3) |
| 스레드 이용 사례 › 설정 | 리디렉션 콜백 URL | `https://finch.ai.kr/api/auth/threads/callback` | `lib/meta/threads-oauth.ts:60` |
| 〃 | 제거(Uninstall) 콜백 | `https://finch.ai.kr/api/auth/threads/deauthorize` | `app/api/auth/threads/deauthorize/route.ts` — POST |
| 〃 | 삭제(Delete) 콜백 | `https://finch.ai.kr/api/auth/threads/data-deletion` | `app/api/auth/threads/data-deletion/route.ts` — POST · 결과 페이지 `/threads/data-deletion-status` 있음 |
| 광고(페이스북 로그인) 설정 | 유효한 OAuth 리디렉션 URI | `https://finch.ai.kr/api/auth/meta-ads/callback` | `lib/meta/ads-oauth.ts:107` |
| 〃 | 승인 취소 콜백 | `https://finch.ai.kr/api/auth/meta-ads/deauthorize` | `app/api/auth/meta-ads/deauthorize/route.ts` — POST |
| 〃 | 데이터 삭제 요청 콜백 | `https://finch.ai.kr/api/auth/meta-ads/data-deletion` | 위와 같음 · 결과 페이지 `/meta-ads/data-deletion-status` 있음 |

- ⚠️ **개인정보처리방침·약관 맨 위에 노란 «초안» 안내가 아직 있다** — «본 문서는 정식 출시 및 법률 검토 전의 초안입니다…»(`lib/legal/documents.ts:27`), 그리고 두 문서 끝의 «…초안의 시행일»(`:127`, `:263`). 심사자가 방침 주소를 열면 «초안»이라는 말을 읽는다. 제출 전에 뺄지 정해 주시면 코드를 고친다. [사장님 확인]
- 데이터 삭제 콜백 주소 셋은 전부 **POST 전용**이라 브라우저로 열면 빈 화면·오류가 정상이다.

---

## 5. 제출 직전 [사장님 확인] 모음

1. 심사용 구글 계정 주소, `OWNER_EMAIL` 두 번째 등록, 동의·첫 안내 완료, 해외 로그인 확인 정리.
2. 테스트 인스타 계정 이름(`sding.kr` 유지/변경), 인스타·스레드 테스터 둘 다 수락, 팔로워 수(100 미만이면 팔로워 지표가 0으로 보일 수 있다).
3. 댓글용 테스트 계정(심사자용 1개 + 녹화용 A·B) 준비와, 심사 기간에 그 계정을 사장님 시험에 쓰지 않기.
4. 광고: 심사자가 페이스북으로 들어올 방법(없으면 §2 대괄호 문장), 녹화 캠페인 비용, 광고 계정의 포트폴리오 소속, 페이지의 인스타 연결.
5. 개인정보처리방침·약관의 «초안» 안내를 뺄지(§4).
6. 앱 카테고리, 연락 메일 수신, 콜백 주소 9개·웹훅·사이트 주소가 대시보드에 등록돼 있는지.
7. 심사자 안내문 칸의 글자 수 한도.
8. 마이그레이션 0092·0093·0094 운영 적용.
9. 제출 화면에 `business_management`·`public_profile` "액세스 늘리기(Increase access)"가 들어갔는지, Marketing API Access Tier 를 같이 낼지.
10. 권한마다 최근 30일 안에 성공한 호출이 1회 이상 있는지(대시보드 «앱 검수» 화면, 반영에 최대 2일 — 스레드 발행·페이지 두 개·business_management 가 특히).
11. 앱은 **개발 모드 그대로** 제출한다(Live 로 돌리면 승인 안 된 권한은 테스터도 못 쓴다 — APP_REVIEW §5).
12. (선택) 설정 화면의 권한 문구 «게시물 발행(카드뉴스 예약 발행)»(스레드)·«예약한 게시물 발행»(인스타)이 「지금 발행」을 말하지 않는다. 녹화 전에 고칠지 — 고치면 코드 수정·배포가 먼저다.

---

## 부록 — 영어 문장에 인용한 라벨 출처 (개발용)

코드 기준 `e88470f`. 여기 없는 라벨은 [RECORDING_GUIDE_KO.md](RECORDING_GUIDE_KO.md) 부록에 있다. `(app)` = `app/(finch)/(app)`.

| 라벨 | 파일:줄 |
|---|---|
| «로그인» · «Google로 계속하기» · «Google로 이동하고 있어요» | `app/(finch)/(marketing)/layout.tsx:55` · `app/(finch)/(auth-split)/login/login-form.tsx:73` · `components/auth/use-oauth-start.tsx:56` |
| «서비스 이용 동의» · «전체 동의 (선택 항목 포함)» · «동의하고 시작하기» · «동의하지 않고 나가기» | `app/(finch)/(auth)/onboarding/consent/consent-form.tsx:85,97,139,155` |
| «핀치에 오신 걸 환영해요» · «건너뛰기» | `app/(finch)/(auth)/onboarding/onboarding-form.tsx:93,86` |
| «채널을 연동해 볼까요?» · «다음에 할게요» | `components/dashboard/connect-channels-modal.tsx:121,161` |
| «계정 및 설정» · «홈» · «발행» · «자동 DM» · «광고 관리» · «성과 분석» · «레퍼런스» | `components/layout/sidebar.tsx:87,33,53,54,60,61,67` |
| «연결» · «SNS 계정 연결» | `lib/settings/sections.ts:61,63` |
| «채널 계정» · «광고 계정» · «Meta 광고» · «연결하기» · «다시 연결» · «연결 해제» · «해제하기» | `(app)/settings/channels/page.tsx:531,616,619,606,590,600,598` |
| «Instagram» · «Threads»(줄 이름) · «연결됨» | `lib/channels.ts:5,7` · `(app)/settings/channels/_lib/derive-state.ts:47` |
| «…로 이동하고 있어요» | `components/ui/connect-link.tsx:99` |
| «@… 계정을 연결했어요» · «광고 계정 N개를 연결했어요» · «확인» | `(app)/settings/channels/page.tsx:314` · `app/api/auth/meta-ads/callback/route.ts:241` · `components/ui/result-modal.tsx:114` |
| «연결은 됐지만 쓸 수 있는 광고 계정이 없어요» | `(app)/settings/channels/page.tsx:279` |
| «핀치가 요청하는 권한» | `(app)/settings/channels/page.tsx:711` |
| «비즈니스 포트폴리오» · «광고 게시 페이지» · «페이지 선택» | `(app)/settings/channels/page.tsx:344,683,696` |
| «비즈니스 포트폴리오에 속하지 않은 광고 계정이에요» | `(app)/settings/channels/_lib/derive-state.ts:175` |
| «광고를 게시할 페이지» · «이 페이지에는 광고 권한이 없어요» | `(app)/ads/_components/ad-publisher-picker.tsx:155,213` |
| «이 페이지의 최근 게시물» · «Facebook에서 보기» | `(app)/ads/_components/page-recent-posts.tsx:47,75` |
| «내 계정» · «팔로워» · «이번 주 조회수» · «평균 참여율» · «최근 게시물» · «조회수»/«좋아요»/«댓글» · «광고 현황» | `(app)/dashboard/_components/dashboard-client.tsx:323,125,131,140,215,231-233,279` |
| «성과 추이» · «도달» 탭 | `components/dashboard/performance-trend.tsx:72` · `dashboard-client.tsx:193` |
| «Instagram»/«Threads» 칩 | `components/layout/channel-switcher.tsx:75,77` |
| «개요» · «내 게시물» · «링크 분석» | `(app)/insights/tabs.tsx:13,14,15` |
| «참여 계정» · «팔로워 순증감» · «프로필 링크 클릭» | `(app)/insights/_components/audience-client.tsx:155,169,184` |
| «새 게시물 포스팅» · 채널 «인스타그램»/«스레드»/«틱톡» · «준비 중» | `(app)/publish/_components/publish-list.tsx:626` · `lib/publish-rules.ts:27-29` · `(app)/publish/_components/post-composer.tsx:449` |
| «추가» | `(app)/publish/_components/media-tiles.tsx:268` |
| «캡션» · «글» | `lib/publish-rules.ts:65,68` |
| «지금 발행» · «예약 발행» · «초안으로 저장» · «스토리로 올리기» · «지금 발행하기» | `post-composer.tsx:585,605,635,503,657` |
| «인스타그램에 올리기 시작했어요» · «스레드에 올리기 시작했어요» | `publish-list.tsx:82` (+ `lib/publish-rules.ts:27-28`) |
| «올리는 중» · «처리 중» · «발행 완료» | `components/ui/status-pill.tsx:26,28,29` |
| «게시물 보기» · 계정 칩 «@…» | `(app)/publish/_components/post-row.tsx:132,291-320` |
| «게시물이 발행됐어요» | `lib/publish/run.ts:512` |
| «첫 자동화 만들기» · «지금 확인» | `(app)/auto-dm/_components/auto-dm-client.tsx:373,502` |
| «현재 게시물에서 선택할게요» · «다음» · «특정 키워드에 발송할게요» · «추가» · «DM 메시지를 작성해주세요» · «메시지 입력» · «메시지 버튼» · «없음» · «네, 답글을 남기고 싶어요» · «확인» | `(app)/auto-dm/_components/rule-wizard.tsx:526,1041,642,669,700,709,728,746,836,1040` |
| «DM 1개를 보냈어요» | `lib/auto-dm/check-now-types.ts:89` |
| «수신거부» / stop / unsubscribe | `lib/auto-dm/match.ts:57-60` |
| «집행 금액» · «노출수» · «평균 CTR» · «평균 ROAS» · «캠페인 성과» · «캠페인 관리» | `(app)/ads/page.tsx:211,212,216,228,241,190` |
| «일시중지» · «게재 시작»(목록) | `(app)/ads/campaigns/_components/campaign-row-actions.tsx:36,45` |
| «게재 시작 — 비용이 발생해요» | `(app)/ads/campaigns/[campaignId]/_components/activate-tree-modal.tsx:103` |
| «게재 중» | `lib/ads/meta-labels.ts:50` |
| «새 캠페인» · «캠페인 만들기» | `(app)/ads/campaigns/page.tsx:208` · `(app)/ads/campaigns/_components/campaign-form.tsx:178` |

API 경로 근거: `lib/meta/instagram-oauth.ts:243,209-213` · `lib/meta/instagram.ts:152-155,198,295-297,363,409-412` · `lib/meta/graph.ts:132,152` · `lib/meta/threads.ts:71,100,134,176,205` · `lib/meta/threads-publish.ts:76,83,90,97` · `lib/meta/ads.ts:142,175,199,377-387` · `lib/meta/ads-pages.ts:84,156,163` · 팔로워 알림 기준 `app/api/cron/refresh-tokens/route.ts:40-41` · 자동 DM 하루 상한 300 `lib/auto-dm/limits.ts:7`.
