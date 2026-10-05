#!/usr/bin/env node
// Usage (from notepad-next/):
//   npm run release -- patch|minor|major|1.2.3 [--push] [--dry-run]
//
// Bumps the version in tauri.conf.json, package.json, package-lock.json, Cargo.toml and Cargo.lock,
// commits "Release vX.Y.Z" and tags vX.Y.Z. With --push it also pushes the commit and the tag, which
// starts the release workflow (macOS .dmg + Windows .exe in a draft GitHub Release).
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { nextVersion, readCargoVersion, setCargoLockVersion, setCargoTomlVersion, setJsonVersion, setPackageLockVersion } from "./release-lib.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const files = {
  tauri: join(root, "src-tauri/tauri.conf.json"),
  pkg: join(root, "package.json"),
  lock: join(root, "package-lock.json"),
  cargo: join(root, "src-tauri/Cargo.toml"),
  cargoLock: join(root, "src-tauri/Cargo.lock"),
};

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const request = args.find((a) => !a.startsWith("--"));
const dry = flags.has("--dry-run");

const git = (...a) => execFileSync("git", a, { cwd: root, encoding: "utf8" }).trim();
const fail = (msg) => {
  console.error(`release: ${msg}`);
  process.exit(1);
};

if (!request) fail("usage: npm run release -- patch|minor|major|x.y.z [--push] [--dry-run]");

const current = JSON.parse(readFileSync(files.tauri, "utf8")).version;
const cargoCurrent = readCargoVersion(readFileSync(files.cargo, "utf8"));
const pkgCurrent = JSON.parse(readFileSync(files.pkg, "utf8")).version;
if (new Set([current, cargoCurrent, pkgCurrent]).size !== 1) {
  fail(`versions disagree: tauri.conf.json ${current}, package.json ${pkgCurrent}, Cargo.toml ${cargoCurrent}. Fix them first.`);
}

let version;
try {
  version = nextVersion(current, request);
} catch (e) {
  fail(e.message);
}
const tag = `v${version}`;

if (!dry) {
  if (git("status", "--porcelain")) fail("the working tree has uncommitted changes; commit or stash them first.");
  if (git("rev-parse", "--abbrev-ref", "HEAD") !== "main") fail("releases are made from the main branch.");
  if (git("tag", "--list", tag)) fail(`tag ${tag} already exists.`);
}

console.log(`${current} -> ${version}${dry ? " (dry run, nothing written)" : ""}`);
if (dry) process.exit(0);

const rewrite = (file, fn) => writeFileSync(file, fn(readFileSync(file, "utf8")));
rewrite(files.tauri, (t) => setJsonVersion(t, version));
rewrite(files.pkg, (t) => setJsonVersion(t, version));
rewrite(files.lock, (t) => setPackageLockVersion(t, version));
rewrite(files.cargo, (t) => setCargoTomlVersion(t, version));
rewrite(files.cargoLock, (t) => setCargoLockVersion(t, "notepad-next", version));

git("add", files.tauri, files.pkg, files.lock, files.cargo, files.cargoLock);
git("commit", "-m", `Release ${tag}`);
git("tag", "-a", tag, "-m", `next-notepad ${tag}`);
console.log(`Committed and tagged ${tag}.`);

if (flags.has("--push")) {
  git("push", "origin", "main");
  git("push", "origin", tag);
  console.log(`Pushed. Watch the build: the "release-next-notepad" workflow on GitHub Actions.`);
} else {
  console.log(`Next: git push origin main && git push origin ${tag}   (or rerun with --push)`);
}
