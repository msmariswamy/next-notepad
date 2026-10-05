import type { Settings, Theme } from "./model";
import type { SettingsStore } from "./store";

const MB = 1024 * 1024;

/** Settings dialog; each control saves immediately (spec: settings "persists changes immediately"). */
export function openSettingsDialog(store: SettingsStore): HTMLDialogElement {
  const s = store.get();
  const dialog = document.createElement("dialog");
  dialog.className = "settings";
  dialog.setAttribute("data-testid", "settings-dialog");

  const row = (label: string, control: HTMLElement) => {
    const l = document.createElement("label");
    l.className = "settings-row";
    const span = document.createElement("span");
    span.textContent = label;
    l.append(span, control);
    return l;
  };
  const checkbox = (key: "silentClose" | "wordWrap" | "showWhitespace" | "showAllCharacters" | "useTabs") => {
    const i = document.createElement("input");
    i.type = "checkbox";
    i.name = key;
    i.checked = s[key];
    i.addEventListener("change", () => void store.update({ [key]: i.checked }));
    return i;
  };
  const number = (name: string, value: number, apply: (n: number) => Partial<Settings>) => {
    const i = document.createElement("input");
    i.type = "number";
    i.name = name;
    i.value = String(value);
    i.addEventListener("change", () => {
      const n = Number(i.value);
      if (Number.isFinite(n)) void store.update(apply(n));
    });
    return i;
  };

  const theme = document.createElement("select");
  theme.name = "theme";
  for (const t of ["system", "light", "dark"] as Theme[]) theme.add(new Option(t, t, false, t === s.theme));
  theme.addEventListener("change", () => void store.update({ theme: theme.value as Theme }));

  const family = document.createElement("input");
  family.type = "text";
  family.name = "fontFamily";
  family.value = s.fontFamily;
  family.addEventListener("change", () => void store.update({ fontFamily: family.value }));

  const close = document.createElement("button");
  close.textContent = "Close";
  close.addEventListener("click", () => dialog.close());

  dialog.append(
    row("Close without prompting (keep unsaved text)", checkbox("silentClose")),
    row("Theme", theme),
    row("Font family", family),
    row("Font size", number("fontSize", s.fontSize, (fontSize) => ({ fontSize }))),
    row("Word wrap", checkbox("wordWrap")),
    row("Show whitespace", checkbox("showWhitespace")),
    row("Show all characters (spaces, tabs, line endings)", checkbox("showAllCharacters")),
    row("Tab width", number("tabWidth", s.tabWidth, (tabWidth) => ({ tabWidth }))),
    row("Insert a tab character (instead of spaces)", checkbox("useTabs")),
    row(
      "Large-file warning (MB)",
      number("largeFileMb", Math.round(s.largeFileThresholdBytes / MB), (mb) => ({
        largeFileThresholdBytes: mb * MB,
      })),
    ),
    close,
  );
  dialog.addEventListener("close", () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
  return dialog;
}
