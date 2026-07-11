import type { Metadata } from "next";
import Image from "next/image";
import { Download } from "lucide-react";

export const metadata: Metadata = {
  title: "브랜드 · 로고 다운로드",
  description:
    "핀치(Finch) 로고와 앱 아이콘 에셋 다운로드. 앱 심사, 스토어 등록, 언론 보도용 로고를 SVG·PNG로 제공합니다.",
  alternates: { canonical: "/brand" },
};

/* 심사·스토어 규격 안내와 함께 다운로드 링크를 제공한다.
   Meta 앱 1024 / Google OAuth 120 / Kakao 108·512 등. */

interface Asset {
  title: string;
  desc: string;
  preview: string;
  previewBg: "coral" | "dark" | "checker";
  files: { label: string; href: string }[];
}

const ICON_ASSETS: Asset[] = [
  {
    title: "앱 아이콘 (코랄)",
    desc: "기본 앱 아이콘. Meta 앱 심사 1024px, Google OAuth 동의화면 120px, Kakao 108·512px 규격 포함.",
    preview: "/brand/finch-app-icon-512.png",
    previewBg: "coral",
    files: [
      { label: "SVG", href: "/brand/finch-app-icon.svg" },
      { label: "1024", href: "/brand/finch-app-icon-1024.png" },
      { label: "512", href: "/brand/finch-app-icon-512.png" },
      { label: "256", href: "/brand/finch-app-icon-256.png" },
      { label: "192", href: "/brand/finch-app-icon-192.png" },
      { label: "180", href: "/brand/finch-app-icon-180.png" },
      { label: "120", href: "/brand/finch-app-icon-120.png" },
      { label: "108", href: "/brand/finch-app-icon-108.png" },
    ],
  },
  {
    title: "앱 아이콘 (다크)",
    desc: "어두운 배경 위 또는 라이트 UI에서 쓰는 반전 버전.",
    preview: "/brand/finch-app-icon-dark-512.png",
    previewBg: "dark",
    files: [
      { label: "SVG", href: "/brand/finch-app-icon-dark.svg" },
      { label: "1024", href: "/brand/finch-app-icon-dark-1024.png" },
      { label: "512", href: "/brand/finch-app-icon-dark-512.png" },
      { label: "256", href: "/brand/finch-app-icon-dark-256.png" },
    ],
  },
];

const MARK_ASSETS: Asset[] = [
  {
    title: "심볼 마크 (코랄)",
    desc: "배경 없는 투명 심볼. 어두운 배경 위에 사용.",
    preview: "/brand/finch-mark-coral-512.png",
    previewBg: "dark",
    files: [
      { label: "SVG", href: "/brand/finch-mark-coral.svg" },
      { label: "512", href: "/brand/finch-mark-coral-512.png" },
      { label: "256", href: "/brand/finch-mark-coral-256.png" },
    ],
  },
  {
    title: "심볼 마크 (다크)",
    desc: "밝은 배경 위에 사용하는 무채색 심볼.",
    preview: "/brand/finch-mark-dark-512.png",
    previewBg: "checker",
    files: [
      { label: "SVG", href: "/brand/finch-mark-dark.svg" },
      { label: "512", href: "/brand/finch-mark-dark-512.png" },
      { label: "256", href: "/brand/finch-mark-dark-256.png" },
    ],
  },
];

const WIDE_ASSETS: Asset[] = [
  {
    title: "워드마크 로고",
    desc: "심볼 + 핀치 Finch 가로 조합. 문서·프레젠테이션 헤더용.",
    preview: "/brand/finch-wordmark-880.png",
    previewBg: "dark",
    files: [
      { label: "SVG", href: "/brand/finch-wordmark.svg" },
      { label: "PNG 880", href: "/brand/finch-wordmark-880.png" },
    ],
  },
  {
    title: "소셜 공유 이미지 (OG)",
    desc: "1200×630 오픈그래프 이미지. 링크 공유·보도자료 썸네일용.",
    preview: "/brand/finch-og-1200.png",
    previewBg: "dark",
    files: [
      { label: "SVG", href: "/brand/finch-og.svg" },
      { label: "PNG 1200", href: "/brand/finch-og-1200.png" },
    ],
  },
];

const PREVIEW_BG: Record<Asset["previewBg"], string> = {
  coral: "bg-primary",
  dark: "bg-surface",
  checker: "bg-white",
};

function AssetCard({ asset, wide = false }: { asset: Asset; wide?: boolean }) {
  return (
    <div className="rounded-card border border-line bg-body p-5">
      <div
        className={`flex items-center justify-center overflow-hidden rounded-card border border-line ${PREVIEW_BG[asset.previewBg]} ${wide ? "aspect-[1200/630]" : "aspect-square"}`}
      >
        {/* 프리뷰는 장식용 — 실제 규격은 아래 다운로드 버튼 라벨 참고 */}
        <Image
          src={asset.preview}
          alt={`${asset.title} 미리보기`}
          width={wide ? 480 : 200}
          height={wide ? 252 : 200}
          className={wide ? "h-auto w-full" : "size-1/2"}
          unoptimized
        />
      </div>
      <h3 className="mt-4 text-[15px] font-bold">{asset.title}</h3>
      <p className="mt-1 text-[13px] leading-relaxed text-fg-sub">{asset.desc}</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {asset.files.map((f) => (
          <a
            key={f.href}
            href={f.href}
            download
            className="inline-flex items-center gap-1 rounded-chip border border-line bg-overlay px-3 py-1 text-xs font-semibold text-fg-sub transition-colors hover:border-primary hover:text-primary"
          >
            <Download className="size-3" aria-hidden />
            {f.label}
          </a>
        ))}
      </div>
    </div>
  );
}

export default function BrandPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-16 md:px-6">
      <header className="max-w-2xl">
        <h1 className="text-3xl font-bold md:text-4xl">브랜드 · 로고</h1>
        <p className="mt-4 text-[16px] leading-relaxed text-fg-sub">
          핀치(Finch)의 로고와 앱 아이콘입니다. 앱 심사(Meta·Google·Kakao), 스토어 등록, 보도자료에
          바로 쓸 수 있도록 SVG 원본과 규격별 PNG를 함께 제공합니다.
        </p>
      </header>

      {/* 심사 규격 안내 */}
      <div className="mt-8 rounded-card border border-line bg-body p-5">
        <h2 className="text-[15px] font-bold">심사·등록 규격 가이드</h2>
        <ul className="mt-3 grid gap-2 text-[13px] text-fg-sub sm:grid-cols-2">
          <li>· Meta 앱 대시보드 아이콘: <span className="text-fg">1024×1024 PNG</span></li>
          <li>· Google OAuth 동의화면 로고: <span className="text-fg">120×120 PNG</span> (1MB 이하)</li>
          <li>· Kakao 앱 아이콘: <span className="text-fg">108 또는 512 PNG</span></li>
          <li>· apple-touch-icon: <span className="text-fg">180×180 PNG</span></li>
        </ul>
      </div>

      <section className="mt-10">
        <h2 className="text-xl font-bold">앱 아이콘</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {ICON_ASSETS.map((a) => (
            <AssetCard key={a.title} asset={a} />
          ))}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-bold">심볼 마크</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {MARK_ASSETS.map((a) => (
            <AssetCard key={a.title} asset={a} />
          ))}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-bold">로고 · 소셜 이미지</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {WIDE_ASSETS.map((a) => (
            <AssetCard key={a.title} asset={a} wide />
          ))}
        </div>
      </section>

      {/* 사용 규칙 */}
      <section className="mt-12 rounded-card border border-line bg-body p-6">
        <h2 className="text-[15px] font-bold">사용 규칙</h2>
        <ul className="mt-3 space-y-2 text-[13px] leading-relaxed text-fg-sub">
          <li>· 로고 주변에는 심볼 높이의 절반 이상 여백을 확보해 주세요.</li>
          <li>· 브랜드 코랄(#FF6B4A)과 다크(#0C0C11) 외의 색으로 로고 색을 바꾸지 마세요.</li>
          <li>· 로고를 기울이거나 늘리거나 그림자·외곽선을 추가하지 마세요.</li>
          <li>· 심볼과 워드마크의 비율·간격을 임의로 조정하지 마세요.</li>
        </ul>
      </section>
    </div>
  );
}
