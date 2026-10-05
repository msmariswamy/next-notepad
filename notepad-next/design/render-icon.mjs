// Renders design/app-icon.svg to a 1024px transparent PNG (and small previews) with Playwright's WebKit.
import { webkit } from "@playwright/test";
import { readFileSync } from "node:fs";

const svg = readFileSync(new URL("./app-icon.svg", import.meta.url), "utf8");
const browser = await webkit.launch();
for (const size of [1024, 128, 32, 16]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{width:${size}px;height:${size}px;display:block}</style>${svg}`);
  const out = size === 1024 ? "design/app-icon.png" : `design/preview-${size}.png`;
  await page.screenshot({ path: out, omitBackground: true });
  await page.close();
}
await browser.close();
console.log("rendered");
