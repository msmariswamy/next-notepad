import type { App } from "./app";

const reasonOf = (e: unknown, path: string): string => {
  const message = e instanceof Error ? e.message : String(e);
  // The Rust side prefixes its errors with the path, which the notification already names.
  return message.startsWith(`${path}: `) ? message.slice(path.length + 2) : message;
};

/**
 * Open files dropped from the operating system onto the window (spec: window-file-drop, design D2). Each path goes through
 * `App.openPath`, so a file that is already open is focused, the large-file warning applies, and the language is detected,
 * exactly as for File > Open. Files open one after the other so tab order matches drop order, an item that cannot be opened
 * (a folder, a missing file) is reported and does not stop the rest, and the last file that opened ends up active.
 */
export function createFileDropHandler(app: App): (paths: string[]) => Promise<void> {
  // A second drop (or a large-file prompt) must not interleave with the first, so drops run in a queue.
  let queue: Promise<void> = Promise.resolve();

  async function open(paths: string[]): Promise<void> {
    let last: string | null = null;
    for (const path of paths) {
      try {
        const id = await app.openPath(path);
        if (id !== null) last = id; // null: the user declined the large-file warning, which is not an error
      } catch (e) {
        app.notify(`cannot open ${path}: ${reasonOf(e, path)}`, "error");
      }
    }
    if (last !== null) {
      app.manager.activate(last);
      app.view.focus();
    }
  }

  return (paths) => (queue = queue.then(() => open(paths)));
}
