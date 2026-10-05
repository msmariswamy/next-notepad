import { describe, expect, it } from "vitest";
import { DETECT_PREFIX_BYTES, detectFromContent } from "./detect";

describe("detectFromContent", () => {
  it("detects JSON objects and arrays", () => {
    expect(detectFromContent('{"a": [1, 2]}')).toBe("JSON");
    expect(detectFromContent('[{"a":1},{"b":2}]')).toBe("JSON");
    expect(detectFromContent('  \n{\n  "name": "x",\n  "n": 1\n}\n')).toBe("JSON");
    expect(detectFromContent("[1, 2, 3]")).toBe("JSON");
  });

  it("still recognises JSON that has a syntax error, so it gets highlighted while being fixed", () => {
    expect(detectFromContent('{"a": 1,\n "b": }')).toBe("JSON");
    expect(detectFromContent('{"a":')).toBe("JSON");
  });

  it("does not mistake prose, markdown links or plain brackets for JSON", () => {
    expect(detectFromContent("[1] see the footnote")).not.toBe("JSON");
    expect(detectFromContent("{ not json at all }")).not.toBe("JSON");
    expect(detectFromContent("Meeting notes: call John tomorrow.")).toBeNull();
  });

  it("detects XML", () => {
    expect(detectFromContent('<?xml version="1.0"?><root><a/></root>')).toBe("XML");
    expect(detectFromContent("<config>\n  <item id=\"1\"/>\n</config>")).toBe("XML");
    expect(detectFromContent("<note><to>Tove</to></note>")).toBe("XML");
  });

  it("detects HTML", () => {
    expect(detectFromContent("<!DOCTYPE html><html><body></body></html>")).toBe("HTML");
    expect(detectFromContent("<html>\n<head></head>\n</html>")).toBe("HTML");
    expect(detectFromContent("<div><p>Hi</p></div>")).toBe("HTML");
    expect(detectFromContent("<ul><li>a</li></ul>")).toBe("HTML");
  });

  it("detects YAML", () => {
    expect(detectFromContent("name: app\nitems:\n  - a\n  - b")).toBe("YAML");
    expect(detectFromContent("---\nkey: value\nother: 2")).toBe("YAML");
    expect(detectFromContent("# config\nserver:\n  port: 8080\n  host: localhost")).toBe("YAML");
    expect(detectFromContent("- a\n- b\n- c")).toBe("YAML");
  });

  it("does not treat a single 'key: value' line or prose with colons as YAML", () => {
    expect(detectFromContent("name: app")).toBeNull();
    expect(detectFromContent("Dear John,\nNote: please call me.\nThanks")).toBeNull();
  });

  it("detects Java", () => {
    expect(detectFromContent("package a;\n\npublic class Foo {\n  public static void main(String[] args) {}\n}")).toBe("Java");
    expect(detectFromContent("import java.util.List;\n\nclass A {}")).toBe("Java");
    expect(detectFromContent("public class Main {\n  @Override\n  public String toString() { return \"x\"; }\n}")).toBe("Java");
    expect(detectFromContent('System.out.println("hi");')).toBe("Java");
  });

  it("returns null for ordinary text, empty input and whitespace", () => {
    expect(detectFromContent("")).toBeNull();
    expect(detectFromContent("   \n\t ")).toBeNull();
    expect(detectFromContent("Just some words here.\nAnd another line.")).toBeNull();
  });

  it("examines only a bounded prefix of large documents", () => {
    const big = '{"a": 1}' + " ".repeat(10) + "x".repeat(DETECT_PREFIX_BYTES * 2);
    const start = performance.now();
    expect(detectFromContent(big)).toBe("JSON"); // shape of the prefix, not full validation
    expect(performance.now() - start).toBeLessThan(200);
    expect(DETECT_PREFIX_BYTES).toBe(64 * 1024);
  });

  it("looks only at the prefix: content after 64 KB cannot change the answer", () => {
    const prose = "word ".repeat(DETECT_PREFIX_BYTES);
    expect(detectFromContent(prose + '\n{"a":1}')).toBeNull();
  });

  it("prefers JSON over YAML for JSON-looking text (JSON is valid YAML)", () => {
    expect(detectFromContent('{"a": 1}')).toBe("JSON");
  });

  it("detects HTML before XML for ordinary web markup", () => {
    expect(detectFromContent("<p>hello</p>")).toBe("HTML");
  });
});
