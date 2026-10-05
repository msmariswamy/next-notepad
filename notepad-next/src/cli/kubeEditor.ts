export type Platform = "mac" | "windows" | "linux";

export interface KubeEditorOptions {
  platform: Platform;
  /** Full path of the running executable. */
  exePath: string;
  /** True when a `next-notepad` link exists on PATH (macOS and Linux only). */
  installed: boolean;
}

export interface Setting {
  label: string;
  text: string;
}

const needsQuotes = (path: string) => /[\s"'`$\\&;|()<>*?#~]/.test(path.replace(/^[A-Za-z]:\\/, ""));

/** Escape a string for use inside a shell's double quotes. */
const inDoubleQuotes = (s: string) => s.replace(/[\\"$`]/g, "\\$&");

/**
 * The `KUBE_EDITOR` line to paste into a shell profile or terminal (spec: cli-install). `--wait` makes the command stay
 * until the file's tab is closed, which is what `kubectl edit` needs. A path containing a single quote may need manual quoting.
 */
export function kubeEditorSettings({ platform, exePath, installed }: KubeEditorOptions): Setting[] {
  if (platform === "windows") {
    // kubectl runs the editor through cmd, so the quoted path is placed ahead of --wait.
    return [
      { label: "PowerShell", text: `$env:KUBE_EDITOR = '"${exePath.replace(/'/g, "''")}" --wait'` },
      { label: "Command Prompt (setx)", text: `setx KUBE_EDITOR "\\"${exePath}\\" --wait"` },
    ];
  }
  const command = installed ? "next-notepad" : needsQuotes(exePath) ? `'${exePath}'` : exePath;
  return [{ label: "zsh / bash", text: `export KUBE_EDITOR="${inDoubleQuotes(command)} --wait"` }];
}
