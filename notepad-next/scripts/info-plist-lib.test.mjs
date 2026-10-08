import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { documentTypeProblems } from "./info-plist-lib.mjs";

const good = { CFBundleDocumentTypes: [{ CFBundleTypeName: "Any file", CFBundleTypeRole: "Editor", LSHandlerRank: "Alternate", LSItemContentTypes: ["public.data"] }] };

describe("documentTypeProblems", () => {
  it("accepts an alternate catch-all document type", () => {
    expect(documentTypeProblems(good)).toEqual([]);
  });

  it("flags a bundle with no document types", () => {
    expect(documentTypeProblems({})).toEqual([expect.stringMatching(/no CFBundleDocumentTypes/)]);
    expect(documentTypeProblems({ CFBundleDocumentTypes: [] })).toHaveLength(1);
    expect(documentTypeProblems(null)).toHaveLength(1);
  });

  it("flags a document type that does not cover any file", () => {
    const info = { CFBundleDocumentTypes: [{ LSHandlerRank: "Alternate", LSItemContentTypes: ["public.plain-text"] }] };
    expect(documentTypeProblems(info)).toEqual([expect.stringMatching(/any file/)]);
  });

  it("flags a catch-all that is not alternate", () => {
    for (const rank of ["Default", "Owner", "None", undefined]) {
      const info = { CFBundleDocumentTypes: [{ ...good.CFBundleDocumentTypes[0], LSHandlerRank: rank }] };
      expect(documentTypeProblems(info).length, String(rank)).toBeGreaterThan(0);
    }
  });

  it("flags any type that would make the app a default handler, even one that is not the catch-all", () => {
    const info = { CFBundleDocumentTypes: [...good.CFBundleDocumentTypes, { CFBundleTypeName: "Markdown", LSHandlerRank: "Owner", LSItemContentTypes: ["net.daringfireball.markdown"] }] };
    expect(documentTypeProblems(info)).toEqual([expect.stringMatching(/default application/)]);
  });

  it("flags a claim to be the default for a type", () => {
    const info = { CFBundleDocumentTypes: [{ ...good.CFBundleDocumentTypes[0], LSIsAppleDefaultForType: true }] };
    expect(documentTypeProblems(info)).toEqual([expect.stringMatching(/default for its type/)]);
  });
});

describe("the Info.plist source that Tauri merges", () => {
  it.skipIf(process.platform !== "darwin")("declares the alternate catch-all document type and nothing stronger", () => {
    const file = join(dirname(fileURLToPath(import.meta.url)), "../src-tauri/Info.plist");
    const info = JSON.parse(execFileSync("plutil", ["-convert", "json", "-o", "-", file], { encoding: "utf8" }));
    expect(documentTypeProblems(info)).toEqual([]);
  });
});
