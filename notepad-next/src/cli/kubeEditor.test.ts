import { describe, expect, it } from "vitest";
import { kubeEditorSettings, type Platform } from "./kubeEditor";

const MAC = "/Applications/Next Notepad.app/Contents/MacOS/next-notepad";
const WIN = "C:\\Program Files\\next-notepad\\next-notepad.exe";
const texts = (platform: Platform, exePath: string, installed = false) => Object.fromEntries(kubeEditorSettings({ platform, exePath, installed }).map((s) => [s.label, s.text]));

describe("kubeEditorSettings on macOS and Linux", () => {
  it("shows one shell line", () => {
    expect(Object.keys(texts("mac", MAC))).toEqual(["zsh / bash"]);
  });

  it("quotes a path that contains spaces and ends with --wait", () => {
    expect(texts("mac", MAC)["zsh / bash"]).toBe(`export KUBE_EDITOR="'${MAC}' --wait"`);
  });

  it("does not quote a path without spaces", () => {
    expect(texts("mac", "/opt/nn/next-notepad")["zsh / bash"]).toBe('export KUBE_EDITOR="/opt/nn/next-notepad --wait"');
  });

  it("uses the bare command once it is installed on PATH", () => {
    expect(texts("mac", MAC, true)["zsh / bash"]).toBe('export KUBE_EDITOR="next-notepad --wait"');
  });

  it("escapes characters that are special inside double quotes", () => {
    const t = texts("mac", "/odd/$HOME/\"q\"/next-notepad")["zsh / bash"];
    expect(t).toBe('export KUBE_EDITOR="\'/odd/\\$HOME/\\"q\\"/next-notepad\' --wait"');
  });

  it("treats Linux like macOS", () => {
    expect(texts("linux", "/opt/nn/next-notepad")["zsh / bash"]).toContain("--wait");
  });
});

describe("kubeEditorSettings on Windows", () => {
  it("gives PowerShell and command-prompt forms", () => {
    expect(Object.keys(texts("windows", WIN))).toEqual(["PowerShell", "Command Prompt (setx)"]);
  });

  it("quotes the path in PowerShell and ends with --wait", () => {
    expect(texts("windows", WIN)["PowerShell"]).toBe(`$env:KUBE_EDITOR = '"${WIN}" --wait'`);
  });

  it("quotes the path in setx and ends with --wait", () => {
    expect(texts("windows", WIN)["Command Prompt (setx)"]).toBe(`setx KUBE_EDITOR "\\"${WIN}\\" --wait"`);
  });

  it("doubles a single quote inside the PowerShell string", () => {
    expect(texts("windows", "C:\\Bob's\\next-notepad.exe")["PowerShell"]).toBe(`$env:KUBE_EDITOR = '"C:\\Bob''s\\next-notepad.exe" --wait'`);
  });

  it("ignores the installed flag, since the Windows installer does not change PATH", () => {
    expect(texts("windows", WIN, true)["PowerShell"]).toContain(WIN);
  });
});
