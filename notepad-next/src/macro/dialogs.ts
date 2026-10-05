import { confirmDialog } from "../app/dialogs";
import type { RunChoice, MacroPrompts } from "./controller";
import type { MacroStore } from "./store";

/** A small modal <dialog> that resolves with whatever `read` returns when OK is pressed, or null on Cancel/Escape. */
function modal<T>(title: string, testId: string, build: (body: HTMLElement, submit: () => void) => () => T | null): Promise<T | null> {
  return new Promise((resolve) => {
    const dialog = document.createElement("dialog");
    dialog.className = "confirm macro-dialog";
    dialog.setAttribute("data-testid", testId);
    const heading = document.createElement("p");
    heading.className = "macro-dialog-title";
    heading.textContent = title;
    const body = document.createElement("div");
    body.className = "macro-dialog-body";
    let answer: T | null = null;
    let read: () => T | null = () => null;
    const ok = document.createElement("button");
    ok.textContent = "OK";
    ok.setAttribute("data-testid", `${testId}-ok`);
    const submit = () => {
      const value = read();
      if (value === null) return; // invalid input: keep the dialog open so the user can fix it
      answer = value;
      dialog.close();
    };
    ok.addEventListener("click", submit);
    const cancel = document.createElement("button");
    cancel.textContent = "Cancel";
    cancel.addEventListener("click", () => dialog.close());
    const row = document.createElement("div");
    row.className = "confirm-buttons";
    row.append(ok, cancel);
    read = build(body, submit);
    dialog.append(heading, body, row);
    dialog.addEventListener("close", () => {
      dialog.remove();
      resolve(answer);
    });
    document.body.append(dialog);
    dialog.showModal();
    dialog.querySelector<HTMLInputElement>("input")?.focus();
  });
}

export function askMacroName(initial: string): Promise<string | null> {
  return modal<string>("Macro name", "macro-name-dialog", (body, submit) => {
    const input = document.createElement("input");
    input.type = "text";
    input.value = initial;
    input.setAttribute("data-testid", "macro-name-input");
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        submit();
      }
    });
    body.append(input);
    return () => (input.value.trim() === "" ? null : input.value.trim());
  });
}

export function askMacroRun(): Promise<RunChoice | null> {
  return modal<RunChoice>("Run macro multiple times", "macro-run-dialog", (body) => {
    const times = document.createElement("label");
    const timesRadio = Object.assign(document.createElement("input"), { type: "radio", name: "macro-run", checked: true });
    timesRadio.setAttribute("data-testid", "macro-run-times-radio");
    const count = Object.assign(document.createElement("input"), { type: "number", min: "1", value: "2" });
    count.setAttribute("data-testid", "macro-run-count");
    times.append(timesRadio, " Run ", count, " times");
    const eof = document.createElement("label");
    const eofRadio = Object.assign(document.createElement("input"), { type: "radio", name: "macro-run" });
    eofRadio.setAttribute("data-testid", "macro-run-eof-radio");
    eof.append(eofRadio, " Run until the end of the file");
    for (const el of [times, eof]) el.style.display = "block";
    count.addEventListener("focus", () => (timesRadio.checked = true));
    body.append(times, eof);
    return () => {
      if (eofRadio.checked) return { untilEof: true };
      const n = Math.floor(Number(count.value));
      return Number.isFinite(n) && n >= 1 ? { times: n } : null;
    };
  });
}

/** Rename, delete and run saved macros. */
export function openMacroManager(store: MacroStore, run: (name: string) => void, notify: (m: string, k: "info" | "error") => void): void {
  const dialog = document.createElement("dialog");
  dialog.className = "confirm macro-dialog";
  dialog.setAttribute("data-testid", "macro-manager");
  const heading = document.createElement("p");
  heading.className = "macro-dialog-title";
  heading.textContent = "Saved macros";
  const list = document.createElement("div");
  list.className = "macro-list";
  const close = document.createElement("button");
  close.textContent = "Close";
  close.addEventListener("click", () => dialog.close());
  const row = document.createElement("div");
  row.className = "confirm-buttons";
  row.append(close);

  const report = async (fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), "error");
    }
  };

  const render = () => {
    list.replaceChildren();
    if (store.list().length === 0) {
      const empty = document.createElement("p");
      empty.textContent = "No saved macros yet.";
      empty.setAttribute("data-testid", "macro-manager-empty");
      list.append(empty);
      return;
    }
    for (const macro of store.list()) {
      const item = document.createElement("div");
      item.className = "macro-item";
      item.setAttribute("data-testid", "macro-item");
      const name = document.createElement("span");
      name.className = "macro-name";
      name.textContent = macro.name;
      const button = (label: string, testId: string, onClick: () => void) => {
        const b = document.createElement("button");
        b.textContent = label;
        b.setAttribute("data-testid", testId);
        b.addEventListener("click", onClick);
        return b;
      };
      item.append(
        name,
        button("Run", "macro-run", () => {
          dialog.close();
          run(macro.name);
        }),
        button("Rename", "macro-rename", () =>
          void askMacroName(macro.name).then((to) => (to === null ? undefined : report(() => store.rename(macro.name, to)))),
        ),
        button("Delete", "macro-delete", () =>
          void confirmDialog(`Delete macro "${macro.name}"?`, "Delete").then((yes) => (yes ? report(() => store.remove(macro.name)) : undefined)),
        ),
      );
      list.append(item);
    }
  };

  const off = store.subscribe(render);
  render();
  dialog.append(heading, list, row);
  dialog.addEventListener("close", () => {
    off();
    dialog.remove();
  });
  document.body.append(dialog);
  dialog.showModal();
}

/** The real prompts; `manage` needs the controller to run a macro, so it is looked up lazily. */
export function createMacroPrompts(store: MacroStore, runSaved: (name: string) => void, notify: (m: string, k: "info" | "error") => void): MacroPrompts {
  return {
    askName: askMacroName,
    askRun: askMacroRun,
    manage: () => openMacroManager(store, runSaved, notify),
  };
}
