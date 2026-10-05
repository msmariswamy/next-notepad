export type Theme = "system" | "light" | "dark";

/** Mirrors the Rust `Settings` struct (camelCase JSON). */
export interface Settings {
  silentClose: boolean;
  theme: Theme;
  fontFamily: string;
  fontSize: number;
  wordWrap: boolean;
  showWhitespace: boolean;
  largeFileThresholdBytes: number;
}

export const DEFAULT_SETTINGS: Settings = {
  silentClose: false,
  theme: "system",
  fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
  fontSize: 13,
  wordWrap: false,
  showWhitespace: false,
  largeFileThresholdBytes: 50 * 1024 * 1024,
};

export const MIN_FONT_SIZE = 8;
export const MAX_FONT_SIZE = 72;

/** Clamp user input into a safe range so a typo cannot make the editor unusable. */
export function sanitizeSettings(s: Settings): Settings {
  const size = Number.isFinite(s.fontSize) ? Math.round(s.fontSize) : DEFAULT_SETTINGS.fontSize;
  return {
    ...s,
    fontSize: Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, size)),
    largeFileThresholdBytes:
      s.largeFileThresholdBytes > 0 ? Math.round(s.largeFileThresholdBytes) : DEFAULT_SETTINGS.largeFileThresholdBytes,
  };
}

export function resolveTheme(theme: Theme, systemPrefersDark: boolean): "light" | "dark" {
  return theme === "system" ? (systemPrefersDark ? "dark" : "light") : theme;
}

export function settingsToCssVars(s: Settings): Record<string, string> {
  return { "--editor-font-size": `${s.fontSize}px`, "--editor-font-family": s.fontFamily };
}

export interface SettingsSource {
  get(): Settings;
  subscribe(fn: (s: Settings) => void): () => void;
}
