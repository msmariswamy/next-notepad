import type { Ipc } from "../ipc";
import { kubeEditorSettings, type Platform } from "./kubeEditor";

/** Mirrors the Rust `CliInfo` (camelCase JSON). */
export interface CliInfo {
  exePath: string;
  platform: Platform;
  canInstall: boolean;
  installedLink: string | null;
}

/** Mirrors the Rust `InstallReport` (camelCase JSON). */
export interface InstallReport {
  link: string;
  dir: string;
  pathHint: string | null;
}

export interface CommandLineDeps {
  ipc: Ipc;
  copy(text: string): Promise<void>;
  notify(message: string, kind: "info" | "error"): void;
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, testId?: string) => {
  const node = Object.assign(document.createElement(tag), props);
  if (testId) node.setAttribute("data-testid", testId);
  return node;
};

/**
 * Help > Command Line Tool… (spec: cli-install): where the executable is, the `KUBE_EDITOR` text to paste with copy
 * buttons, and on macOS an Install button that puts a `next-notepad` link on PATH.
 */
export async function openCommandLineDialog(deps: CommandLineDeps): Promise<void> {
  let info: CliInfo;
  try {
    info = await deps.ipc.invoke<CliInfo>("cli_info");
  } catch (e) {
    deps.notify(`Could not read the command line information: ${e instanceof Error ? e.message : e}`, "error");
    return;
  }
  let installed = info.installedLink !== null;
  let resultText = info.installedLink ? `Installed: ${info.installedLink}` : "";
  let pathHint: string | null = null;

  const dialog = el("dialog", { className: "confirm macro-dialog cli-dialog" }, "cli-dialog");
  const body = el("div", { className: "macro-dialog-body" });

  const copyButton = (text: string) => {
    const b = el("button", { textContent: "Copy" }, "cli-copy");
    b.addEventListener("click", () =>
      void deps.copy(text).then(
        () => deps.notify("Copied to the clipboard", "info"),
        (e) => deps.notify(`Could not copy: ${e instanceof Error ? e.message : e}`, "error"),
      ),
    );
    return b;
  };

  const render = () => {
    body.replaceChildren();
    body.append(
      el("p", { textContent: "Run next-notepad from a terminal, and use it as the editor for kubectl edit, git commit and similar tools. With --wait the command stays open until you close the file." }),
      el("p", { className: "macro-dialog-title", textContent: "Executable" }),
    );
    const exeRow = el("div", { className: "cli-row" });
    exeRow.append(el("code", { textContent: info.exePath }, "cli-exe-path"), copyButton(info.exePath));
    body.append(exeRow);

    if (info.canInstall) {
      const install = el("button", { textContent: installed ? "Reinstall command" : "Install command" }, "cli-install");
      install.addEventListener("click", async () => {
        try {
          const report = await deps.ipc.invoke<InstallReport>("install_cli_command");
          installed = true;
          resultText = `Installed: ${report.link}`;
          pathHint = report.pathHint;
        } catch (e) {
          resultText = e instanceof Error ? e.message : String(e);
        }
        render();
      });
      body.append(el("p", { className: "macro-dialog-title", textContent: "Command" }), install);
      if (resultText) body.append(el("p", { textContent: resultText }, "cli-install-result"));
      if (pathHint) {
        body.append(el("p", { textContent: "If your terminal cannot find next-notepad, add its folder to PATH:" }), el("code", { textContent: pathHint }, "cli-path-hint"));
      }
    }

    body.append(el("p", { className: "macro-dialog-title", textContent: "Use it as your Kubernetes editor" }));
    for (const s of kubeEditorSettings({ platform: info.platform, exePath: info.exePath, installed })) {
      const row = el("div", { className: "cli-row" });
      row.append(el("span", { className: "cli-label", textContent: s.label }), el("code", { textContent: s.text }, "cli-setting"), copyButton(s.text));
      body.append(row);
    }
  };

  render();
  const close = el("button", { textContent: "Close" }, "cli-close");
  close.addEventListener("click", () => dialog.close());
  const buttons = el("div", { className: "confirm-buttons" });
  buttons.append(close);
  dialog.append(el("p", { className: "macro-dialog-title", textContent: "Command Line Tool" }), body, buttons);
  dialog.addEventListener("close", () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
}
