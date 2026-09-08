/*
  글꼴 패키지 버전 고정표 — 2026-09-08 실측 시점의 @5 해석 결과.

  왜 고정하나 (2026-09-08 보안 감사): 예전엔 `@fontsource/<pkg>@5` 라는 **떠 있는 범위**를 썼다.
  jsdelivr 는 npm 에 새 5.x 가 올라오면 12시간 안에 새 내용을 집어 오고 브라우저는 7일 캐시한다 —
  즉 우리가 아무것도 배포하지 않아도 **공개 프로필 전 방문자와 편집 화면에 실리는 CSS 가 바뀔 수 있다.**
  CSP 의 script-src 에는 jsdelivr 가 없어 스크립트 실행까지는 못 가지만, CSS 만으로도
  속성 선택자 + background:url() 로 값을 실어 보내고 ::before·position 으로 화면을 덮을 수 있다.

  ⚠️ 여기 없는 패키지는 fontStylesheets 가 **글꼴을 싣지 않는다**(떠 있는 범위로 되돌아가지 않는다).
  글꼴을 추가하면 이 표에도 넣어야 하고, 넣기 전에 그 주소가 실제로 200 인지 확인한다.
  갱신 방법: 각 패키지의 `@5` 가 지금 무엇으로 풀리는지 확인하고(응답 헤더 x-jsd-version)
  index.css·700.css 가 200 인지 대조한 뒤 이 표를 바꾼다. 2026-09-08 에는 40개 60주소 전부 200 이었다.
*/
export const FONT_PKG_VERSIONS: Readonly<Record<string, string>> = {
  "bebas-neue": "5.2.7",
  "black-han-sans": "5.3.0",
  "caveat": "5.2.8",
  "cute-font": "5.2.8",
  "dm-serif-display": "5.3.0",
  "do-hyeon": "5.3.0",
  "dongle": "5.3.0",
  "east-sea-dokdo": "5.3.0",
  "gaegu": "5.2.8",
  "gamja-flower": "5.3.0",
  "gothic-a1": "5.3.0",
  "gowun-batang": "5.3.0",
  "gowun-dodum": "5.3.0",
  "gugi": "5.2.7",
  "hahmlet": "5.3.0",
  "hi-melody": "5.2.8",
  "ibm-plex-sans-kr": "5.2.8",
  "inter": "5.2.8",
  "jua": "5.3.0",
  "kirang-haerang": "5.3.0",
  "lora": "5.2.8",
  "montserrat": "5.2.8",
  "nanum-brush-script": "5.3.0",
  "nanum-gothic": "5.3.0",
  "nanum-gothic-coding": "5.3.0",
  "nanum-myeongjo": "5.3.0",
  "nanum-pen-script": "5.3.0",
  "noto-sans-kr": "5.3.0",
  "noto-serif-kr": "5.2.9",
  "pacifico": "5.3.0",
  "playfair-display": "5.2.8",
  "poor-story": "5.3.0",
  "poppins": "5.2.7",
  "raleway": "5.3.0",
  "single-day": "5.3.1",
  "song-myung": "5.3.1",
  "space-grotesk": "5.2.10",
  "stylish": "5.3.1",
  "sunflower": "5.3.1",
  "yeon-sung": "5.2.8",
};
