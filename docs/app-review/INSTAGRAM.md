# Meta App Review: Instagram permissions (Instagram API with Instagram Login)

**App:** Finch (1709021066981985). Submission is planned for about 2026-09-18, and the app stays in Development mode.
**Scopes:** these come from `INSTAGRAM_SCOPES` in `lib/meta/instagram-oauth.ts:28-34`: `instagram_business_basic`, `instagram_business_manage_insights`, `instagram_business_manage_comments`, `instagram_business_manage_messages`, `instagram_business_content_publish`.

**How to read this document:**
- Every Korean label in «…» is the exact string from the code (checked against the repo on 2026-09-11). The publishing parts (Must-do 12, D7, section 3 and the Publish lines of the Label index) were re-checked on 2026-09-12 against `40355b5`: the new publish composer merged in `3366fe1`, plus the publishing overlay added in `40355b5`. The text in parentheses is an English gloss. The **Label index** at the end gives file:line for each label.
- **[VERIFY]** means the code can't prove it: Instagram's own UI, the Meta dashboard, or how the live system behaves.
- **[DECISION]** means the owner has to decide before submitting. **[OWNER CONFIRM]** is a fact only the owner can check.

---

## 0. Before recording

### Must-do (confirmed in code)
1. **Record every take signed in as the reviewer Google account** (the second or a later address in `OWNER_EMAIL`), not the primary owner. The primary owner sees «운영자에게만 보이는 안내» (Operator-only notice) at the top of «SNS 계정 연결» and raw error text when a connection fails. Only `isPrimaryOwner()` gets those (`settings/channels/page.tsx:399, 489-495`; `lib/channel-availability.ts:75`).
2. **Disconnect sding.kr from every other Finch account first** with «연결 해제» (Disconnect). The pair `(channel, platform_user_id)` must be unique across all users. If a second Finch account connects it, the result is «이미 다른 핀치 계정에 연결된 계정이에요» (Already linked to another Finch account). The reason is set in `api/auth/instagram/callback/route.ts:199` and the text lives in `settings/channels/page.tsx:275`. Disconnecting deletes the row (`settings/channels/actions.ts:33-35`), which frees the account.
3. The reviewer account must already have finished onboarding consent. Otherwise every app screen redirects to `/onboarding/consent` (`(app)/layout.tsx:40`).
4. Migration **0092** must be applied in production. Without it, «지금 확인» always answers «지금은 확인하지 못했어요» (Couldn't check right now) (`lib/auto-dm/check-now.ts:220-227`). **[VERIFY applied]**
5. **Show Instagram's full login in every video.** For each permission, Meta asks the screencast to show the complete Instagram login process and the user granting the permission. Before each take, log out of instagram.com in the browser profile you record Finch in. Then press «연결하기» (Connect) or «다시 연결» (Reconnect), and Instagram shows its login and consent screens.
6. After connecting, if the result dialog also shows «댓글 자동 DM을 쓰시려면 다시 연결해 주세요.» (Reconnect to use comment Auto DM), the webhook subscription failed (`settings/channels/page.tsx:293, 409-411`). Reconnect and record the take again.
7. **Commenter accounts:**
   - Comments from @sding.kr itself are ignored (`isOwnComment`, `check-now.ts:96`).
   - Each comment is answered once. Each person gets at most one automated DM per 24 hours per Finch account, and that includes rehearsals on the reviewer account (`reserve_dm_send` in 0092, steps 0.5 and 4). So the manage_comments and manage_messages takes need **different commenter accounts**, or at least 24 hours between them.
8. «지금 확인» works once every 30 seconds per automation (`CHECK_NOW_COOLDOWN_SEC`, `check-now-types.ts:9`). If you press it sooner you get «방금 확인했어요» (Just checked).
9. The test post must be a photo post on @sding.kr. Comments older than 6.5 days are skipped and counted as «기간 지남» (Expired) (`pipeline.ts:48`).
10. **The post list is cached for 5 minutes** (`lib/meta/instagram.ts`, `revalidate: 300`). After you publish the test photo, wait at least 5 minutes before the Auto DM take, or the new post may not be in the post picker yet.
11. **Insights data:**
   - «내 게시물» needs at least 3 of the latest 12 posts with reach above 0 (`lib/data/growth.ts:18`, `growth-client.tsx:34`). Otherwise it shows «진단할 게시물이 아직 부족해요» (Not enough posts to analyze yet).
   - The repo's API spec says that below 100 followers Instagram omits `followers_count` and `follower_count`. The Home «팔로워» card could then show 0, the «팔로워» trend tab could be empty, and «팔로워 순증감» could be 0. **[OWNER CONFIRM sding.kr follower count]**
   - Get some views and likes on the test posts a few days before recording.
12. **The publish take uses the new composer** (merged 2026-09-12, `3366fe1`). Files now upload straight from the browser to Finch's storage.
   - Use one square JPG or PNG photo. The composer converts it to JPEG with the long side at most 1440 px. A photo outside 4:5–1.91:1 is center-cropped and gets the note «사진 1장을 인스타그램 비율(4:5~1.91:1)에 맞춰 가운데를 기준으로 잘랐어요.» (1 photo was center-cropped to Instagram's ratio); a square photo avoids both.
   - «지금 발행하기» (Publish now) stays disabled until the upload finishes. Until then the line under it reads «파일을 올리는 중이에요 — 0/1» (Uploading files — 0/1).
   - **[VERIFY] before recording:** migration **0093** is applied in production (without it the composer can't upload files or save any post), and one rehearsal photo post via «지금 발행» reaches Instagram. That rehearsal is test B-5 in `docs/PUBLISH_VIDEO_PLAN.md` («손으로 해 보는 시험»). It is also the first live check that Instagram accepts the signed file URLs Finch gives it (`lib/publish/media.ts:14-21`).
   - Keep the take to one photo. Videos, carousels and stories work with the same permission, but it doesn't need them (section 3, step 11).
13. Log out between takes with the round account button at the top right (its label is «계정 메뉴») › «로그아웃» (Log out).
14. **Stay on the screens in the scripts.** Don't open the «레퍼런스» (Reference) menus («탐색», «스크랩», «경쟁사»), and don't linger on Home's «오늘의 핀치» or «오늘의 아카이빙 현황». Those features run on non-Meta public data and aren't part of any requested permission. Scroll past them.
15. Suggested recording order: 1 basic → 3 publish (creates the test photo) → 2 insights (this also covers the 5-minute wait) → 4 comments (commenter A) → 5 messages (commenter B, or the next day).

### [VERIFY] live behavior
- **V1: webhooks in Development mode.**
  - APP_REVIEW.md §1 says comment and message webhooks only arrive after the app goes Live.
  - But `app/api/webhooks/instagram/route.ts:226` records 31 comment webhooks received on 2026-09-10. All were rejected with 401 before the secret fix on 09-11.
  - If tester comments now reach the webhook, the DM goes out seconds after the comment, and «지금 확인» shows «새로 보낼 DM이 없었어요» with «이미 처리함» instead of «DM 1개를 보냈어요». Rehearse once, and use variant **B** in video 4 if that happens.
  - If `messages` webhooks also arrive, the opt-out in video 5 can be shown for real.
- **V2: button DMs.** If «메시지 버튼» is set to «1개», the private reply goes out as a button template (`lib/meta/graph.ts:116-128`). Confirm in a rehearsal that it arrives. If it doesn't, choose «없음» (None).
- **V3: Development-mode recipients.** Commenter accounts should hold an accepted Instagram Tester role on the app. Meta may not deliver messages to accounts without a role.
- **V4:** Whether the DM lands in the Primary inbox or in Requests for a commenter who doesn't follow @sding.kr.
- **V5:** The exact text of Instagram's login and consent screen, whether a reconnect shows the full permission list or a short "continue" screen, and whether individual permissions can be unticked.
- **V6:** Meta's permission reference says the cURL can be generated with the "API Integration Helper in Meta App Dashboard > Instagram". Confirm the exact menu path and how the helper picks the recipient (IGSID).
- **V7:** The free-plan `content_analysis` quota on the reviewer account, and at least 5 comments on the post. This only matters for the optional «링크 분석» scene.

### [DECISION]
- **D1: A commenter account for reviewers.** Reviewers need a **second Instagram tester account** to comment with. A comment we seed in advance expires after 6.5 days, and review can take 1–3 weeks.
  - Create a dedicated tester (not a personal account) and accept the tester invite.
  - Put its credentials in the test-credentials field next to sding.kr.
  - Without it, reviewers can't reproduce Auto DM, which APP_REVIEW §5 lists as the most common rejection reason.
- **D2: The soft-launch notice.** «지금은 임시오픈 기간입니다» (We're in soft launch) opens on every fresh load of an app screen until «오늘 하루 종일 보지 않기» (Don't show again today) is clicked.
  - That choice is stored in localStorage until midnight KST and survives logout. «닫기» (Close) only hides it for the current visit (`opening-notice.tsx:15-16, 38-40`).
  - It says some features "may still be refined", which reads as unfinished (APP_REVIEW §5).
  - Reviewers use their own browsers, so only a code change hides it from them. For our own takes, click «오늘 하루 종일 보지 않기» before recording.
- **D3: A static 0 on the Auto DM screen.** Once a rule exists, the screen shows «최근 30일 0건 발송 · 평균 응답률 0%» (0 sent in 30 days · 0% reply rate). Its tooltip says example data is shown before connecting. It comes from `autoDmSummary`, which is always 0 in real mode (`auto-dm-client.tsx:338-346`, `lib/data/empty.ts:127`), and sits right next to «누적 발송 1». Hide it in real mode before recording.
- **D4: Clean up after recording.** Delete the recorded automations on the reviewer account, because the free plan allows one automated post (`lib/auto-dm/limits.ts:13`). Reviewers then start from «첫 자동화 만들기». Leave @sding.kr connected; the steps below work in both states.
- **D5: A "coming soon" button in the Auto DM link step.** When «메시지 버튼» is «1개» or more, the link step shows a disabled «내 링크 불러오기 (준비 중)» (Load my link, coming soon) (`rule-wizard.tsx:801`). Video 5 shows this step. Hide it before recording, or accept the risk.
- **D6: An always-empty card in Overview.** In real mode, «자주 반응하는 사람 Top 8» (Top 8 most engaged people) is always empty because `topEngagers: []` is fixed in `insights/page.tsx:19`. Its empty text mentions the internal term "웹훅" (webhook) (`audience-client.tsx:352-353`). Don't scroll to it on camera, or hide it in real mode.
- **D7 (minor):** The composer's channel row shows «틱톡» with a «준비 중» (coming soon) tag (`post-composer.tsx:452`). This is low risk; noted for completeness.
- **Minor copy issue:** the Home «평균 참여율» tooltip says (likes + comments + shares) ÷ reach (`dashboard-client.tsx:142`). The code uses `total_interactions` ÷ reach, which also counts saves (`lib/data/live.ts:535`). Don't hover it on camera, or fix the text.

### Recording layout
- **Chrome profile 1:** Finch at finch.ai.kr, logged out of both Finch and instagram.com. Window at most 1440 px wide, 1080p, no audio.
- **Chrome profile 2:** instagram.com, logged in as the commenter tester.
- **Chrome profile 3 (or a mirrored phone):** instagram.com as @sding.kr, for the profile grid, the public reply and the business inbox.
- Never show a password or token. Blur them in editing.

### Suggested general note for reviewers (submission-level)
> Finch's interface is in Korean; each step gives the exact Korean label with an English gloss. Use a desktop browser at least 1024 px wide. Sign in at https://finch.ai.kr → «로그인» → «Google로 계속하기» with the test Google account. Connect Instagram with the test professional account sding.kr. To test Auto DM, comment on sding.kr's post from the second test Instagram account. Auto DM is normally triggered by the comments webhook; while the app is in development mode, use the «지금 확인» (Check now) button, which runs the same processing on demand. Metrics refresh every 5 minutes.

---

## 1. instagram_business_basic

### How we use it
Finch uses instagram_business_basic to connect the creator's own Instagram professional account through Instagram Login, started from «계정 및 설정» (Account & Settings) › «SNS 계정 연결» (Connect social accounts). Right after authorization Finch calls `GET /me` for the account's ID, username, name, profile picture, biography, website and follower, following and media counts. Whenever «홈» (Home) or the «자동 DM» (Auto DM) post picker loads, it calls `GET /{ig-user-id}/media` for recent posts: caption, media type, permalink, thumbnail or media URL, timestamp, like count and comment count. The settings row uses these fields to show which account is linked, Home builds the profile card and 3×3 post grid from them, and Auto DM uses the post list so the user can choose which post to automate. Finch reads only the single account the user connected, keeps its token encrypted (AES-256-GCM), and deletes the stored token when the user clicks «연결 해제» (Disconnect) or removes Finch in Instagram's settings.

### Reviewer test steps
1. Open https://finch.ai.kr in a desktop browser at least 1024 px wide, so the left sidebar is visible.
2. Click «로그인» (Log in) at the top right.
3. Click «Google로 계속하기» (Continue with Google) and sign in with the Finch test Google account. You land on «홈» (Home). If «지금은 임시오픈 기간입니다» appears, click «닫기» (Close).
4. At the bottom of the left sidebar, click «계정 및 설정» (Account & Settings). Under «연결» (Connections), click «SNS 계정 연결» (Connect social accounts).
5. Optional: expand «핀치가 요청하는 권한» (Permissions Finch requests). Under «인스타그램» it lists «프로필 기본 정보 조회» (View basic profile info).
6. Under «채널 계정» (Channel accounts), on the «Instagram» row, click «연결하기» (Connect). If the row already shows «연결됨» (Connected) with @sding.kr, click «다시 연결» (Reconnect) instead.
7. On Instagram, log in as **sding.kr** (the password is in the test-credentials field) and allow every requested permission.
8. Back in Finch, a dialog reads «@sding.kr 계정을 연결했어요» (@sding.kr is connected). Click «확인» (OK). The row now shows the profile photo, «@sding.kr · (name)» and «연결됨».
9. Click «홈» (Home) and scroll to «내 계정» (My accounts). The Instagram card shows the photo, name, «연동됨» (Connected), «팔로워» (Followers) and «게시물» (Posts).
10. Click the «Instagram» chip in the top bar. The right-hand panel shows the bio, the counts and a grid of recent posts, matching instagram.com/sding.kr.

### Screencast script
| # | On screen (exact UI) | Caption (English) |
|---|---|---|
| 1 | finch.ai.kr landing page, logged out | Finch is a web app where creators manage their own Instagram account. We start logged out. |
| 2 | Click «로그인» (Log in) at the top right. The page «로그인» opens | Click "로그인" (Log in). Finch sign-in is Google or Kakao only. |
| 3 | Click «Google로 계속하기» (Continue with Google). The dialog «Google로 이동하고 있어요» (Taking you to Google) appears. Pick the reviewer Google account | Sign in with the test Google account. |
| 4 | «홈» (Home) loads. Close the soft-launch notice with «닫기» if it shows (D2). Scroll past «오늘의 핀치» to «내 계정» (My accounts): «연동된 계정이 없습니다» (No connected accounts) | Signed in. No Instagram account is connected yet. |
| 5 | Sidebar «계정 및 설정» (Account & Settings) › group «연결» (Connections) › «SNS 계정 연결» (Connect social accounts) | Open "계정 및 설정" (Account & Settings) › "SNS 계정 연결" (Connect social accounts). |
| 6 | Expand «핀치가 요청하는 권한» (Permissions Finch requests) and point at «인스타그램» › «프로필 기본 정보 조회» | Finch lists every permission it asks for. "프로필 기본 정보 조회" = basic profile info (instagram_business_basic). |
| 7 | «Instagram» row: «미연결» (Not connected), hint «비즈니스·크리에이터 계정만 연결할 수 있어요» (Business or Creator accounts only) with the link «전환 방법» (How to switch). Click «연결하기» (Connect). The dialog «Instagram로 이동하고 있어요» (Taking you to Instagram) appears | Click "연결하기" (Connect). Finch uses Instagram Login; no Facebook Page is needed. |
| 8 | instagram.com login as sding.kr (password blurred), then Instagram's consent screen, then allow **[VERIFY V5 wording]** | Instagram's own login and consent screen. The test professional account sding.kr grants Finch access. |
| 9 | Back on «SNS 계정 연결». Dialog «@sding.kr 계정을 연결했어요» → «확인» (OK) | Connected. |
| 10 | Row shows the profile photo, «연결됨» (Connected), «@sding.kr · (name)», «자동으로 연장돼요» (Renews automatically), «다시 연결» and «연결 해제» | Username, name and profile photo, read with GET /me (instagram_business_basic). |
| 11 | Sidebar «홈». Scroll to «내 계정». Instagram card: photo, name, «연동됨», @sding.kr, «팔로워», «게시물» **[OWNER CONFIRM ≥100 followers]** | Home › "내 계정" (My accounts): profile photo, name, follower and post counts. |
| 12 | Top bar chip «Instagram». Right panel: @sding.kr, photo, «게시물»/«팔로워», bio, 3×3 grid (don't hover the tiles) | The Instagram view mirrors the profile: bio and recent posts from GET /{ig-user-id}/media. |
| 13 | Side by side: instagram.com/sding.kr (profile 3) with the same photo, bio and posts | The same profile on Instagram. Finch shows only the account the user connected. |
| 14 | Back on «SNS 계정 연결». Point at «연결 해제» (Disconnect) without clicking | The user can disconnect at any time; "연결 해제" deletes the stored token. |

---

## 2. instagram_business_manage_insights

### How we use it
We request instagram_business_manage_insights so creators can read their own Instagram performance inside Finch instead of opening Instagram's professional dashboard. Finch calls `GET /{ig-user-id}/insights` for reach, views, accounts_engaged, total_interactions and profile_links_taps: totals for the last 7 days, the 7 days before that, and the last 14 days, plus daily reach and follower_count. It also calls `GET /{ig-media-id}/insights` for views, reach, likes, saved, shares, comments and total_interactions on the 10–12 most recent posts. «홈» (Home) turns these into weekly views, engagement rate, 7-day follower change and a 14-day trend chart. «성과 분석» (Performance analytics) › «개요» (Overview) compares reach, accounts engaged, net follower change and profile-link taps with the previous 7 days, and «내 게시물» (My posts) ranks recent posts by save rate and lists each post's engagement rate, reach and saves. The rates are plain ratios of Instagram's own numbers, explained in "?" tooltips, and insights are requested only for the one account the user connected, never for other accounts.

### Reviewer test steps
1. Go to https://finch.ai.kr and click «로그인» (Log in).
2. Choose «Google로 계속하기» (Continue with Google) and use the test Google account. Dismiss the notice with «닫기» (Close) if it appears.
3. If Instagram isn't connected yet, go to «계정 및 설정» › «SNS 계정 연결» › «Instagram» › «연결하기» and log in as sding.kr (section 1, steps 4–8).
4. Click «홈» (Home), then the **«Instagram»** chip in the top bar. Look at «팔로워» (Followers), «이번 주 조회수» (Views this week), «게시물 수» (Posts) and «평균 참여율» (Avg. engagement rate).
5. In «성과 추이» (Performance trend), click the «도달» (Reach) and «팔로워» (Followers) tabs. Scroll to «최근 게시물» (Recent posts) and look at the «조회수» (Views) column.
6. Left sidebar: «성과 분석» (Performance analytics). The tab «개요» (Overview) opens with the page «팔로워 분석» (Follower analytics). Look at «도달» (Reach), «참여 계정» (Accounts engaged), «팔로워 순증감» (Net follower change) and «프로필 링크 클릭» (Profile link taps). Switch between «7일» and «14일».
7. Open the tab «내 게시물» (My posts). Look at «평균 저장률» (Avg. save rate), «평균 참여율», «평균 도달» (Avg. reach), «분석 게시물» (Posts analyzed) and the table «게시물별 성과» (Performance by post).
8. Note: the test account is small. Instagram doesn't return follower data for accounts under 100 followers, so «팔로워 순증감» and the «팔로워» trend may be 0 or empty.

### Screencast script
| # | On screen (exact UI) | Caption (English) |
|---|---|---|
| 1 | finch.ai.kr, logged out. Click «로그인» (Log in) | Starting logged out at finch.ai.kr. |
| 2 | «Google로 계속하기» → reviewer account → «홈» | Sign in with the test Google account. |
| 3 | «계정 및 설정» › «SNS 계정 연결»: Instagram «연결됨» @sding.kr. Expand «핀치가 요청하는 권한» and point at «게시물·계정 인사이트 조회» | "게시물·계정 인사이트 조회" = post and account insights (instagram_business_manage_insights). |
| 4 | «다시 연결» (Reconnect) → «Instagram로 이동하고 있어요» → instagram.com login as sding.kr (password blurred) → consent → allow → «@sding.kr 계정을 연결했어요» → «확인» | The account owner logs in to Instagram and grants the insights permission. |
| 5 | «홈» → top chip «Instagram». Cards «팔로워», «이번 주 조회수», «게시물 수», «평균 참여율» | Home, Instagram only: weekly views and engagement rate come from account insights. |
| 6 | «성과 추이» (last 14 days): click «도달», then «팔로워» if sding.kr has 100+ followers. Don't click «참여율» (it shows a text note, not a chart) | A 14-day trend from Instagram's daily reach and follower_count. |
| 7 | Scroll to «최근 게시물»: columns «조회수», «좋아요», «댓글» | Per-post views come from media insights (GET /{ig-media-id}/insights). |
| 8 | Sidebar «성과 분석» → tab «개요». Page «팔로워 분석» (Follower analytics); top bar «Instagram 기준» (Based on Instagram) | Performance analytics › Overview. |
| 9 | Cards «도달», «참여 계정», «팔로워 순증감», «프로필 링크 클릭», with «직전 7일 대비» (vs previous 7 days). Click «14일» | Reach, accounts engaged, net follower change and profile-link taps, compared with the previous period. |
| 10 | Charts «일별 도달» (Daily reach) and «일별 팔로워 순증감» (Daily net follower change). Stop scrolling above «자주 반응하는 사람 Top 8» (D6) | Daily charts from the reach and follower_count time series. |
| 11 | Tab «내 게시물» → «성장 진단» (Growth check): «평균 저장률», «평균 참여율», «평균 도달», «분석 게시물». Scroll to «게시물별 성과»: «저장률», «참여율», «도달», «저장». Don't press «AI 진단 받기» | My posts: ranked by save rate, calculated from each post's reach, saves and interactions. |
| 12 | End card | Insights are read only for the connected account and shown only to its owner. |

---

## 3. instagram_business_content_publish

### How we use it
Finch uses instagram_business_content_publish so a user can post to their own connected Instagram professional account from «발행» (Publish). In the «새 게시물 포스팅» (New post) composer the user picks «인스타그램», adds photos or videos with «추가» (Add), writes the «캡션» (Caption) and chooses «지금 발행» (Publish now), «예약 발행» (Schedule) or «초안으로 저장» (Save as draft). Photos are converted to JPEG and center-cropped into Instagram's 4:5–1.91:1 range, and each file is uploaded to Finch's own storage. Nothing is published until the user clicks «지금 발행하기» (Publish now) or the chosen time arrives. Finch then gives Instagram a URL for each file and creates a container with `POST /{ig-user-id}/media`: a photo post for one photo, a Reel for one video (with the user's «피드에도 보이기» (Also show in feed) and «커버» (Cover) choices), a carousel for 2–10 items, or a story when «스토리로 올리기» (Post as story) is on. It waits until the container's `status_code` is `FINISHED`, calls `POST /{ig-user-id}/media_publish`, and reads the new post's `permalink`, so the post's row under «발행완료» (Published) opens it on Instagram with «게시물 보기» (View post). While Instagram is still processing, which is usual for video, the post shows «처리 중» (Processing), and Finch completes it in the background and sends an in-app notification. Scheduled posts go through the same calls within 5 minutes of the chosen time. Finch never edits or deletes posts on Instagram.

### Reviewer test steps
1. Open https://finch.ai.kr, click «로그인» (Log in), then «Google로 계속하기» (Continue with Google), and sign in with the test Google account. If a notice pops up, close it with «닫기».
2. If Instagram isn't connected, connect it first: «계정 및 설정» › «SNS 계정 연결» › «Instagram» › «연결하기» → sding.kr.
3. Left sidebar: «발행» (Publish). The channel strip shows «인스타그램» with @sding.kr.
4. Click «새 게시물 포스팅» (New post), at the right end of the tab row.
5. «채널» (Channel): «인스타그램» is already selected. Under «사진·영상» (Photos & videos), click the «추가» (Add) tile and choose one JPG or PNG photo; square works best. The tile shows the photo with a «사진» (Photo) chip, the counter reads «1/10», and the line below reads «사진 게시물로 올라가요» (Posts as a photo post). Leave the «스토리로 올리기» (Post as story) switch off.
6. Type a caption, hashtags included, in «캡션» (Caption).
7. Under «발행 방식» (Publishing method), the default is «예약 발행» (Schedule). Select «지금 발행» (Publish now), then click **«지금 발행하기»** (Publish now). If the button is still disabled and the line under it reads «파일을 올리는 중이에요 — 0/1» (Uploading files — 0/1), wait a moment. While Finch publishes, the composer is covered by «인스타그램에 올리고 있어요» (Posting to Instagram) with a seconds counter; a photo usually takes 10–30 seconds.
8. The dialog «인스타그램에 올라갔어요» (Posted to Instagram) appears. Click «확인» (OK). If it reads «인스타그램이 게시물을 처리하고 있어요» (Instagram is processing the post) instead, Instagram needs more time: the post waits under the «발행예약» (Scheduled) tab as «처리 중» (Processing) and is published automatically within a few minutes, followed by the notification «게시물이 발행됐어요» (Your post was published).
9. Click the tab «발행완료» (Published). The post shows «발행 완료» (Published) and a «게시물 보기» (View post) link.
10. Click «게시물 보기». The post opens on Instagram in a new tab. You can delete it on Instagram afterwards; Finch doesn't delete posts.
11. Optional, not needed for this permission: the same permission also publishes videos and multi-item posts. One MP4 or MOV video posts as a Reel, with «피드에도 보이기» (Also show in feed, on by default) and «커버 고르기» (Choose cover); 2–10 photos or videos post as a carousel; one item with «스토리로 올리기» (Post as story) turned on posts as a story. A video usually shows «처리 중» (Processing) for a few minutes before it goes live.

### Screencast script
| # | On screen (exact UI) | Caption (English) |
|---|---|---|
| 1 | finch.ai.kr, logged out → «로그인» | Starting logged out. |
| 2 | «Google로 계속하기» → reviewer account → «홈» | Sign in with the test Google account. |
| 3 | «계정 및 설정» › «SNS 계정 연결». Expand «핀치가 요청하는 권한» and point at «예약한 게시물 발행» | "예약한 게시물 발행" = publish your posts (instagram_business_content_publish). |
| 4 | «다시 연결» → «Instagram로 이동하고 있어요» → instagram.com login as sding.kr (password blurred) → consent → allow → «@sding.kr 계정을 연결했어요» → «확인» | The account owner logs in to Instagram and grants the publishing permission. |
| 5 | Sidebar «발행» (Publish). Header «발행». Channel strip «인스타그램» @sding.kr | Open "발행" (Publish). Instagram is connected as @sding.kr. |
| 6 | Click «새 게시물 포스팅» (New post). Dialog «새 게시물 포스팅»; «채널» «인스타그램» selected; «사진·영상» (Photos & videos) reads «0/10» | Create a new post for Instagram. |
| 7 | «사진·영상» → «추가» (Add) tile → square JPEG. The tile shows the photo with the «사진» (Photo) chip (a thin upload bar may flash along its bottom), the counter reads «1/10», and the line below reads «사진 게시물로 올라가요». Leave «스토리로 올리기» off | Add one photo. Finch converts it to JPEG and uploads it to its own storage. |
| 8 | «캡션»: type `Posted from Finch for Meta app review #finch #test` | Write the caption and hashtags. |
| 9 | «발행 방식»: switch from the default «예약 발행» to «지금 발행». Its description reads «저장하자마자 바로 올라가요. 영상은 처리하는 데 몇 분 걸릴 수 있어요.» | Choose "지금 발행" (Publish now). Nothing is posted until the user clicks. |
| 10 | Click «지금 발행하기». After a moment the composer is covered by «인스타그램에 올리고 있어요» (Posting to Instagram): the Finch logo animates, the line under it changes from «사진·영상을 보내는 중이에요.» (Sending your photos and videos) to «인스타그램이 게시물을 확인하고 있어요.» (Instagram is checking the post), and «{n}초 지남 · 이 창을 닫지 말고 기다려 주세요» ({n} s elapsed · please keep this window open) counts up. Trim the wait; keep 2–3 s | Finch creates a media container, waits until Instagram finishes processing it, then calls media_publish. |
| 11 | Dialog «인스타그램에 올라갔어요» / «「발행완료」 탭에서 확인할 수 있어요.» → «확인» | Instagram confirmed the post. |
| 12 | Click the tab «발행완료» (Published): a row with the thumbnail, caption, time, «Instagram» badge, «발행 완료» and the link «게시물 보기» (View post) | The post is listed under "발행완료" (Published). |
| 13 | Click «게시물 보기». A new tab opens the post on instagram.com: @sding.kr, the photo, the caption and the hashtags | "게시물 보기" (View post) opens the published post on Instagram: the same photo and caption are live on @sding.kr. |

Tips:
- If scene 11 reads «인스타그램이 게시물을 처리하고 있어요» (Instagram is processing the post), re-take, or keep recording: open «발행예약» (Scheduled), show the row's «처리 중» (Processing) and «인스타그램이 처리하고 있어요 · 끝나면 자동으로 올라가요» (Instagram is processing it · it posts automatically when done), wait for the bell notification «게시물이 발행됐어요», then continue with scene 12.
- If the row has no «게시물 보기» link (Finch couldn't read the post's permalink in time), open instagram.com/sding.kr in a new tab instead and click the newest post.
- Optional: Reels, carousels and stories go through this same permission, but it doesn't need them, and a video spends minutes in «처리 중». To show one anyway, add it after scene 13: one video → «피드에도 보이기» and «커버 고르기» → «지금 발행» → «처리 중» → «발행완료» → «게시물 보기».

---

## 4. instagram_business_manage_comments

### How we use it
instagram_business_manage_comments powers «자동 DM» (Auto DM). The account owner picks one of their own posts, the keywords to react to, a private message and optional public replies, and Finch then answers matching comments on that post only. For each new comment Finch reads `id`, `text`, `timestamp`, `username` and `from{id,username}` (`GET /{ig-media-id}/comments`, or the comments webhook). It sends one Private Reply to the commenter (`POST /{ig-user-id}/messages` with `recipient.comment_id`) and, if the owner turned it on, posts one of the owner's prepared replies under the comment (`POST /{ig-comment-id}/replies`). The «지금 확인» (Check now) button runs the same pipeline on the post's 50 newest top-level comments, so the owner can trigger it on demand and the flow can be tested before webhooks are delivered. Each comment is answered at most once, the owner's own comments and comments older than about 6.5 days are skipped, and Finch never hides, edits or deletes comments. The same read access lets «링크 분석» (Link analysis) turn the comments on the user's own post into a positive, neutral and negative summary from an AI model, without storing the comment text.

### Reviewer test steps
1. Visit https://finch.ai.kr, press «로그인» (Log in) and pick «Google로 계속하기» (Continue with Google) with the test Google account. Close any notice with «닫기».
2. If Instagram isn't connected, connect sding.kr via «계정 및 설정» › «SNS 계정 연결» › «Instagram» › «연결하기» and allow all permissions.
3. Left sidebar: «자동 DM» (Auto DM). Click «첫 자동화 만들기» (Create your first automation), or «자동화 만들기» at the top right. The free plan allows one automated post. If an automation already exists on another post, delete it first with its trash icon (label «삭제») → «삭제».
4. Keep «현재 게시물에서 선택할게요» (Choose from my current posts), click the test photo post, then «다음» (Next).
5. Select «특정 키워드에 발송할게요» (Send for specific keywords), type `link`, press Enter (or «추가»), then «다음».
6. Type a message in «메시지 입력» (Message). «메시지 버튼» (Message buttons) starts at «1개»; set it to «없음» (None). Then «다음».
7. Select «네, 답글을 남기고 싶어요» (Yes, leave a reply). Three suggested replies are filled in; keep at least one. Then «다음».
8. On «최종 검수» (Final review), click «확인» (Confirm). The card shows «실행 중» (Running) and a **«지금 확인»** (Check now) button.
9. On Instagram, log in as the **commenter test account** from the credentials field and comment on that @sding.kr post with text containing "link". Comments posted by sding.kr itself are ignored.
10. Back in Finch, click «지금 확인». The result reads «DM 1개를 보냈어요» (1 DM sent). If it reads «새로 보낼 DM이 없었어요» (No new DMs to send) with «건너뛴 이유: 이미 처리함 1» (Skipped: already handled 1), the real-time webhook already sent it.
11. On Instagram, the comment now has a reply from @sding.kr, and the commenter's Direct inbox (possibly Requests) has the DM.
12. Wait 30 seconds and click «지금 확인» again. The result reads «새로 보낼 DM이 없었어요» with «이미 처리함» in the skip reasons. The same comment is never answered twice.

### Screencast script
Before this take: the test photo post exists on @sding.kr (published at least 5 minutes ago), commenter **A** is logged into profile 2, and the reviewer account has no automation yet.

| # | On screen (exact UI) | Caption (English) |
|---|---|---|
| 1 | finch.ai.kr, logged out → «로그인» | Starting logged out. |
| 2 | «Google로 계속하기» → reviewer account → «홈» | Sign in with the test Google account. |
| 3 | «계정 및 설정» › «SNS 계정 연결». Expand «핀치가 요청하는 권한» and point at «댓글 조회·답글 및 비공개 답장(DM)» | "댓글 조회·답글 및 비공개 답장(DM)" = read comments, reply, private reply (instagram_business_manage_comments). |
| 4 | «다시 연결» → «Instagram로 이동하고 있어요» → instagram.com login as sding.kr (password blurred) → consent → allow → «@sding.kr 계정을 연결했어요» → «확인» | The account owner logs in to Instagram and grants the comments permission. |
| 5 | Sidebar «자동 DM». Header «자동 DM», top bar «Instagram 전용» (Instagram only), empty state «아직 자동 DM 규칙이 없어요». Click «첫 자동화 만들기» | Auto DM: the account owner decides which comments get answered. |
| 6 | Wizard «자동화 만들기»: «어떤 게시물을 자동화할까요?» → «현재 게시물에서 선택할게요» → click the test post → «다음» | Step 1: pick one of the owner's own posts. |
| 7 | «어떤 댓글에 DM을 보낼까요?» → «특정 키워드에 발송할게요» → type `link` → Enter → «다음» | Step 2: answer only comments containing "link". |
| 8 | «DM 메시지를 작성해주세요» → «메시지 입력»: `Hi! Here is the link you asked for: https://finch.ai.kr (automated reply)` → «메시지 버튼» «없음» → «다음» | Step 3: the private reply the commenter will receive. |
| 9 | «게시물 댓글에 대하여, 자동 답글을 남길까요?» → «네, 답글을 남기고 싶어요». Three suggested Korean replies are filled in: remove two with X and replace the last with `Thanks! We just sent you a DM.` → «다음» | Step 4: an optional public reply posted under the comment. |
| 10 | «최종 검수»: «선택한 인스타 게시물», «감지될 키워드» link, «보내질 DM 메시지», «자동으로 답글 달기» ON → «확인» | Review and save. |
| 11 | Card shows «실행 중» (Running), «키워드 :» link, «DM :» …, «자동 답글 : ON», «발송 전» (Not sent yet), «지금 확인» | The automation is running. |
| 12 | Profile 2 (commenter A): the @sding.kr post → comment `Can you send me the link?` | Another Instagram account comments on the post with the keyword. |
| 13 | **A:** Finch «지금 확인» → overlay «댓글을 확인하고 있어요…» → dialog «DM 1개를 보냈어요» / «댓글 1개 확인 · DM 1개 보냄 · 건너뜀 0개» → «확인». **B (if V1):** show scenes 15–16 first, then «지금 확인» → «새로 보낼 DM이 없었어요» / «건너뛴 이유: 이미 처리함 1» | **A:** Check now reads the post's comments (GET /{ig-media-id}/comments), matches "link", sends one private reply and posts the public reply. The comments webhook uses the same pipeline. **B:** The comments webhook already answered this comment in real time. Check now confirms it ("이미 처리함", already handled) and doesn't send twice. |
| 14 | Card now reads «누적 1건» (1 total), «오늘 1/300», «방금 전 발송» (Sent just now) | Finch records the result on the automation. |
| 15 | Profile 3: refresh the post. The reply from sding.kr appears under the comment | In Instagram, the public reply appears under the comment. |
| 16 | Profile 2: Direct inbox (Primary or Requests **[VERIFY V4]**) → thread from sding.kr with the DM | The commenter also received the private reply in Instagram Direct. |
| 17 | Finch: wait at least 30 seconds → «지금 확인» → «새로 보낼 DM이 없었어요», «건너뛴 이유: 이미 처리함 1» | Checking again never answers the same comment twice. |
| 18 (optional, **[VERIFY V7]**) | «성과 분석» › «링크 분석» → paste the post URL → «분석하기» → «댓글 감성 요약». Needs 5+ comments; skip if unsure | Comments on the owner's own post can also be summarized as positive, neutral or negative. |
| 19 | End card | Finch reads comments and replies to them. It never hides, edits or deletes comments. |

---

## 5. instagram_business_manage_messages

### How we use it
An Auto DM private reply opens an Instagram Direct conversation between the commenter and the business account, and Finch requests instagram_business_manage_messages for the messaging side of that conversation. When an account is connected, Finch subscribes it to the `messages` webhook (`POST /me/subscribed_apps` with `subscribed_fields=comments,messages`), so a recipient's reply to an automated DM reaches Finch. Each incoming message is checked only for an opt-out word («수신거부», "stop" or "unsubscribe"). On a match Finch stores a one-way hash of the sender's Instagram-scoped ID and never sends that person another automated message from this account; message text is never stored. The DM itself is written by the account owner in the «DM 메시지를 작성해주세요» (Write your DM) step, can carry up to three link buttons, and is sent with `POST /{ig-user-id}/messages` only to people who commented on the owner's post. It goes out at most once per comment, once per person every 24 hours and 300 times per automation per day, so Finch never starts cold conversations or sends bulk messages.

### Reviewer test steps
1. Sign in at https://finch.ai.kr: «로그인» → «Google로 계속하기» with the test Google account. Close the notice with «닫기» if it shows.
2. If Instagram isn't connected, connect sding.kr via «계정 및 설정» › «SNS 계정 연결» › «Instagram» › «연결하기».
3. Left sidebar: «자동 DM». On the automation card, click the pencil icon (label «편집», Edit). If there's no automation, create one with section 4, steps 3–8.
4. Click «다음» twice to reach «DM 메시지를 작성해주세요» (Write your DM). Edit the text. Optionally set «메시지 버튼» to «1개» and fill in «버튼 입력» (Button label) and «URL 입력» (URL).
5. Keep pressing the bottom button until «최종 검수» (on the link step it reads «1/1 링크 설정 완료», Links set 1/1; otherwise «다음»). Then click «변경 저장» (Save changes).
6. As the commenter test account, comment "link" on the post. Each Instagram account gets at most one automated DM per 24 hours. If it already got one today, the result lists «발송 제한» (Send limit).
7. In Finch, click «지금 확인» (Check now). The result reads «DM 1개를 보냈어요».
8. In the commenter's Instagram Direct, the message from @sding.kr shows your text (and button). @sding.kr's own Instagram Direct shows the same conversation.
9. Comment again within 24 hours, wait 30 seconds, and click «지금 확인». The skip reasons include «발송 제한 1».
10. Replying «수신거부» or exactly "stop" to the DM registers an opt-out through the messages webhook. That webhook may not be delivered while the app is in development mode **[VERIFY V1]**.

### Screencast script
Before this take: an automation exists (from video 4, or create one). Use commenter **B**, a different tester, or record at least 24 hours after video 4. Profile 2 is logged in as B, and profile 3 is @sding.kr's Direct inbox. Keep the Meta App Dashboard ready in a separate window for scene 12.

| # | On screen (exact UI) | Caption (English) |
|---|---|---|
| 1 | finch.ai.kr, logged out → «로그인» | Starting logged out. |
| 2 | «Google로 계속하기» → reviewer account → «홈» | Sign in with the test Google account. |
| 3 | «계정 및 설정» › «SNS 계정 연결». Expand «핀치가 요청하는 권한» and point at «다이렉트 메시지 송수신» | "다이렉트 메시지 송수신" = send and receive Direct messages (instagram_business_manage_messages). |
| 4 | «다시 연결» → «Instagram로 이동하고 있어요» → instagram.com login as sding.kr (password blurred) → consent → allow → «@sding.kr 계정을 연결했어요» → «확인» | The account owner logs in to Instagram and grants the messaging permission. |
| 5 | «자동 DM» → card pencil (label «편집») → «자동화 수정» → «다음» ×2 → «DM 메시지를 작성해주세요». «메시지 입력»: `Hi! Here's the Finch guide you asked for. (automated reply)` + new line + `수신거부는 이 메시지에 '수신거부'라고 답장해 주세요.` Set «메시지 버튼» «1개» → «다음» | The owner writes the Direct message Finch will send. The last line tells the recipient how to opt out. |
| 6 | «1번째 버튼 링크 설정»: «버튼 입력» `Open guide`, «URL 입력» `https://finch.ai.kr` → «1/1 링크 설정 완료» → «다음» → «최종 검수» → «변경 저장». If V2 fails, choose «없음» in scene 5. See D5 for the disabled button on this step | An optional link button. The preview shows how the DM will look. |
| 7 | Profile 2 (commenter B): comment `link please` on the test post | Someone comments with the keyword. |
| 8 | Finch: «지금 확인» → «DM 1개를 보냈어요» | Finch sends the message to the commenter (POST /{ig-user-id}/messages). |
| 9 | Profile 2: Direct → thread from @sding.kr → message text, opt-out line and «Open guide» button → click it (opens finch.ai.kr) | The message sent by Finch, displayed in the recipient's Instagram inbox. |
| 10 | Profile 3 (@sding.kr): Direct → the same conversation with the sent message | The same conversation in the business account's Instagram inbox. |
| 11 | Profile 2: reply `Thanks!`. It appears in profile 3's inbox | Replies land in the business's normal Instagram inbox. Finch doesn't store message text. |
| 12 (required, **[VERIFY V6]**) | Meta App Dashboard › Instagram › API Integration Helper: select @sding.kr, pick the conversation with commenter B, type `Test message via the Instagram API (Finch app review)`, generate the cURL (token blurred). Run it, or show the equivalent: `curl -X POST "https://graph.instagram.com/v25.0/<IG_ID>/messages" -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" -d '{"recipient":{"id":"<IGSID>"},"message":{"text":"Test message via the Instagram API (Finch app review)"}}'`. The response shows `recipient_id` and `message_id`, and the message appears in profile 2's inbox. The reply in scene 11 opened the 24-hour window | Generating the send request with Meta's API Integration Helper (token hidden). The message appears in Instagram Direct. |
| 13 | Wait at least 30 seconds. Profile 2 comments `link again` → Finch «지금 확인» → «새로 보낼 DM이 없었어요», «건너뛴 이유: 이미 처리함 1 · 발송 제한 1», and the line «발송 제한은 하루 상한·수신거부·24시간 안에 이미 받은 사람 같은 안전장치예요.» | Anti-spam: at most one automated DM per person every 24 hours. |
| 14 | Profile 2: reply `수신거부` in the thread | **Default:** Replying "수신거부" (unsubscribe) opts this person out of automated DMs. Finch receives the reply through the messages webhook and stores only a hashed opt-out. **If V1 confirms messages webhooks arrive:** add a segment more than 24 hours later (new comment → «지금 확인» → «발송 제한 1») with the caption: Next day: this person opted out, so Finch sends nothing. |
| 15 | End card | Finch messages only people who commented on the owner's post: once per comment, never after they opt out. |

---

## Label index (file:line, checked 2026-09-11)
- `components/layout/sidebar.tsx`: «홈» 33 · «발행» 53 · «자동 DM» 54 · «성과 분석» 61 · «레퍼런스»/«탐색»/«스크랩»/«경쟁사» 67-71 · «계정 및 설정» 87
- `lib/settings/sections.ts`: group «연결» 61 · «SNS 계정 연결» 63
- `app/(finch)/(app)/settings/channels/page.tsx`: «이미 다른 핀치 계정에 연결된 계정이에요» 275 · «댓글 자동 DM을 쓰시려면 다시 연결해 주세요.» 293 · «{handle} 계정을 연결했어요» 314 · «운영자에게만 보이는 안내» 491 (shown only if 399/489) · «채널 계정» 520 · «전환 방법» 562 · «다시 연결» 579 · «연결 해제» 589 · «연결하기» 595 · «핀치가 요청하는 권한» 700 · «기능에 필요한 최소 권한만 요청해요» 701 · «인스타그램» 706
- `app/(finch)/(app)/settings/channels/_lib/derive-state.ts`: «비즈니스·크리에이터 계정만 연결할 수 있어요» 31 · «연결됨» 47 · «자동으로 연장돼요» 53 · «미연결» 61
- `lib/channels.ts:5` «Instagram» · `components/ui/connect-link.tsx:99` «{label}로/으로 이동하고 있어요» → «Instagram로 이동하고 있어요» (`lib/josa.ts:39-44`, a Latin ending takes «로») · `components/ui/result-modal.tsx:114` «확인»
- `lib/meta/instagram-oauth.ts:45-49`: «프로필 기본 정보 조회» · «게시물·계정 인사이트 조회» · «댓글 조회·답글 및 비공개 답장(DM)» · «다이렉트 메시지 송수신» · «예약한 게시물 발행»
- Login: `app/(finch)/(marketing)/layout.tsx:55` «로그인» · `app/(finch)/(auth-split)/login/login-form.tsx:54` «로그인», 73 «Google로 계속하기» · `components/auth/use-oauth-start.tsx:56` «Google로 이동하고 있어요»
- `components/layout/opening-notice.tsx`: «지금은 임시오픈 기간입니다» 101 · «오늘 하루 종일 보지 않기» 115 · «닫기» 118 · `components/layout/topbar.tsx`: «계정 메뉴» (aria-label) 167 · «로그아웃» 194
- `components/layout/channel-switcher.tsx`: «Instagram 기준» 33 · «Instagram 전용» 60 · chip «Instagram» 75
- `app/(finch)/(app)/dashboard/_components/dashboard-client.tsx`: «팔로워» 125 · «이번 주 조회수» 131 · «게시물 수» 136 · «평균 참여율» 140 (tooltip 142) · «홈» 158 · «최근 게시물» 215 · «조회수»/«좋아요»/«댓글» 231-233 · «내 계정» 323 · «연동됨» 360 · card «팔로워»/«참여율»/«게시물» 372/393/402 · «연동된 계정이 없습니다» 430
- `components/dashboard/performance-trend.tsx`: «성과 추이» 72 · tabs «팔로워»/«도달»/«참여율» 33-35 («도달» via `dashboard-client.tsx:193`) · `components/dashboard/channel-profile-panel.tsx`: «게시물»/«팔로워»/«참여율» 80-82 · `components/dashboard/daily-brief.tsx`: «오늘의 핀치» 60 · «오늘의 아카이빙 현황» 236
- `app/(finch)/(app)/insights/tabs.tsx`: «개요» 13 · «내 게시물» 14 · «링크 분석» 15
- `app/(finch)/(app)/insights/_components/audience-client.tsx`: «팔로워 분석» 119 · «{p}일» 135 · «도달» 146 · «직전 {period}일 대비» 149/179 · «참여 계정» 155 · «직전 7일 대비» 164/193 · «팔로워 순증감» 169 · «프로필 링크 클릭» 184 · «일별 도달» 214 · «일별 팔로워 순증감» 233 · «자주 반응하는 사람 Top 8» 286
- `app/(finch)/(app)/insights/posts/_components/growth-client.tsx`: «성장 진단» 78 · «진단할 게시물이 아직 부족해요» 91 · «평균 저장률» 102 · «평균 참여율» 110 · «평균 도달» 118 · «분석 게시물» 125 · «AI 진단 받기» 141 · «게시물별 성과» 203 · «저장률»/«참여율»/«도달»/«저장» 214-219
- `app/(finch)/(app)/insights/link/page.tsx`: «분석하기» 64 · «댓글 감성 요약» 160
- Publish (re-checked 2026-09-12 against `40355b5`): `publish/page.tsx:128` «발행» · `publish/_components/publish-list.tsx`: strip «인스타그램» 384 (handle 405) · «캘린더» 429 (default tab, 143) · «발행예약» 430 · «발행완료» 431 · «새 게시물 포스팅» 460 · «{label}이 처리하고 있어요 · 끝나면 자동으로 올라가요» 986 · «게시물 보기» 1001 (published posts with a permalink only, 982) · list badge «Instagram» `lib/channels.ts:5`
- Composer: `publish/_components/post-composer.tsx`: «새 게시물 포스팅» 414 · «채널» 428 (starting channel 139-144) · «준비 중» 452 · «사진·영상» 462 · «{n}/{max}» 466 · «사진 1장은 사진 게시물, 영상 1개는 릴스, 2개 이상은 캐러셀로 올라가요» 106 · «사진 게시물로 올라가요» 113 · crop note «사진 {n}장을 인스타그램 비율(4:5~1.91:1)에 맞춰 가운데를 기준으로 잘랐어요.» 487 · «스토리로 올리기» 506 · «피드에도 보이기» 513 · «커버» 522 · «커버 고르기» 537 · caption label 549 (= «캡션», `lib/publish-rules.ts:65`) · «{n}/2200» 553 · «발행 방식» 572 · «지금 발행» 588 (description 589) · «예약 발행» 606 (default mode, 149) · «초안으로 저장» 636 · «지금 발행하기» 658 · «발행 중…» 653 (under the overlay) · «파일을 올리는 중이에요 — {n}/{m}» 252 · result titles «{label}에 올라갔어요» 74 · «곧 올라가요» 78 · «{label}이 영상을/게시물을 처리하고 있어요» 81 · «{label}에 올리지 못했어요» 91 (label «인스타그램», `lib/publish-rules.ts:27`; «이/가» from `lib/josa.ts:34-36`)
- Publishing overlay: `publish/_components/publishing-veil.tsx` (mounted at `post-composer.tsx:412`): «{label}에 올리고 있어요» 52 · «사진·영상을 보내는 중이에요.»/«글을 보내는 중이에요.» 58 · «{label}이 게시물을 확인하고 있어요.» 60 · «거의 다 됐어요. 조금만 더 기다려 주세요.» 64 · «{n}초 지남 · 이 창을 닫지 말고 기다려 주세요» 78
- Composer tiles and status: `publish/_components/media-tiles.tsx`: «추가» 268 · chip «사진» 214 · video chip (▶ length) 209-211 · «준비 중» 159 · upload bar 163-175 · «다시 올리기» 194 · `publish/_components/use-media-tiles.ts:99` accepted files (JPG·PNG·WEBP photos, MP4·MOV videos) · `publish/_components/cover-picker.tsx:125` «커버 고르기» · `components/ui/status-pill.tsx`: «처리 중» 27 · «발행 완료» 28 · `lib/publish/run.ts:457` «게시물이 발행됐어요»
- `app/(finch)/(app)/auto-dm/_components/auto-dm-client.tsx`: «실행 중» 46 · stat cards 272-275 · «자동 DM» 281 · «자동화 만들기» 292 · «최근 30일 … 평균 응답률 …» 340 · «아직 자동 DM 규칙이 없어요» 367 · «첫 자동화 만들기» 373 · «키워드 :» 432 · «DM :» 451 · «자동 답글 :» 466 · «누적 {n}건» 476 · «오늘 {n}/{cap}» 478 · «발송 전»/«{ago} 발송» 482 · «지금 확인» 502 · «편집» 514 · «삭제» 523 · «이 자동화를 지울까요?» 562 · «댓글을 확인하고 있어요…» 578
- `app/(finch)/(app)/auto-dm/_components/rule-wizard.tsx`: «자동화 수정»/«자동화 만들기»/«최종 검수» 461/488 · «어떤 게시물을 자동화할까요?» 518 · «현재 게시물에서 선택할게요» 526 · «어떤 댓글에 DM을 보낼까요?» 633 · «특정 키워드에 발송할게요» 642 · «추가» 669 · «DM 메시지를 작성해주세요» 700 · «메시지 입력» 709 · «메시지 버튼» 728 · «없음»/«{n}개» 746 · «{n}번째 버튼 링크 설정» 766 · «버튼 입력» 771 · «URL 입력» 784 · «내 링크 불러오기 (준비 중)» 801 · «게시물 댓글에 대하여, 자동 답글을 남길까요?» 831 · «네, 답글을 남기고 싶어요» 836 · «선택한 인스타 게시물» 903 · «감지될 키워드» 938 · «보내질 DM 메시지» 955 · «자동으로 답글 달기» 979 · «{n}/{m} 링크 설정 완료» 1036 · «변경 저장» 1039 · «확인» 1040 · «다음» 1041
- `lib/auto-dm/check-now-types.ts`: «DM {n}개를 보냈어요» / «새로 보낼 DM이 없었어요» 89 · «댓글 {n}개 확인 · DM {n}개 보냄 · 건너뜀 {n}개» 90 · «이미 처리함»/«기간 지남»/«발송 제한» 94-97 · «건너뛴 이유:» 99 · «발송 제한은 …안전장치예요.» 101 · «방금 확인했어요» 157 · «지금은 확인하지 못했어요» 170
- API calls: `lib/meta/instagram-oauth.ts:207-213, 241-248` · `lib/meta/instagram.ts:77-122, 147-170, 187-211, 294-297, 317-321, 358-364, 404-415` · `lib/meta/instagram-publish.ts:100-132, 142-201` (containers, `status_code`, `media_publish`, `permalink`, `content_publishing_limit`) · `app/(finch)/(app)/publish/actions.ts:104-143` (direct uploads), `:373-562` (save and «지금 발행») · `lib/publish/run.ts` (publish flow; the inline wait before «처리 중» is `:141-143`) · `lib/meta/graph.ts:18, 106-160` · `lib/auto-dm/pipeline.ts`, `lib/auto-dm/check-now.ts`, `lib/auto-dm/match.ts:26-60` · `app/api/webhooks/instagram/route.ts:153-175` · `supabase/migrations/0092_auto_dm_manual_checks.sql:110-212`

---

## Changes made
1. **Login and consent in every video is now required.** Meta's reference asks each screencast to show the complete Instagram login and the user granting that permission. Scene 4 of videos 2–5 was marked "(recommended)"; it's now required, and Must-do 5 (log out of instagram.com before each take) makes Instagram show its login.
2. **The cURL scene in video 5 is now required.** Meta's reference for manage_messages asks for "generating a cURL request … You may use the API Integration Helper in Meta App Dashboard > Instagram", and APP_REVIEW §4-2-5 says the same. It was "optional". V6 now names that location.
3. **The manage_messages description was rewritten.** Meta's Private Replies doc lists `instagram_business_basic` + `instagram_business_manage_comments` for private replies, and the code agrees (`pipeline.ts:50-55`). The draft's opening claim that Finch "needs manage_messages to deliver the DM" contradicted both. The text now describes the real use: the `messages` webhook subscription and opt-out handling for the conversation the private reply opens. Meta's docs confirm the `messages` webhook requires manage_messages.
4. Insights: «내 게시물» is sorted by save rate only (`growth.ts:145`), not "by save rate and engagement rate". The call ranges and post counts were made precise (7d / previous 7d / 14d; 10 posts on Home, 12 on My posts).
5. Insights scene 6 no longer clicks «참여율»: in real mode it shows a text note, not a chart (`performance-trend.tsx:121`). «팔로워» is shown only if the account has 100+ followers.
6. Basic: the media list is read when Home or the Auto DM picker loads, not "right after authorization" (`live.ts:492, 1091`). Added that the token is cleared when the user removes Finch in Instagram (`deauthorize/route.ts:41`).
7. Publish: added that images are uploaded to Finch storage and passed as `image_url` (`publish/actions.ts:313-322`), that the composer's default mode is «예약 발행» (`post-composer.tsx:73`), and that the list opens on «캘린더», so «발행완료» must be clicked (`publish-list.tsx:99`). Hashtags were added to the caption, since Meta's content_publish guidance mentions captions and hashtags. (These line numbers are from the old composer; item 17 supersedes this item.)
8. Comments: the comment fields now include `username` (`instagram.ts:363`). "50 newest" is now "50 newest top-level comments". The link-analysis clause now says an AI model does the classification and needs 5+ comments.
9. Wizard details: «메시지 버튼» defaults to «1개» for a new rule (`rule-wizard.tsx:120`), and three suggested replies are prefilled (`:126`). Scripts now say to switch or remove them. On the link step the bottom button reads «1/1 링크 설정 완료», not «다음».
10. Video 4 scene 13 variant B now shows the correct on-screen result («새로 보낼 DM이 없었어요» + «이미 처리함 1») and the scene order.
11. Video 5 scene 13 skip reasons corrected to «이미 처리함 1 · 발송 제한 1». Test step 10 no longer asserts that "Meta only delivers that webhook after approval" (unproven; tagged V1). Reviewers are told to reply exactly "stop" (`match.ts:57-60` matches only the whole word).
12. D2 corrected: the notice reappears on every fresh load until «오늘 하루 종일 보지 않기» is clicked. «닫기» is per visit, not per day.
13. Citation fixes: the «이미 다른 핀치 계정에 연결된 계정이에요» text is in `settings/channels/page.tsx:275`, and the callback only sets the reason. The operator notice is gated at 399/489. «계정 메뉴» and «편집»/«삭제» are aria-labels on icon buttons, not visible text.
14. Added Must-do items: a webhook-subscription warning check after connecting, the 5-minute post-list cache before the Auto DM take, and staying off the «레퍼런스» screens and Home's pool hero.
15. Added decisions D5 («내 링크 불러오기 (준비 중)»), D6 (always-empty «자주 반응하는 사람 Top 8» with "웹훅" in its text) and D7 («틱톡 준비 중» in the composer).
16. DM sample texts now say "(automated reply)", following the owner's pending «자동 발송» disclosure item in APP_REVIEW §7. The Label index with file:line was added.
17. **2026-09-12: publishing rewritten for the new composer (`3366fe1`) and its publishing overlay (`40355b5`).** The draft described the old image-only composer.
   - Must-do 12 no longer mentions the 3 MB total cap («사진 용량 합계가 커요») or the base64 upload; files now upload straight to storage. It adds the migration 0093 and rehearsal checks.
   - Section 3: the description now covers photos, Reels, carousels and stories, the «처리 중» (Processing) state and the «게시물 보기» (View post) link. The test steps and the script use the new labels («사진·영상», the «추가» tile, the «사진» chip, the new «지금 발행» description, and the «인스타그램에 올리고 있어요» overlay that replaced the button's «발행 중…» note) and end by opening the post with «게시물 보기» instead of browsing the profile.
   - Added the optional note for video, carousel and story posts, and new Publish and overlay lines in the Label index. D7's line moved to 452.

## Remaining items
- **[VERIFY]** 0092 applied in production; 0093 applied and one rehearsal photo post via «지금 발행» reaches Instagram (Must-do 12); V1 webhooks in dev mode; V2 button-template delivery; V3 recipient tester role; V4 Primary vs Requests; V5 consent-screen wording on first connect vs reconnect; V6 exact App Dashboard path for the API Integration Helper and how it selects the IGSID; V7 link-analysis quota and comment count.
- **[OWNER CONFIRM] sding.kr follower count.** Below 100, Home «팔로워» may read 0 while instagram.com shows a real number, which is a visible mismatch in video 1 scene 11. The follower trend and «팔로워 순증감» may also be empty.
- **[OWNER CONFIRM] Test-account username.** "sding.kr" matches the name of a competing tool referenced in code comments (`supabase/migrations/0052_auto_dm_follow_request.sql:3`, `rule-wizard.tsx:16`). Confirm the account is Finch's own test account. The handle appears in every video and in the reviewer credentials; consider renaming the Instagram username before recording.
- **[OWNER CONFIRM] Sign-in challenges.** The reviewer Google account may hit Google's new-account or foreign-login verification, and sding.kr may hit an Instagram login checkpoint (APP_REVIEW §4-2-1, §4-2-2). Either one blocks the whole submission.
- **[OWNER CONFIRM] How thin the manage_messages case is.** In code, manage_messages covers only the `messages` webhook (opt-out). The DM itself runs on manage_comments according to Meta's docs. If Meta rejects manage_messages as unnecessary, automated DMs still send, but opt-out replies would stop arriving. Decide whether that risk is acceptable or whether a stronger messaging use is needed; that would be a product change.
- **[DECISION]** D1 commenter tester for reviewers; D2 soft-launch notice (a code change is needed for reviewers); D3 static «최근 30일 0건 발송»; D4 cleanup after recording; D5 «내 링크 불러오기 (준비 중)»; D6 «자주 반응하는 사람 Top 8»; D7 composer «틱톡 준비 중»; the «평균 참여율» tooltip text.
- **Not covered by our screencast:** Meta lists "insights for an Instagram professional account's public profile" for manage_insights, and "update/delete comments" for manage_comments. Finch doesn't use either; the descriptions and end cards say so explicitly.
