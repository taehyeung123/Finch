"use client";

import { useEffect, useRef, useState } from "react";

/*
  카카오 지도 임베드(2026-08-28) — 지도 블록의 점진적 강화.

  원가 원칙(무료 쿼터 30만/일이 하드 캡, 비즈월렛 미연결 = 과금 0원):
  ① 화면에 들어와야만 SDK 를 로드한다(IntersectionObserver) — 지도 블록까지
     스크롤하지 않은 방문은 쿼터를 쓰지 않는다.
  ② 실패(스크립트 차단·한도 초과·좌표 못 찾는 자유 표기 주소)는 지도 영역만
     조용히 숨고, 주소 카드(길찾기 링크)는 항상 남는다 — 지도는 강화일 뿐
     없어도 고장으로 보이지 않는다.
  ③ 같은 주소는 다시 지오코딩하지 않는다(모듈 캐시) — 편집기 탭 전환·모달이
     블록을 다시 마운트해도 쿼터가 나가지 않는다(쏘넷 점검).

  JS 키는 도메인 제한(finch.ai.kr·localhost:3100)이 걸린 **공개 키**다 — 페이지
  소스에 노출되는 것이 카카오의 설계라 시크릿이 아니다(앱: Finch, ID 1515927).
*/
const KAKAO_JS_KEY = process.env.NEXT_PUBLIC_KAKAO_JS_KEY ?? "52e7ce49c05eadd7b8a16436e17a9558";
const SDK_ID = "kakao-maps-sdk";
const SDK_SRC = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_JS_KEY}&autoload=false&libraries=services`;

/* 필요한 만큼만 적은 SDK 타입 — @types 패키지 없이 간다 */
type KakaoLatLng = object;
type KakaoMapObj = { setCenter: (c: KakaoLatLng) => void; relayout: () => void };
type KakaoNS = {
  maps: {
    load: (cb: () => void) => void;
    LatLng: new (lat: number, lng: number) => KakaoLatLng;
    Map: new (el: HTMLElement, opts: Record<string, unknown>) => KakaoMapObj;
    Marker: new (opts: { map: KakaoMapObj; position: KakaoLatLng }) => { setPosition: (c: KakaoLatLng) => void };
    services: {
      Geocoder: new () => {
        addressSearch: (q: string, cb: (r: Array<{ x: string; y: string }>, status: string) => void) => void;
      };
      Status: { OK: string };
    };
  };
};

/** SDK 는 페이지에 한 번만 — 동시에 여러 지도 블록이 떠도 스크립트는 하나다 */
let sdkPromise: Promise<KakaoNS | null> | null = null;
function loadSdk(): Promise<KakaoNS | null> {
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve) => {
    const w = window as unknown as { kakao?: KakaoNS };
    /* 실패는 «없음»이 아니다 — 타임아웃은 로더(dapi.kakao.com)만이 아니라
       kakao.maps.load 의 2단계 엔진 로드(t1.daumcdn.net — 카카오 내부 로더에
       onerror 가 없어 실패해도 콜백이 영영 안 온다)까지 전 구간을 지킨다(쏘넷 점검).
       실패 시 프로미스와 <script> 요소를 **함께** 버린다 — 죽은 요소를 남기면
       다음 시도가 그걸 재사용해 영구 불능이 된다(쏘넷 점검). */
    let settled = false;
    const finish = (v: KakaoNS | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      if (!v) {
        sdkPromise = null;
        document.getElementById(SDK_ID)?.remove();
      }
      resolve(v);
    };
    const timer = window.setTimeout(() => finish(null), 12_000);
    const ready = () => w.kakao!.maps.load(() => finish(w.kakao!));
    if (w.kakao?.maps) {
      ready();
      return;
    }
    let el = document.getElementById(SDK_ID) as HTMLScriptElement | null;
    if (!el) {
      el = document.createElement("script");
      el.id = SDK_ID;
      el.src = SDK_SRC;
      el.async = true;
      document.head.appendChild(el);
    }
    el.addEventListener("load", () => {
      if ((window as unknown as { kakao?: KakaoNS }).kakao?.maps) ready();
      else finish(null);
    });
    el.addEventListener("error", () => finish(null));
  });
  return sdkPromise;
}

/** 주소 → 좌표 모듈 캐시 — 같은 주소 재지오코딩 금지(쿼터). 편집 세션 안에서만 산다 */
const geoCache = new Map<string, { lat: number; lng: number }>();

export function KakaoMap({ address, className = "" }: { address: string; className?: string }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<KakaoMapObj | null>(null);
  const markerRef = useRef<{ setPosition: (c: KakaoLatLng) => void } | null>(null);
  const centerRef = useRef<KakaoLatLng | null>(null);
  /* pending(회색 펄스) → shown | failed(숨김). failed 여도 div 는 hidden 으로 남겨 두어
     주소를 고쳐 쓰면(편집 미리보기) 같은 컨테이너로 재시도할 수 있다. */
  const [state, setState] = useState<"pending" | "shown" | "failed">("pending");
  const [seen, setSeen] = useState(false);
  /* 첫 로드는 즉시 — 0.6초 디바운스는 «타이핑 중 주소 변경»용이지 첫 표시용이 아니다(쏘넷: 빈 판) */
  const firstRun = useRef(true);

  /* ① 뷰포트에 들어와야 시작 — 쿼터는 «지도를 실제로 본 방문»만 쓴다 */
  useEffect(() => {
    const el = boxRef.current;
    if (!el || seen) return;
    if (typeof IntersectionObserver === "undefined") {
      /* 관찰자가 없는 옛 브라우저는 그냥 바로 — 비동기로 넘겨 렌더 연쇄를 피한다 */
      const t = window.setTimeout(() => setSeen(true), 0);
      return () => window.clearTimeout(t);
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          io.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);

  /* ② 로드 + 지오코딩 + 렌더. 주소가 바뀌면(편집 미리보기 타이핑) 0.6초 뒤에만 따라간다 */
  useEffect(() => {
    const q = address.trim();
    if (!seen || !q) return;
    let cancelled = false;
    const delay = firstRun.current ? 0 : 600;
    firstRun.current = false;
    const timer = window.setTimeout(async () => {
      const kakao = await loadSdk();
      if (cancelled) return;
      if (!kakao || !boxRef.current) {
        setState("failed");
        return;
      }
      const draw = (lat: number, lng: number) => {
        if (cancelled || !boxRef.current) return;
        const center = new kakao.maps.LatLng(lat, lng);
        centerRef.current = center;
        if (!mapRef.current) {
          /* 프로필 페이지의 지도는 «보는» 지도다 — 스크롤 중 잡아채지 않게 조작은 끈다.
             자세히 보고 싶으면 아래 카드가 카카오맵으로 보낸다. */
          mapRef.current = new kakao.maps.Map(boxRef.current, {
            center,
            level: 4,
            draggable: false,
            scrollwheel: false,
            disableDoubleClickZoom: true,
          });
        } else {
          mapRef.current.setCenter(center);
        }
        /* 주소가 바뀌면 마커는 옮긴다 — 매번 새로 만들면 이전 마커가 쌓인다 */
        if (markerRef.current) markerRef.current.setPosition(center);
        else markerRef.current = new kakao.maps.Marker({ map: mapRef.current, position: center });
        setState("shown");
      };
      const cached = geoCache.get(q);
      if (cached) {
        draw(cached.lat, cached.lng);
        return;
      }
      new kakao.maps.services.Geocoder().addressSearch(q, (results, status) => {
        if (cancelled) return;
        const hit = status === kakao.maps.services.Status.OK ? results[0] : undefined;
        if (!hit) {
          /* 자유 표기 주소(해외·건물명만 등)는 좌표가 없다 — 지도만 숨고 카드가 말한다 */
          setState("failed");
          return;
        }
        const lat = Number(hit.y);
        const lng = Number(hit.x);
        if (geoCache.size > 100) geoCache.clear();
        geoCache.set(q, { lat, lng });
        draw(lat, lng);
      });
    }, delay);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [seen, address]);

  /* ③ 타일 재계산은 shown 이 **커밋된 뒤**에 — rAF 는 커밋 전에 돌 수 있어
     hidden(0×0)→shown 재시도 경로에서 빈 지도를 남겼다(쏘넷 점검) */
  useEffect(() => {
    if (state !== "shown") return;
    mapRef.current?.relayout();
    if (centerRef.current) mapRef.current?.setCenter(centerRef.current);
  }, [state]);

  return (
    <div
      ref={boxRef}
      /* 장식 지도(조작 불가) — aria-hidden 만으로는 SDK 가 그리는 로고 앵커가
         «보조기기엔 없는데 Tab 으론 닿는» 요소가 된다. inert 로 탭 정지까지 걷는다 */
      aria-hidden
      inert
      className={`relative w-full overflow-hidden ${state === "failed" || !address.trim() ? "hidden" : ""} ${state === "pending" ? "animate-pulse bg-[var(--lp-border)]" : ""} ${className}`}
    >
      {state === "pending" ? (
        /* 로드 전에도 «지도 자리»로 읽히게 — 빈 회색 판은 고장으로 보인다(쏘넷 점검) */
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--lp-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.55">
            <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
        </span>
      ) : null}
    </div>
  );
}
