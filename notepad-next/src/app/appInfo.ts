import pkg from "../../package.json";

/** Who made the app and which version this is; shown in Help > About and kept in sync with package.json. */
export const APP_INFO = {
  name: "next-notepad",
  version: pkg.version,
  author: "Mariswamy Pillai",
  credit: "Idea and creation by Mariswamy Pillai",
  year: 2026,
} as const;
