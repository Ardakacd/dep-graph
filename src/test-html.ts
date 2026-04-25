// Tier 2 — graph.html smoke tests.
// Validates the embedded GRAPH literal, key DOM elements, and JS wiring strings.

import { readFileSync, statSync } from "fs";

const html = readFileSync("graph.html", "utf-8");

let pass = 0, fail = 0;
const failures: string[] = [];
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log("  ✔", name); }
  else { fail++; failures.push(`${name}${detail ? " — " + detail : ""}`); console.log("  ✘", name, detail ?? ""); }
}

console.log("\n── Section 1: file shape ──");
const size = statSync("graph.html").size;
check(`file is non-trivially sized (${size} bytes)`, size > 100_000 && size < 20_000_000);
check("starts with <!doctype html or <!DOCTYPE", /^<!doctype html|^<!DOCTYPE html/i.test(html));
check("ends with </html>", /<\/html>\s*$/.test(html));
check("has a <title>", /<title>[^<]+<\/title>/i.test(html));

console.log("\n── Section 2: cytoscape & layout ──");
check("loads cytoscape.js", /cytoscape(?:\.min)?\.js/.test(html));
check("loads fcose layout extension", /cytoscape-fcose|layout-base|cose-base/.test(html));
check('layout name is "fcose"', /name:\s*['"]fcose['"]/.test(html));

console.log("\n── Section 3: embedded GRAPH literal ──");
const start = html.indexOf("const GRAPH = ");
check("GRAPH literal marker present", start !== -1);

let graph: any = null;
if (start !== -1) {
  const stop = html.indexOf(";\n\n", start);
  check("GRAPH literal terminator present", stop !== -1);
  if (stop !== -1) {
    const literal = html.slice(start + "const GRAPH = ".length, stop);
    try {
      graph = JSON.parse(literal);
      check("GRAPH parses as JSON", true);
    } catch (e: any) {
      check("GRAPH parses as JSON", false, e.message);
    }
  }
}

if (graph) {
  check("GRAPH has nodes array", Array.isArray(graph.nodes));
  check("GRAPH has edges array", Array.isArray(graph.edges));
  check(`GRAPH node count > 1300 (got ${graph.nodes.length})`, graph.nodes.length > 1300);
  check(`GRAPH edge count > 1500 (got ${graph.edges.length})`, graph.edges.length > 1500);

  const sampleNode = graph.nodes[0];
  check("nodes have id field", typeof sampleNode?.id === "string");
  check("nodes have type field", sampleNode?.type === "tool" || sampleNode?.type === "resource");

  const types = new Set(graph.nodes.map((n: any) => n.type));
  check("both 'tool' and 'resource' types present", types.has("tool") && types.has("resource"));

  const resCount = graph.nodes.filter((n: any) => n.type === "resource").length;
  const toolCount = graph.nodes.filter((n: any) => n.type === "tool").length;
  check(`resource count between 30 and 100 (got ${resCount})`, resCount >= 30 && resCount <= 100);
  check(`tool count > 1000 (got ${toolCount})`, toolCount > 1000);

  // Toolkit field on resources powers the toolkit-filter behavior.
  const resWithToolkit = graph.nodes.filter((n: any) => n.type === "resource" && typeof n.toolkit === "string");
  check("all resource nodes carry a toolkit field",
    resWithToolkit.length === resCount, `${resWithToolkit.length}/${resCount}`);
  const toolkitVals = new Set(resWithToolkit.map((n: any) => n.toolkit));
  check("resource toolkit values include 'any'/'googlesuper'/'github'",
    toolkitVals.has("any") || (toolkitVals.has("googlesuper") && toolkitVals.has("github")),
    "found: " + [...toolkitVals].join(", "));

  // Spot checks on canonical nodes.
  const ids = new Set(graph.nodes.map((n: any) => n.id));
  for (const slug of [
    "GOOGLESUPER_REPLY_TO_THREAD",
    "GOOGLESUPER_SEND_EMAIL",
    "GITHUB_CREATE_AN_ISSUE_COMMENT",
    "R::email_address",
    "R::repository",
    "R::issue",
  ]) {
    check(`embedded GRAPH contains ${slug}`, ids.has(slug));
  }

  const edgeKinds = new Set(graph.edges.map((e: any) => e.kind));
  check("edges include both 'produces' and 'consumes' kinds",
    edgeKinds.has("produces") && edgeKinds.has("consumes"));
}

console.log("\n── Section 4: DOM controls ──");
// Filter buttons / panel
check("toolkit filter buttons present",
  /data-tk\s*=\s*['"](?:all|googlesuper|github)['"]/.test(html));
check("view-mode filter buttons present",
  /data-view\s*=\s*['"](?:resources|full)['"]/.test(html));
check("'Show all labels' control present", /Show all labels|show-labels|toggleLabels/i.test(html));
check("'Reset view' control present", /Reset view|reset-view|resetView/i.test(html));
check("selection / detail panel present",
  /id\s*=\s*['"](?:panel|details|selection|sidebar)['"]/i.test(html) ||
  /class\s*=\s*['"][^'"]*\bpanel\b[^'"]*['"]/i.test(html));

console.log("\n── Section 5: interactivity wiring ──");
check("registers a tap/click handler", /\.on\(\s*['"](?:tap|click)/.test(html));
check("references node selection", /\.target\.id\(\)|\.selected\(\)|\.select\(\)/.test(html));
// Optional/required edge styling
check("styles dashed (optional) edges", /line-style\s*:\s*['"]?dashed|dashed/.test(html));
// Layout tunables — make sure they survived bundling.
check("idealEdgeLength tuned", /idealEdgeLength/.test(html));
check("nodeRepulsion tuned", /nodeRepulsion/.test(html));

console.log("\n── Section 6: no obvious errors ──");
check("no literal 'undefined' as node id", !/"id"\s*:\s*"undefined"/.test(html));
check("no JS console.error in source", !/console\.error\s*\(/.test(html));
check("no TODO/FIXME markers in shipped html", !/\b(TODO|FIXME)\b/.test(html));

console.log("\n══════════════════════════════════════════");
console.log(`Tier 2: ${pass} passed, ${fail} failed.`);
if (fail) {
  console.log("\nFailures:");
  for (const f of failures) console.log("  •", f);
  process.exit(1);
}
