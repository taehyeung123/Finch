import { PageLoading } from "@/components/ui/page-loading";

/*
  (app) 그룹 공용 로딩 — 이 그룹의 모든 페이지에 적용된다.
  사이드바·상단바는 layout.tsx가 들고 있으므로 그대로 남고 본문 자리만 바뀐다.

  페이지별 loading.tsx를 두지 않는다(전부 지웠다). 페이지마다 다른 골격을 그리면
  어떤 페이지는 부드럽고 어떤 페이지는 덜컹거려서, 앱 전체가 일관되지 않게 느껴진다.
*/
export default function AppLoading() {
  return <PageLoading />;
}
