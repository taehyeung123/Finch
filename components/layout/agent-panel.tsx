"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { ArrowRight, Send, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { FinchMark } from "@/components/logo";

/**
 * 플로팅 AI 에이전트 챗 패널 (PART 4.9, 6.2) — 전 페이지 공통.
 * 응답은 위젯형(관련 화면으로 이동하는 카드 첨부)으로 설계한다.
 * TODO(최후순위): 목 응답을 Claude API Function Calling으로 교체
 * (get_dashboard_summary, search_trending, analyze_account, generate_card_news 등).
 */

interface AgentMessage {
  role: "user" | "agent";
  text: string;
  linkCard?: { href: string; label: string };
}

const PRESETS = [
  "이번 주 우리 인스타 어때?",
  "요즘 뷰티 카테고리에서 뜨는 릴스 찾아줘",
  "경쟁사 새 광고 있어?",
  "이 주제로 카드뉴스 만들어줘",
];

function mockReply(q: string): AgentMessage {
  if (q.includes("인스타") || q.includes("어때") || q.includes("성과")) {
    return {
      role: "agent",
      text: "이번 주 Instagram 팔로워는 1,240명 늘어 4만 8,200명이 됐고, 주간 조회수는 62만 회로 지난주보다 8.1% 상승했어요. 최근 릴스 '여름 신제품 언박싱'이 성장을 이끌고 있습니다.",
      linkCard: { href: "/dashboard", label: "대시보드에서 자세히 보기" },
    };
  }
  if (q.includes("트렌드") || q.includes("뜨는") || q.includes("뷰티")) {
    return {
      role: "agent",
      text: "뷰티 카테고리에서 팔로워 대비 조회수 28.6배를 기록 중인 '5초 쿨톤 베이스 루틴' 콘텐츠가 가장 눈에 띄어요. 최근 6시간 급상승 콘텐츠 4건을 탐색 탭에 정리해뒀습니다.",
      linkCard: { href: "/discover", label: "탐색에서 트렌드 보기" },
    };
  }
  if (q.includes("광고")) {
    return {
      role: "agent",
      text: "오늘 오전 6시에 '오로라 브랜드'의 신규 영상 광고 1건이 감지됐어요. 인스타그램·페이스북에 동시 게재 중이고, 첫 구매 30% 할인 소재입니다.",
      linkCard: { href: "/competitors/ads", label: "광고 모니터링 열기" },
    };
  }
  if (q.includes("카드뉴스") || q.includes("만들어")) {
    return {
      role: "agent",
      text: "좋아요. 주제만 입력하면 슬라이드별 카피를 만들어드릴게요. AI 스튜디오의 카드뉴스 생성기로 이동할까요?",
      linkCard: { href: "/studio", label: "AI 스튜디오 열기" },
    };
  }
  return {
    role: "agent",
    text: "채널 성과 요약, 트렌드 탐색, 경쟁사 광고 확인, 카드뉴스 생성까지 도와드릴 수 있어요. 아래 자주 쓰는 질문을 눌러보셔도 좋아요.",
  };
}

export function AgentPanel() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<AgentMessage[]>([
    {
      role: "agent",
      text: "안녕하세요, 핀치입니다. 오늘의 채널 소식이 궁금하시면 무엇이든 물어보세요.",
    },
  ]);
  const [input, setInput] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  function send(text: string) {
    const q = text.trim();
    if (!q) return;
    setMessages((prev) => [...prev, { role: "user", text: q }, mockReply(q)]);
    setInput("");
    requestAnimationFrame(() => {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="AI 에이전트 열기"
        className={cn(
          "fixed bottom-20 right-4 z-40 flex size-13 items-center justify-center rounded-chip bg-primary text-on-primary transition-colors hover:bg-primary-hover md:bottom-6 md:right-6",
          open && "hidden",
        )}
      >
        <FinchMark className="size-6 text-on-primary" />
      </button>

      {open ? (
        <div className="shadow-pop fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-line bg-overlay">
          <div className="flex h-16 items-center justify-between border-b border-line px-5">
            <span className="inline-flex items-center gap-2 font-bold">
              <FinchMark className="size-5 text-primary" />
              AI 에이전트
              <span className="rounded-chip bg-primary-weak px-2 py-0.5 text-[11px] font-semibold text-primary">베타</span>
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="닫기"
              className="rounded-card p-1.5 text-fg-faint hover:bg-body hover:text-fg"
            >
              <X className="size-5" />
            </button>
          </div>

          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto p-5">
            {messages.map((m, i) => (
              <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[85%] rounded-card px-3.5 py-2.5 text-[14px] leading-relaxed",
                    m.role === "user" ? "bg-primary text-on-primary" : "bg-body border border-line text-fg",
                  )}
                >
                  {m.text}
                  {m.linkCard ? (
                    <Link
                      href={m.linkCard.href}
                      onClick={() => setOpen(false)}
                      className="mt-2.5 flex items-center justify-between gap-2 rounded-card border border-line bg-overlay px-3 py-2 text-[13px] font-semibold text-primary hover:border-primary"
                    >
                      {m.linkCard.label}
                      <ArrowRight className="size-3.5" aria-hidden />
                    </Link>
                  ) : null}
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-line p-4">
            <div className="mb-3 flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => send(p)}
                  className="rounded-chip border border-line bg-body px-3 py-1 text-xs text-fg-sub hover:border-primary hover:text-primary"
                >
                  {p}
                </button>
              ))}
            </div>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                send(input);
              }}
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="무엇이든 물어보세요"
                className="h-10 flex-1 rounded-card border border-line bg-body px-3 text-[15px] placeholder:text-fg-faint focus:border-primary focus:outline-none"
              />
              <button
                type="submit"
                aria-label="전송"
                className="flex size-10 items-center justify-center rounded-card bg-primary text-on-primary hover:bg-primary-hover"
              >
                <Send className="size-4" />
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
