import type { App } from "../app/app";
import { decode, encode } from "./base64";

export type Base64Action = "encode" | "decode" | "encodeUrl" | "decodeUrl";

export interface CommandResult {
  ok: boolean;
  message: string;
}

const DONE: Record<Base64Action, string> = {
  encode: "Base64 encoded",
  decode: "Base64 decoded",
  encodeUrl: "Base64 (URL-safe) encoded",
  decodeUrl: "Base64 (URL-safe) decoded",
};

/**
 * Encode or decode every selection range, or the whole document when nothing is selected (spec: base64-transform).
 * All-or-nothing: if any range fails, no range changes. The edit is one transaction, so one undo step.
 */
export function runBase64Command(app: App, action: Base64Action): CommandResult {
  const doc = app.manager.active;
  if (!doc) return { ok: false, message: "No document" };
  const state = app.view.state;
  const nonEmpty = state.selection.ranges.filter((r) => !r.empty);
  const ranges = nonEmpty.length > 0 ? nonEmpty.map((r) => ({ from: r.from, to: r.to })) : [{ from: 0, to: state.doc.length }];
  const urlSafe = action.endsWith("Url");

  const changes: { from: number; to: number; insert: string }[] = [];
  for (const r of ranges) {
    const text = state.sliceDoc(r.from, r.to);
    if (action.startsWith("encode")) {
      changes.push({ ...r, insert: encode(text, urlSafe) });
      continue;
    }
    const out = decode(text, urlSafe);
    if (!out.ok) {
      app.notify(out.message, "error");
      return { ok: false, message: out.message };
    }
    changes.push({ ...r, insert: out.text });
  }
  app.applyChangesToDoc(doc.id, changes);
  app.notify(DONE[action], "info");
  return { ok: true, message: DONE[action] };
}
