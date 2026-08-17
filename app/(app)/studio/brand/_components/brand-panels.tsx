"use client";

import { useState } from "react";
import { BrandTone } from "../../_components/brand-tone";
import { BrandKitPanel } from "../../_components/brand-kit";
import type { BrandKit } from "../../brand-kit-actions";

/**
 * 브랜드 톤 + 브랜드 킷 — 스튜디오에서 옮겨온 두 패널.
 *
 * 스튜디오에서는 카드뉴스 렌더에 킷을 즉시 반영해야 해서 부모가 상태를 들고 있었지만,
 * 여기서는 저장이 목적이라 이 컴포넌트가 직접 들고 있으면 된다.
 * (BrandKitPanel 은 저장 시 자체 server action 을 호출한다 — brand-kit-actions.ts)
 */
export function BrandPanels() {
  const [kit, setKit] = useState<BrandKit | null>(null);

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <BrandTone />
      <BrandKitPanel kit={kit} onChange={setKit} />
    </div>
  );
}
