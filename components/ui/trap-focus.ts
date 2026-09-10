/** 모달 안 Tab 순환 — 마지막에서 Tab 은 처음으로, 처음에서 Shift+Tab 은 마지막으로. 루트 자신에 포커스가 있을 때도 처리 */
export function trapFocus(root: HTMLElement | null, e: React.KeyboardEvent) {
  if (e.key !== "Tab" || !root) return;
  const els = [...root.querySelectorAll<HTMLElement>('button, input, textarea, select, a[href], [tabindex]:not([tabindex="-1"])')].filter(
    (el) => !el.hasAttribute("disabled"),
  );
  if (!els.length) {
    e.preventDefault();
    return;
  }
  const first = els[0];
  const last = els[els.length - 1];
  if (e.shiftKey && (document.activeElement === first || document.activeElement === root)) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

/**
 * 이 스크림(role="dialog" aria-modal="true" 인 요소)이 지금 맨 위 모달인가 — DOM 상 마지막 dialog 가 맨 위다(둘 다 z-50 이면 DOM 순서가 쌓임 순서).
 * document 에 Esc 리스너를 거는 모달은 닫기 전에 이걸 본다 — 안 보면 위에 뜬 확인 모달·날짜 픽커와 함께 Esc 한 번에 둘 다 닫혀
 * 바깥 모달의 입력이 증발한다(2026-08-27 ModalShell, 2026-09-11 작성 모달 두 곳).
 */
export function isTopmostDialog(scrim: Element | null | undefined): boolean {
  const dialogs = document.querySelectorAll('[role="dialog"][aria-modal="true"]');
  return dialogs.length <= 1 || dialogs[dialogs.length - 1] === scrim;
}
