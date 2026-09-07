import "server-only";
import { lookup } from "node:dns/promises";
import https from "node:https";
import net from "node:net";
import { isPrivateIp, SafeFetchError } from "@/lib/links/safe-fetch";

/*
  공급사 CDN 썸네일 전용 가져오기 — «남의 URL 을 서버가 여는» 두 번째(이자 마지막) 예외.

  왜 생겼나 (2026-09-07 보안 감사): lib/pool/thumbs.ts 와 lib/reference/engine.ts 가
  공급사(ScrapeCreators·Apify·메타 광고 라이브러리)가 준 URL 을 **맨 fetch** 로 열고 있었다.
  스킴·호스트·사설 IP 검사가 한 줄도 없고 리다이렉트는 기본값(follow)이었다. Vercel 에는
  아웃바운드 방화벽이 없으므로(lib/links/index.ts:172-174 가 스스로 적어 둔 전제) 그 경로는
  «공급사 응답 한 줄 = 우리 함수의 임의 아웃바운드 요청» 이었고, 받아 온 바이트가
  **공개 버킷**(reference-thumbs)으로 그대로 나갔다 — 유출 통로가 된다.
  두 호출 모두 createAdminClient()(service_role) 컨텍스트에서 돈다.
  그리고 이건 저장소가 스스로 금지한 것이다: lib/links/index.ts:186
  «그 파일 밖에서 남의 URL 을 여는 코드는 여전히 금지다».

  울타리 (lib/links/safe-fetch.ts 와 같은 방식):
   · https 만, 443 포트만 — 평문 http 로 이미지를 받을 이유가 없다
   · node:https.request 에 **커스텀 lookup** 을 꽂아 소켓이 실제로 연결될 IP 를 우리가 고르고 검사한다.
     검사와 연결이 같은 조회 결과를 쓰므로 DNS 리바인딩이 성립하지 않는다.
   · 리다이렉트를 **따라가지 않는다**(3xx 면 실패) — 썸네일 CDN 이 리다이렉트할 이유가 없고,
     따라가는 순간 «첫 hop 만 안전한» 상태가 된다.
   · Content-Type 은 **우리가 정한 4종만** 통과시키고, 저장할 때도 원격이 준 문자열이 아니라
     여기서 고른 값을 쓴다(원격이 정한 text/html 이 공개 버킷에 그대로 굳는 것을 막는다).
   · 바이트 상한을 스트리밍 중에 건다 — 다 받은 뒤에 재는 것은 상한이 아니다.
   · 응답 헤더는 Content-Type 외에 아무것도 읽지 않는다(Set-Cookie 등 무시).
*/

/** 저장까지 허용하는 이미지 형식 — 키가 우리가 저장할 Content-Type, 값이 확장자 */
const ALLOWED: ReadonlyArray<readonly [RegExp, string, string]> = [
  [/^image\/jpe?g\b/i, "image/jpeg", "jpg"],
  [/^image\/png\b/i, "image/png", "png"],
  [/^image\/webp\b/i, "image/webp", "webp"],
  [/^image\/gif\b/i, "image/gif", "gif"],
];

export interface SafeImage {
  buf: Buffer;
  /** 원격이 준 문자열이 아니라 위 표에서 고른 값 */
  contentType: string;
  /** 위 표에서 고른 확장자 */
  ext: string;
}

/**
 * 공급사 CDN 이미지 한 장을 안전하게 받는다. 실패는 전부 null — 호출측은 썸네일을 포기하고 계속한다.
 * (수집 자체를 막지 않는다는 기존 규칙 유지.)
 */
export async function fetchSupplierImage(
  raw: string,
  { timeoutMs = 10_000, maxBytes = 2_000_000 }: { timeoutMs?: number; maxBytes?: number } = {},
): Promise<SafeImage | null> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.port && url.port !== "443") return null;

  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    return null;
  }
  if (net.isIP(host) && isPrivateIp(host)) return null;

  try {
    return await requestImage(url, timeoutMs, maxBytes);
  } catch {
    return null;
  }
}

function requestImage(url: URL, timeoutMs: number, maxBytes: number): Promise<SafeImage | null> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: "GET",
        headers: {
          "user-agent": "Mozilla/5.0 (compatible; FinchThumbBot/1.0; +https://finch.ai.kr)",
          accept: "image/avif,image/webp,image/jpeg,image/png,*/*;q=0.5",
        },
        /* 연결 직전 조회 — 여기서 고른 주소로만 소켓이 열린다(safe-fetch 와 같은 수법).
           하나라도 사설이면 통째로 거절한다: 공인 IP 를 섞어 두고 재조회를 노리는 수를 막는다. */
        lookup: (hostname, options, cb) => {
          lookup(hostname, { all: true })
            .then((addrs) => {
              const ok = addrs.filter((a) => !isPrivateIp(a.address));
              if (addrs.length === 0 || ok.length !== addrs.length) {
                cb(new SafeFetchError("private"), "", 4);
                return;
              }
              if (options && typeof options === "object" && options.all) {
                cb(null, ok.map((a) => ({ address: a.address, family: a.family })));
              } else {
                cb(null, ok[0].address, ok[0].family);
              }
            })
            .catch((e) => cb(e instanceof Error ? e : new Error(String(e)), "", 4));
        },
        timeout: timeoutMs,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        /* 리다이렉트는 **따라가지 않는다** — 목적지가 다시 검사되지 않는 hop 이 생기면 울타리가 무의미하다 */
        if (status !== 200) {
          res.resume();
          resolve(null);
          return;
        }
        const ct = String(res.headers["content-type"] ?? "");
        const match = ALLOWED.find(([re]) => re.test(ct));
        if (!match) {
          res.resume();
          resolve(null);
          return;
        }
        /* 헤더가 이미 상한을 넘었다고 말하면 본문을 받지 않는다(대역폭 절약) */
        const declared = Number(res.headers["content-length"] ?? NaN);
        if (Number.isFinite(declared) && declared > maxBytes) {
          res.resume();
          resolve(null);
          return;
        }

        let got = 0;
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => {
          got += chunk.length;
          if (got > maxBytes) {
            /* 상한은 **받는 중에** 건다 — 다 받고 재면 상한이 아니라 사후 보고다 */
            res.destroy();
            resolve(null);
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () => {
          if (got === 0) {
            resolve(null);
            return;
          }
          resolve({ buf: Buffer.concat(chunks), contentType: match[1], ext: match[2] });
        });
        res.on("error", (e) => reject(e));
      },
    );
    req.on("timeout", () => req.destroy(new SafeFetchError("timeout")));
    req.on("error", (e) => reject(e));
    req.end();
  });
}
