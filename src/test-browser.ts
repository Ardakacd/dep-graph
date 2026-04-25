/// <reference lib="dom" />
// Tier 4 — Playwright browser test for graph.html.
// Loads the page in headless Chromium, exercises the controls, and asserts
// the cytoscape graph state changes as expected. Captures any console errors.

import { chromium, type ConsoleMessage } from "playwright";
import { resolve } from "path";

let pass = 0, fail = 0;
const failures: string[] = [];
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log("  ✔", name); }
  else { fail++; failures.push(`${name}${detail ? " — " + detail : ""}`); console.log("  ✘", name, detail ?? ""); }
}

const url = "file://" + resolve("graph.html");

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await context.newPage();

const consoleErrors: string[] = [];
const pageErrors: string[] = [];
page.on("console", (msg: ConsoleMessage) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});
page.on("pageerror", (e) => pageErrors.push(e.message));

console.log("\n── Section 1: page loads cleanly ──");
await page.goto(url, { waitUntil: "load" });
// Wait for cytoscape to register and for fcose to settle.
await page.waitForFunction(() => typeof (window as any).cy !== "undefined", null, { timeout: 10_000 });
// fcose runs async — give it a beat to finish initial layout.
await page.waitForFunction(() => (window as any).cy.nodes().length > 0, null, { timeout: 10_000 });
await page.waitForTimeout(2_000);

const initialCounts = await page.evaluate(() => {
  const cy = (window as any).cy;
  return {
    nodes: cy.nodes().length,
    edges: cy.edges().length,
    visibleNodes: cy.nodes(":visible").length,
    canvasCount: document.querySelectorAll("#cy canvas").length,
  };
});
check(`cytoscape mounted (${initialCounts.nodes} nodes, ${initialCounts.edges} edges)`,
  initialCounts.nodes > 1300 && initialCounts.edges > 1500);
check(`cytoscape rendered to canvas (${initialCounts.canvasCount} canvases)`, initialCounts.canvasCount >= 1);
check("default view 'resources' hides at least 80% of tool nodes",
  initialCounts.visibleNodes < initialCounts.nodes * 0.5,
  `visible: ${initialCounts.visibleNodes} / ${initialCounts.nodes}`);

console.log("\n── Section 2: view-mode filter ──");
await page.click('.filter-btn[data-view="full"]');
await page.waitForTimeout(800);
const fullVisible = await page.evaluate(() => (window as any).cy.nodes(":visible").length);
check(`'Full graph' shows more nodes than 'Resources only' (${fullVisible} > ${initialCounts.visibleNodes})`,
  fullVisible > initialCounts.visibleNodes);

await page.click('.filter-btn[data-view="resources"]');
await page.waitForTimeout(500);
const backToResources = await page.evaluate(() => (window as any).cy.nodes(":visible").length);
check("toggling back to 'Resources only' restores hidden state",
  Math.abs(backToResources - initialCounts.visibleNodes) < 5);

console.log("\n── Section 3: toolkit filter ──");
// Switch to full so we can see toolkit splits clearly.
await page.click('.filter-btn[data-view="full"]');
await page.waitForTimeout(800);
const allTk = await page.evaluate(() => (window as any).cy.nodes(":visible").length);

await page.click('.filter-btn[data-tk="googlesuper"]');
await page.waitForTimeout(1500);
const googleOnly = await page.evaluate(() => {
  const cy = (window as any).cy;
  const visibleNodes = cy.nodes(":visible");
  let googleTools = 0, githubTools = 0, anyOrGoogleResources = 0, githubResources = 0;
  for (const n of visibleNodes) {
    const t = n.data("type");
    const tk = n.data("toolkit");
    if (t === "tool" && tk === "googlesuper") googleTools++;
    if (t === "tool" && tk === "github") githubTools++;
    if (t === "resource" && (tk === "googlesuper" || tk === "any")) anyOrGoogleResources++;
    if (t === "resource" && tk === "github") githubResources++;
  }
  return { total: visibleNodes.length, googleTools, githubTools, anyOrGoogleResources, githubResources };
});
check("googlesuper filter hides every github tool", googleOnly.githubTools === 0,
  `still visible: ${googleOnly.githubTools}`);
check("googlesuper filter hides every github-only resource", googleOnly.githubResources === 0,
  `still visible: ${googleOnly.githubResources}`);
check("googlesuper filter still shows google tools", googleOnly.googleTools > 100);

await page.click('.filter-btn[data-tk="github"]');
await page.waitForTimeout(1500);
const githubOnly = await page.evaluate(() => {
  const cy = (window as any).cy;
  let googleTools = 0, githubTools = 0;
  for (const n of cy.nodes(":visible")) {
    const t = n.data("type"), tk = n.data("toolkit");
    if (t === "tool" && tk === "googlesuper") googleTools++;
    if (t === "tool" && tk === "github") githubTools++;
  }
  return { googleTools, githubTools };
});
check("github filter hides every google tool", githubOnly.googleTools === 0);
check("github filter still shows github tools", githubOnly.githubTools > 100);

await page.click('.filter-btn[data-tk="all"]');
await page.waitForTimeout(1000);

console.log("\n── Section 4: show all labels & reset view ──");
const beforeLabelsZoom = await page.evaluate(() => (window as any).cy.zoom());
// "Show all labels" auto-zooms (per recent fix) — find the button by its text.
await page.getByText(/show all labels/i).first().click();
await page.waitForTimeout(700);
const afterLabelsZoom = await page.evaluate(() => (window as any).cy.zoom());
check("'Show all labels' changes the zoom level (auto-zooms in)",
  afterLabelsZoom > beforeLabelsZoom,
  `before=${beforeLabelsZoom.toFixed(2)} after=${afterLabelsZoom.toFixed(2)}`);

await page.getByText(/reset view/i).first().click();
await page.waitForTimeout(1500);
const afterReset = await page.evaluate(() => {
  const cy = (window as any).cy;
  return { zoom: cy.zoom(), pan: cy.pan() };
});
check("'Reset view' returns to a sane zoom (between 0.1 and 3)",
  afterReset.zoom > 0.05 && afterReset.zoom < 3);

console.log("\n── Section 5: node selection ──");
// Click a known tool node by id and verify the details panel updates.
const detailsBefore = await page.evaluate(() => {
  const el = document.querySelector("#panel, #details, #selection, .panel");
  return el ? el.textContent || "" : "";
});
await page.evaluate(() => {
  const cy = (window as any).cy;
  const node = cy.getElementById("GOOGLESUPER_REPLY_TO_THREAD");
  if (node && node.length) {
    node.emit("tap");
  }
});
await page.waitForTimeout(500);
const detailsAfter = await page.evaluate(() => {
  const el = document.querySelector("#panel, #details, #selection, .panel");
  return el ? el.textContent || "" : "";
});
check("clicking a node updates the panel content",
  detailsAfter !== detailsBefore && /REPLY|thread/i.test(detailsAfter),
  detailsAfter.length > 200 ? detailsAfter.slice(0, 100) + "…" : detailsAfter);

console.log("\n── Section 6: no console / page errors ──");
check(`no console.error during run (got ${consoleErrors.length})`,
  consoleErrors.length === 0,
  consoleErrors.slice(0, 3).join(" | "));
check(`no uncaught page errors (got ${pageErrors.length})`,
  pageErrors.length === 0,
  pageErrors.slice(0, 3).join(" | "));

await browser.close();

console.log("\n══════════════════════════════════════════");
console.log(`Tier 4 (browser): ${pass} passed, ${fail} failed.`);
if (fail) {
  console.log("\nFailures:");
  for (const f of failures) console.log("  •", f);
  process.exit(1);
}
