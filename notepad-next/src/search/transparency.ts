export interface TransparencySettings {
  enabled: boolean;
  mode: "blur" | "always";
  /** Opacity applied while transparent, as a percentage (20-100). */
  level: number;
}

/** Dialog opacity (0-1) for the Transparency option. */
export function dialogOpacity(t: TransparencySettings, focused: boolean): number {
  if (!t.enabled) return 1;
  if (t.mode === "blur" && focused) return 1;
  return Math.min(100, Math.max(20, t.level)) / 100;
}
