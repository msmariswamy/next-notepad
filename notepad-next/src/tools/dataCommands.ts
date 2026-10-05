import type { App } from "../app/app";
import type { Command } from "../app/commands";
import { jsonToYaml, yamlToJson } from "../convert/yamlJson";
import { jsonToXml, xmlToJson } from "../convert/xmlJson";
import { compactXml, escapeXmlTool, formatXml, sortXmlAttributes, unescapeXmlTool, validateXmlTool } from "../xml/tools";
import { compactYaml, formatYaml, sortYamlKeys, validateYamlTool, withYamlSelection } from "../yaml/tools";
import { runConvert, runTool, type ToolContext, type ToolResult } from "./runTool";

/** The XML and YAML menus and the Convert commands (specs: xml-tools, yaml-tools, format-conversion). No accelerators, to avoid collisions. */
export function dataToolCommands(app: App): Command[] {
  const xml = (id: string, label: string, success: string, run: (t: string, c: ToolContext) => ToolResult, inspectOnly = false): Command => ({
    id,
    label,
    run: () => void runTool(app, { language: "XML", success, errorPrefix: inspectOnly ? "Invalid XML" : `Cannot ${label.toLowerCase().replace(/ \(.*\)$/, "")} XML`, inspectOnly, run }),
  });
  const yaml = (id: string, label: string, success: string, run: (t: string, c: ToolContext) => Promise<ToolResult>, inspectOnly = false): Command => ({
    id,
    label,
    run: () =>
      void runTool(app, {
        language: "YAML",
        success,
        errorPrefix: inspectOnly ? "Invalid YAML" : `Cannot ${label.toLowerCase().replace(/ \(.*\)$/, "")} YAML`,
        inspectOnly,
        run: (t, c) => withYamlSelection(t, c, (dedented) => run(dedented, c)),
      }),
  });
  const convert = (id: string, label: string, target: string, from: string, run: (t: string, c: ToolContext) => ToolResult | Promise<ToolResult>): Command => ({
    id,
    label,
    run: () => void runConvert(app, { target, success: `Converted to ${target}`, errorPrefix: `Cannot convert ${from}`, run }),
  });

  return [
    xml("xml.format2", "Format (2 spaces)", "Formatted as XML", (t, c) => formatXml(t, "  ", c)),
    xml("xml.format4", "Format (4 spaces)", "Formatted as XML", (t, c) => formatXml(t, "    ", c)),
    xml("xml.formatTabs", "Format (tabs)", "Formatted as XML", (t, c) => formatXml(t, "\t", c)),
    xml("xml.compact", "Compact", "Compacted XML", compactXml),
    xml("xml.sortAttributes", "Sort Attributes", "Sorted XML attributes", sortXmlAttributes),
    xml("xml.escape", "Escape", "Escaped XML text", escapeXmlTool),
    xml("xml.unescape", "Unescape", "Unescaped XML text", unescapeXmlTool),
    xml("xml.validate", "Validate", "XML is valid", validateXmlTool, true),
    yaml("yaml.format2", "Format (2 spaces)", "Formatted as YAML", (t, c) => formatYaml(t, 2, c)),
    yaml("yaml.format4", "Format (4 spaces)", "Formatted as YAML", (t, c) => formatYaml(t, 4, c)),
    yaml("yaml.compact", "Compact", "Compacted YAML to flow style", compactYaml),
    yaml("yaml.validate", "Validate", "YAML is valid", validateYamlTool, true),
    yaml("yaml.sortKeys", "Sort Keys", "Sorted YAML keys", sortYamlKeys),
    convert("convert.jsonToYaml", "Convert to YAML", "YAML", "JSON", jsonToYaml),
    convert("convert.jsonToXml", "Convert to XML", "XML", "JSON", jsonToXml),
    convert("convert.yamlToJson", "Convert to JSON", "JSON", "YAML", yamlToJson),
    convert("convert.xmlToJson", "Convert to JSON", "JSON", "XML", xmlToJson),
  ];
}
