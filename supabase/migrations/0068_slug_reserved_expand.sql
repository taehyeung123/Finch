-- 0068_slug_reserved_expand.sql — 예약어 확장 (2026-08-26 사장님 지시 «sns·finch·우리 페이지 주소들»)
--
-- 쏘넷 공격 점검(피싱 사칭·웹 인프라 관례·PRD 예정 라우트 3관점)으로 고른 36개를 0066 제약에 더한다.
-- 앱 목록(lib/links/reserved.ts)과 같은 커밋에서 함께 바뀐다 — 3중 방어(화면·서버·DB) 원칙 그대로.
-- finch-* 브랜드 프리픽스 차단은 앱 계층에만 있다(정책이라 자주 바뀌고, DB 에 굳히면
-- 기존 finch-* 페이지가 있을 때 제약 추가 자체가 실패한다).
--
-- 셀러가 실제로 쓸 낱말(shop·store·cafe·event·beauty 등)은 점검에서 «넣지 말 것»으로
-- 판정돼 일부러 없다 — 예약어 하나가 사용자 이름 하나를 뺏는다.

-- 자가 치유: 새 예약어와 충돌하는 기존 행이 있으면 제약 추가가 통째로 실패한다.
-- 실측(2026-08-26): slug 'sns' 인 페이지 1건 실존(운영자 본인 계정, 이 지시의 발단).
-- 충돌 행은 임시 무작위 주소로 옮기고 slug_set_at 을 비워 «주소 정하기» 모달이 다시 뜨게 한다
-- (주소를 뺏었으니 최초 1회 권한을 돌려주는 것 — 쿨다운도 함께 풀린다).
update public.link_pages
set slug = substr(md5(random()::text || id::text), 1, 8), slug_set_at = null
where slug in (
    'brand','features','goodbye','instagram','pricing','privacy','reference','terms','threads','tiktok',
    'ads','analyze','audience','auto-dm','competitors','dashboard','discover','growth','insights',
    'library','links','notifications','publish','reports','scrap','settings','studio','support',
    'login','signup','team','api','auth','p','go','oauth','onboarding','samples',
    'robots.txt','sitemap.xml','icon.svg','favicon.ico','llms.txt',
    'admin','app','logout','signin','help','billing','official','about','contact','root','system',
    'static','assets','public','new','edit','delete','null','undefined','finch','me','my','sns',
    'cs','notice','qna','faq','mypage','join',
    'account','verify','password','payment','pay','security','abuse','legal',
    'unsubscribe','report','invite','download','partners',
    'www','mail','cdn','blog','docs','status','dev','test','staging','beta','demo','mobile'
);

alter table public.link_pages drop constraint if exists link_pages_slug_not_reserved;
alter table public.link_pages add constraint link_pages_slug_not_reserved check (
  slug not in (
    -- 마케팅 (+ PRD PART 13.2 예정 라우트 features)
    'brand','features','goodbye','instagram','pricing','privacy','reference','terms','threads','tiktok',
    -- 앱(로그인 후)
    'ads','analyze','audience','auto-dm','competitors','dashboard','discover','growth','insights',
    'library','links','notifications','publish','reports','scrap','settings','studio','support',
    -- 인증·팀 라우트
    'login','signup','team',
    -- 라우트 핸들러·시스템·public/ 디렉터리
    'api','auth','p','go','oauth','onboarding','samples',
    'robots.txt','sitemap.xml','icon.svg','favicon.ico','llms.txt',
    -- 사칭 방지
    'admin','app','logout','signin','help','billing','official','about','contact','root','system',
    'static','assets','public','new','edit','delete','null','undefined','finch','me','my','sns',
    'cs','notice','qna','faq','mypage','join',
    'account','verify','password','payment','pay','security','abuse','legal',
    'unsubscribe','report','invite','download','partners',
    -- 웹 인프라 관례
    'www','mail','cdn','blog','docs','status','dev','test','staging','beta','demo','mobile'
  )
);
