/**
 * Checks on the macOS Info.plist, given as the JSON `plutil -convert json` prints (spec: macos-document-types, ADR-0010).
 * Returns a list of problems; an empty list means the bundle declares the alternate catch-all handler and nothing stronger.
 */
export function documentTypeProblems(info) {
  const types = info?.CFBundleDocumentTypes;
  if (!Array.isArray(types) || types.length === 0) return ["Info.plist has no CFBundleDocumentTypes, so Finder will not offer the app for files"];
  const problems = [];
  const catchAll = types.find((t) => Array.isArray(t?.LSItemContentTypes) && t.LSItemContentTypes.includes("public.data"));
  if (!catchAll) problems.push("no document type covers any file (LSItemContentTypes must include public.data)");
  else if (catchAll.LSHandlerRank !== "Alternate") problems.push(`the catch-all document type has rank ${JSON.stringify(catchAll.LSHandlerRank)}, expected "Alternate"`);
  for (const t of types) {
    if (t?.LSHandlerRank === "Owner" || t?.LSHandlerRank === "Default") {
      problems.push(`document type ${JSON.stringify(t.CFBundleTypeName ?? "?")} has rank ${t.LSHandlerRank}, which would make next-notepad a default application`);
    }
    if (t?.LSIsAppleDefaultForType) problems.push(`document type ${JSON.stringify(t.CFBundleTypeName ?? "?")} claims to be the default for its type`);
  }
  return problems;
}
