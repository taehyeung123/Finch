-- 0066_slug_reserved_guard.sql — 루트 주소 전환에 따른 예약어 방어 (DB 최후 방어선)
--
-- 2026-08-25, 공개 프로필 링크가 `finch.ai.kr/p/{slug}` → `finch.ai.kr/{slug}` 로 바뀌었다.
-- 이제 **사용자 주소와 제품 주소가 같은 이름 공간**을 쓴다.
--
-- 지금까지 예약어 검사는 앱에만 있었다(lib/links/reserved.ts). /p 프리픽스가 있던 시절엔
-- 그걸 뚫려도 «사칭» 정도였지만, 루트로 올라온 뒤에는 다르다:
--   · `dashboard` 를 잡으면 그 사람 페이지는 정적 라우트에 가려 **영원히 안 열린다**(쓰레기 행)
--   · `api`·`auth` 를 잡으면 더 나쁘다
-- link_pages 는 authenticated 가 RLS 안에서 직접 INSERT/UPDATE 할 수 있으므로
-- (REST 로 앱을 거치지 않고) DB 가 같은 규칙을 갖고 있어야 한다. 0045 의 형식 check 옆에 붙인다.
--
-- ⚠️ 앱 목록(lib/links/reserved.ts)과 **같이** 바뀐다. 새 라우트를 만들면 양쪽에 넣을 것.
--    (형식 규칙이 3중인 것과 같은 이유다: 화면=즉시 피드백, 서버=신뢰 경계, DB=최후 방어)

alter table public.link_pages drop constraint if exists link_pages_slug_not_reserved;
alter table public.link_pages add constraint link_pages_slug_not_reserved check (
  slug not in (
    -- 마케팅
    'brand','goodbye','instagram','pricing','privacy','reference','terms','threads','tiktok',
    -- 앱(로그인 후)
    'ads','analyze','audience','auto-dm','competitors','dashboard','discover','growth','insights',
    'library','links','notifications','publish','reports','scrap','settings','studio','support',
    -- 라우트 핸들러·시스템
    'api','auth','p','onboarding','robots.txt','sitemap.xml','icon.svg','favicon.ico','llms.txt',
    -- 사칭 방지
    'admin','app','login','logout','signup','signin','help','billing','official','team','about',
    'contact','root','system','static','assets','public','new','edit','delete','null','undefined',
    'finch','me','my'
  )
);

-- 서브 페이지(sub_slug)는 부모 아래에만 있어 라우트와 부딪히지 않는다 —
-- 0060 이 이미 go/vcard/dwell/s/p/api 를 막고 있어 그대로 둔다.
