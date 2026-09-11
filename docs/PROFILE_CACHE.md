# 공개 프로필 창고(ISR) — 원리와 규칙

2026-09-11 도입. 공개 프로필(`finch.ai.kr/{slug}`)을 방문마다 새로 그리지 않고, 한 번 그린 완성 화면을
Vercel CDN 에 넣어 두고 꺼내 주는 구조다. 사내에서는 이걸 «창고»라고 부른다.

## 한 문단 요약

첫 방문자가 오면 서버가 DB 에서 발행본을 읽어 화면을 조립하고, 그 결과(HTML + RSC 데이터)를 Vercel CDN 에
저장한다. 두 번째 방문자부터는 CDN 이 저장본을 바로 준다 — 서버 함수도 DB 도 돌지 않는다. 주인이 발행하거나
설정을 바꾸면 서버가 그 페이지의 저장본을 **즉시 만료**시키고, 다음 방문자 때 한 번 새로 조립한다.
저장본의 최대 수명은 하루다(놓친 변경이 있어도 하루 안에 새로 그린다).

## 요청이 흘러가는 길

```
방문자 ── finch.ai.kr/abc ──▶ proxy.ts ─┬─ 쿠키 없음(대부분) ──▶ /p/abc        창고 라우트(ISR)
                                        │                           └ CDN 에 있으면 그대로(HIT), 없으면 한 번 그림(MISS)
                                        └─ 세션·열림 쿠키 있음 ──▶ /p/-live/abc  즉석 라우트(매번 새로, 저장 안 함)
```

- **창고 라우트** `app/p/[slug]/page.tsx`, `app/p/[slug]/[sub]/page.tsx`
  - `dynamic = "force-static"`, `revalidate = 86400`, `generateStaticParams() → []`
  - 빌드 때는 아무것도 굽지 않는다. 첫 방문 때 굽는다.
  - 렌더 안에서 `cookies()`·`headers()` 는 **빈 값**이다(`force-static`). 그래서 누가 요청했든 익명 방문자 화면만 나온다.
  - 조회는 `loadCachedPublicPage` — anon 클라이언트(`lib/supabase/anon.ts`)로 읽어 RLS(발행·비잠금만)가 한 번 더 막는다.
- **즉석 라우트** `app/p/-live/[slug]/page.tsx`, `app/p/-live/[slug]/[sub]/page.tsx`
  - `force-dynamic`. 같은 렌더러를 `live=true` 로 부른다. 응답은 `private, no-store`.
  - 여기로 오는 요청: 핀치 로그인 세션 쿠키(`sb-…-auth-token`)나 비밀번호 열림 쿠키(`finch_lu_…`)가 있는 **화면** 요청.
  - 주인 미리보기(비공개·미발행 안내), 잠긴 페이지의 내용, 주인 방문 시 마케팅 픽셀 제외가 여기서만 산다.
  - `-live` 는 누구의 slug 도 될 수 없다(slug 는 영문·숫자로 시작 — `SLUG_RE`, DB 0045). proxy 는 그런 첫 조각을 리라이트하지 않는다.
- **창고와 무관한 것**: `/abc/go/…`, `/abc/vcard/…`, `/abc/dwell`(라우트 핸들러), 서버 액션(방문 기록·리드·방명록·잠금 해제 — POST 는 창고를 거치지 않는다).

## 무엇이 창고를 비우나

정본은 `lib/links/public-cache.ts` 다. 새 쓰기 경로를 만들면 이 표에 줄을 더한다.

| 쓰기 | 비우는 곳 |
|---|---|
| 발행(수동·자동) `publishLinkPage` | 자기 주소 + 서브면 `/p/{부모}/{서브}` |
| 공개/비공개 전환 `setLinkPublished` | 같음 |
| 페이지 설정 `updateLinkSettings`(언어·검색 노출·픽셀·공유 카드·잠금 문구) | 같음 — 설정은 발행 없이 바로 읽힌다 |
| 비밀번호 걸기/풀기 `setLinkPassword` | 같음 — 잠그면 즉시 잠금 화면 |
| 방명록 답글·숨김·삭제, 방문자 방명록 작성 | 그 글이 걸린 페이지 |
| 주소 변경 `changeSlug`·`updateLinkProfile`(주소가 바뀐 저장만) | 옛·새 주소, 그 아래 서브 주소, 무덤(옛 주소 → 새 주소 안내) |
| 페이지 삭제 `deleteLinkPage` | 자기·자식·서브 주소·무덤 |
| 탈퇴·동의 거부 `purgeAndDeleteUser` | 그 사람의 모든 페이지 |
| 되돌리기 `revertLinkDraft` | 자기 주소(보이는 변화는 없지만 안전하게) |

- 초안 저장(블록·테마·프로필 자동 저장)은 **비우지 않는다.** 공개 화면은 발행본만 그리기 때문이다. 자동 저장이 0.8초마다
  돌아서, 여기서 비우면 편집하는 동안 공개 페이지가 사실상 캐시되지 않는다.
- 주소 구조가 바뀌는 쓰기는 **쓰기 전에** `collectPublicPaths(ids, { structure: true })` 로 옛 주소를 모아 둔다. 지운 뒤엔 알 수 없다.
- 비우기는 `revalidatePath`(즉시 만료)다. `revalidateTag(…, "max")` 는 옛 화면을 한 번 더 주므로 쓰지 않는다.
- 비우는 대상은 라우트 경로(`/p/abc`)다. 방문자 주소(`/abc`)를 넘기면 아무 일도 안 일어난다.

### 앱 밖에서 바꿨을 때(대시보드·SQL)

코드가 모르는 변경은 창고에 최대 하루 남는다. 신고 처리처럼 바로 내려야 하면:

```bash
curl -X POST https://finch.ai.kr/api/admin/purge-profile -H "Authorization: Bearer $CRON_SECRET" -H "Content-Type: application/json" -d '{"slug":"abc"}'
```

모든 공개 프로필을 한꺼번에 비우려면 본문을 `{"all":true}` 로. 다음 방문부터 하나씩 다시 굽는다(잠깐 느려질 뿐 틀리지 않는다).

## 시간이 바꾸는 것

예약 공개/마감 블록과 일정 블록은 «그린 시각»의 판정이 저장본에 굳는다. 그래서 창고 렌더가 다음 전환 시각을 계산해
(`lib/links/blocks.ts` `nextVisibilityChange`) 저장본 수명을 그 시각까지로 줄인다(`page.tsx` `capLifetimeAt`).
전환 직후 첫 방문자는 옛 화면을 한 번 받고, 그 요청이 새로 굽는다. 링크 클릭(`/go`)은 서버가 매번 예약을 다시 확인하므로
마감된 링크로 새지는 않는다.

⚠️ 예약 블록을 브라우저에서 거르는 방식으로 바꾸지 말 것 — 공개 전 내용이 HTML 에 먼저 실린다.

## 실패할 때

- 창고 렌더에서 DB 조회가 실패하면 **던진다.** Next 는 던진 렌더를 저장하지 않고 이전 저장본을 계속 준다.
  null(=없는 페이지)을 돌려주면 404 가 하루 동안 굳는다 — 그래서 `readRow`·`movedTo`·`resolveSubSlug`·방명록 조회에 strict 모드가 있다.
- 비우기가 실패해도 사용자의 저장은 성공으로 끝난다. 기록(Sentry)만 남는다. 최악은 하루 동안 옛 화면이다.

## 방문 기록

창고 도입 뒤에도 방문 기록(`recordView`)은 방문마다 서버에서 돈다. 예전엔 여기서 발행본 전체를 DB 에서 읽었다.
지금은 `id·발행·잠금`만 읽어 5분 기억한다(`unstable_cache`, 태그 `lp:{slug}` — 비우기 때 함께 만료). 잠긴 페이지만 예전 판정을 탄다.

## 확인하는 법

```bash
curl -sI https://finch.ai.kr/abc | grep -iE "x-vercel-cache|cache-control|set-cookie"
```

- 두 번째 요청이 `x-vercel-cache: HIT` 이면 창고에서 나간 것이다. `MISS` 는 방금 구웠다는 뜻, `STALE` 은 수명이 지나 뒤에서 다시 굽는 중.
- `set-cookie: finch_lv=…` 는 HIT 에서도 요청마다 **다른 값**이어야 한다(proxy 가 붙인다 — 저장본에 굳으면 방문자 구분이 무너진다).
- 로그인 쿠키를 붙인 요청은 `cache-control: private, no-cache, no-store` 여야 한다(즉석 라우트).

## 하지 말 것

- 창고 렌더 경로에 쿠키·헤더로 화면을 가르는 코드를 넣지 말 것. `force-static` 이라 빈 값이 와서 «항상 익명»이 된다.
  쿠키로 달라져야 하면 proxy.ts `needsLiveRender` 에 쿠키를 추가하고 즉석 라우트에서 그린다.
- `force-static` 을 지우지 말 것. 기본값(auto)에서는 렌더 경로에 쿠키 읽기가 하나라도 남으면 **매 방문 500** 이다
  (런타임 ISR 은 정적→동적 전환을 오류로 던진다). 빌드는 통과해서 배포 뒤에야 드러난다.
- Cloudflare 에서 HTML 캐시 규칙을 켜지 말 것. `revalidatePath` 는 Cloudflare 캐시를 비우지 못한다.
- 공개 화면을 바꾸는 새 쓰기를 만들면 위 표에 줄을 더하고 `purgePublicPage` 를 부른다.
