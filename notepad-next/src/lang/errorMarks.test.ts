import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEditor } from "../editor/createEditor";
import { loadLanguageExtension } from "./languages";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

async function mount(language: string, doc: string) {
  const ext = await loadLanguageExtension(language);
  return createEditor({ parent: document.body, doc, extensions: [ext] });
}
const marks = (v: ReturnType<typeof createEditor>, cls: string) => [...v.contentDOM.querySelectorAll(`.${cls}`)].map((e) => e.textContent);

describe("live error underlines come with the XML and YAML languages only", () => {
  it("XML tabs underline the first error", async () => {
    const v = await mount("XML", "<a><b></a>");
    await vi.advanceTimersByTimeAsync(400);
    expect(marks(v, "cm-xml-error")).toHaveLength(1);
    v.destroy();
  });

  it("XML marks clear when the XML is fixed", async () => {
    const v = await mount("XML", "<a><b></a>");
    await vi.advanceTimersByTimeAsync(400);
    v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: "<a><b/></a>" } });
    await vi.advanceTimersByTimeAsync(400);
    expect(marks(v, "cm-xml-error")).toEqual([]);
    v.destroy();
  });

  it("YAML tabs underline the first error", async () => {
    // The yaml package is imported on demand, which fake timers cannot drive, so this one waits in real time.
    vi.useRealTimers();
    const v = await mount("YAML", "a: 1\na: 2");
    await vi.waitFor(() => expect(marks(v, "cm-yaml-error")).toHaveLength(1), { timeout: 4000, interval: 50 });
    v.destroy();
  });

  it("a Python tab with broken XML text shows no marks", async () => {
    const v = await mount("Python", "<a><b></a>");
    await vi.advanceTimersByTimeAsync(400);
    expect(marks(v, "cm-xml-error")).toEqual([]);
    expect(marks(v, "cm-yaml-error")).toEqual([]);
    v.destroy();
  });

  it("a JSON tab with broken YAML text shows no YAML marks", async () => {
    const v = await mount("JSON", "a: [1, 2");
    await vi.advanceTimersByTimeAsync(400);
    expect(marks(v, "cm-yaml-error")).toEqual([]);
    v.destroy();
  });

  it("valid XML and YAML show nothing", async () => {
    const x = await mount("XML", "<a/>");
    const y = await mount("YAML", "a: 1");
    await vi.advanceTimersByTimeAsync(400);
    expect(marks(x, "cm-xml-error")).toEqual([]);
    expect(marks(y, "cm-yaml-error")).toEqual([]);
    x.destroy();
    y.destroy();
  });
});
