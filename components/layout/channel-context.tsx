"use client";

import { createContext, useContext, useState } from "react";
import type { ChannelFilter } from "@/lib/types";

/** 전역 채널 스위처 상태 (PART 6.2 상단바) — 대시보드 등 페이지들이 구독 */
const ChannelContext = createContext<{
  channel: ChannelFilter;
  setChannel: (c: ChannelFilter) => void;
}>({ channel: "all", setChannel: () => {} });

export function ChannelProvider({ children }: { children: React.ReactNode }) {
  const [channel, setChannel] = useState<ChannelFilter>("all");
  return <ChannelContext.Provider value={{ channel, setChannel }}>{children}</ChannelContext.Provider>;
}

export function useChannel() {
  return useContext(ChannelContext);
}
