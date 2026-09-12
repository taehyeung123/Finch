# 메타 앱 심사 녹화 가이드 (사장님용)

> 2026-09-12 작성 · 코드 기준 `e88470f` — 비동기 「지금 발행」(누르면 창이 바로 닫히고 목록에 «올리는 중»)과 줄마다 붙는 계정 칩 «@아이디» 반영.
> 이 문서의 «…» 글자는 **지금 코드에서 하나씩 찾아 확인한 화면 글자 그대로**다. 어느 파일 몇째 줄인지는 맨 아래 [부록 — 라벨 출처](#부록--라벨-출처-개발용).
> 제출서에 붙일 영어 문장은 [SUBMISSION_PACK.md](SUBMISSION_PACK.md). 일정·정본은 [../APP_REVIEW.md](../APP_REVIEW.md).
> **[사장님 확인]** = 코드로는 알 수 없어 사장님이 직접 보거나 정해야 하는 것.
> 테스트 인스타 계정 이름을 `sding.kr` 에서 바꾸면, 이 문서의 `sding.kr` 을 새 이름으로 읽으면 된다(영어 자막에는 계정 이름을 일부러 넣지 않았다).

---

## 0. 먼저 이것만 — 꼭 지킬 8가지

1. **권한 하나에 영상 하나, 모두 13편**(인스타 5 · 스레드 3 · 광고 5). 한 영상을 두 권한에 쓰지 않는다. 앞 영상의 장면을 잘라 붙이지도 않는다(로그인 장면 포함 — 매번 새로 찍는다).
2. **매 영상 핀치에서 로그아웃한 상태로 시작** → 구글 로그인 → 인스타·스레드·페이스북 연결(그쪽 로그인 + 권한 허용 화면) → 기능 화면.
3. **소리 없음. 1080p. 브라우저 너비 1440 이하**(방법은 1-4).
4. **자막은 영어**, 장면마다 한 줄. 아래 표의 **올릴 영어 자막** 칸을 그대로 쓰면 된다.
5. **비밀번호는 절대 보이면 안 된다.** 입력하는 몇 초를 잘라내거나 흐리게 덮는다. 비밀번호 칸의 «눈» 아이콘(보이기)은 누르지 않는다.
6. **심사용 구글 계정으로 찍는다.** 사장님 본계정으로 찍으면 «운영자에게만 보이는 안내»가 화면 위에 떠서 «미완성»으로 읽힌다.
7. **안 누르는 것**: 왼쪽 «레퍼런스» 묶음(«탐색»·«스크랩»·«경쟁사»), 광고 화면의 «AI 추천», «AI 진단 받기», 광고 «광고 만들기», 발행 작성 창의 «틱톡» 칩.
8. 긴 기다림(로딩)은 편집에서 잘라 2~3초만 남긴다. 한 편은 1~3분이면 충분하다.

---

## 1. 준비물

### 1-1. 계정

| 무엇 | 쓰는 영상 | 녹화 전 상태 |
|---|---|---|
| **심사용 구글 계정** | 13편 전부 | Vercel `OWNER_EMAIL` 에 **두 번째**로 들어가 있고, 핀치 로그인 → 동의 → 첫 안내까지 한 번 끝낸 상태. 해외 로그인 본인확인에 걸리지 않게 정리. [사장님 확인: 주소] |
| **인스타 프로페셔널 계정 `sding.kr`** | 1~8 | 핀치 앱의 **인스타 테스터 + 스레드 테스터** 초대를 둘 다 수락. 사장님 본계정 핀치에서는 «연결 해제»해 둔다(한 인스타 계정은 핀치 계정 하나에만 붙는다). 사진 게시물 3개 이상, 며칠 전부터 조회·좋아요가 조금 있을 것. 팔로워 100명 이상 권장 — 100명 미만이면 인스타가 팔로워 숫자를 안 줘서 «팔로워»가 0으로 보일 수 있다. [사장님 확인: 팔로워 수] |
| `sding.kr` 의 **스레드** | 6~8 | 글 3개 이상(1개는 사진 포함). **최근 9개 글에 영상이 없을 것**(영상 글은 격자에서 빈칸으로 보인다). |
| **댓글용 인스타 테스트 계정 A** | 4 | `sding.kr` 이 아닌 다른 계정. 핀치 앱 테스터 초대 수락. 개인 계정 말고 테스트용으로. |
| **댓글용 인스타 테스트 계정 B** | 5 | A와 또 다른 계정(한 사람은 24시간에 자동 DM 을 한 번만 받는다). 없으면 영상 5를 영상 4 다음 날 A로 찍는다. |
| **페이스북 계정(사장님)** | 9~13 | 핀치 앱에 역할이 있는 계정. 아래 광고 자산에 권한이 있을 것. |
| 광고 계정 | 9~13 | **비즈니스 포트폴리오(예: 주식회사 딥레드)에 들어가 있을 것** — 안 들어가 있으면 영상 13에 «비즈니스 포트폴리오에 속하지 않은 광고 계정이에요»가 뜬다. 최근 30일에 돈이 쓰인 캠페인 1개가 «게재 중», **일 예산은 최소로**. [사장님 확인: 포트폴리오 이름·예산] |
| 페이스북 페이지 | 11·12 | 광고 권한이 있는 페이지 1개. 최근 게시물 3개(글+사진). **인스타 계정이 연결돼 있을 것**(없으면 페이지 저장이 안 된다). [사장님 확인: 어느 인스타 계정이 연결됐는지] |
| 휴대폰 | 4·5·7 | 인스타 앱(받은편지함 보여 줄 계정), 스레드 앱(`sding.kr`). 폰 화면 녹화 기능을 쓸 수 있을 것. |

### 1-2. 녹화 전날까지 끝낼 것

- [ ] 마이그레이션 **0092**(자동 DM «지금 확인»)·**0093**(발행 파일 올리기)·**0094**(계정 칩)이 운영 DB에 적용돼 있다. [사장님 확인] — 0092가 없으면 «지금 확인»이 늘 «지금은 확인하지 못했어요», 0093이 없으면 발행 저장 자체가 안 된다.
- [ ] **리허설**(녹화 안 함): 인스타 사진 1장 «지금 발행» 1회, 스레드 글 «지금 발행» 1회 → 둘 다 «발행 완료»가 뜨는지.
- [ ] **리허설**: 자동 DM «지금 확인» 1회 — 이때 댓글은 A·B가 **아닌** 다른 계정으로 단다(A·B는 24시간 제한이 걸린다). 그 계정도 앱 테스터 초대를 수락한 계정이어야 DM이 확실히 간다. DM이 받은편지함의 «기본»에 오는지 «요청»에 오는지도 이때 본다.
- [ ] 광고: 녹화 **이틀 전까지** 핀치에서 Meta 광고 «다시 연결» → «광고 게시 페이지»의 «페이지 선택»에서 페이지를 **한 번 클릭**(메타 대시보드에 호출 기록이 찍혀야 제출할 수 있다 — 반영에 최대 2일).
- [ ] 인스타·스레드·페이스북 설정에서 **Finch 앱 권한을 지우는 메뉴 위치**를 한 번 찾아 둔다(2-1에서 영상마다 쓴다). [사장님 확인: 메뉴 경로]

### 1-3. 브라우저

- 크롬에 **녹화 전용 프로필**을 새로 만든다. 확장 프로그램 없음, 북마크바 숨김, 자동 번역 끔(번역 팝업이 뜨면 이 사이트는 번역하지 않게 설정).
- 녹화 프로필 크롬에 **심사용 구글 계정만 미리 로그인**해 둔다 → 핀치 로그인 때 비밀번호 없이 구글 계정 고르는 화면만 나온다.
- 녹화 프로필에서 **instagram.com·threads.net·facebook.com 은 로그아웃** 상태로 둔다(영상 안에서 로그인 장면을 보여 줘야 한다).
- 댓글 다는 쪽(A·B)은 **다른 크롬 프로필**이나 휴대폰으로. `sding.kr` 받은편지함은 휴대폰이나 또 다른 프로필로.
- Windows 알림 끄기(설정 › 시스템 › 알림 › 방해 금지), 마우스 포인터 크게(설정 › 접근성 › 마우스 포인터).

### 1-4. 녹화 프로그램 설정 (일반적인 방법)

- **프로그램**: OBS Studio(무료) 같은 화면 녹화 프로그램이면 무엇이든 된다.
- **해상도 1920×1080(1080p)**, 30fps, MP4 로 저장.
- **브라우저 너비 1440 이하 맞추기(가장 쉬운 방법)**: 1920×1080 모니터에서 Windows 설정 › 시스템 › 디스플레이 › **배율 150%**. 그러면 웹 화면 폭이 1280이 되고 글자도 커진다. 녹화는 화면 전체 1920×1080 그대로. 핀치 왼쪽 메뉴가 보이면 정상이다. 모니터가 1920×1080이 아니면 [사장님 확인 — 알려 주시면 맞는 값을 드린다].
- **소리 끄기**: 녹화 프로그램에서 마이크·데스크톱 소리를 둘 다 음소거. 편집 뒤 내보낼 때도 소리 없이.
- **자막 넣기**: 녹화 뒤 영상 편집 프로그램(예: Windows 기본 앱 Clipchamp)에서 **텍스트(글자)를 영상 위에 얹는다**. 화면 아래 가운데, 흰 글씨 + 검은 반투명 바탕, 장면마다 한 줄, 3~5초. 따로 자막 파일을 만들지 말고 영상 안에 글자로 박는다.
- **가리기**: 비밀번호·이메일 칸은 편집기의 흐림(블러) 효과로 덮거나 그 구간을 잘라낸다. 액세스 토큰(긴 영문 숫자 줄)도 흐리게.
- **휴대폰 장면**(받은편지함·스레드 앱): 폰 화면 녹화 → 편집기에서 해당 장면에 끼워 넣는다(가운데, 양옆 검은 여백이면 된다).
- **파일 이름**: `01_instagram_business_basic.mp4` … `13_business_management.mp4`(각 영상 제목 옆에 적어 두었다).

---

## 2. 공통 흐름

### 2-1. 영상마다 — 녹화 버튼 누르기 전 초기화 (화면 밖에서)

매 영상이 «연결하기» → 로그인 → 권한 허용을 새로 보여 줘야 해서, 찍기 전에 연결을 풀어 둔다.

**인스타 영상(1~5)**
1. 핀치(심사용 계정) › «계정 및 설정» › «SNS 계정 연결» › «Instagram» 줄의 «연결 해제» → 창 «연결을 해제할까요?»에서 «해제하기» → «연결을 해제했어요» → «확인».
2. 인스타그램 설정에서 Finch 앱 권한 삭제. [사장님 확인: 메뉴 경로] — 안 지우면 다음 연결 때 권한 화면이 짧게 넘어가 버릴 수 있다.
3. 녹화 프로필 크롬에서 instagram.com 로그아웃.
4. 핀치 오른쪽 위 동그란 버튼(계정 메뉴) → «로그아웃».

**스레드 영상(6~8)**: 위와 같은 순서로, 대상은 «Threads» 줄, 스레드 설정에서 Finch 삭제[사장님 확인: 경로], threads.net·instagram.com 로그아웃.

**광고 영상(9~13)**: «Meta 광고» 줄 «연결 해제» → «해제하기» → «확인» / 페이스북 설정의 비즈니스 통합에서 Finch 삭제[사장님 확인: 경로] / facebook.com 로그아웃 / 핀치 로그아웃.
⚠️ 페이스북에서 Finch를 지우면 **사장님 본계정 핀치의 광고 연결도 같이 끊긴다.** 광고 영상을 다 찍은 뒤 본계정에서 «다시 연결» 한 번(4장).

> 핀치에서 «연결 해제»해도 **자동 DM 규칙·발행한 글은 지워지지 않는다.** 영상 4에서 만든 자동화를 영상 5에서 그대로 쓴다.

### 2-2. 모든 영상의 앞부분 (공통 장면)

| 순서 | 화면에서 할 일 | 체크 |
|---|---|---|
| A | finch.ai.kr 첫 화면(로그아웃 상태) → 오른쪽 위 «로그인» | 첫 화면에 «로그인» 버튼 |
| B | «Google로 계속하기» → 잠깐 «Google로 이동하고 있어요» → 구글 계정 고르기에서 심사용 계정 클릭 → «홈» 도착 | 비밀번호 화면이 안 나와야 정상 |
| C | 왼쪽 메뉴 맨 아래 «계정 및 설정» → «연결» 묶음의 «SNS 계정 연결» | 제목 아래 «채널 계정», «광고 계정» 묶음 |
| D | 맨 아래 «핀치가 요청하는 권한»을 눌러 펼치고 → **그 영상의 권한 문구**(2-3 표)를 마우스로 가리키며 2초 | 목록이 펼쳐져 있다 |
| E | 해당 줄의 «연결하기» → 잠깐 «Instagram로 이동하고 있어요»(스레드는 «Threads로…», 광고는 «Meta 광고로…») → 그쪽 로그인(비밀번호 가림) → **권한 허용 화면에서 3초 멈춤** → 허용(모든 항목 허용) | 권한 목록이 읽힐 만큼 멈췄다 |
| F | 핀치로 돌아와 결과 창 → «확인» | 인스타·스레드는 «@sding.kr 계정을 연결했어요», 광고는 «광고 계정 1개를 연결했어요»(광고 계정이 여러 개면 숫자가 그만큼) |

- «지금은 임시오픈 기간입니다» 창은 **심사용 계정에는 안 뜬다.** 뜨면 본계정으로 찍고 있는 것 — 멈추고 계정을 확인한다.
- «채널을 연동해 볼까요?» 창이 뜨면 «다음에 할게요».
- 인스타·페이스북이 로그인 정보 저장이나 본인 확인 같은 화면을 띄우면 "나중에" 같은 버튼으로 넘기고 그 부분은 편집에서 잘라도 된다(비밀번호가 안 보이면 된다).

### 2-3. 영상마다 D단계에서 가리킬 권한 문구

| 영상 | 권한 | «핀치가 요청하는 권한» 안에서 가리킬 글자 |
|---|---|---|
| 1 | instagram_business_basic | «인스타그램» 아래 «프로필 기본 정보 조회» |
| 2 | instagram_business_manage_insights | «게시물·계정 인사이트 조회» |
| 3 | instagram_business_content_publish | «예약한 게시물 발행» |
| 4 | instagram_business_manage_comments | «댓글 조회·답글 및 비공개 답장(DM)» |
| 5 | instagram_business_manage_messages | «다이렉트 메시지 송수신» |
| 6 | threads_basic | «Threads» 아래 «프로필 기본 정보 조회» |
| 7 | threads_content_publish | «게시물 발행(카드뉴스 예약 발행)» |
| 8 | threads_manage_insights | «계정·게시물 인사이트 조회» |
| 9 | ads_read | «Meta 광고» 아래 «광고 계정·캠페인 성과 조회» |
| 10 | ads_management | «캠페인·광고 생성·수정·집행 상태 변경» |
| 11 | pages_show_list | «광고를 게시할 Facebook 페이지 목록 확인» |
| 12 | pages_read_engagement | «광고 게시 페이지의 정보·최근 게시물 확인» |
| 13 | business_management | «광고 계정이 속한 비즈니스 포트폴리오 조회» |

> 참고: 스레드 발행 문구가 «카드뉴스 예약 발행»이라 「지금 발행」과 딱 맞지는 않는다. 그대로 찍어도 되지만, 고치고 싶으면 녹화 **전에** 말씀 주시면 코드를 고쳐 배포한다. [사장님 확인]

### 2-4. 찍는 순서 (추천)

- **인스타**: 1 → 2 → 3 → (5분 이상 쉬기) → 4 → 5. 영상 4는 영상 3에서 올린 사진을 쓴다.
- **스레드**: 6 → 8 → 7. 발행(7)을 마지막에 — 먼저 올리면 조회수 0인 새 글이 인사이트 목록 맨 위에 온다.
- **광고**: 9 → 13 → 11 → 12 → 10. 돈이 나갈 수 있는 10을 마지막에.

---

## 3. 영상별 대본 (13편)

표 읽는 법: **화면에서 할 일**의 «…»는 누를 버튼·보일 글자 그대로. **올릴 영어 자막**은 그 장면 동안 한 줄. **체크**는 그 장면에서 화면에 꼭 보여야 하는 것.

---

### 영상 1 — instagram_business_basic · `01_instagram_business_basic.mp4`

**이 영상에서 꼭 보여야 하는 것 (메타 요구)**
- 핀치 로그아웃 상태 → 로그인까지 전부
- 인스타그램 로그인 화면과 권한 허용 화면(사용자가 허용하는 장면)
- 연결된 계정의 아이디·이름·사진, 그리고 그 계정의 게시물이 핀치 화면에 보이는 것

| 장면 | 화면에서 할 일 | 올릴 영어 자막 | 체크 |
|---|---|---|---|
| 1 | finch.ai.kr 첫 화면(로그아웃) → «로그인» | Finch is a web app for Instagram creators. We start logged out. | «로그인» 버튼 |
| 2 | «Google로 계속하기» → «Google로 이동하고 있어요» → 심사용 계정 클릭 | Sign in to Finch with the test Google account. | «홈» 도착 |
| 3 | «홈»을 아래로 내려 «내 계정» | No Instagram account is connected yet. | Instagram 카드가 «미연동»(또는 «연동된 계정이 없습니다») |
| 4 | 왼쪽 맨 아래 «계정 및 설정» → «SNS 계정 연결» | Open Account & Settings, then Connect social accounts. | «Instagram» 줄 «미연결», 안내 «비즈니스·크리에이터 계정만 연결할 수 있어요» |
| 5 | «핀치가 요청하는 권한» 펼치기 → «프로필 기본 정보 조회» 가리키기 | Finch lists every permission it asks for, starting with basic profile info. | 권한 목록 펼쳐짐 |
| 6 | «Instagram» 줄 «연결하기» → «Instagram로 이동하고 있어요» | Connect starts Instagram Login. No Facebook Page is needed. | 이동 안내 창 |
| 7 | 인스타 로그인 화면: 아이디 `sding.kr`, 비밀번호(가림) → 로그인 | Instagram's own login screen (password hidden). | 비밀번호 칸 흐림 |
| 8 | 인스타 권한 화면에서 3초 멈춤 → 허용 | The account owner grants instagram_business_basic. | 권한 목록이 읽힘 |
| 9 | «@sding.kr 계정을 연결했어요» → «확인» | Connected. We are back in Finch. | 결과 창 |
| 10 | «Instagram» 줄을 가리키기 | Username, name and profile photo come from GET /me. | 프로필 사진, «연결됨», «@sding.kr · (이름)», «자동으로 연장돼요» |
| 11 | 왼쪽 «홈» → «내 계정»의 Instagram 카드 | Home shows the linked profile with its follower and post counts. | 사진, 이름, «연동됨», «팔로워», «게시물» |
| 12 | 화면 위쪽 채널 칩 «Instagram» 클릭 → 오른쪽 프로필 칸의 소개와 게시물 격자 | Recent posts are read with GET /{ig-user-id}/media. | 소개 글, 3×3 격자 |
| 13 | 새 탭에 instagram.com/sding.kr | The same profile and posts on Instagram itself. | 같은 사진·소개·게시물 |
| 14 | «SNS 계정 연결»로 돌아와 «연결 해제»를 **가리키기만** | The user can disconnect at any time; the stored token is then deleted. | 누르지 않는다 |

**하지 말 것**
- 홈 위쪽 «오늘의 핀치», «오늘의 아카이빙 현황»에서 멈추지 말 것(인스타 권한과 무관한 기능이다 — 스크롤로 지나간다).
- «레퍼런스» 메뉴 금지. «연결 해제»는 누르지 않는다.

---

### 영상 2 — instagram_business_manage_insights · `02_instagram_business_manage_insights.mp4`

**이 영상에서 꼭 보여야 하는 것 (메타 요구)**
- 로그인 전부 + 인스타 로그인·권한 허용 장면
- 연결한 계정의 인사이트(도달·조회수·참여·팔로워 변화 등)가 핀치 화면에 보이는 것 — 계정 단위와 게시물 단위 둘 다

| 장면 | 화면에서 할 일 | 올릴 영어 자막 | 체크 |
|---|---|---|---|
| 1 | 첫 화면(로그아웃) → «로그인» | Recording starts logged out at finch.ai.kr. | «로그인» 버튼 |
| 2 | «Google로 계속하기» → 심사용 계정 → «홈» | Google sign-in with the test account. | «홈» |
| 3 | «계정 및 설정» → «SNS 계정 연결» → «핀치가 요청하는 권한» → «게시물·계정 인사이트 조회» | Finch requests access to post and account insights. | 권한 문구 |
| 4 | «Instagram» «연결하기» → 인스타 로그인(비밀번호 가림) | The owner logs in to Instagram. | 비밀번호 흐림 |
| 5 | 권한 화면 3초 → 허용 → «@sding.kr 계정을 연결했어요» → «확인» | The owner grants instagram_business_manage_insights. | 결과 창 |
| 6 | «홈» → 위쪽 «Instagram» 칩 → 카드 «팔로워», «이번 주 조회수», «게시물 수», «평균 참여율» | Home, Instagram only: followers, weekly views and engagement. | 숫자들이 보임 |
| 7 | «성과 추이»에서 «도달» 탭 클릭(팔로워 100명 이상이면 «팔로워» 탭도) | A 14-day trend built from Instagram's daily insights. | 선 그래프 |
| 8 | 아래 «최근 게시물» 표 — «조회수», «좋아요», «댓글» 열 | Views for each post come from GET /{ig-media-id}/insights. | 표 |
| 9 | 왼쪽 «성과 분석» → «개요» 탭 → 제목 «팔로워 분석» | Performance analytics, Overview tab. | 위쪽 «Instagram 기준» |
| 10 | 카드 «도달», «참여 계정», «팔로워 순증감», «프로필 링크 클릭»과 «직전 7일 대비» → «14일» 클릭 | Reach, accounts engaged and link taps against the previous period. | 비교 문구 |
| 11 | 아래 «일별 도달», «일별 팔로워 순증감» 그래프 — 그 아래로는 내려가지 않는다 | Daily reach and net follower change. | 그래프 2개 |
| 12 | «내 게시물» 탭 → «성장 진단»의 «평균 저장률», «평균 참여율», «평균 도달», «분석 게시물» → 아래 «게시물별 성과» 표(«저장률»·«참여율»·«도달»·«저장») | My posts: recent posts ranked by save rate. | 표 |
| 13 | 끝 화면 | Insights are read only for the connected account. | — |

**하지 말 것**
- «성과 추이»의 «참여율» 탭(그래프 대신 안내 글이 나온다), «평균 참여율» 옆 «?» 설명 창 열기.
- «AI 진단 받기» 누르기. «개요» 맨 아래 «자주 반응하는 사람 Top 8»까지 내려가기(늘 비어 있다).
- «내 게시물»이 «진단할 게시물이 아직 부족해요»면 → 최근 게시물 3개 이상에 조회가 있어야 한다. 며칠 뒤 다시 찍는다.

---

### 영상 3 — instagram_business_content_publish · `03_instagram_business_content_publish.mp4`

**이 영상에서 꼭 보여야 하는 것 (메타 요구)**
- 로그인 전부 + 인스타 로그인·권한 허용 장면
- 핀치에서 게시물 만들기(사진 + 캡션 + 해시태그) → 발행
- 결과가 **핀치 화면**(«발행 완료»)과 **인스타그램**(실제 게시물) 양쪽에 보이는 것

준비: 정사각형 JPG 사진 1장(핀치 로고 등, 사람 얼굴 없이).

| 장면 | 화면에서 할 일 | 올릴 영어 자막 | 체크 |
|---|---|---|---|
| 1 | 첫 화면(로그아웃) → «로그인» | Starting logged out. | «로그인» 버튼 |
| 2 | «Google로 계속하기» → 심사용 계정 → «홈» | Sign in with the Google test account. | «홈» |
| 3 | «SNS 계정 연결» → «핀치가 요청하는 권한» → «예약한 게시물 발행» | Finch asks permission to publish posts for the user. | 권한 문구 |
| 4 | «Instagram» «연결하기» → 인스타 로그인(비밀번호 가림) | Instagram login for the account owner. | 비밀번호 흐림 |
| 5 | 권한 화면 3초 → 허용 → «@sding.kr 계정을 연결했어요» → «확인» | The owner grants instagram_business_content_publish. | 결과 창 |
| 6 | 왼쪽 «발행» → 화면 위 연결 줄 | The Publish screen shows which Instagram account will post. | «인스타그램» 밑에 «@sding.kr» |
| 7 | «새 게시물 포스팅» 클릭 → 창 «새 게시물 포스팅» | Open the New post editor. Instagram is selected. | «채널»에서 «인스타그램»이 골라져 있음 |
| 8 | «사진·영상»의 «추가» 칸 → 사진 1장 선택 | Add one photo. It uploads to Finch's own storage. | 사진 칸에 «사진» 표시, «1/10», 아래 «사진 게시물로 올라가요» |
| 9 | «캡션» 칸에 입력: `Posted from Finch for Meta app review #finch #test` | Write the caption and hashtags. | 글자 수 표시 |
| 10 | «발행 방식»에서 «예약 발행»(처음 선택값) → **«지금 발행»** 선택 | Choose Publish now. Nothing is posted until the user clicks. | 설명 «누르면 바로 올리기 시작해요. 이 화면을 나가도 계속 올라가요. …» |
| 11 | **«지금 발행하기»** 클릭 → 창이 곧 닫힘(잠깐 «발행을 시작하고 있어요»가 보일 수 있음) → 아래쪽 알림 **«인스타그램에 올리기 시작했어요»** | Finch starts posting on its server right after the click. | 알림 설명 «화면을 나가도 계속 올라가요. 진행 상황은 오늘 날짜 목록에서 볼 수 있고…» |
| 12 | 오른쪽 **오늘 날짜 목록 맨 위 줄**을 가리키기 | The post shows Posting, with the account it goes to. | 썸네일 위 도는 표시, 상태 **«올리는 중»**, 인스타 로고 + **«@sding.kr»** 칩, «방금 시작 · 화면을 나가도 계속 올라가요» |
| 13 | 몇 초 기다림(편집에서 줄이기) → 상태가 **«발행 완료»**로 바뀜 + 알림 **«인스타그램에 올라갔어요»** | Instagram published it. The status is now Published. | «발행 완료» |
| 14 | 그 줄 오른쪽 **바깥 화살표 아이콘**에 마우스 → 작은 글씨 «게시물 보기» → 클릭 | View post opens the new post on Instagram. | «게시물 보기» 글자 |
| 15 | 새 탭 instagram.com 게시물 | The same photo, caption and hashtags are live on Instagram. | @sding.kr 게시물, 같은 사진·캡션 |
| 16 (선택) | 핀치로 돌아와 오른쪽 위 종(알림) → «게시물이 발행됐어요» | Finch also sends an in-app notification. | 알림 목록 |

**하지 말 것**
- «채널»의 «틱톡»(«준비 중») 칩을 누르거나 가리키지 않는다. «스튜디오에서 만들기»도 누르지 않는다.
- 영상·여러 장(캐러셀)·«스토리로 올리기»는 이번 영상에 넣지 않는다(권한은 같지만 필요 없고 처리 시간이 길다).
- 발행 도중 새로고침하지 않는다(해도 서버는 계속 올리지만 화면이 흐트러진다).

**이럴 땐**
- «지금 발행하기»가 흐리고 아래에 «파일을 올리는 중이에요 — 0/1» → 사진이 다 올라갈 때까지 잠깐 기다린다.
- 상태가 «처리 중»(«1분째 · 끝나면 자동으로 올라가요»)이면 → 기다렸다가 «발행 완료»가 되면 계속 찍는다(기다린 구간은 잘라낸다).
- 화살표 아이콘이 없으면 → 새 탭에서 instagram.com/sding.kr 을 열어 가장 최근 게시물을 누른다.
- «발행 실패»(빨간 줄) 또는 알림 «인스타그램에 올리지 못했어요» → 녹화를 멈추고 화면을 캡처해 Claude에게.

---

### 영상 4 — instagram_business_manage_comments · `04_instagram_business_manage_comments.mp4`

**이 영상에서 꼭 보여야 하는 것 (메타 요구)**
- 로그인 전부 + 인스타 로그인·권한 허용 장면
- 핀치가 댓글을 읽고 답하는 것, 그리고 그 결과가 **핀치와 인스타그램 양쪽**에 보이는 것 — 인스타에서는 댓글 아래 공개 답글, 댓글 쓴 사람의 받은편지함에 DM

준비: 영상 3의 사진이 `sding.kr` 에 올라가 있고 5분 이상 지났다. 심사용 계정에 자동화가 **하나도 없다**(있으면 휴지통 아이콘 → «이 자동화를 지울까요?» → «삭제»). 댓글 계정 **A**가 다른 크롬 프로필이나 폰에 로그인돼 있다.

| 장면 | 화면에서 할 일 | 올릴 영어 자막 | 체크 |
|---|---|---|---|
| 1 | 첫 화면(로그아웃) → «로그인» | We begin logged out. | «로그인» 버튼 |
| 2 | «Google로 계속하기» → 심사용 계정 → «홈» | Log in to Finch with the Google test account. | «홈» |
| 3 | «SNS 계정 연결» → «핀치가 요청하는 권한» → «댓글 조회·답글 및 비공개 답장(DM)» | Finch asks to read comments and reply to them. | 권한 문구 |
| 4 | «Instagram» «연결하기» → 인스타 로그인(비밀번호 가림) | Instagram login, password hidden. | 비밀번호 흐림 |
| 5 | 권한 화면 3초 → 허용 → «@sding.kr 계정을 연결했어요» → «확인» | The owner grants instagram_business_manage_comments. | 결과 창. «댓글 자동 DM을 쓰시려면 다시 연결해 주세요.»가 보이면 다시 찍기 |
| 6 | 왼쪽 «자동 DM» → «아직 자동 DM 규칙이 없어요» → «첫 자동화 만들기» | Auto DM: the owner decides which comments get answered. | 위쪽 «Instagram 전용» |
| 7 | «어떤 게시물을 자동화할까요?» → «현재 게시물에서 선택할게요» → 영상 3 사진 클릭 → «다음» | Step 1: pick one of the owner's own posts. | 사진에 선택 표시 |
| 8 | «어떤 댓글에 DM을 보낼까요?» → «특정 키워드에 발송할게요» → `link` 입력 → «추가» → «다음» | Step 2: answer only comments that contain "link". | 키워드 칩 link |
| 9 | «DM 메시지를 작성해주세요» → «메시지 입력»: `Hi! Here is the link you asked for: https://finch.ai.kr (automated reply)` → «메시지 버튼»을 «없음»으로 → «다음» | Step 3: the private reply the commenter will receive. | «없음» 선택됨 |
| 10 | «게시물 댓글에 대하여, 자동 답글을 남길까요?» → «네, 답글을 남기고 싶어요» → 미리 들어간 한국어 답글 3개 중 2개를 X로 지우고 남은 1개를 `Thanks! We just sent you a DM.`로 바꿈 → «다음» | Step 4: an optional public reply under the comment. | 답글 1개 |
| 11 | «최종 검수» → «확인» | Review everything, then save. | «선택한 인스타 게시물», «감지될 키워드», «보내질 DM 메시지», «자동으로 답글 달기» 켜짐 |
| 12 | 자동화 카드 가리키기 | The automation is now running. | «실행 중», «키워드 :» link, «자동 답글 : ON», «발송 전», 버튼 «지금 확인» |
| 13 | 계정 A 화면: `sding.kr` 의 그 사진에 댓글 `Can you send me the link?` | Another Instagram account comments with the keyword. | 댓글이 달림 |
| 14 | 핀치 «지금 확인» → «댓글을 확인하고 있어요…» → **«DM 1개를 보냈어요»** → «확인» | Check now reads the comments and sends one private reply. | 설명 «댓글 1개 확인 · DM 1개 보냄 · 건너뜀 0개» |
| 15 | 자동화 카드 | Finch records the result on the automation. | «누적 1건», «오늘 1/300», «방금 전 발송» |
| 16 | `sding.kr` 쪽 인스타(폰 또는 새 탭)에서 그 사진 새로고침 → 댓글 아래 답글 | On Instagram, the public reply appears under the comment. | `sding.kr` 의 답글 |
| 17 | 계정 A의 인스타 DM 받은편지함(기본함 또는 «요청») → `sding.kr` 대화 | The commenter received the private reply in Instagram Direct. | 장면 9에서 쓴 메시지 |
| 18 | 30초 이상 지난 뒤 핀치 «지금 확인» 한 번 더 → «새로 보낼 DM이 없었어요» | Checking again never answers the same comment twice. | «건너뛴 이유: 이미 처리함 1» |
| 19 | 끝 화면 | Finch never hides, edits or deletes comments. | — |

**하지 말 것**
- `sding.kr` 자신이 댓글을 달지 말 것(자기 댓글은 무시된다).
- 30초 안에 «지금 확인»을 두 번 누르지 말 것(«방금 확인했어요»가 뜬다).
- 자동화 화면 위쪽 작은 줄 «최근 30일 … 발송 · 평균 응답률 …»을 가리키지 말 것(늘 0으로 나오는 요약이다).

**이럴 땐**
- 장면 14에서 처음부터 «새로 보낼 DM이 없었어요» + «건너뛴 이유: 이미 처리함 1»이 나오면 → 댓글 알림(웹훅)이 먼저 DM을 보낸 것이다. 그대로 계속 찍고, 장면 14 자막을 `The comments webhook already answered it in real time; Check now confirms it.`로 바꾼다.
- «건너뛴 이유»에 «발송 제한»이 나오면 → A가 24시간 안에 이미 자동 DM을 받았다. 다른 계정으로 다시.
- 영상 3의 사진이 목록에 안 보이면 → 5분 뒤 다시 연다.

---

### 영상 5 — instagram_business_manage_messages · `05_instagram_business_manage_messages.mp4`

**이 영상에서 꼭 보여야 하는 것 (메타 요구)**
- 로그인 전부 + 인스타 로그인·권한 허용 장면
- **핀치가 보낸 메시지가 인스타그램 받은편지함에 보이는 것**
- **메시지 보내기 요청(cURL)을 만들어 보내는 장면** — 메타 앱 대시보드의 API 연동 도우미(API Integration Helper)를 써도 된다(메타 권한 안내)

준비: 영상 4의 자동화가 남아 있다. 댓글 계정 **B**(A와 다른 계정 — 없으면 영상 4 다음 날 A로). 메타 앱 대시보드를 다른 창에 로그인해 열어 둔다(대시보드 로그인 장면은 필요 없다). `sding.kr` 받은편지함을 볼 폰.

| 장면 | 화면에서 할 일 | 올릴 영어 자막 | 체크 |
|---|---|---|---|
| 1 | 첫 화면(로그아웃) → «로그인» | Logged out at the start. | «로그인» 버튼 |
| 2 | «Google로 계속하기» → 심사용 계정 → «홈» | Sign in through Google. | «홈» |
| 3 | «SNS 계정 연결» → «핀치가 요청하는 권한» → «다이렉트 메시지 송수신» | Finch asks to send and receive Direct messages. | 권한 문구 |
| 4 | «Instagram» «연결하기» → 인스타 로그인(비밀번호 가림) | Instagram login for the business account. | 비밀번호 흐림 |
| 5 | 권한 화면 3초 → 허용 → «@sding.kr 계정을 연결했어요» → «확인» | The owner grants instagram_business_manage_messages. | 결과 창 |
| 6 | «자동 DM» → 카드의 연필 아이콘(편집) → 창 «자동화 수정» → «다음» 두 번 → «DM 메시지를 작성해주세요» | The owner edits the message Finch will send. | 메시지 칸 |
| 7 | «메시지 입력»을 지우고 입력: `Hi! Here's the Finch guide you asked for. (automated reply)` 줄바꿈 `수신거부는 이 메시지에 '수신거부'라고 답장해 주세요.` → «메시지 버튼» «없음» | The last line tells people how to opt out. | 두 줄 |
| 8 | «다음» 두 번 → «최종 검수» → «변경 저장» | Save the change. | 카드로 돌아옴 |
| 9 | 계정 B 화면: 같은 사진에 댓글 `link please` | A second test account comments with the keyword. | 댓글 |
| 10 | 핀치 «지금 확인» → «DM 1개를 보냈어요» → «확인» | Finch sends the message with POST /{ig-user-id}/messages. | 결과 창 |
| 11 | 계정 B의 인스타 DM 받은편지함 → `sding.kr` 대화 | The message Finch sent, in the recipient's Instagram inbox. | 메시지 두 줄 그대로 |
| 12 | 폰: `sding.kr` 인스타 받은편지함 → 같은 대화 | The same conversation in the business account's inbox. | 같은 메시지 |
| 13 | 계정 B가 `Thanks!` 답장 → 폰 `sding.kr` 받은편지함에 보임 | The reply lands in the business's normal Instagram inbox. | 답장 |
| 14 | 메타 앱 대시보드 › 인스타그램 › **API 연동 도우미**: `sding.kr` 선택 → B와의 대화 선택 → 메시지 `Test message via the Instagram API (Finch app review)` → 요청(cURL) 만들기 → 보내기. **토큰은 흐리게**. [사장님 확인: 메뉴 위치·받는 사람 고르는 법] | Meta's API Integration Helper builds the send request (token hidden). | 응답에 `message_id` |
| 15 | 계정 B 받은편지함에 그 메시지 도착 | The API message arrives in Instagram Direct. | 새 메시지 |
| 16 | 30초 이상 뒤 계정 B가 `link again` 댓글 → 핀치 «지금 확인» → «새로 보낼 DM이 없었어요» | At most one automated DM per person every 24 hours. | «건너뛴 이유: 이미 처리함 1 · 발송 제한 1», 설명 «발송 제한은 하루 상한·수신거부·24시간 안에 이미 받은 사람 같은 안전장치예요.» |
| 17 | 계정 B가 DM 대화에 `수신거부` 답장 | Replying "수신거부" (unsubscribe) opts this person out. | 답장 |
| 18 | 끝 화면 | Finch messages only people who commented, and never after they opt out. | — |

**하지 말 것**
- 장면 16 전에 30초를 꼭 기다린다.
- 받은편지함 화면에 다른 사람과의 대화·개인 정보가 보이면 흐리게.

**선택 (리허설에서 확인했을 때만)**
- 장면 7에서 «메시지 버튼»을 «1개»로 하고 «1번째 버튼 링크 설정»에 «버튼 입력» `Open guide`, «URL 입력» `https://finch.ai.kr` → 아래 버튼 «1/1 링크 설정 완료». 이때 같은 화면의 «내 링크 불러오기 (준비 중)»은 가리키지 않는다. 버튼 메시지가 리허설에서 안 오면 «없음»으로 찍는다.

---

### 영상 6 — threads_basic · `06_threads_basic.mp4`

**이 영상에서 꼭 보여야 하는 것 (메타 요구)**
- 스레드 로그인과 권한 허용 장면 전부
- 핀치 안에서 스레드 계정을 연결하는 과정 전체와, 무슨 권한을 요청하는지
- 가져온 **내 글 목록**이 글·사진과 함께 보이는 것

| 장면 | 화면에서 할 일 | 올릴 영어 자막 | 체크 |
|---|---|---|---|
| 1 | 첫 화면(로그아웃) → «로그인» | Finch, signed out. We start on the homepage. | «로그인» 버튼 |
| 2 | «Google로 계속하기» → 심사용 계정 → «홈» | Sign in with Continue with Google. | «홈» |
| 3 | «계정 및 설정» → «SNS 계정 연결» → «Threads» 줄 | Connect social accounts: Threads is not connected yet. | «미연결» |
| 4 | «핀치가 요청하는 권한» → «Threads» 아래 3줄 → «프로필 기본 정보 조회» 가리키기 | Finch shows each Threads permission it requests. | 3줄 목록 |
| 5 | «Threads» «연결하기» → «Threads로 이동하고 있어요» → 스레드 로그인(비밀번호 가림) | Connect opens Threads Login. | 비밀번호 흐림 |
| 6 | 스레드 권한 화면 3~4초 → 허용 | The user approves threads_basic. | 권한 목록 |
| 7 | «@sding.kr 계정을 연결했어요» → «확인» | Back in Finch: Threads is connected. | 결과 창 |
| 8 | «Threads» 줄 가리키기 | Profile name and photo come from threads_basic. | «연결됨», 사진, «@sding.kr · (이름)», «자동으로 연장돼요» |
| 9 | «홈» → 위쪽 «Threads» 칩 → 오른쪽 프로필 칸 | Home, Threads view: the linked profile and bio. | 사진·이름·소개 |
| 10 | 프로필 칸 아래 사진 격자를 천천히 | The user's own recent threads with their photos. | 사진 격자 |
| 11 | 아래 «최근 게시물» | Each row is one of the user's threads: text, type and time. | 글, 종류(«텍스트»·«피드»·«캐러셀»), 시간 |
| 12 (선택) | 새 탭 threads.net/@sding.kr | The same threads on Threads itself. | 같은 글 |

**하지 말 것**
- 왼쪽 «성과 분석», «리포트»에 가지 않는다(인스타 기준 화면이다).
- 스레드에 새 글을 올리지 않는다(발행은 영상 7).

---

### 영상 7 — threads_content_publish · `07_threads_content_publish.mp4`

**이 영상에서 꼭 보여야 하는 것 (메타 요구)**
- 스레드 로그인·권한 허용 장면 + 핀치 안의 연결 과정
- 글(과 사진)로 게시물 만들기 → 발행
- 결과가 **핀치 화면**과 **스레드 앱(휴대폰)** 양쪽에 보이는 것

준비: 사진 1장(선택). 폰에 스레드 앱(`sding.kr`) + 폰 화면 녹화.

| 장면 | 화면에서 할 일 | 올릴 영어 자막 | 체크 |
|---|---|---|---|
| 1 | 첫 화면(로그아웃) → «로그인» | Signed out of Finch; we sign in first. | «로그인» 버튼 |
| 2 | «Google로 계속하기» → 심사용 계정 → «홈» | Google sign-in to Finch. | «홈» |
| 3 | «SNS 계정 연결» → «핀치가 요청하는 권한» → «게시물 발행(카드뉴스 예약 발행)» | Finch asks permission to post to Threads. | 권한 문구 |
| 4 | «Threads» «연결하기» → 스레드 로그인(비밀번호 가림) → 권한 화면 3초 → 허용 | The user approves threads_content_publish. | 권한 목록 |
| 5 | «@sding.kr 계정을 연결했어요» → «확인» | Threads is now linked. | 결과 창 |
| 6 | 왼쪽 «발행» → 위쪽 연결 줄 | The Publish screen shows the Threads account. | «스레드» 밑에 «@sding.kr» |
| 7 | «새 게시물 포스팅» → «채널»에서 **«스레드»** 클릭(처음엔 «인스타그램»이 골라져 있을 수 있다) | Destination: Threads. | «사진·영상 (선택)» «0/20», 안내 «사진·영상 최대 20개 · 영상은 5분까지 · 글만 올려도 돼요» |
| 8 | «추가» → 사진 1장(선택) | A photo is optional. | 사진 칸 «사진», 아래 막대가 끝남 |
| 9 | «글» 칸에 `Finch app review test: posting to Threads from Finch.` | Write the post (up to 500 characters). | «…/500» |
| 10 | «지금 발행» 선택 → **«지금 발행하기»** | Publish now. | 버튼 클릭 |
| 11 | 창이 닫히고 알림 **«스레드에 올리기 시작했어요»** → 오른쪽 오늘 목록 맨 위 줄 | Finch creates the Threads container and publishes it. | **«올리는 중»**, 스레드 로고 + **«@sding.kr»** 칩 |
| 12 | 몇 초 뒤 **«발행 완료»** + 알림 **«스레드에 올라갔어요»** | Published. | «발행 완료» |
| 13 | 줄 오른쪽 화살표 아이콘(«게시물 보기») 클릭 → 새 탭 threads.net | View post opens the thread on Threads. | 같은 글 |
| 14 | **폰 화면 녹화**: 스레드 앱 → `sding.kr` 프로필 맨 위 같은 글 | The same post, live in the Threads app. | 같은 글·사진 |
| 15 (선택) | 핀치 «홈» → «Threads» → «최근 게시물» 맨 위 | It also appears in the user's recent threads in Finch. | 새 글 (안 보이면 5분 뒤) |

**하지 말 것**
- «인스타그램» 채널로 올리지 않는다(영상 3과 섞인다). «틱톡» 칩도 누르지 않는다.
- 영상 파일을 올리지 않는다(스레드 격자에서 빈칸이 된다).

**이럴 땐**
- 사진 글이 리허설에서 실패하면 → 글만 올린다(메타는 «글·사진·영상 중 하나»로 본다).
- «처리 중»이 뜨면 → «발행 완료»까지 기다리고 기다린 구간은 잘라낸다.

---

### 영상 8 — threads_manage_insights · `08_threads_manage_insights.mp4`

**이 영상에서 꼭 보여야 하는 것 (메타 요구)**
- 스레드 로그인·권한 허용 장면 + 핀치 안의 연결 과정
- **계정 지표**(팔로워·참여·조회)와 **게시물 지표**(좋아요·댓글 등)가 핀치에 보이는 것

| 장면 | 화면에서 할 일 | 올릴 영어 자막 | 체크 |
|---|---|---|---|
| 1 | 첫 화면(로그아웃) → «로그인» | Start: not signed in to Finch. | «로그인» 버튼 |
| 2 | «Google로 계속하기» → 심사용 계정 → «홈» | Sign in with the Google test account. | «홈» |
| 3 | «SNS 계정 연결» → «핀치가 요청하는 권한» → «계정·게시물 인사이트 조회» | Finch asks to read Threads account and post insights. | 권한 문구 |
| 4 | «Threads» «연결하기» → 스레드 로그인(비밀번호 가림) → 권한 화면 3초 → 허용 | The user approves threads_manage_insights. | 권한 목록 |
| 5 | «@sding.kr 계정을 연결했어요» → «확인» | Connected. Finch can now read this account's insights. | 결과 창 |
| 6 | «홈» → «Threads» 칩 → «팔로워» 카드 | Followers: the current total from Threads insights. | 숫자 |
| 7 | «이번 주 조회수»와 «지난주 대비» | Views in the last 7 days, compared with the 7 days before. | 비교 문구 |
| 8 | «평균 참여율» 가리키기(«?»는 열지 않음) | Engagement rate = (likes + replies + reposts + quotes) ÷ views. | 퍼센트 |
| 9 | «성과 추이» → **«도달»** 탭 클릭(처음 열린 «팔로워» 탭은 비어 있으니 바로 넘어간다) | For Threads, this chart shows daily views over 14 days. | 선 그래프 |
| 10 | 아래 «최근 게시물» 표의 «조회수»·«좋아요»·«댓글» | Post-level insights: views, likes and replies per thread. | 표 |
| 11 | 오른쪽 사진 격자 한 장에 마우스 올리기 | Hovering a post shows its view count. | 조회수 표시 |
| 12 (선택) | 폰 스레드 앱에서 같은 글의 인사이트 | Cross-check in the Threads app (Finch may lag up to 5 minutes). | 비슷한 숫자 |

**하지 말 것**
- «성과 분석», «리포트»에 가지 않는다.
- «게시물 수»를 "전체 게시물 수"라고 자막에 쓰지 않는다(최근 글 최대 25개를 센 값이다).

---

### 영상 9 — ads_read · `09_ads_read.mp4`

**이 영상에서 꼭 보여야 하는 것 (메타 요구)**
- 로그인 전부 + 페이스북 로그인과 광고 권한 허용 장면
- 광고 데이터(노출·지출·클릭·도달·전환 등)가 핀치 화면에 보이는 것

| 장면 | 화면에서 할 일 | 올릴 영어 자막 | 체크 |
|---|---|---|---|
| 1 | 첫 화면(로그아웃) → «로그인» | How Finch uses ads_read. We start logged out. | «로그인» 버튼 |
| 2 | «Google로 계속하기» → 심사용 계정 → «홈» | Sign in to Finch with Google. | «홈» |
| 3 | «SNS 계정 연결» → 아래 «광고 계정» 묶음 → «Meta 광고» 줄 | Meta Ads is not connected yet. | «미연결» |
| 4 | «핀치가 요청하는 권한» → «Meta 광고» 아래 «광고 계정·캠페인 성과 조회» | Finch asks to view ad accounts and campaign results. | 권한 문구 |
| 5 | «Meta 광고» «연결하기» → «Meta 광고로 이동하고 있어요» → 페이스북 로그인(이메일·비밀번호 가림) | Facebook Login for the Finch app. | 가림 처리 |
| 6 | 페이스북 화면에서 비즈니스·페이지·광고 계정을 고르고 → 광고 권한이 나온 화면에서 3초 → 허용 | The user grants Finch access to their ads data. | 권한 목록 |
| 7 | «광고 계정 1개를 연결했어요» → «확인» | One ad account is connected. | «Meta 광고» 줄 «연결됨» + 광고 계정 이름 |
| 8 | 왼쪽 «광고 관리» → 부제 «(광고 계정 이름) · 최근 30일», 카드 4개 | Last-30-day totals from Meta Insights. | «집행 금액 (최근 30일)», «노출수 (최근 30일)», «평균 CTR», «평균 ROAS» |
| 9 | «캠페인 성과» 표의 열 제목 위로 마우스를 천천히 | Per campaign: budget, spend, impressions, reach, clicks, CTR, ROAS. | «일 예산»·«집행액»·«노출»·«도달»·«링크 클릭»·«CTR»·«CPC»·«전환»·«ROAS» |
| 10 | «홈» → 오른쪽 «광고 현황» 카드 | Home puts paid results next to organic ones. | «집행 금액», «진행 중 캠페인», «평균 ROAS» |
| 11 (선택) | 메타 광고 관리자 탭(기간 최근 30일)에서 같은 캠페인 | The same campaign in Meta Ads Manager. | 비슷한 숫자 |

**하지 말 것**
- «캠페인 성과» 아래 «AI 추천»(«준비 중» 표시)까지 내려가지 않는다.
- «캠페인 관리»에서 아무것도 바꾸지 않는다(그건 영상 10).
- «전환»이 «미추적»이면 전환 숫자를 자막에 쓰지 않는다(구매가 없으면 그렇게 나온다).

---

### 영상 10 — ads_management · `10_ads_management.mp4`

> ⚠️ **돈이 나갈 수 있다.** 캠페인을 다시 켜면(«게재 시작») 그 순간부터 광고비가 나간다. 일 예산이 가장 작은 캠페인으로 찍는다. 녹화가 끝나면 원래 상태로 둘지 끌지 정한다. [사장님 확인]

**이 영상에서 꼭 보여야 하는 것 (메타 요구)**
- 로그인 전부 + 페이스북 로그인과 광고 관리 권한 허용 장면
- 광고 데이터(지출·노출 등)를 보고, **핀치에서 캠페인을 실제로 바꾸는 것**(끄기 → 켜기)

| 장면 | 화면에서 할 일 | 올릴 영어 자막 | 체크 |
|---|---|---|---|
| 1 | 첫 화면(로그아웃) → «로그인» | ads_management in Finch. The recording starts signed out. | «로그인» 버튼 |
| 2 | «Google로 계속하기» → 심사용 계정 → «홈» | Log in to Finch using Google. | «홈» |
| 3 | «SNS 계정 연결» → «핀치가 요청하는 권한» → «캠페인·광고 생성·수정·집행 상태 변경» | Finch says it will create and edit campaigns and change delivery. | 권한 문구 |
| 4 | «Meta 광고» «연결하기» → 페이스북 로그인(가림) → 광고 관리 권한 화면 3초 → 허용 | Facebook Login: the user lets Finch manage their ads. | 권한 목록 |
| 5 | «광고 계정 1개를 연결했어요» → «확인» | Connection complete. | 결과 창 |
| 6 | 왼쪽 «광고 관리» → 카드와 «캠페인 성과» 표 | Before changing anything, the business checks its results. | 숫자들 |
| 7 | 오른쪽 위 «캠페인 관리» → «캠페인» 표 | Campaign management lists status, daily budget and spend. | «상태»·«일 예산»·«집행액»·«동작» |
| 8 | 상태 «게재 중»인 캠페인의 «동작» 칸 «일시중지» → 창 «캠페인 일시중지» | Pausing an active campaign asks for confirmation first. | 확인 창 |
| 9 | 창의 «일시중지» | Paused through the Marketing API. | 초록 띠 «캠페인을 일시중지했어요.», 상태 «일시중지» |
| 10 (선택) | 메타 광고 관리자 탭: 같은 캠페인 꺼짐 | Ads Manager shows the same campaign switched off. | 꺼진 스위치 |
| 11 | **3초 이상 기다림** → 같은 줄 «게재 시작» → 캠페인 화면과 창 «게재 시작 — 비용이 발생해요» | Resuming: Finch warns that charges will apply. | 경고 창 |
| 12 | 창의 «게재 시작» | Delivery resumed through the Marketing API. | «캠페인 게재를 시작했어요. 승인된 광고부터 노출이 시작되고 비용이 발생해요.», 상태 «게재 중»(잠깐 «처리 중»일 수 있음) |
| 13 | 왼쪽 위 «캠페인 관리»로 돌아가기 | The campaign list shows it active again. | 상태 «게재 중» |

**하지 말 것**
- 캠페인 화면의 «광고 만들기»(소재 만들기)는 누르지 않는다 — 개발 모드에서 실패할 수 있다.
- 버튼을 3초 안에 연달아 누르지 않는다(«요청이 너무 빨라요. 잠시 후 다시 시도해 주세요.»).
- 예산이 큰 캠페인으로 찍지 않는다.

**돈 없이 찍고 싶으면 (선택)**
- «캠페인 관리» 아래 «새 캠페인» → «캠페인 이름», «캠페인 목표», «일 예산» → «특별 광고 카테고리»에서 «해당 없음 — 아래 카테고리와 관련 없는 광고예요» → «캠페인 만들기» → 목록에 «일시중지»로 생긴다(«일시중지 상태로 만들어져요 — 이 단계에서는 비용이 발생하지 않아요.»).
- 그 캠페인의 «게재 시작» → 창에 «이 캠페인에는 아직 광고가 없어 켜도 노출되지 않고 비용도 발생하지 않아요.»가 보이면 돈이 안 나간다 → «게재 시작» → «캠페인 관리» → 같은 줄 «일시중지».
- 이 방법은 장면 8~13의 순서가 켜기 → 끄기로 바뀐다. 자막도 그 순서로.
- 광고가 없는 캠페인을 메타가 켜 주는지는 코드로 확인할 수 없다 — 리허설에서 한 번 해 보고 되면 쓴다. [사장님 확인]

---

### 영상 11 — pages_show_list · `11_pages_show_list.mp4`

**이 영상에서 꼭 보여야 하는 것 (메타 요구)**
- 로그인 전부 + 페이스북 로그인에서 페이지를 고르고 허용하는 장면
- 핀치가 **사용자가 관리하는 페이지 목록**을 보여 주는 것

| 장면 | 화면에서 할 일 | 올릴 영어 자막 | 체크 |
|---|---|---|---|
| 1 | 첫 화면(로그아웃) → «로그인» | pages_show_list demo, starting signed out. | «로그인» 버튼 |
| 2 | «Google로 계속하기» → 심사용 계정 → «홈» | The user logs in with their Google account. | «홈» |
| 3 | «SNS 계정 연결» → «핀치가 요청하는 권한» → «광고를 게시할 Facebook 페이지 목록 확인» | Finch asks to see the Facebook Pages the user manages. | 권한 문구 |
| 4 | «Meta 광고» «연결하기» → 페이스북 로그인(가림) → **페이지 고르는 화면에서 페이지 선택** → 페이지 권한 화면 3초 → 허용 | The user selects their Page and allows access to the Page list. | 페이지 선택 |
| 5 | «광고 계정 1개를 연결했어요» → «확인» → 아래 «광고 게시 페이지» 줄 | Ads need a publishing Page; none is chosen yet. | «아직 고르지 않았어요 — 광고를 만들려면 필요해요» |
| 6 | «페이지 선택» → 창 «광고를 게시할 페이지» | Finch lists the Pages this user manages. | 페이지 목록, «광고 권한 있음» / «이 페이지에는 광고 권한이 없어요» |
| 7 | 페이지 클릭 → «Instagram 계정» 단계(연결된 인스타가 골라져 있음) → «이 계정으로 저장» | The user picks a Page and its linked Instagram account. | 저장 버튼 |
| 8 | «광고 게시 페이지» 줄 | This Page is now Finch's ad publishing Page. | «(페이지 이름) · @(인스타 아이디)», 버튼 «변경» |

**하지 말 것**
- 장면 7에서 창 아래에 «이 페이지의 최근 게시물»이 같이 뜬다 — 그건 영상 12의 내용이니 멈추지 말고 저장한다.

**이럴 땐**
- «선택한 페이지에 연결된 Instagram 계정이 없어요…»가 뜨면 → 저장이 안 된다. 페이지에 인스타를 연결하고 다시 찍거나, 장면 6(목록)에서 끝낸다.
- «이 계정으로 관리하는 Facebook 페이지가 없어요…»가 뜨면 → 페이스북 화면에서 페이지를 고르지 않았다. 초기화 후 다시.

---

### 영상 12 — pages_read_engagement · `12_pages_read_engagement.mp4`

**이 영상에서 꼭 보여야 하는 것 (메타 요구)**
- 로그인 전부 + 페이스북 로그인에서 페이지를 고르고 허용하는 장면
- **페이지 게시물 내용(글·사진·날짜)이 핀치 화면에 보이는 것**

준비: 페이지에 최근 글 3개(글+사진).

| 장면 | 화면에서 할 일 | 올릴 영어 자막 | 체크 |
|---|---|---|---|
| 1 | 첫 화면(로그아웃) → «로그인» | How Finch uses pages_read_engagement. We begin logged out. | «로그인» 버튼 |
| 2 | «Google로 계속하기» → 심사용 계정 → «홈» | Google sign-in to Finch. | «홈» |
| 3 | «SNS 계정 연결» → «핀치가 요청하는 권한» → «광고 게시 페이지의 정보·최근 게시물 확인» | Finch states it reads the Page's info and recent posts. | 권한 문구 |
| 4 | «Meta 광고» «연결하기» → 페이스북 로그인(가림) → 페이지 선택 → 페이지 콘텐츠 권한 화면 3초 → 허용 | The user lets Finch read content on the selected Page. | 권한 목록 |
| 5 | «광고 계정 1개를 연결했어요» → «확인» | Connected. | 결과 창 |
| 6 | «광고 게시 페이지» 줄 «페이지 선택» → 페이지 클릭 | Open Select Page and click the Page. | 잠깐 «Instagram 계정과 최근 게시물을 확인하는 중…» |
| 7 | 창 아래 «이 페이지의 최근 게시물»을 천천히 | Finch loads the Page's three latest posts: text, photo and date. | 부제 «고른 페이지가 맞는지 확인해 보세요.», 게시물 3개 |
| 8 | 한 게시물의 «Facebook에서 보기» → 새 탭 | The same post on Facebook. The content matches. | 같은 글·사진 |
| 9 | 핀치 탭으로 돌아와 «이 계정으로 저장» | The user confirms it is the right Page and saves. | 줄에 페이지 이름 |

**이럴 땐**
- «이 페이지에는 아직 게시물이 없어요.» → 페이지에 글을 올리고 다시.
- 게시물 칸에 오류 문장이 뜨면 → 녹화 멈추고 화면을 캡처해 Claude에게(권한 문제일 수 있다).

---

### 영상 13 — business_management · `13_business_management.mp4`

**이 영상에서 꼭 보여야 하는 것 (메타 요구)**
- 로그인 전부 + 페이스북 로그인에서 비즈니스 포트폴리오를 고르고 허용하는 장면
- 핀치가 비즈니스 정보(광고 계정이 어느 포트폴리오 소속인지)를 보여 주고, 그 광고 계정의 광고 데이터가 보이는 것

준비: 광고 계정이 비즈니스 포트폴리오에 들어가 있을 것. **안 들어가 있으면 «비즈니스 포트폴리오» 줄에 «비즈니스 포트폴리오에 속하지 않은 광고 계정이에요»가 뜬다** — 녹화 전에 메타 비즈니스 설정에서 넣어 둔다. [사장님 확인]

| 장면 | 화면에서 할 일 | 올릴 영어 자막 | 체크 |
|---|---|---|---|
| 1 | 첫 화면(로그아웃) → «로그인» | business_management walkthrough, not signed in yet. | «로그인» 버튼 |
| 2 | «Google로 계속하기» → 심사용 계정 → «홈» | Signing in to Finch through Google. | «홈» |
| 3 | «SNS 계정 연결» → «핀치가 요청하는 권한» → «광고 계정이 속한 비즈니스 포트폴리오 조회» | Finch requests read access to the business portfolio. | 권한 문구 |
| 4 | «Meta 광고» «연결하기» → 페이스북 로그인(가림) → **비즈니스 포트폴리오 선택** → 비즈니스 권한 화면 3초 → 허용 | The user grants Finch access to their business portfolio. | 포트폴리오 선택 |
| 5 | «광고 계정 1개를 연결했어요» → «확인» | Connected. | 결과 창 |
| 6 | «Meta 광고» 바로 아래 «비즈니스 포트폴리오» 줄 | Finch shows which portfolio owns the ad account. | 잠깐 «확인하는 중…» → 포트폴리오 이름 |
| 7 | 줄 제목 옆 (i) 아이콘 클릭 | Portfolio names are read from Meta on each visit, not stored. | «광고 계정을 소유한 메타 비즈니스 포트폴리오예요. 이 화면을 열 때마다 메타에서 새로 확인해요.» |
| 8 | 왼쪽 «광고 관리» → 부제·카드·«캠페인 성과» | Ad results for that portfolio's ad account. | «(광고 계정) · 최근 30일» |
| 9 (선택) | 메타 비즈니스 설정 › 광고 계정 → 같은 포트폴리오 | Meta Business settings show the same account in the same portfolio. | 같은 이름 |

**이럴 땐**
- «다시 연결하면 광고 계정이 속한 포트폴리오를 보여 드려요» → 페이스북 화면에서 비즈니스 권한을 뺐다. 초기화 후 모든 항목을 허용해 다시.
- «포트폴리오를 확인하지 못했어요 · 새로고침해 주세요» → 새로고침 후 다시. 계속되면 Claude에게.

---

## 4. 다 찍은 뒤

1. **심사용 계정의 자동화 지우기**: «자동 DM» → 카드의 휴지통 아이콘 → «이 자동화를 지울까요?» → «삭제». (무료 요금은 자동화 게시물 1개라, 심사자가 «첫 자동화 만들기»부터 시작할 수 있게.)
2. **사장님 본계정**으로 로그인 → «SNS 계정 연결» → «Meta 광고» «다시 연결»(광고 초기화 때 끊겼다).
3. 광고 캠페인 상태를 원래대로(켜 둘지 끌지). [사장님 확인]
4. 파일 13개 점검: 이름, 1080p, **소리 트랙 없음**, 비밀번호·이메일·토큰 안 보임, 자막이 영어로 장면마다 있음.
5. 심사 기간 댓글 계획: 심사자는 제출서에 적은 댓글용 테스트 계정으로 직접 댓글을 단다. 그 계정이 24시간 안에 자동 DM을 받은 적이 없게, 사장님 쪽 시험에는 쓰지 않는다. [사장님 확인]

---

## 5. 막히면 — 화면에 이 글자가 뜰 때

| 화면 글자 | 뜻 | 할 일 |
|---|---|---|
| «이미 다른 핀치 계정에 연결된 계정이에요» | `sding.kr` 이 다른 핀치 계정(보통 사장님 본계정)에 붙어 있다 | 본계정에서 «연결 해제» 후 다시 |
| «이 계정에는 아직 연결 권한이 없어요» | 그 인스타·스레드 계정이 앱 테스터가 아니다 | 테스터 초대 수락 확인 |
| «연결을 취소했어요» | 권한 화면에서 취소를 눌렀다 | 다시 «연결하기» |
| 결과 창 «@sding.kr 계정을 연결했어요» 아래에 «댓글 자동 DM을 쓰시려면 다시 연결해 주세요.» | 연결은 됐지만 댓글 알림 설정만 실패 | «다시 연결» 후 그 영상 다시 찍기 |
| 줄에 «준비 중» · «곧 열릴 예정이에요», 버튼 없음 | 심사용 계정이 `OWNER_EMAIL` 에 없다 | 녹화 멈추고 Claude에게 |
| 맨 위에 «운영자에게만 보이는 안내» | 사장님 본계정으로 로그인했다 | 로그아웃 → 심사용 계정 |
| «지금은 확인하지 못했어요» | 0092가 운영에 없거나 일시 오류 | 30초 뒤 한 번 더, 계속되면 Claude에게 |
| «방금 확인했어요» | 30초 안에 또 눌렀다 | 30초 기다리기 |
| «발행 실패» / «인스타그램에 올리지 못했어요» / «스레드에 올리지 못했어요» | 발행이 거절됐다 | 화면 캡처 → Claude에게 |
| «연결은 됐지만 쓸 수 있는 광고 계정이 없어요» | 페이스북 화면에서 광고 계정을 안 골랐다 | 초기화 후 광고 계정 선택 |
| «요청이 너무 빨라요. 잠시 후 다시 시도해 주세요.» | 광고 버튼을 너무 빨리 눌렀다 | 3초 기다리기 |

화면에 없는 글자(인스타·스레드·페이스북 쪽 로그인·권한 화면의 문구, 메타 대시보드 메뉴 이름)는 핀치 코드 밖이라 이 문서에서 미리 확인할 수 없었다. 리허설 때 한 번 보고 적어 두면 좋다.

---

## 부록 — 라벨 출처 (개발용)

코드 기준 `e88470f`. 경로는 저장소 루트 기준, `(app)` = `app/(finch)/(app)`.

| 화면 | 라벨 | 파일:줄 |
|---|---|---|
| 로그인 | «로그인» | `app/(finch)/(marketing)/layout.tsx:55` · 로그인 화면 제목 `app/(finch)/(auth-split)/login/login-form.tsx:54` |
| 로그인 | «Google로 계속하기» | `app/(finch)/(auth-split)/login/login-form.tsx:73` |
| 로그인 | «Google로 이동하고 있어요» | `components/auth/use-oauth-start.tsx:56`(조사 `lib/josa.ts:39`) |
| 공통 | «Instagram로/Threads로/Meta 광고로 이동하고 있어요» | `components/ui/connect-link.tsx:99` + 이름 `lib/channels.ts:5,7` · `(app)/settings/channels/page.tsx:589,605,645,661` |
| 공통 | «지금은 임시오픈 기간입니다» · «오늘 하루 종일 보지 않기» | `components/layout/opening-notice.tsx:111,125` — 심사용 계정은 안 뜸 `(app)/layout.tsx:62,100` |
| 공통 | «채널을 연동해 볼까요?» · «다음에 할게요» | `components/dashboard/connect-channels-modal.tsx:121,161` |
| 공통 | 계정 메뉴 · «로그아웃» · 알림 | `components/layout/topbar.tsx:167,194,156` |
| 메뉴 | «홈» · «발행» · «자동 DM» · «광고 관리» · «성과 분석» · «리포트» · «레퍼런스» · «계정 및 설정» | `components/layout/sidebar.tsx:33,53,54,60,61,62,67,87` |
| 설정 | «연결» · «SNS 계정 연결» | `lib/settings/sections.ts:61,63` |
| 설정 | «채널 계정» · «광고 계정» · «Meta 광고» | `(app)/settings/channels/page.tsx:531,616,619` |
| 설정 | «연결하기» · «다시 연결» · «연결 해제» · «해제하기» · «연결을 해제할까요?» | `(app)/settings/channels/page.tsx:606/662 · 590/646 · 600/656 · 598/654 · 596` |
| 설정 | «미연결» · «연결됨» · «자동으로 연장돼요» · «준비 중»/«곧 열릴 예정이에요» · «비즈니스·크리에이터 계정만 연결할 수 있어요» | `(app)/settings/channels/_lib/derive-state.ts:61,47,53,59,31` |
| 설정 | «@… 계정을 연결했어요» · «광고 계정 1개를 연결했어요» · «연결을 해제했어요» · «확인» | `(app)/settings/channels/page.tsx:314,415` · `app/api/auth/meta-ads/callback/route.ts:241` · `components/ui/result-modal.tsx:114` |
| 설정 | 오류 창 제목들(«연결을 취소했어요» · «이 계정에는 아직 연결 권한이 없어요» · «이미 다른 핀치 계정에…» · «연결은 됐지만 쓸 수 있는 광고 계정이 없어요») | `(app)/settings/channels/page.tsx:266,268,275,279` |
| 설정 | 댓글 알림 실패 — 제목은 «@… 계정을 연결했어요», 설명 «댓글 자동 DM을 쓰시려면 다시 연결해 주세요.» | `(app)/settings/channels/page.tsx:416-421`(설명 문구 `:293`) |
| 설정 | «운영자에게만 보이는 안내» | `(app)/settings/channels/page.tsx:502` |
| 설정 | «핀치가 요청하는 권한» · 목록 제목 «인스타그램»/«Threads»/«Meta 광고» | `(app)/settings/channels/page.tsx:711,717-719` |
| 설정 | 권한 문구(인스타 5 · 스레드 3 · 광고 5) | `lib/meta/instagram-oauth.ts:45-49` · `lib/meta/threads-oauth.ts:38-40` · `lib/meta/ads-oauth.ts:70-74` |
| 설정 | «비즈니스 포트폴리오» · «확인하는 중…» · (i) 설명 | `(app)/settings/channels/page.tsx:344,673,329` |
| 설정 | «비즈니스 포트폴리오에 속하지 않은 광고 계정이에요» · «다시 연결하면 광고 계정이 속한 포트폴리오를 보여 드려요» · «포트폴리오를 확인하지 못했어요 · 새로고침해 주세요» | `(app)/settings/channels/_lib/derive-state.ts:175,150,153` |
| 설정 | «광고 게시 페이지» · «아직 고르지 않았어요 — 광고를 만들려면 필요해요» · «페이지 선택»/«변경» | `(app)/settings/channels/page.tsx:683,692,696` |
| 페이지 고르기 | «광고를 게시할 페이지»/«Instagram 계정» · «광고 권한 있음»/«이 페이지에는 광고 권한이 없어요» · «Instagram 계정과 최근 게시물을 확인하는 중…» · «이 계정으로 저장» · «이 계정으로 관리하는 Facebook 페이지가 없어요…» | `(app)/ads/_components/ad-publisher-picker.tsx:155,213,220,179,196` |
| 페이지 고르기 | «이 페이지의 최근 게시물» · «고른 페이지가 맞는지 확인해 보세요.» · «이 페이지에는 아직 게시물이 없어요.» · «Facebook에서 보기» | `(app)/ads/_components/page-recent-posts.tsx:47,49,53,75` |
| 페이지 고르기 | «선택한 페이지에 연결된 Instagram 계정이 없어요…» | `lib/ads/campaign-rules.ts:123` |
| 홈 | 채널 칩 «Instagram»/«Threads» | `components/layout/channel-switcher.tsx:75,77` |
| 홈 | «팔로워» · «이번 주 조회수» · «게시물 수» · «평균 참여율» · «지난주 대비» | `(app)/dashboard/_components/dashboard-client.tsx:125,131,136,140` · `components/ui/stat-card.tsx:18` |
| 홈 | «성과 추이» · «팔로워»/«참여율» 탭 · «도달» 탭 | `components/dashboard/performance-trend.tsx:72,33,35` · `dashboard-client.tsx:193` |
| 홈 | «최근 게시물» · «조회수»/«좋아요»/«댓글» · «텍스트»/«피드»/«캐러셀» | `dashboard-client.tsx:215,231-233,42,38,41` |
| 홈 | «내 계정» · «연동됨»/«미연동» · «연동된 계정이 없습니다» | `dashboard-client.tsx:323,360,362,430` |
| 홈 | «광고 현황» · «집행 금액» · «진행 중 캠페인» · «평균 ROAS» | `dashboard-client.tsx:279,290,296,302` |
| 홈 | «오늘의 핀치» · «오늘의 아카이빙 현황» | `components/dashboard/daily-brief.tsx:60,236` |
| 성과 분석 | «개요»/«내 게시물» 탭 · «Instagram 기준» | `(app)/insights/tabs.tsx:13,14` · `components/layout/channel-switcher.tsx:33` |
| 성과 분석 | «팔로워 분석» · «도달» · «참여 계정» · «팔로워 순증감» · «프로필 링크 클릭» · «직전 7일 대비» · «일별 도달» · «일별 팔로워 순증감» · «자주 반응하는 사람 Top 8» | `(app)/insights/_components/audience-client.tsx:119,146,155,169,184,164,214,233,286` |
| 성과 분석 | «성장 진단» · «진단할 게시물이 아직 부족해요» · «평균 저장률» · «평균 참여율» · «평균 도달» · «분석 게시물» · «AI 진단 받기» · «게시물별 성과» | `(app)/insights/posts/_components/growth-client.tsx:78,91,102,110,118,125,141,203` |
| 발행 | 연결 줄 «인스타그램»/«스레드» + 아이디 | `(app)/publish/_components/publish-list.tsx:552,572` |
| 발행 | «새 게시물 포스팅» · «스튜디오에서 만들기» | `publish-list.tsx:626,623` · 창 제목 `post-composer.tsx:411` |
| 발행 | «채널» · «인스타그램»/«스레드»/«틱톡» · «준비 중» | `(app)/publish/_components/post-composer.tsx:425,448,449` · 이름 `lib/publish-rules.ts:27-29` |
| 발행 | «사진·영상» · «(선택)» · «1/10»·«0/20» · «추가» · «사진» 표시 | `post-composer.tsx:459,460,463` · `(app)/publish/_components/media-tiles.tsx:268,214` |
| 발행 | «사진 게시물로 올라가요» · «사진·영상 최대 20개 · 영상은 5분까지 · 글만 올려도 돼요» | `post-composer.tsx:109,99` |
| 발행 | «캡션»/«글» · 글자 수 | `lib/publish-rules.ts:65,68` · `post-composer.tsx:546,550` |
| 발행 | «발행 방식» · «지금 발행»(+설명) · «예약 발행» · «초안으로 저장» · «스토리로 올리기» | `post-composer.tsx:569,585,587,605,635,503` |
| 발행 | «지금 발행하기» · «파일을 올리는 중이에요 — 0/1» · «발행을 시작하고 있어요» | `post-composer.tsx:657,248` · `(app)/publish/_components/publishing-veil.tsx:29` |
| 발행 | 알림 «…에 올리기 시작했어요»(+«…오늘 날짜 목록에서…») · «…에 올라갔어요» · «…에 올리지 못했어요» | `publish-list.tsx:82-84,331,95,101` · 알림 창 `components/ui/toast.tsx` |
| 발행 | 상태 «올리는 중» · «처리 중» · «발행 완료» · «발행 실패» | `components/ui/status-pill.tsx:26,28,29,31` |
| 발행 | «방금 시작 · 화면을 나가도 계속 올라가요» · «…분째 · 끝나면 자동으로 올라가요» | `(app)/publish/_components/post-row.tsx:330,334` · `lib/publish/progress.ts:153,156` |
| 발행 | 계정 칩 «@아이디» · «게시물 보기»(아이콘 이름) | `post-row.tsx:291-320,132` |
| 발행 | 알림 «게시물이 발행됐어요» | `lib/publish/run.ts:512` |
| 자동 DM | «자동 DM» · «Instagram 전용» · «아직 자동 DM 규칙이 없어요» · «첫 자동화 만들기» | `(app)/auto-dm/_components/auto-dm-client.tsx:281,367,373` · `components/layout/channel-switcher.tsx:60` |
| 자동 DM | «실행 중» · «키워드 :» · «자동 답글 :» · «누적 …건» · «오늘 …/300» · «발송 전» · «지금 확인» · 편집·삭제 아이콘 · «이 자동화를 지울까요?» · «댓글을 확인하고 있어요…» · «최근 30일 … 평균 응답률» | `auto-dm-client.tsx:46,432,466,476,478,482,502,514,523,562,578,340` · «방금 전» `lib/format.ts:65` |
| 자동 DM | 만들기 창: «자동화 수정»/«최종 검수» · «어떤 게시물을 자동화할까요?» · «현재 게시물에서 선택할게요» · «어떤 댓글에 DM을 보낼까요?» · «특정 키워드에 발송할게요» · «추가» · «DM 메시지를 작성해주세요» · «메시지 입력» · «메시지 버튼» · «없음» · «1번째 버튼 링크 설정» · «버튼 입력» · «URL 입력» · «내 링크 불러오기 (준비 중)» · «게시물 댓글에 대하여, 자동 답글을 남길까요?» · «네, 답글을 남기고 싶어요» · «선택한 인스타 게시물» · «감지될 키워드» · «보내질 DM 메시지» · «자동으로 답글 달기» · «1/1 링크 설정 완료» · «변경 저장» · «확인» · «다음» | `(app)/auto-dm/_components/rule-wizard.tsx:488,518,526,633,642,669,700,709,728,746,766,771,784,801,831,836,903,938,955,979,1036,1039,1040,1041` |
| 자동 DM | «DM 1개를 보냈어요»/«새로 보낼 DM이 없었어요» · «댓글 … 확인 · DM … 보냄 · 건너뜀 …» · «이미 처리함»/«기간 지남»/«발송 제한» · «건너뛴 이유:» · «발송 제한은 …안전장치예요.» · «방금 확인했어요» · «지금은 확인하지 못했어요» | `lib/auto-dm/check-now-types.ts:89,90,94,96,97,99,101,157,170` |
| 광고 | «광고 관리» · 부제 · «캠페인 관리» · 카드 4개 · «캠페인 성과» · «AI 추천»/«준비 중» | `(app)/ads/page.tsx:182,184,190,211-228,241,294,301` · «최근 30일» `lib/data/ads.ts:644` |
| 광고 | 표 열 제목 · «미추적» | `(app)/ads/_components/live-campaign-table.tsx:39-52,88` |
| 광고 | «캠페인 관리» 화면 · «동작» · «새 캠페인» · «캠페인을 일시중지했어요.» | `(app)/ads/campaigns/page.tsx:55,150,208,27` |
| 광고 | «일시중지» · «캠페인 일시중지» · «게재 시작»(목록) | `(app)/ads/campaigns/_components/campaign-row-actions.tsx:36,31,45` |
| 광고 | «게재 시작 — 비용이 발생해요» · «게재 시작» · «이 캠페인에는 아직 광고가 없어…» | `(app)/ads/campaigns/[campaignId]/_components/activate-tree-modal.tsx:103,114,123` |
| 광고 | «캠페인 게재를 시작했어요. …» · 돌아가기 «캠페인 관리» | `(app)/ads/campaigns/[campaignId]/page.tsx:366,440` |
| 광고 | «게재 중» · «일시중지» · «처리 중» | `lib/ads/meta-labels.ts:50,51,56` |
| 광고 | 새 캠페인 폼 «캠페인 이름» · «캠페인 목표» · «일 예산» · «특별 광고 카테고리» · «해당 없음 — …» · «일시중지 상태로 만들어져요 — …» · «캠페인 만들기» | `(app)/ads/campaigns/_components/campaign-form.tsx:69,84,111,139,152,175,178` |
| 광고 | «요청이 너무 빨라요. 잠시 후 다시 시도해 주세요.» | `lib/ads/campaign-rules.ts:96` |
