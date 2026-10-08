#!/usr/bin/env node
// Usage (from notepad-next/, macOS only): node scripts/check-info-plist.mjs [path/to/next-notepad.app]
// Reads the Info.plist of a built bundle (default: the release build) and fails unless it declares the alternate
// catch-all document type (spec: macos-document-types).
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { documentTypeProblems } from "./info-plist-lib.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const app = process.argv[2] ?? join(root, "src-tauri/target/release/bundle/macos/next-notepad.app");
const plist = join(app, "Contents", "Info.plist");

let info;
try {
  info = JSON.parse(execFileSync("plutil", ["-convert", "json", "-o", "-", plist], { encoding: "utf8" }));
} catch (e) {
  console.error(`check-info-plist: could not read ${plist}: ${e.message}`);
  process.exit(2);
}
const problems = documentTypeProblems(info);
if (problems.length > 0) {
  for (const p of problems) console.error(`check-info-plist: ${p}`);
  process.exit(1);
}
console.log(`${plist}: catch-all document type with Alternate rank, no default claims`);
