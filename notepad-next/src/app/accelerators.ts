/** "Mod" is Cmd on macOS and Ctrl elsewhere; the matcher is lenient and accepts either. */
export interface Accelerator {
  key: string;
  mod: boolean;
  shift: boolean;
  alt: boolean;
}

export function parseAccelerator(spec: string): Accelerator {
  const parts = spec.split("+");
  const key = parts.pop()!.toLowerCase();
  return { key, mod: parts.includes("Mod"), shift: parts.includes("Shift"), alt: parts.includes("Alt") };
}

export function matchesAccelerator(e: Pick<KeyboardEvent, "key" | "code" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey">, spec: string): boolean {
  const a = parseAccelerator(spec);
  const mod = e.metaKey || e.ctrlKey;
  if (a.mod !== mod || a.shift !== e.shiftKey || a.alt !== e.altKey) return false;
  // With Alt held macOS reports a different `key` (e.g. Option+J gives a symbol); fall back to the physical key.
  return e.key.toLowerCase() === a.key || (a.alt && e.code.toLowerCase() === `key${a.key}`);
}

export function formatAccelerator(spec: string, mac: boolean): string {
  const a = parseAccelerator(spec);
  const key = a.key.length === 1 ? a.key.toUpperCase() : a.key.replace(/^f(\d+)$/, "F$1").replace(/^./, (c) => c.toUpperCase());
  if (mac) return `${a.alt ? "⌥" : ""}${a.shift ? "⇧" : ""}${a.mod ? "⌘" : ""}${key}`;
  return [a.mod ? "Ctrl" : "", a.alt ? "Alt" : "", a.shift ? "Shift" : "", key].filter(Boolean).join("+");
}

export const isMac = () => typeof navigator !== "undefined" && /Mac/i.test(navigator.platform);
