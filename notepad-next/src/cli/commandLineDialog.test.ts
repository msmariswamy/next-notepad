import { afterEach, describe, expect, it, vi } from "vitest";
import { createMockIpc } from "../ipc";
import { openCommandLineDialog, type CliInfo, type InstallReport } from "./commandLineDialog";

const MAC: CliInfo = { exePath: "/Applications/Next Notepad.app/Contents/MacOS/next-notepad", platform: "mac", canInstall: true, installedLink: null };
const WIN: CliInfo = { exePath: "C:\\Program Files\\next-notepad\\next-notepad.exe", platform: "windows", canInstall: false, installedLink: null };

afterEach(() => {
  document.body.innerHTML = "";
});

const q = (id: string) => document.querySelector<HTMLElement>(`[data-testid='${id}']`);
const all = (id: string) => [...document.querySelectorAll<HTMLElement>(`[data-testid='${id}']`)];
const flush = () => new Promise((r) => setTimeout(r, 0));

async function open(info: CliInfo, install?: () => InstallReport | Promise<InstallReport>) {
  const copy = vi.fn(async (_: string) => {});
  const notify = vi.fn();
  const ipc = createMockIpc({ cli_info: () => info, install_cli_command: () => install!() });
  await openCommandLineDialog({ ipc, copy, notify });
  await flush();
  return { copy, notify, ipc };
}

describe("Command Line Tool dialog", () => {
  it("shows the full path of the executable", async () => {
    await open(MAC);
    expect(q("cli-exe-path")!.textContent).toBe(MAC.exePath);
  });

  it("shows the KUBE_EDITOR line for macOS", async () => {
    await open(MAC);
    expect(all("cli-setting").map((e) => e.textContent)).toEqual([`export KUBE_EDITOR="'${MAC.exePath}' --wait"`]);
  });

  it("shows PowerShell and setx lines on Windows, with no Install button", async () => {
    await open(WIN);
    expect(all("cli-setting")).toHaveLength(2);
    expect(all("cli-setting")[0].textContent).toContain("$env:KUBE_EDITOR");
    expect(all("cli-setting")[1].textContent).toContain("setx KUBE_EDITOR");
    expect(q("cli-install")).toBeNull();
  });

  it("copies a setting and confirms", async () => {
    const { copy, notify } = await open(MAC);
    // The first Copy belongs to the executable path, the last to the KUBE_EDITOR line.
    all("cli-copy")[0].click();
    await flush();
    expect(copy).toHaveBeenLastCalledWith(MAC.exePath);
    const buttons = all("cli-copy");
    buttons[buttons.length - 1].click();
    await flush();
    expect(copy).toHaveBeenLastCalledWith(`export KUBE_EDITOR="'${MAC.exePath}' --wait"`);
    expect(notify).toHaveBeenCalledWith(expect.stringMatching(/copied/i), "info");
  });

  it("uses the bare command when it is already installed", async () => {
    await open({ ...MAC, installedLink: "/usr/local/bin/next-notepad" });
    expect(all("cli-setting")[0].textContent).toBe('export KUBE_EDITOR="next-notepad --wait"');
    expect(q("cli-install-result")!.textContent).toContain("/usr/local/bin/next-notepad");
  });

  it("installs, reports the link and switches the setting to the bare command", async () => {
    await open(MAC, () => ({ link: "/usr/local/bin/next-notepad", dir: "/usr/local/bin", pathHint: null }));
    q("cli-install")!.click();
    await flush();
    expect(q("cli-install-result")!.textContent).toContain("/usr/local/bin/next-notepad");
    expect(all("cli-setting")[0].textContent).toBe('export KUBE_EDITOR="next-notepad --wait"');
    expect(q("cli-path-hint")).toBeNull();
  });

  it("shows the line to add the folder to PATH when needed", async () => {
    await open(MAC, () => ({ link: "/Users/me/.local/bin/next-notepad", dir: "/Users/me/.local/bin", pathHint: 'export PATH="$HOME/.local/bin:$PATH"' }));
    q("cli-install")!.click();
    await flush();
    expect(q("cli-path-hint")!.textContent).toBe('export PATH="$HOME/.local/bin:$PATH"');
  });

  it("explains why nothing was installed", async () => {
    await open(MAC, () => {
      throw new Error("/usr/local/bin/next-notepad already exists and was not made by next-notepad, so it was left alone");
    });
    q("cli-install")!.click();
    await flush();
    expect(q("cli-install-result")!.textContent).toMatch(/left alone/);
    expect(all("cli-setting")[0].textContent).toContain(MAC.exePath);
  });

  it("closes", async () => {
    await open(MAC);
    q("cli-close")!.click();
    expect(q("cli-dialog")).toBeNull();
  });

  it("reports when the information cannot be read", async () => {
    const notify = vi.fn();
    const ipc = createMockIpc({
      cli_info: () => {
        throw new Error("no exe");
      },
    });
    await openCommandLineDialog({ ipc, copy: async () => {}, notify });
    expect(notify).toHaveBeenCalledWith(expect.stringMatching(/no exe/), "error");
    expect(q("cli-dialog")).toBeNull();
  });
});
