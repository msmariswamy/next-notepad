import { beforeEach, describe, expect, it } from "vitest";
import { DocumentManager } from "./documentManager";

let m: DocumentManager;
beforeEach(() => {
  m = new DocumentManager();
});

describe("creating documents", () => {
  it("names untitled tabs 'new 1', 'new 2'", () => {
    expect(m.newDoc().title).toBe("new 1");
    expect(m.newDoc().title).toBe("new 2");
  });

  it("numbers one higher than the highest existing untitled number", () => {
    m.newDoc();
    const b = m.newDoc();
    m.newDoc(); // new 3
    m.close(b.id); // new 2 gone
    expect(m.newDoc().title).toBe("new 4");
  });

  it("makes the new tab active", () => {
    const a = m.newDoc();
    expect(m.activeId).toBe(a.id);
    const b = m.newDoc();
    expect(m.activeId).toBe(b.id);
  });

  it("opens a file with its metadata and a title from the path", () => {
    const d = m.openFile("/tmp/a/data.json", { text: "{}", encoding: "UTF-8", bom: false, eol: "crlf" });
    expect(d.title).toBe("data.json");
    expect(d.path).toBe("/tmp/a/data.json");
    expect(d.eol).toBe("crlf");
    expect(d.dirty).toBe(false);
  });

  it("re-activates an already open file instead of duplicating it", () => {
    const a = m.openFile("/x/a.txt", { text: "a", encoding: "UTF-8", bom: false, eol: "lf" });
    m.newDoc();
    const again = m.openFile("/x/a.txt", { text: "a", encoding: "UTF-8", bom: false, eol: "lf" });
    expect(again.id).toBe(a.id);
    expect(m.docs.length).toBe(2);
    expect(m.activeId).toBe(a.id);
  });
});

describe("switching and reordering", () => {
  it("activates a chosen tab", () => {
    const a = m.newDoc();
    m.newDoc();
    m.activate(a.id);
    expect(m.activeId).toBe(a.id);
  });

  it("ignores activating an unknown id", () => {
    const a = m.newDoc();
    m.activate("nope");
    expect(m.activeId).toBe(a.id);
  });

  it("moves a tab to a new index", () => {
    const a = m.newDoc();
    const b = m.newDoc();
    const c = m.newDoc();
    m.move(c.id, 0);
    expect(m.docs.map((d) => d.id)).toEqual([c.id, a.id, b.id]);
  });
});

describe("closing", () => {
  it("activates the neighbouring tab after closing the active one", () => {
    const a = m.newDoc();
    const b = m.newDoc();
    const c = m.newDoc();
    m.activate(b.id);
    m.close(b.id);
    expect(m.activeId).toBe(c.id);
    m.close(c.id);
    expect(m.activeId).toBe(a.id);
  });

  it("has no active tab when the last one closes", () => {
    const a = m.newDoc();
    m.close(a.id);
    expect(m.activeId).toBeNull();
    expect(m.docs).toEqual([]);
  });

  it("keeps the active tab when closing a different one", () => {
    const a = m.newDoc();
    const b = m.newDoc();
    m.activate(a.id);
    m.close(b.id);
    expect(m.activeId).toBe(a.id);
  });
});

describe("dirty tracking", () => {
  it("is clean on creation", () => {
    expect(m.newDoc().dirty).toBe(false);
  });

  it("becomes dirty when text differs from the saved text", () => {
    const d = m.newDoc();
    m.setText(d.id, "hello");
    expect(m.get(d.id)!.dirty).toBe(true);
  });

  it("becomes clean again when text returns to the saved text", () => {
    const d = m.newDoc();
    m.setText(d.id, "hello");
    m.setText(d.id, "");
    expect(m.get(d.id)!.dirty).toBe(false);
  });

  it("clears dirty on save and records the new saved text", () => {
    const d = m.newDoc();
    m.setText(d.id, "hello");
    m.markSaved(d.id);
    expect(m.get(d.id)!.dirty).toBe(false);
    m.setText(d.id, "hello!");
    expect(m.get(d.id)!.dirty).toBe(true);
  });

  it("binds an untitled doc to a path when saved with one", () => {
    const d = m.newDoc();
    m.markSaved(d.id, "/tmp/x/note.txt");
    expect(m.get(d.id)!.path).toBe("/tmp/x/note.txt");
    expect(m.get(d.id)!.title).toBe("note.txt");
  });

  it("marks a doc dirty when its line ending changes", () => {
    const d = m.openFile("/a.txt", { text: "a", encoding: "UTF-8", bom: false, eol: "lf" });
    m.setEol(d.id, "crlf");
    expect(m.get(d.id)!.eol).toBe("crlf");
    expect(m.get(d.id)!.dirty).toBe(true);
  });
});

describe("missing files", () => {
  it("saving a restored missing tab clears the missing flag", () => {
    const d = m.restoreDoc({ id: "doc-3", title: "gone.txt", path: "/gone.txt", text: "x", savedText: "", eol: "lf", encoding: "UTF-8", bom: false, language: "Normal text", languageManual: false, metaDirty: false, missing: true });
    expect(m.get(d.id)!.missing).toBe(true);
    m.markSaved(d.id);
    expect(m.get(d.id)!.missing).toBe(false);
  });
});

describe("close policy", () => {
  it("closes a clean tab with no prompt", () => {
    const d = m.newDoc();
    expect(m.requestClose(d.id, { silentClose: false })).toBe("close");
  });

  it("prompts for a dirty tab when silentClose is off", () => {
    const d = m.newDoc();
    m.setText(d.id, "x");
    expect(m.requestClose(d.id, { silentClose: false })).toBe("prompt");
    expect(m.docs.length).toBe(1);
  });

  it("closes a dirty tab silently when silentClose is on and keeps its text recoverable", () => {
    const d = m.newDoc();
    m.setText(d.id, "precious");
    expect(m.requestClose(d.id, { silentClose: true })).toBe("closed");
    expect(m.docs.length).toBe(0);
    expect(m.recentlyClosed[0].text).toBe("precious");
  });

  it("does not record a clean silent close in recently closed", () => {
    const d = m.newDoc();
    m.requestClose(d.id, { silentClose: true });
    expect(m.recentlyClosed).toEqual([]);
  });

  it("bounds the recently closed list, dropping the oldest", () => {
    const small = new DocumentManager({ recentlyClosedLimit: 2 });
    for (const t of ["one", "two", "three"]) {
      const d = small.newDoc();
      small.setText(d.id, t);
      small.requestClose(d.id, { silentClose: true });
    }
    expect(small.recentlyClosed.map((r) => r.text)).toEqual(["three", "two"]);
  });
});

describe("change notifications", () => {
  it("notifies subscribers on changes and supports unsubscribe", () => {
    let n = 0;
    const off = m.subscribe(() => n++);
    m.newDoc();
    expect(n).toBeGreaterThan(0);
    const before = n;
    off();
    m.newDoc();
    expect(n).toBe(before);
  });
});
