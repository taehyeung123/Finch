# 발행 — 영상이 안 되는 이유와 만드는 순서

> 2026-09-11 조사(코드 전수 + 메타·Supabase·Vercel 공식 문서). 만들기 시작하면 이 문서를 정본으로 고쳐 가며 쓴다.
> 심사 관련 결정은 [APP_REVIEW.md](APP_REVIEW.md) 가 정본이다.

## 구현 상태 (2026-09-11, 백엔드 조각 `feat/video-core`)

아래 설계에서 바뀐 것 — **이 절이 아래 본문보다 우선한다**:

- 마이그레이션 번호는 **0093**(`supabase/migrations/0093_publish_media.sql`, 0092 는 자동 DM 이 먼저 썼다). **코드보다 먼저 적용**하고, 적용 뒤 Storage 전역 파일 상한을 300MB 이상으로 올린다.
- 업로드는 TUS 가 아니라 **서명 업로드 URL 에 원본 바이트를 한 번 PUT**(XHR — 진행률이 나온다, 새 의존성 없음). 끊기면 한 번 다시 올린다. 현장에서 실패가 잦으면 TUS 로 바꾼다(같은 토큰이 `x-signature` 로 된다).
- 서버 쪽(백엔드) 완료: 규칙(`lib/publish-rules.ts`)·미디어 모델(`lib/publish/media-core.ts`, `media.ts`)·업로드 발급/확인/버리기(`lib/publish/uploads.ts` + `publish/actions.ts`)·
  단계별 어댑터(`lib/meta/instagram-publish.ts`, `threads-publish.ts`)·한국어 오류(`lib/meta/publish-errors.ts`)·상태 기계(`lib/publish/engine-core.ts` 판단 + `run.ts` 실행)·
  크론 3개(`publish-scheduled` 개편·`publish-processing` 매분·`publish-media-sweep` 매일)·CSP `media-src`·파일 수명(발행 7일 뒤 영상 삭제·초안 삭제·계정 삭제·고아 관찰).
- 남은 것: 컴포저 UI(타일·진행 막대·커버 고르기·영상 검사 `mp4-inspect-core`/`video-inspect`/`image-bake`/`upload-client`), 목록의 처리 중·링크·배지 표시, S0 실측.
- 검사: `node scripts/test-publish-rules.ts` · `test-publish-engine.ts` · `test-publish-errors.ts` · `test-publish-media.ts [ffmpeg 픽스처 폴더]`.
- 두 번 올리지 않기·선점·회수·정리 규칙의 정본은 `lib/publish/engine-core.ts`·`run.ts` 머리말과 0093 머리말이다.

## 한 줄 요약

영상은 **메타가 막은 게 아니라 핀치가 사진 전용으로 만들어져서** 안 된다. 권한은 이미 받은 두 개로 충분하다
(`instagram_business_content_publish` 가 릴스·스토리·영상 캐러셀까지, `threads_content_publish` 가 `VIDEO` 까지 덮는다).
새 권한이 필요 없으니 **9/18 심사와 무관하게 만들 수 있다** — 이미 승인될 권한 안에서 미디어 종류를 늘리는 건 재심사가 필요 없다
(메타가 2022-03 캐러셀을 추가할 때 같은 방식이었다, IG 변경 기록).

## 1. 왜 안 되나 — 층마다 사진 전용이다

| 층 | 지금 | 근거 |
|---|---|---|
| 파일 고르기 | `image/png,jpeg,webp` 만 받는다 | `publish/_components/post-composer.tsx` 파일 입력 `accept` |
| 변환 | 모든 파일을 캔버스에서 JPEG 로 다시 굽는다 — 영상은 여기서 실패 | 같은 파일 `fitImage` 계열 |
| 전송 | base64 로 서버 액션 본문에 싣는다. **Vercel 은 요청 본문 4.5MB 에서 413** — 그래서 컴포저가 합계 3MB 에서 막는다 | Vercel limits 문서, 컴포저의 합계 검사 |
| 서버 액션 | `data:image/*` 8MB 이하만 받는다 | `publish/actions.ts` `createPost` |
| DB | `image_urls text[]` 뿐 — 미디어 종류·컨테이너 id·커버 칸이 없고, 상태에 «처리 중»이 없다 | `0010`·`0043`·`0074` 마이그레이션 |
| 메타 어댑터 | 인스타는 `image_url` 만, 스레드는 TEXT·IMAGE·이미지 캐러셀만 | `lib/meta/instagram-publish.ts`, `threads-publish.ts` |
| 시간 모델 | 요청 하나 안에서 끝까지 기다린다(「지금 발행」 80초, 크론 글당 90초). 메타는 영상 처리를 «1분마다, 5분까지» 확인하라고 한다 | IG content publishing 문서 |
| 기타 | CSP 에 `media-src` 가 없어 영상 미리보기(blob:)가 막힌다. 스튜디오 «영상으로 저장»은 WebM — 두 API 모두 WebM 을 안 받는다 | `proxy.ts`, `lib/studio/video.ts` |

⚠️ 같은 3MB 상한이 **사진 캐러셀도 실제로 묶고 있다** — `publish-rules.ts` 의 «25MB» 주석은 Vercel 에서 틀린 말이다.

## 2. 메타가 받는 것 (2026-09-11 문서 기준)

- **인스타 릴스**: `media_type=REELS` + `video_url`. MP4/MOV, H.264/HEVC + AAC, 3초~15분, 300MB 이하, 가로 1920px 이하. 커버 `cover_url`(JPEG) 또는 `thumb_offset`, `share_to_feed`.
  일반 피드 `VIDEO` 는 2023-11 부터 단일 게시물로는 안 된다(캐러셀 아이템으로만 남음).
- **인스타 스토리**: `STORIES` 사진·영상(영상 3~60초, 100MB 이하).
- **인스타 캐러셀**: 사진·영상 섞어 2~10개. 모든 아이템이 첫 아이템 비율로 잘린다.
- **스레드 영상**: `VIDEO` + `video_url`, 5분 이하·1GB 이하. 캐러셀은 사진·영상 섞어 2~20개.
- **하루 한도**: 인스타 `content_publishing_limit`(문서에 100·50 이 섞여 있다 — 실행 중에 `quota_total` 을 읽는다), 스레드 250개.
- **컨테이너 오류 코드**를 한국어로 바꿔 보여 준다: 인스타 2207026(형식)·2207052(파일 못 가져감)·2207003(다운로드 시간 초과), 스레드 `FAILED_DOWNLOADING_VIDEO`·`INVALID_DURATION`·`INVALID_FRAME_RATE`.

## 3. 설계 — 서버에서 영상을 변환하지 않는다

1. **브라우저 → Storage 직접 업로드.** 서버 액션이 경로(`${uid}/${uuid}.mp4`)를 정하고 **admin 클라이언트로 서명된 업로드 토큰**을 준다.
   브라우저는 TUS(이어받기, 6MB 조각)로 올린다 — 진행률이 보이고 끊겨도 이어진다(`tus-js-client` 새 의존성).
   올린 뒤 확인 액션이 크기·형식을 다시 보고 틀리면 지운다. ⚠️ `links/actions.ts` 의 `admin ?? createClient()` 폴백을 베끼지 말 것(CLAUDE.md 보안 규칙).
   **사진도 같은 길로 옮긴다** → 3MB 상한이 사라져 인스타 10장·스레드 20장 캐러셀이 실제로 된다.
2. **검사는 브라우저에서**: 확장자·MIME·크기·길이·해상도(`<video>` 메타데이터). 형식·코덱을 사용자에게 요구하고, 최종 판정은 메타가 한다.
   ⚠️ 폰 원본이 메타 조건(moov 앞쪽, edit list 없음)에 걸리는지는 확인 안 됨 — S0 실측으로 정한다.
3. **새 버킷 `publish-media`**: 파일 300MB, `video/mp4`·`video/quicktime`·`image/jpeg` 만, 로그인 사용자 insert 정책 없음(서버 토큰으로만).
   비공개 버킷 + 짧은 서명 URL 을 먼저 시험하고(메타가 쿼리 토큰 붙은 URL 을 받는지 미확인), 안 되면 `cardnews` 처럼 공개.
   Supabase **전역 파일 크기 상한을 대시보드에서 300MB 이상으로** 올려야 한다(Pro 는 500GB 까지, 현재 값 미확인). `cardnews` 에도 8MB·이미지만 제한을 건다.
4. **비동기 발행(크론 여러 번에 걸친 상태 기계)**: `scheduled → publishing → 컨테이너 생성 → (바로 끝나면) 발행 / (아니면) processing`.
   매분 도는 가벼운 크론 `publish-processing` 이 상태를 보고 FINISHED 면 발행, PUBLISHED 면 «이미 올라감»으로 기록(두 번 올리지 않기),
   ERROR/EXPIRED 면 한국어 사유로 실패. 마감은 컨테이너 생성 + 30분(컨테이너 수명 24시간).
   예약 영상은 예약 시각 15~30분 전에 컨테이너를 만들고, **예약 시각 전엔 절대 발행하지 않는다.**
5. **보안**: `scheduled_posts` 는 주인이 모든 칸을 바꿀 수 있다(RLS). 새 서버 전용 칸(컨테이너 id 등)은 0085 방식으로 권한을 빼고,
   사용자가 상태를 `publishing`·`processing`·`published` 로 옮기지 못하게 트리거를 건다(INSERT·UPDATE 둘 다). `run.ts` 는 미디어 URL 이
   우리 버킷·그 사용자 폴더인지 다시 확인한다.
6. **정리**: 발행 7일 뒤 영상 원본을 지운다(메타는 자기 사본을 갖는다, 목록용 커버 JPEG 는 남긴다). 계정 삭제(`lib/account/delete.ts`)·
   고아 점검 크론 버킷 목록에 새 버킷을 넣는다(두 곳 다 폴더 두 단계까지만 훑는다 — 경로 깊이를 지킬 것).

## 4. 만드는 순서

| 조각 | 내용 | 규모(추정) |
|---|---|---|
| **S0** | 실측: 폰 원본 5개(아이폰 HEVC MOV·갤럭시 MP4·캡컷·화면 녹화·1분 넘는 것)로 인스타 릴스·스레드 영상 1개씩(공개·서명 URL 둘 다). Supabase 전역 상한 확인·상향. (스레드 전체 시간 예산 버그는 2026-09-11 수리함) | 1일 |
| **S1** | 미디어 모델 + 직접 업로드: 마이그레이션 0092, 규칙, 업로드 토큰·확인 액션, 이어받기 클라이언트, 사진도 이 길로(3MB 상한 해제), CSP `media-src`, `cardnews` 제한 | 2~3일 |
| **S2** | 비동기 엔진 + 영상 1개: 어댑터를 «생성·확인·발행» 단계로 쪼개기, «처리 중» 상태, 매분 크론, 두 번 올리지 않는 재시도, 한도 확인, 게시물 링크, 한국어 오류. 영상 고르기·검사·커버 고르기·`share_to_feed`, 목록의 «처리 중» | 3~4일 |
| **S3** | 사진·영상 섞은 캐러셀(인스타 10·스레드 20) + 인스타 스토리 | 1.5~2일 |
| **S4** | 파일 수명: 발행 뒤 삭제, 초안 삭제·취소 때 정리, 계정 삭제·고아 점검에 버킷 추가, 예약 영상 미리 컨테이너 | 1일 |
| **S5** | 작성 기능: 인스타+스레드 동시 발행(채널별 문구), 해시태그·멘션 개수, 스레드 링크 5개 제한, 대체 텍스트, 첫 댓글, 체험 릴스, AI 생성 표시, 초안 수정 | 3~4일 |
| **S6** | 스레드 추가: 투표, 주제 태그, 스포일러 | 1~2일 |
| 나중 / 안 함 | 사람 태그·공동 작업자(S0 실측 통과 시), 미리보기, 자르기 화면, 시간대 추천. 위치 태그(새 권한·새 심사), 연속 글(권한 실측 필요), 스레드→인스타 스토리 공유·게시물 삭제(새 권한) | — |

**합치는 시점**: S1~S3 은 **9/16~18 심사 녹화가 끝난 뒤** main 에 합친다 — 녹화 중에 발행 흐름이 바뀌면 영상을 다시 찍어야 한다.
작은 수리(S0 의 버그·S5 의 검사)는 먼저 내보내도 된다.

## 5. 9/18 전에 정할 권한 — 전부 «넣지 않는다»

| 권한 | 여는 기능 | 결정 |
|---|---|---|
| `threads_location_tagging` | 스레드 위치 태그 | 안 넣음 — 화면·녹화·호출이 9/15 까지 필요, 인스타 위치는 인스타 로그인 방식에서 안 된다 |
| `threads_share_to_instagram` | 스레드 글을 인스타 스토리로 | 안 넣음 — 인스타 스토리를 직접 발행하면 된다 |
| `threads_delete` | 스레드 글 삭제 | 안 넣음 — 스레드 앱에서 지우면 된다 |
| `threads_manage_replies` | 연속 글·답글 승인 | 2026-09-11 뺐다. 연속 글이 이 권한 없이 되는지(문서가 서로 다르다)는 실측 후 결정 |
| 인스타 새 권한 | — | 필요 없음 |

## 6. 따로 찾은 것

- 틱톡 소개 페이지(`app/(finch)/(marketing)/tiktok/page.tsx`)가 **없는 기능을 약속한다** — «틱톡 인사이트 기반 게시물 예약 발행»(틱톡 발행 어댑터 없음),
  «영상별 조회수·참여율»(틱톡 영상 데이터는 일부러 비워 둔다, `lib/data/live.ts`). 문구 정리 필요.
- 스레드 글자 수: 스레드는 이모지를 UTF-8 바이트로 센다 — 핀치는 JS `.length` 로 센다. 이모지가 많은 글은 핀치 검사를 통과하고 메타에서 떨어질 수 있다.
