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
