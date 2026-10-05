// Pure helpers for scripts/release.mjs (kept free of I/O so they can be unit tested).

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

export function isSemver(v) {
  return SEMVER.test(v);
}

/** Resolve "patch" | "minor" | "major" | "1.2.3" (optionally prefixed with v) against the current version. */
export function nextVersion(current, request) {
  const req = String(request).replace(/^v/, "");
  const m = SEMVER.exec(current);
  if (!m) throw new Error(`Current version "${current}" is not x.y.z`);
  const [maj, min, pat] = m.slice(1).map(Number);
  if (req === "patch") return `${maj}.${min}.${pat + 1}`;
  if (req === "minor") return `${maj}.${min + 1}.0`;
  if (req === "major") return `${maj + 1}.0.0`;
  if (!isSemver(req)) throw new Error(`"${request}" is not patch, minor, major or a version like 1.2.3`);
  if (compare(req, current) <= 0) throw new Error(`New version ${req} must be greater than the current ${current}`);
  return req;
}

export function compare(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
  return 0;
}

/** Replace the top-level "version" of a JSON document, keeping its formatting (2-space indent, trailing newline). */
export function setJsonVersion(text, version) {
  const data = JSON.parse(text);
  data.version = version;
  return JSON.stringify(data, null, 2) + "\n";
}

/** package-lock.json carries the version twice: at the top and under packages[""]. */
export function setPackageLockVersion(text, version, name) {
  const data = JSON.parse(text);
  data.version = version;
  if (name) data.name = name;
  if (data.packages?.[""]) {
    data.packages[""].version = version;
    if (name) data.packages[""].name = name;
  }
  return JSON.stringify(data, null, 2) + "\n";
}

/** Set `version` in the [package] table of Cargo.toml without touching dependency versions. */
export function setCargoTomlVersion(text, version) {
  const out = text.replace(/(\[package\][\s\S]*?\nversion\s*=\s*")[^"]*(")/, `$1${version}$2`);
  if (out === text && !text.includes(`version = "${version}"`)) throw new Error("Could not find [package] version in Cargo.toml");
  return out;
}

/** Update the entry for this crate in Cargo.lock so `cargo build --locked` keeps working. */
export function setCargoLockVersion(text, crate, version) {
  const re = new RegExp(`(\\[\\[package\\]\\]\\nname = "${crate}"\\nversion = ")[^"]*(")`);
  if (!re.test(text)) throw new Error(`Could not find crate ${crate} in Cargo.lock`);
  return text.replace(re, `$1${version}$2`);
}

export function readCargoVersion(text) {
  const m = /\[package\][\s\S]*?\nversion\s*=\s*"([^"]+)"/.exec(text);
  if (!m) throw new Error("Could not read [package] version from Cargo.toml");
  return m[1];
}
