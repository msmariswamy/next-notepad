import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DocumentManager } from "../docs/documentManager";
import { createMockIpc } from "../ipc";
import { SessionClient } from "./client";
import { buildSnapshot, restoreSession, type SessionSnapshot, type TabSnapshot } from "./snapshot";

const tab = (over: Partial<TabSnapshot> = {}): TabSnapshot => ({
  id: "doc-1",
  title: "new 1",
  path: null,
  encoding: "UTF-8",
  bom: false,
  eol: "lf",
  language: "Normal text",
  dirty: true,
  text: "hello",
  ...over,
});

const snapshotOf = (tabs: TabSnapshot[], activeId: string | null = null): SessionSnapshot => ({
  tabs,
  activeId,
  recentlyClosed: [],
});

describe("buildSnapshot", () => {
  it("stores text for untitled tabs", () => {
    const m = new DocumentManager();
    const d = m.newDoc();
    m.setText(d.id, "draft");
    expect(buildSnapshot(m).tabs[0]).toMatchObject({ id: d.id, text: "draft", path: null, dirty: true });
  });

  it("stores text for a dirty file tab but not for a clean one", () => {
    const m = new DocumentManager();
    const clean = m.openFile("/a.txt", { text: "a", encoding: "UTF-8", bom: false, eol: "lf" });
    const dirty = m.openFile("/b.txt", { text: "b", encoding: "UTF-8", bom: false, eol: "lf" });
    m.setText(dirty.id, "b!");
    const snap = buildSnapshot(m);
    expect(snap.tabs.find((t) => t.id === clean.id)!.text).toBeNull();
    expect(snap.tabs.find((t) => t.id === dirty.id)!.text).toBe("b!");
  });

  it("records the active tab and recently closed text", () => {
    const m = new DocumentManager();
    const a = m.newDoc();
    m.setText(a.id, "gone");
    m.requestClose(a.id, { silentClose: true });
    m.newDoc();
    const snap = buildSnapshot(m);
    expect(snap.activeId).toBe(m.activeId);
    expect(snap.recentlyClosed[0].text).toBe("gone");
  });
});

describe("restoreSession", () => {
  it("restores untitled tabs with their text, marked modified", async () => {
    const ipc = createMockIpc({ load_session: () => snapshotOf([tab({ id: "doc-1", text: "one" }), tab({ id: "doc-2", title: "new 2", text: "two" })]) });
    const m = new DocumentManager();
    expect(await restoreSession(m, ipc)).toBe(true);
    expect(m.docs.map((d) => [d.title, d.text, d.dirty])).toEqual([
      ["new 1", "one", true],
      ["new 2", "two", true],
    ]);
  });

  it("restores the active tab", async () => {
    const ipc = createMockIpc({
      load_session: () => snapshotOf([tab({ id: "doc-1" }), tab({ id: "doc-2", title: "new 2" })], "doc-2"),
    });
    const m = new DocumentManager();
    await restoreSession(m, ipc);
    expect(m.activeId).toBe("doc-2");
  });

  it("does not collide new ids with restored ones", async () => {
    const ipc = createMockIpc({ load_session: () => snapshotOf([tab({ id: "doc-7" })]) });
    const m = new DocumentManager();
    await restoreSession(m, ipc);
    expect(m.newDoc().id).toBe("doc-8");
  });

  it("numbers the next untitled tab after restored ones", async () => {
    const ipc = createMockIpc({ load_session: () => snapshotOf([tab({ title: "new 3" })]) });
    const m = new DocumentManager();
    await restoreSession(m, ipc);
    expect(m.newDoc().title).toBe("new 4");
  });

  it("reloads a clean file tab from disk", async () => {
    const ipc = createMockIpc({
      load_session: () => snapshotOf([tab({ id: "doc-1", title: "a.txt", path: "/a.txt", dirty: false, text: null })]),
      open_file: () => ({ text: "on disk", encoding: "UTF-8", bom: false, eol: "lf" }),
    });
    const m = new DocumentManager();
    await restoreSession(m, ipc);
    expect(m.docs[0]).toMatchObject({ text: "on disk", dirty: false, missing: false });
  });

  it("keeps edited text for a dirty file tab and compares against the disk copy", async () => {
    const ipc = createMockIpc({
      load_session: () => snapshotOf([tab({ title: "a.txt", path: "/a.txt", text: "edited" })]),
      open_file: () => ({ text: "original", encoding: "UTF-8", bom: false, eol: "lf" }),
    });
    const m = new DocumentManager();
    await restoreSession(m, ipc);
    expect(m.docs[0]).toMatchObject({ text: "edited", savedText: "original", dirty: true });
  });

  it("keeps unsaved text but flags the tab when its file is missing", async () => {
    const ipc = createMockIpc({
      load_session: () => snapshotOf([tab({ title: "gone.txt", path: "/gone.txt", text: "still mine" })]),
      open_file: () => {
        throw new Error("No such file");
      },
    });
    const m = new DocumentManager();
    await restoreSession(m, ipc);
    expect(m.docs[0]).toMatchObject({ text: "still mine", missing: true, dirty: true });
  });

  it("skips a clean tab whose file is missing", async () => {
    const ipc = createMockIpc({
      load_session: () => snapshotOf([tab({ path: "/gone.txt", dirty: false, text: null })]),
      open_file: () => {
        throw new Error("No such file");
      },
    });
    const m = new DocumentManager();
    expect(await restoreSession(m, ipc)).toBe(false);
    expect(m.docs).toEqual([]);
  });

  it("restores the caret-free content only (no cursor in the model)", async () => {
    const ipc = createMockIpc({ load_session: () => snapshotOf([tab()]) });
    const m = new DocumentManager();
    await restoreSession(m, ipc);
    expect(Object.keys(m.docs[0])).not.toContain("cursor");
  });

  it("returns false and leaves the manager empty for an empty session", async () => {
    const ipc = createMockIpc({ load_session: () => snapshotOf([]) });
    const m = new DocumentManager();
    expect(await restoreSession(m, ipc)).toBe(false);
  });

  it("restores the recently closed list", async () => {
    const ipc = createMockIpc({
      load_session: () => ({ tabs: [], activeId: null, recentlyClosed: [tab({ id: "closed-0", text: "kept" })] }),
    });
    const m = new DocumentManager();
    await restoreSession(m, ipc);
    expect(m.recentlyClosed[0].text).toBe("kept");
  });
});

describe("SessionClient", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("saves a snapshot after the debounce interval, not on every change", async () => {
    const ipc = createMockIpc({ save_session: () => undefined });
    const m = new DocumentManager();
    const client = new SessionClient(m, ipc, 2000);
    client.start();
    const d = m.newDoc();
    m.setText(d.id, "a");
    m.setText(d.id, "ab");
    expect(ipc.calls.length).toBe(0);
    await vi.advanceTimersByTimeAsync(2000);
    expect(ipc.calls.length).toBe(1);
    expect((ipc.calls[0].args as { snapshot: SessionSnapshot }).snapshot.tabs[0].text).toBe("ab");
  });

  it("flush saves immediately and cancels the pending debounce", async () => {
    const ipc = createMockIpc({ save_session: () => undefined });
    const m = new DocumentManager();
    const client = new SessionClient(m, ipc, 2000);
    client.start();
    m.newDoc();
    await client.flush();
    expect(ipc.calls.length).toBe(1);
    await vi.advanceTimersByTimeAsync(5000);
    expect(ipc.calls.length).toBe(1);
  });

  it("stop() halts further snapshots", async () => {
    const ipc = createMockIpc({ save_session: () => undefined });
    const m = new DocumentManager();
    const client = new SessionClient(m, ipc, 100);
    client.start();
    client.stop();
    m.newDoc();
    await vi.advanceTimersByTimeAsync(1000);
    expect(ipc.calls.length).toBe(0);
  });
});
