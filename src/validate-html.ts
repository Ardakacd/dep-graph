import { readFileSync } from "fs";
const html = readFileSync("graph.html", "utf-8");
console.log("size:", html.length);
const start = html.indexOf("const GRAPH = ");
const stop = html.indexOf(";\n\n// ── Build cytoscape", start);
const literal = html.slice(start + "const GRAPH = ".length, stop);
try {
  const obj = JSON.parse(literal);
  console.log("embedded JSON OK: nodes=", obj.nodes.length, "edges=", obj.edges.length);
} catch (e: any) {
  console.log("parse FAIL:", e.message);
  console.log("near:", literal.slice(0, 200), "...", literal.slice(-200));
}
