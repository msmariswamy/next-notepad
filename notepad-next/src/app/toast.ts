/** Transient message area (JSON validation results, save errors). */
export function createToaster(el: HTMLElement, durationMs = 4000): (message: string, kind: "info" | "error") => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  el.setAttribute("role", "status");
  return (message, kind) => {
    el.textContent = message;
    el.className = `toast ${kind}`;
    el.hidden = false;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => (el.hidden = true), durationMs);
  };
}
