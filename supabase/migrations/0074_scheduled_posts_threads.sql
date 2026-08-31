-- 0074_scheduled_posts_threads.sql — 스레드 자동발행을 위한 대기열 완화
--
-- 왜: 0010 이 scheduled_posts 를 **인스타 카드뉴스 전용**으로 만들면서
--     image_urls 에 `array_length(image_urls, 1) between 1 and 10` 체크를 걸었다.
--     스레드는 **글만 있는 게시물이 정상**이고(docs/REAL_API_SPEC.md 5절, media_type=TEXT),
--     캐러셀 상한도 20장이라 이 체크에 그대로 걸린다.
--
--     ⚠️ postgres 에서 `array_length('{}', 1)` 은 0 이 아니라 **null** 이다.
--     그래서 빈 배열은 기존 체크에서 `null between 1 and 10` → null → 통과처럼 보이지만,
--     이 컬럼엔 not null 만 걸려 있고 체크는 null 결과를 «위반 아님» 으로 처리한다.
--     즉 빈 배열이 우연히 통과할 수는 있어도 **의도된 규칙이 아니었다.**
--     채널별 규칙을 명시적으로 다시 쓴다.
--
-- 새 규칙:
--   instagram : 1 ~ 10 장 (Meta 캐러셀 상한, 이미지 필수)
--   threads   : 0 ~ 20 장 (글 전용 허용, 캐러셀 상한 20)
--   tiktok    : 제한 두지 않음 — 발행 미구현이라 규칙을 지어내지 않는다
--               (구현할 때 이 자리에 실제 스펙을 넣는다)
--
-- coalesce(array_length(...), 0) 으로 빈 배열을 0 으로 눌러 비교한다 —
-- 위의 null 함정을 이 자리에서 끝낸다.
--
-- ⚠️ 0053(channel 컬럼)이 선행이다. 이 파일은 그 컬럼을 전제로 한다.
--
-- 적용: Supabase 대시보드 → SQL Editor 에 붙여넣고 실행.

-- 0053 이 아직 안 들어갔다면 여기서 함께 보장한다(멱등)
alter table public.scheduled_posts
  add column if not exists channel text not null default 'instagram'
    check (channel in ('instagram', 'tiktok', 'threads'));

-- 0010 의 인라인 check 에 postgres 가 붙인 이름이 바로 이것이다(프로덕션 pg_constraint 로 확인:
--   conname=scheduled_posts_image_urls_check
--   def=CHECK (array_length(image_urls,1) >= 1 AND array_length(image_urls,1) <= 10))
-- 이름으로 지우는 것만으로 충분하다.
--
-- ⚠️ 예전에 «정의에 array_length 와 image_urls 가 같이 들어가는 check 를 전부 지우는» do 블록을
-- 예비로 뒀다가 뺐다. 그 패턴은 **아래에서 새로 만드는 제약의 정의에도 매칭된다** —
-- 나중에 image_urls 규칙이 하나 더 생긴 뒤 이 파일을 다시 실행하면 남의 제약까지 쓸어 간다.
-- 이름을 모르는 제약을 지우는 빗자루는 두지 않는다.
alter table public.scheduled_posts
  drop constraint if exists scheduled_posts_image_urls_check;

alter table public.scheduled_posts
  add constraint scheduled_posts_image_urls_check check (
    case channel
      when 'instagram' then coalesce(array_length(image_urls, 1), 0) between 1 and 10
      when 'threads'   then coalesce(array_length(image_urls, 1), 0) between 0 and 20
      else true
    end
  );

comment on column public.scheduled_posts.image_urls is
  '발행 이미지 URL. 채널별 개수 규칙은 scheduled_posts_image_urls_check 참조 — 스레드는 글 전용(0장)이 정상이다.';

comment on column public.scheduled_posts.channel is
  '발행 채널 — instagram·threads 는 실제 발행이 구현돼 있다(lib/meta/*-publish.ts). tiktok 은 API 연동 전.';

comment on column public.scheduled_posts.ig_media_id is
  '발행된 게시물 id. 컬럼명은 인스타 시절 이름이지만 스레드 발행분의 media id 도 여기 들어간다.';
