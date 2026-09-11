# Threads: Meta App Review package (threads_basic · threads_content_publish · threads_manage_insights)

I checked this against `main` @ 65ddf9f on 2026-09-11, and against Meta's reference pages for the three permissions (developers.facebook.com/docs/permissions/reference/threads_basic, /threads_content_publish and /threads_manage_insights).

- Every Korean label is the exact string from the code, with an English gloss in parentheses. The file:line for each one is in the «Label verification» table near the end.
- **[VERIFY]** means the code can't confirm the step (for example, screens hosted by Meta).
- **[GAP]** means the code doesn't fully support something.
- **[OWNER CONFIRM]** means the owner has to decide.
- The parts to paste into the Meta form are the «How we use it» paragraphs and the «Reviewer test steps». The screencast scripts are for recording only.

## What Meta requires in each screencast (from the reference pages)

| Permission | What the video must show |
|---|---|
| **All three** | (1) The complete Threads OAuth login, with the user granting the permission. (2) The full flow of linking a Threads account inside the app, showing which permissions are requested. |
| threads_basic | (3) The user's own posts listed after retrieval, with details such as text, images and video. |
| threads_content_publish | (3) Creating a post with text, images or video. (4) Publishing it. (5) The result shown both in the app and in the native Threads app. |
| threads_manage_insights | (3) Profile-level metrics such as followers, engagement and reach. (4) Post-level metrics such as likes, comments and shares. |

## 0. Before recording (applies to all 3 videos)

1. **Reviewer Google account.**
   - It must be in `OWNER_EMAIL`, but not first in the list.
   - It must have finished onboarding and the consent step.
   - If it isn't in `OWNER_EMAIL`, the Threads row shows «준비 중» (Coming soon) with «곧 열릴 예정이에요» (Opening soon) and no button.
   - If consent is missing, `/api/auth/threads/start` redirects to `/onboarding/consent`.
2. **Threads tester.** `sding.kr` must be a Threads Tester on the Finch app (1709021066981985) and must have accepted the invite in the Threads app. **[VERIFY]** this in the dashboard and in the Threads app.
3. **One Finch account per Threads profile.** `connected_accounts` has a global unique index on (channel, platform_user_id) (migration 0004).
   - If another Finch account still holds sding.kr's Threads, including the owner's main account, the reviewer's connect fails with «이미 다른 핀치 계정에 연결된 계정이에요» (This account is already linked to another Finch account).
   - The owner's main account must click «연결 해제» (Disconnect) inside Finch.
   - Removing Finch in the Threads app is **not** enough. The deauthorize callback only marks the row disconnected and keeps its `platform_user_id`, so the unique index still blocks the reviewer.
4. **App Review dashboard.**
   - Click «앱 검수에 추가» (Add to App Review) for `threads_content_publish` and `threads_manage_insights`. Don't add the two reply permissions; they are no longer requested.
   - Each permission needs at least one successful call in the last 30 days, and calls can take up to 2 days to show.
   - To create the calls in rehearsal, open «홈» (Home) › «Threads» once, and do one «지금 발행» (Publish now).
5. **Threads content on sding.kr.**
   - At least 3 posts, at least one with a photo.
   - A few views, likes and replies from another account, so the numbers aren't zero.
   - **No video post among the 9 newest.** Video tiles render blank (see Gaps).
   - No personal information in the newest posts.
6. **Soft-launch notice.** After login, the app shows a «지금은 임시오픈 기간입니다» (We are in a soft-launch period) dialog once per day per browser.
   - On recording day, sign in once in the recording profile, click «오늘 하루 종일 보지 않기» (Don't show again today), then sign out.
   - The flag resets at midnight KST.
   - **[OWNER CONFIRM]** Hide it for reviewer accounts altogether? Its text says features may still change, which can read as "unfinished".
7. **Reset before EACH video.** Every video must show the connect flow and the permission screen.
   1. Reviewer account in Finch: «계정 및 설정» › «SNS 계정 연결» › Threads row › «연결 해제» (Disconnect) › «해제하기» (Disconnect).
   2. Threads app › Settings › Account › Website permissions › remove Finch. **[VERIFY]** the menu path, and that the full permission list appears again on the next authorization.
   3. Sign out of Finch.
8. **Recording setup.**
   - Use a clean Chrome profile, a 1440 px wide viewport, 1080p export, no audio and English captions.
   - Sign the Google account into the browser beforehand, so only the account chooser appears.
   - Also sign in to threads.net as sding.kr beforehand, so Threads shows only the consent step. Blur any credential field that appears anyway.
   - Record in this order: threads_basic, then threads_manage_insights, then threads_content_publish. Otherwise the test post sits at the top of the insights list with 0 views.
9. **Cache.**
   - Threads reads are cached for 300 s per token, and the 7-day totals stop at the start of the current hour.
   - Reconnecting gives a new token, so data right after connecting is always fresh.
   - A post made after Home was already opened can take up to 5 minutes to appear there.

## Gaps and findings in code (read before recording)

- **Correction to the earlier draft: opening a single post is not required.** Meta's threads_basic video asks only for the list of the user's posts with their text and images or video. Finch shows text in «최근 게시물» (Recent posts) and photos in the profile grid.
  - Optional polish: rows and tiles aren't links. `permalink` is fetched but never used, and `Post` has no `permalink` field.
- **[GAP] Video posts show a blank tile.** The grid uses `media_url` as the thumbnail, and for a VIDEO post that URL is the video file. `thumbnail_url` isn't requested. Either keep video out of the 9 newest posts, or fetch `thumbnail_url` (a small code fix).
- **Keep «성과 분석» (Insights) and «리포트» (Reports) out of all Threads videos and descriptions.**
  - The «성과 분석» top bar says «Instagram 기준» (Instagram-based), and its tooltip says Threads will be added later. Yet `getLiveAudience` merges Threads views, interactions and clicks into that screen.
  - The report download builds its summary from Instagram only, and returns HTTP 400 if Instagram isn't connected.
  - **[OWNER CONFIRM]** APP_REVIEW §2 still lists both screens under threads_manage_insights. Either update the doc, or change the «Instagram 기준» label.
- **«성과 추이» (Performance trend) opens on the «팔로워» (Followers) tab.** Threads has no follower series, so that tab shows «이 지표의 추이 데이터가 아직 없어요…» (No trend data for this metric yet…). Click «도달» (Reach) right away; for Threads it plots daily views.
- **Copy a reviewer may misread (optional fixes — the owner decides):**
  - The unconnected Threads hint says «연결하면 게시물·답글 지표를 불러와요» (Connect to load post and reply metrics). "답글" means reply counts from insights, not the reply permissions.
  - The permission label «게시물 발행(카드뉴스 예약 발행)» (Publish posts (scheduled card-news publishing)) doesn't mention «지금 발행» (Publish now). It is visible in the threads_basic video.
  - The Threads «팔로워» (Followers) card always shows «0% 지난주 대비» (0% vs. last week), and the profile card always shows «팔로워 0 · 최근 7일» (Followers 0 · last 7 days). The follower change is hard-coded to 0.
  - The «평균 참여율» (Average engagement rate) tooltip uses Instagram wording: (likes + comments + shares) ÷ reach. Don't open it on camera.
  - «게시물 수» (Posts) is the number of recent posts Finch loaded, capped at 25. It is not the lifetime total, so don't describe it as one.
- **Requested but not displayed (not blocking):**
  - Profile field `is_verified`.
  - Post fields `permalink` and `is_quote_post`.
  - Per-post `reposts`, `quotes` and `shares`.
  - Account `clicks`, which feeds only «성과 분석».

---

## 1. threads_basic

### How we use it
Finch uses threads_basic so a creator can link their own Threads profile through Threads Login, started from «계정 및 설정» (Account & Settings) › «SNS 계정 연결» (Connect social accounts) › «Threads» › «연결하기» (Connect). Right after consent, Finch reads the profile's ID, username, display name, profile picture and bio, and shows the handle, name and photo on that settings row and on the Threads profile card on «홈» (Home), so the user can confirm which account is linked. Whenever the user opens Home and picks «Threads», Finch retrieves the account's own recent threads (text, media type, media URL and publish time) and shows them as the «최근 게시물» (Recent posts) list and a 3×3 photo grid, so they can review what they have posted without switching apps. Finch never puts these posts on a public page or shows them to anyone outside the user's own Finch workspace. The access token is stored encrypted and is deleted from Finch when the user clicks «연결 해제» (Disconnect).

### Reviewer test steps
1. Open https://finch.ai.kr in a browser where you are not signed in to Finch.
2. Click «로그인» (Log in) at the top right.
3. Click «Google로 계속하기» (Continue with Google) and sign in with the test Google account from the App Review notes. Finch opens «홈» (Home).
4. If a dialog titled «지금은 임시오픈 기간입니다» (We are in a soft-launch period) appears, click «닫기» (Close).
5. At the bottom of the left sidebar, click «계정 및 설정» (Account & Settings). Under «연결» (Connections), click «SNS 계정 연결» (Connect social accounts).
6. Under «채널 계정» (Channel accounts), find the «Threads» row.
   - If it shows «미연결» (Not connected), click «연결하기» (Connect).
   - If it shows «연결됨» (Connected), click «다시 연결» (Reconnect). It runs the same authorization.
7. Finch shows «Threads로 이동하고 있어요» (Taking you to Threads), then opens the Threads authorization page. If this browser is already signed in to Threads or Instagram with a different account, sign out of it first.
8. Sign in as the Threads test account sding.kr (credentials are in the App Review notes). Review the requested permissions and approve. **[VERIFY]** Meta's button wording.
9. You return to «SNS 계정 연결» with a dialog saying «@sding.kr 계정을 연결했어요» (Connected account @sding.kr). **[VERIFY]** that the Threads username is sding.kr. Click «확인» (OK).
10. The «Threads» row now shows «연결됨» (Connected), the profile photo, @sding.kr, the display name, and «자동으로 연장돼요» (Renews automatically).
11. At the bottom of the page, expand «핀치가 요청하는 권한» (Permissions Finch requests). Under «Threads» it lists:
    - «프로필 기본 정보 조회» (View basic profile info)
    - «게시물 발행(카드뉴스 예약 발행)» (Publish posts (scheduled card-news publishing))
    - «계정·게시물 인사이트 조회» (View account and post insights)
12. Click «홈» (Home) in the sidebar, then click «Threads» in the channel selector at the top of the page.
13. On the right, the Threads profile card shows the photo, @sding.kr, the name and bio, and below them a grid of the account's latest posts with their photos.
14. Scroll to «최근 게시물» (Recent posts). Each row is one of the account's own threads, with:
    - its text;
    - its type: «텍스트» (Text), «피드» (Feed, a photo post) or «캐러셀» (Carousel);
    - how long ago it was posted.

### Screencast script
| # | On screen / action | Caption |
|---|---|---|
| 1 | finch.ai.kr landing page, not signed in to Finch | "Finch (finch.ai.kr), signed out. We start on the public homepage." |
| 2 | «로그인» › «Google로 계속하기» › pick the test account in the Google chooser › Finch «홈» | "Sign in to Finch with «Google로 계속하기» (Continue with Google)." |
| 3 | Sidebar «계정 및 설정» › «SNS 계정 연결»; the Threads row shows «미연결» | "Account & Settings › Connect social accounts. Threads reads «미연결» (Not connected)." |
| 4 | Click «연결하기»; the «Threads로 이동하고 있어요» dialog appears | "«연결하기» (Connect) starts Threads Login." |
| 5 | Threads authorization page; hold 3–4 s on the permission list; approve | "Threads lists what Finch asks for. threads_basic covers the profile and the user's own posts. The user approves." |
| 6 | Back in Finch: «@sding.kr 계정을 연결했어요» › «확인» | "Back in Finch: «@sding.kr 계정을 연결했어요» (Connected account @sding.kr)." |
| 7 | The row shows «연결됨», photo, @sding.kr and name | "Profile fields from threads_basic: username, display name and profile picture." |
| 8 | Expand «핀치가 요청하는 권한» › the Threads list | "Finch explains each Threads permission to the user in plain Korean." |
| 9 | Sidebar «홈» › «Threads» in the top selector; the profile card | "Home › Threads: the linked profile's photo, name and bio." |
| 10 | Slow pan over the photo grid under the profile card | "The user's own recent threads, shown with their photos." |
| 11 | Scroll to «최근 게시물» | "«최근 게시물» (Recent posts): each row is one of the user's threads, with its text, post type and time." |
| 12 (optional) | «SNS 계정 연결» › «연결 해제» › «해제하기» › «연결을 해제했어요» | "Disconnecting removes the stored Threads token from Finch." |

---

## 2. threads_content_publish

### How we use it
Finch requests threads_content_publish for a single feature: posting content the user writes in the «발행» (Publish) screen to their own Threads profile. In the «새 게시물 포스팅» (New post) composer, the user picks the «스레드» (Threads) channel, writes up to 500 characters, optionally attaches up to 10 photos, and chooses «지금 발행» (Publish now) or «예약 발행» (Schedule) with a date and time. Finch stores the photos in its own storage and passes them to Threads as public image URLs, creates a TEXT, IMAGE or CAROUSEL container with `POST /{threads-user-id}/threads`, waits until the container status is FINISHED, and then calls `/threads_publish`, either immediately or within five minutes of the scheduled time. The user sees the outcome right away: a «스레드에 올라갔어요» (Posted to Threads) confirmation, the post under the «발행완료» (Published) tab and an in-app notification; if Threads rejects it, Finch shows the error and keeps the post so the user can retry or delete it. Nothing reaches the user's Threads profile unless the user wrote it and chose to publish or schedule it.

### Reviewer test steps
1. Go to https://finch.ai.kr while signed out, click «로그인» (Log in), then «Google로 계속하기» (Continue with Google), and use the test Google account. If the «지금은 임시오픈 기간입니다» dialog appears, click «닫기» (Close).
2. Open «계정 및 설정» (Account & Settings) › «SNS 계정 연결» (Connect social accounts), and check that the «Threads» row says «연결됨» (Connected). If it doesn't, follow threads_basic steps 6–9.
3. In the left sidebar, under «SNS», click «발행» (Publish). The strip at the top shows «스레드» (Threads) with @sding.kr.
4. Click «새 게시물 포스팅» (New post) on the right.
5. Under «채널» (Channel), click «스레드» (Threads). The composer opens with «인스타그램» (Instagram) selected.
6. Optional: under «이미지 (선택)» (Images, optional), click «추가» (Add) and choose a JPG or PNG.
7. In «글» (Text), type a short post such as "Finch app review test". The counter shows x/500.
8. Under «발행 방식» (Publishing method), select «지금 발행» (Publish now). The default is «예약 발행» (Schedule).
9. Click «지금 발행하기» (Publish now). The button changes to «발행 중…» (Publishing…), with the note «스레드가 게시물을 처리하는 동안 잠시 걸릴 수 있어요. 창을 닫지 마세요.» (Threads may take a moment to process the post. Please keep this window open.) A post with a photo can take up to about a minute.
10. When «스레드에 올라갔어요» (Posted to Threads) appears, click «확인» (OK).
11. Click the «발행완료» (Published) tab. The post is listed with today's date and time and the status «발행 완료» (Published).
12. Open the Threads app (or threads.net) signed in as sding.kr and go to the profile. The new post is at the top, with the same text and photo.
13. Optional: in Finch, «홈» (Home) › «Threads» › «최근 게시물» (Recent posts) lists the new post as well. If Home was already open before you published, allow up to 5 minutes.
14. Optional, to test scheduling:
    1. In step 8, choose «예약 발행» (Schedule) with a time a few minutes ahead, and click «예약하기» (Schedule).
    2. The dialog «스레드 발행을 예약했어요» (Threads post scheduled) appears.
    3. The post waits under «발행예약» (Scheduled) and is published within five minutes after the chosen time.

### Screencast script
| # | On screen / action | Caption |
|---|---|---|
| 1 | finch.ai.kr signed out › «로그인» › «Google로 계속하기» › «홈» | "Recording starts signed out of Finch. We sign in with Google." |
| 2 | «계정 및 설정» › «SNS 계정 연결» › the Threads row «미연결» › «연결하기» | "To publish, the user first links Threads from Connect social accounts." |
| 3 | Threads authorization page; hold on the permission list; approve | "The permission list includes threads_content_publish, used to post for the user. Approve." |
| 4 | «@sding.kr 계정을 연결했어요» › «확인»; the row shows «연결됨» | "Threads is now linked as @sding.kr." |
| 5 | Sidebar «SNS» › «발행»; the strip shows «스레드» @sding.kr | "The «발행» (Publish) screen shows which Threads account will post." |
| 6 | Click «새 게시물 포스팅» | "Open the composer: «새 게시물 포스팅» (New post)." |
| 7 | Under «채널», click «스레드» | "Destination: «스레드» (Threads)." |
| 8 | «추가» › pick 1 photo; type text in «글» (counter x/500) | "The user attaches a photo and writes the post. Threads allows up to 500 characters." |
| 9 | Select «지금 발행» › click «지금 발행하기» | "«지금 발행» (Publish now): Finch creates the Threads container and publishes it." |
| 10 | «발행 중…» and the processing note (trim the wait; keep 2–3 s) | "Threads is processing the photo…" |
| 11 | «스레드에 올라갔어요» › «확인» | "Done: «스레드에 올라갔어요» (Posted to Threads)." |
| 12 | Click the «발행완료» tab; the new row shows «발행 완료» | "Finch lists it under «발행완료» (Published), with the time it went live." |
| 13 | Threads mobile app (phone screen recording spliced in) › @sding.kr profile › open the new post | "The same post, live in the Threads app, with the same text and photo." |
| 14 (optional) | «홈» › «Threads» › «최근 게시물», with the new post at the top | "It also appears in Finch's list of the user's recent threads." |
| 15 (optional) | Bell «알림» › «게시물이 발행됐어요» | "Finch leaves an in-app notice: «게시물이 발행됐어요» (Your post was published)." |

Tips:
- Meta asks for the **native** Threads app in scene 13, so a phone screen recording is safer than threads.net. **[VERIFY]** whether threads.net is accepted.
- Scene 14 works immediately only if Home › Threads was not opened between connecting and publishing.
- If a photo post fails in rehearsal, record a text-only post. Meta asks for text, images or video.

---

## 3. threads_manage_insights

### How we use it
Finch uses threads_manage_insights to show a creator how their own Threads account is performing on «홈» (Home) after they choose «Threads» in the channel selector at the top of the page. From `/threads_insights` it reads the current followers_count and the account's views, likes, replies, reposts and quotes for the last 7 days and the 7 days before; these fill the «팔로워» (Followers), «이번 주 조회수» (Views this week, with the change vs. last week) and «평균 참여율» (Average engagement rate) cards, plus a 14-day daily-views line in «성과 추이» (Performance trend). The engagement rate is Finch's own figure, (likes + replies + reposts + quotes) ÷ views, and per-post insights for the 10 newest threads supply the view, like and reply counts in the «최근 게시물» (Recent posts) table and on the profile grid, so the user can see which posts performed best. Once a day, a background job re-reads the follower count and sends an in-app alert when it moves by at least 30 followers and 3% in a single day. These numbers are visible only inside the user's Finch workspace, meaning the account owner and any teammates they invite.

### Reviewer test steps
1. Sign in: https://finch.ai.kr › «로그인» (Log in) › «Google로 계속하기» (Continue with Google), using the test Google account. Close the «지금은 임시오픈 기간입니다» dialog with «닫기» (Close) if it appears.
2. Check that «계정 및 설정» (Account & Settings) › «SNS 계정 연결» (Connect social accounts) shows «Threads» as «연결됨» (Connected). If it doesn't, follow threads_basic steps 6–9.
3. Click «홈» (Home), then click «Threads» in the channel selector at the top of the page.
4. Read the summary cards:
   - «팔로워» (Followers): the current follower total.
   - «이번 주 조회수» (Views this week): views in the last 7 days, with «지난주 대비» (vs. last week).
   - «게시물 수» (Posts): the number of recent posts Finch loaded, up to 25.
   - «평균 참여율» (Average engagement rate): (likes + replies + reposts + quotes) ÷ views, over the last 7 days.
5. In «성과 추이» (Performance trend), click the «도달» (Reach) tab. For Threads it plots daily views for the last 14 days. The «팔로워» (Followers) tab stays empty, because Threads provides only the current follower total, not a daily series.
6. Scroll to «최근 게시물» (Recent posts). Each of the 10 newest threads shows «조회수» (Views), «좋아요» (Likes) and «댓글» (Comments; for Threads this is the reply count).
7. Hover over a photo in the profile grid on the right to see that post's view count.
8. Optional: compare a post with its insights in the Threads app. Post numbers can lag by up to 5 minutes, and the weekly totals are counted up to the start of the current hour.

### Screencast script
| # | On screen / action | Caption |
|---|---|---|
| 1 | finch.ai.kr signed out › «로그인» › «Google로 계속하기» › «홈» | "Start: not signed in to Finch. Sign in with Google." |
| 2 | «계정 및 설정» › «SNS 계정 연결» › the Threads row › «연결하기» | "Link the Threads account whose performance we want to see." |
| 3 | Threads authorization page; hold on the permission list; approve | "Among the requested permissions is threads_manage_insights, for account and post insights. Approve." |
| 4 | «@sding.kr 계정을 연결했어요» › «확인» | "Connected. Finch can now read this account's insights." |
| 5 | «홈» › click «Threads» in the top selector | "Home, filtered to Threads." |
| 6 | Point at the «팔로워» card | "Followers: the current follower total from Threads insights." |
| 7 | Pan to «이번 주 조회수» with «지난주 대비» | "Views in the last 7 days, compared with the 7 days before." |
| 8 | Point at «평균 참여율» (don't open its tooltip) | "Engagement rate, calculated by Finch: (likes + replies + reposts + quotes) ÷ views." |
| 9 | «성과 추이» › click «도달» | "The «도달» (Reach) tab: for Threads, Finch plots daily views over the last 14 days." |
| 10 | Scroll to «최근 게시물»; show the «조회수 / 좋아요 / 댓글» columns | "Post-level insights: views, likes and replies for each recent thread." |
| 11 | Hover one photo in the grid on the right | "Hovering a post in the profile grid shows its view count." |
| 12 (optional) | Threads app › the same post › its insights | "Cross-check in the Threads app. Finch may lag by up to 5 minutes." **[VERIFY]** |

---

## Label verification (paths relative to `C:\Users\rnjsr\Downloads\Finch\`)

| Label (gloss) | Where it appears | Code |
|---|---|---|
| «로그인» (Log in) | Landing page header | `app/(finch)/(marketing)/layout.tsx:55` |
| «Google로 계속하기» (Continue with Google) | Login page | `app/(finch)/(auth-split)/login/login-form.tsx:73` |
| «지금은 임시오픈 기간입니다» / «오늘 하루 종일 보지 않기» / «닫기» | Soft-launch notice dialog | `components/layout/opening-notice.tsx:101, 115, 118` |
| «홈» (Home) | Sidebar / page title | `components/layout/sidebar.tsx:33` / `app/(finch)/(app)/dashboard/_components/dashboard-client.tsx:158` |
| «SNS» › «발행» (Publish) | Sidebar group and item | `components/layout/sidebar.tsx:51, 53` |
| «계정 및 설정» (Account & Settings) | Sidebar footer | `components/layout/sidebar.tsx:87` |
| «연결» › «SNS 계정 연결» (Connections › Connect social accounts) | Settings hub | `lib/settings/sections.ts:62, 63` |
| «채널 계정» (Channel accounts) | Settings › channels | `app/(finch)/(app)/settings/channels/page.tsx:520` |
| «Threads» (row label) | Settings row | `lib/channels.ts:7` |
| «미연결» / «연결됨» / «준비 중» / «곧 열릴 예정이에요» / «자동으로 연장돼요» | Row state | `app/(finch)/(app)/settings/channels/_lib/derive-state.ts:61, 47, 59, 59, 53` |
| «연결하면 게시물·답글 지표를 불러와요» | Unconnected hint | `app/(finch)/(app)/settings/channels/_lib/derive-state.ts:32` |
| «연결하기» / «다시 연결» / «연결 해제» / «해제하기» | Row buttons | `app/(finch)/(app)/settings/channels/page.tsx:595, 579, 589, 587` |
| «Threads로 이동하고 있어요» | Leaving dialog | `components/ui/connect-link.tsx:99` (+ `lib/josa.ts:39-44` → «로») |
| «@sding.kr 계정을 연결했어요» / «연결을 해제했어요» | Result dialog | `app/(finch)/(app)/settings/channels/page.tsx:406, 314, 408` |
| «확인» (OK) | Result dialog button | `components/ui/result-modal.tsx:114` |
| «이미 다른 핀치 계정에 연결된 계정이에요» | Error dialog | `app/(finch)/(app)/settings/channels/page.tsx:275` |
| «핀치가 요청하는 권한» | Permission disclosure | `app/(finch)/(app)/settings/channels/page.tsx:700, 707` |
| «프로필 기본 정보 조회» / «게시물 발행(카드뉴스 예약 발행)» / «계정·게시물 인사이트 조회» | Scope labels | `lib/meta/threads-oauth.ts:38-40` |
| «Threads» (top selector) / «Instagram 기준» | Topbar | `components/layout/channel-switcher.tsx:77, 33-34` |
| «팔로워» / «이번 주 조회수» / «게시물 수» / «평균 참여율» | Home cards | `app/(finch)/(app)/dashboard/_components/dashboard-client.tsx:125, 131, 136, 140` |
| «지난주 대비» | Card delta | `components/ui/stat-card.tsx:18` |
| «성과 추이» / «팔로워» / «도달» / «참여율» | Trend card | `components/dashboard/performance-trend.tsx:72, 33-35`; «도달» passed at `dashboard-client.tsx:193` |
| «이 지표의 추이 데이터가 아직 없어요…» | Empty trend tab | `components/dashboard/performance-trend.tsx:122` |
| «최근 게시물» / «조회수» / «좋아요» / «댓글» | Home table | `app/(finch)/(app)/dashboard/_components/dashboard-client.tsx:215, 231-233` |
| «텍스트» / «피드» / «캐러셀» | Post type | `app/(finch)/(app)/dashboard/_components/dashboard-client.tsx:42, 38, 41` |
| Profile card stats / «팔로워 … · 최근 7일» / hover views | Home right panel | `components/dashboard/channel-profile-panel.tsx:80-82, 103, 139-143` |
| «스레드» (strip) | Publish page | `app/(finch)/(app)/publish/_components/publish-list.tsx:307, 328` |
| «발행예약» / «발행완료» / «새 게시물 포스팅» | Publish tabs / button | `app/(finch)/(app)/publish/_components/publish-list.tsx:353, 354, 383` |
| «발행 완료» (status) | List row | `components/ui/status-pill.tsx:25` |
| «채널» / «이미지 (선택)» / «추가» / «글» / x/500 | Composer | `app/(finch)/(app)/publish/_components/post-composer.tsx:499, 533-534, 578, 612, 615`; `lib/publish-rules.ts:21, 58` |
| «발행 방식» / «지금 발행» / «예약 발행» | Composer | `app/(finch)/(app)/publish/_components/post-composer.tsx:631, 646, 663` |
| «지금 발행하기» / «예약하기» / «발행 중…» / processing note | Composer button | `app/(finch)/(app)/publish/_components/post-composer.tsx:713, 714, 708, 719` |
| «스레드에 올라갔어요» / «스레드 발행을 예약했어요» | Result dialog | `app/(finch)/(app)/publish/_components/post-composer.tsx:405, 419` |
| «알림» (bell) / «게시물이 발행됐어요» | Topbar / notification | `components/layout/topbar.tsx:156`; `lib/publish/run.ts:182` |

## API calls behind each claim

| Claim | Code |
|---|---|
| OAuth scopes: `threads_basic`, `threads_content_publish`, `threads_manage_insights` | `lib/meta/threads-oauth.ts:29-33` |
| Profile: `GET /me?fields=id,username,name,threads_profile_picture_url,threads_biography,is_verified` | `lib/meta/threads-oauth.ts:195` |
| Posts: `GET /{id}/threads?fields=id,media_type,media_url,permalink,text,timestamp,is_quote_post&limit=25` | `lib/meta/threads.ts:174-176` |
| Account insights: `views, likes, replies, reposts, quotes, clicks` for 7 days and the prior 7 days; `followers_count` (lifetime); daily `views` for 14 days | `lib/meta/threads.ts:68-71, 100, 134`; `lib/data/live.ts:674-680, 708-711` |
| Per-post insights: `views, likes, replies, reposts, quotes, shares` for the 10 newest posts | `lib/meta/threads.ts:203-205`; `lib/data/live.ts:707-709` |
| Engagement = (likes + replies + reposts + quotes) ÷ views | `lib/data/live.ts:722-724` |
| Publishing: TEXT, IMAGE or CAROUSEL (`is_carousel_item`) → poll `status` → `threads_publish` | `lib/meta/threads-publish.ts:173-228` |
| Scheduled posts publish within 5 minutes | `vercel.json` cron `publish-scheduled */5` |
| Follower alert: daily, ±max(30, 3%) | `app/api/cron/refresh-tokens/route.ts:40-41, 494-513`; `vercel.json` `0 18 * * *` |
| Disconnect deletes the row, token included | `app/(finch)/(app)/settings/channels/actions.ts:33-38` |
| Threads-side deauthorize only nulls the token and keeps the row | `app/api/auth/threads/deauthorize/route.ts:31-36` |
| Threads posts never appear on public profile pages (the Threads feed block is disabled) | `app/(finch)/(app)/links/_components/block-editor.tsx:975`; `app/(finch)/(app)/links/actions.ts:2153-2157` |
| Unique index (channel, platform_user_id) | `supabase/migrations/0004_dm_send_pipeline.sql:9-10` |

### Code references (absolute)
- `C:\Users\rnjsr\Downloads\Finch\lib\meta\threads-oauth.ts`
- `C:\Users\rnjsr\Downloads\Finch\lib\meta\threads.ts`
- `C:\Users\rnjsr\Downloads\Finch\lib\meta\threads-publish.ts`
- `C:\Users\rnjsr\Downloads\Finch\lib\data\live.ts`
- `C:\Users\rnjsr\Downloads\Finch\lib\publish\run.ts`
- `C:\Users\rnjsr\Downloads\Finch\lib\publish-rules.ts`
- `C:\Users\rnjsr\Downloads\Finch\lib\channel-availability.ts`
- `C:\Users\rnjsr\Downloads\Finch\app\api\auth\threads\start\route.ts`
- `C:\Users\rnjsr\Downloads\Finch\app\api\auth\threads\callback\route.ts`
- `C:\Users\rnjsr\Downloads\Finch\app\api\auth\threads\deauthorize\route.ts`
- `C:\Users\rnjsr\Downloads\Finch\app\api\cron\refresh-tokens\route.ts`
- `C:\Users\rnjsr\Downloads\Finch\app\(finch)\(app)\settings\channels\page.tsx`
- `C:\Users\rnjsr\Downloads\Finch\app\(finch)\(app)\settings\channels\actions.ts`
- `C:\Users\rnjsr\Downloads\Finch\app\(finch)\(app)\settings\channels\_lib\derive-state.ts`
- `C:\Users\rnjsr\Downloads\Finch\app\(finch)\(app)\publish\_components\post-composer.tsx`
- `C:\Users\rnjsr\Downloads\Finch\app\(finch)\(app)\publish\_components\publish-list.tsx`
- `C:\Users\rnjsr\Downloads\Finch\app\(finch)\(app)\publish\actions.ts`
- `C:\Users\rnjsr\Downloads\Finch\app\(finch)\(app)\dashboard\_components\dashboard-client.tsx`
- `C:\Users\rnjsr\Downloads\Finch\components\dashboard\channel-profile-panel.tsx`
- `C:\Users\rnjsr\Downloads\Finch\components\dashboard\performance-trend.tsx`
- `C:\Users\rnjsr\Downloads\Finch\components\layout\channel-switcher.tsx`
- `C:\Users\rnjsr\Downloads\Finch\components\layout\opening-notice.tsx`
- `C:\Users\rnjsr\Downloads\Finch\components\ui\connect-link.tsx`
- `C:\Users\rnjsr\Downloads\Finch\supabase\migrations\0004_dm_send_pipeline.sql`

---

## Changes made
1. **Baseline:** now `main` @ 65ddf9f; the draft cited 1b679ac.
2. **Missing scenes added.** Meta's pages require the Threads OAuth login and the permission list in **every** Threads video. The draft had them only in threads_basic, so the Threads connect flow is now in the threads_content_publish and threads_manage_insights scripts and test steps. A per-video reset step was added to §0.
3. **Removed a wrong requirement.** Opening a single post is not a Meta requirement for threads_basic. The [GAP] framing, the fallback scene and the conditional clause in the description are gone; the photo grid (images) plus the «최근 게시물» list (text) now cover what Meta asks for.
4. **Prep item 3 corrected.** The owner's main account must click «연결 해제» in Finch. Removing Finch in the Threads app keeps the row (deauthorize callback), so the unique index would still block the reviewer.
5. **Added video-post blank-tile warning.** Also added handling for the soft-launch notice, a "sign out of other Threads accounts" step, and a recording order that keeps the test post from topping the insights list.
6. **Descriptions made accurate and distinct.**
   - Named the actual endpoints.
   - Replaced "image URL" with "media URL", and dropped the unused permalink from the threads_basic claim.
   - Added the real alert threshold (30 followers and 3%).
   - Added that Threads posts never appear on public pages.
   - Stated that «게시물 수» is capped at 25, that «도달» plots views for Threads, and that weekly totals are aligned to the hour.
7. **Added test step and scenes.** An optional scheduling test with verified labels («예약하기», «스레드 발행을 예약했어요», «발행예약»), and an optional Home scene showing the new post. The publish result now uses the native Threads app, since Meta names it.
8. **Added the label and API verification tables** with file:line citations.

## Remaining [VERIFY] / [OWNER CONFIRM]
- **[VERIFY]**
  - sding.kr is a Threads Tester on app 1709021066981985 and has accepted the invite.
  - Threads › Settings › Account › Website permissions is the right menu path, and re-authorizing after removal shows the full permission list again.
  - Meta's wording on the consent screen and its approve button.
  - The Threads username is exactly sding.kr.
  - After rehearsal, the dashboard shows calls for `threads_content_publish` and `threads_manage_insights` (up to 2 days' lag).
  - The Threads deauthorize and data-deletion callback URLs are registered (APP_REVIEW §4-2-6).
  - Whether threads.net is accepted as "the native Threads app".
- **[OWNER CONFIRM]**
  - The «임시오픈» (soft-launch) notice: hide it for reviewer accounts, or keep it and close it in the video?
  - Fix the scope label «게시물 발행(카드뉴스 예약 발행)» before recording? It is visible in the threads_basic video and doesn't match «지금 발행». This is a code change: run build and lint, and redeploy before recording.
  - Team visibility: teammates can see the owner's Threads posts on Home, while Meta's threads_basic allowed usage says "visible only to the user who created them". Is the "user's own Finch workspace" wording acceptable?
  - sding.kr may hit an Instagram/Threads login checkpoint when the reviewer signs in from abroad. Settle that before submitting.
  - APP_REVIEW §2 lists «성과 분석» (Insights) and «리포트» (Reports) under threads_manage_insights, but this package excludes them. Update the doc, or relabel «Instagram 기준» (Instagram-based).
  - Optional code polish (not blocking): video thumbnails (`thumbnail_url`), the follower delta hard-coded to 0, the engagement tooltip wording, and fields that are requested but unused.
