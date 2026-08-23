import "server-only";
import { lookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import net from "node:net";

/*
  공개 호스트 전용 HTML 가져오기 — 「주소로 제목·이미지 불러오기」(리틀리 흡수 2단계)를 위해
  lib/links/index.ts 의 "서버가 남의 URL 을 fetch 하지 않는다" 결정에 **하나의 예외**를 뚫는다.
  그 주석이 요구한 방식 그대로다: global fetch 가 아니라 node:http(s).request 에 **커스텀 lookup** 을
  꽂아, 소켓이 실제로 연결될 IP 를 우리가 고르고 검사한다. DNS 리바인딩(검사 때 공인 IP, 연결 때
  사설 IP)은 검사와 연결이 같은 조회 결과를 쓰므로 성립하지 않는다.

  그 밖의 울타리: http/https 만 · 80/443 만 · 리다이렉트는 직접 따라가며 매 hop 같은 검사 · 6초 ·
  512KB · text/html 만 · 응답 헤더의 Set-Cookie 등은 읽지 않는다.
*/

/** 사설·루프백·링크로컬·멀티캐스트 — IPv4 매핑 IPv6(::ffff:a.b.c.d / ::ffff:XXXX:XXXX)도 IPv4 로 풀어 본다 */
export function isPrivateIp(raw: string): boolean {
  let ip = raw.trim().replace(/^\[|\]$/g, "").toLowerCase();
  const mapped = /^::ffff:(.+)$/.exec(ip);
  if (mapped) {
    const rest = mapped[1];
    if (net.isIPv4(rest)) ip = rest;
    else {
      const hex = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(rest);
      if (hex) {
        const hi = parseInt(hex[1], 16);
        const lo = parseInt(hex[2], 16);
        ip = `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
      }
    }
  }
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a >= 224) return true; // 멀티캐스트·예약
    return false;
  }
  if (net.isIPv6(ip)) {
    if (ip === "::1" || ip === "::") return true;
    if (/^f[cd]/.test(ip)) return true; // fc00::/7 ULA
    if (/^fe[89ab]/.test(ip)) return true; // fe80::/10 링크로컬
    if (/^2002:/.test(ip)) return true; // 6to4 — 안쪽 IPv4 를 검사하기 번거로우니 통째로 막는다
    return false;
  }
  return true; // IP 가 아니면 "모른다" = 막는다
}

export class SafeFetchError extends Error {}

type Hop = { status: number; headers: http.IncomingHttpHeaders; body: string };

function requestOnce(url: URL, timeoutMs: number, maxBytes: number): Promise<Hop> {
  return new Promise((resolve, reject) => {
    const mod = url.protocol === "https:" ? https : http;
    const req = mod.request(
      url,
      {
        method: "GET",
        headers: {
          "user-agent": "Mozilla/5.0 (compatible; FinchLinkBot/1.0; +https://finch.ai.kr)",
          accept: "text/html,application/xhtml+xml",
          "accept-language": "ko,en;q=0.8",
        },
        /* 연결 직전 조회 — 여기서 고른 주소로만 소켓이 열린다 */
        lookup: (hostname, options, cb) => {
          lookup(hostname, { all: true })
            .then((addrs) => {
              const ok = addrs.filter((a) => !isPrivateIp(a.address));
              if (addrs.length === 0 || ok.length !== addrs.length) {
                cb(new SafeFetchError("private"), "", 4);
                return;
              }
              const pick = ok[0];
              if (options && typeof options === "object" && options.all) cb(null, ok.map((a) => ({ address: a.address, family: a.family })));
              else cb(null, pick.address, pick.family);
            })
            .catch((e) => cb(e instanceof Error ? e : new Error(String(e)), "", 4));
        },
        timeout: timeoutMs,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        /* 리다이렉트는 본문을 읽지 않는다 */
        if ([301, 302, 303, 307, 308].includes(status)) {
          res.resume();
          resolve({ status, headers: res.headers, body: "" });
          return;
        }
        const ct = String(res.headers["content-type"] ?? "");
        if (!/text\/html|application\/xhtml/i.test(ct)) {
          res.resume();
          resolve({ status, headers: res.headers, body: "" });
          return;
        }
        let got = 0;
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => {
          got += chunk.length;
          chunks.push(chunk);
          /* <head> 만 필요하다 — 상한에 닿거나 </head> 가 보이면 끊는다 */
          if (got >= maxBytes || chunk.includes("</head>")) {
            res.destroy();
            resolve({ status, headers: res.headers, body: Buffer.concat(chunks).toString("utf8") });
          }
        });
        res.on("end", () => resolve({ status, headers: res.headers, body: Buffer.concat(chunks).toString("utf8") }));
        res.on("error", (e) => reject(e));
      },
    );
    req.on("timeout", () => req.destroy(new SafeFetchError("timeout")));
    req.on("error", (e) => reject(e));
    req.end();
  });
}

/**
 * 공개 호스트의 HTML(앞부분)을 가져온다. 실패는 SafeFetchError(메시지 코드) 또는 일반 Error.
 * 반환: 최종 URL 과 본문.
 */
export async function fetchPublicHtml(
  start: URL,
  { timeoutMs = 6000, maxBytes = 512 * 1024, maxHops = 4 }: { timeoutMs?: number; maxBytes?: number; maxHops?: number } = {},
): Promise<{ url: URL; html: string }> {
  let url = start;
  for (let hop = 0; hop < maxHops; hop++) {
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new SafeFetchError("scheme");
    const port = url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80;
    if (port !== 80 && port !== 443) throw new SafeFetchError("port");
    const host = url.hostname.replace(/^\[|\]$/g, "");
    if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) throw new SafeFetchError("private");
    if (net.isIP(host) && isPrivateIp(host)) throw new SafeFetchError("private");

    const res = await requestOnce(url, timeoutMs, maxBytes);
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const loc = res.headers.location;
      if (!loc) throw new SafeFetchError("redirect");
      url = new URL(Array.isArray(loc) ? loc[0] : loc, url);
      continue;
    }
    if (res.status < 200 || res.status >= 300) throw new SafeFetchError(`status:${res.status}`);
    if (!res.body) throw new SafeFetchError("not-html");
    return { url, html: res.body };
  }
  throw new SafeFetchError("hops");
}
