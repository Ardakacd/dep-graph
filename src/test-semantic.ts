// Tier 3 — semantic deep-check over graph.json.
// Goes beyond structural validity: dependency reachability, hub fan-out,
// dead-end detection, toolkit isolation. Exits non-zero on hard failures.

import { readFileSync } from "fs";

type Edge = { source: string; target: string; kind: "produces" | "consumes"; param?: string; required?: boolean };
type Node = {
  id: string;
  type: "tool" | "resource";
  label: string;
  toolkit?: string;
  produces?: string[];
  consumes?: string[];
};

const g = JSON.parse(readFileSync("graph.json", "utf-8")) as { nodes: Node[]; edges: Edge[] };

let pass = 0, fail = 0;
const failures: string[] = [];
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log("  ✔", name); }
  else { fail++; failures.push(`${name}${detail ? " — " + detail : ""}`); console.log("  ✘", name, detail ?? ""); }
}

const byId = new Map(g.nodes.map((n) => [n.id, n] as const));
const tools = g.nodes.filter((n) => n.type === "tool");
const resources = g.nodes.filter((n) => n.type === "resource");
const produces = g.edges.filter((e) => e.kind === "produces");
const consumes = g.edges.filter((e) => e.kind === "consumes");

// Index: resource → producers (tool slugs); resource → consumers (tool slugs);
// tool → required resources (incoming consumes edges only count required).
const producersOf = new Map<string, string[]>();
const consumersOf = new Map<string, string[]>();
for (const e of produces) {
  if (!producersOf.has(e.target)) producersOf.set(e.target, []);
  producersOf.get(e.target)!.push(e.source);
}
for (const e of consumes) {
  if (!consumersOf.has(e.source)) consumersOf.set(e.source, []);
  consumersOf.get(e.source)!.push(e.target);
}

// Required incoming resources per tool (from consumes edges with required !== false).
const requiredResourcesOf = new Map<string, Set<string>>();
for (const e of consumes) {
  if (e.required === false) continue;
  if (!requiredResourcesOf.has(e.target)) requiredResourcesOf.set(e.target, new Set());
  requiredResourcesOf.get(e.target)!.add(e.source);
}

console.log("\n── Section 1: producer coverage ──");
// A consumed resource without producers is a dead-end for any tool that requires it.
const consumedResources = new Set(consumes.map((e) => e.source));
const consumerOnly = [...consumedResources].filter((r) => !(producersOf.get(r)?.length ?? 0));
// We log these as informational in Tier 1; here we cap the count — runaway means a missing alias.
check(`consumer-only resources stay below 5 (got ${consumerOnly.length})`,
  consumerOnly.length < 5,
  consumerOnly.length ? "consumer-only: " + consumerOnly.join(", ") : "");

// Required-binding edges into consumer-only resources are real toolkit coverage gaps
// (e.g. Google exposes ACL_DELETE but no LIST_ACL). We log them and only fail if the
// count balloons — that would mean a producer-detection regression, not a real gap.
const requiredEdgesNoProducer = consumes.filter(
  (e) => e.required !== false && !(producersOf.get(e.source)?.length ?? 0),
);
check(`required-consume edges into consumer-only resources stay below 20 (got ${requiredEdgesNoProducer.length})`,
  requiredEdgesNoProducer.length < 20);
if (requiredEdgesNoProducer.length > 0) {
  console.log(`  ℹ ${requiredEdgesNoProducer.length} required edge(s) into consumer-only resources (known gaps):`);
  for (const e of requiredEdgesNoProducer.slice(0, 5)) {
    console.log(`       • ${e.target}  needs  ${e.source}  (param=${e.param})`);
  }
}

console.log("\n── Section 2: hub fan-out sanity ──");
// Hub resources should be heavily consumed (the whole point of having them).
function expectFanOut(resourceKey: string, minConsumers: number) {
  const id = `R::${resourceKey}`;
  const n = consumersOf.get(id)?.length ?? 0;
  check(`hub '${resourceKey}' has ≥${minConsumers} consumers (got ${n})`, n >= minConsumers);
}
expectFanOut("repository", 50);
expectFanOut("issue", 10);
expectFanOut("pull_request", 10);
expectFanOut("gmail_thread", 3);
expectFanOut("gmail_message", 3);
expectFanOut("calendar", 3);
expectFanOut("email_address", 5);

// Hub resources should also have a real producer (>=1).
function expectProducible(resourceKey: string) {
  const id = `R::${resourceKey}`;
  const n = producersOf.get(id)?.length ?? 0;
  check(`hub '${resourceKey}' has ≥1 producer (got ${n})`, n >= 1);
}
for (const k of ["repository", "issue", "pull_request", "gmail_thread", "gmail_message", "calendar", "email_address"]) {
  expectProducible(k);
}

console.log("\n── Section 3: dead-end tool detection ──");
// A "dead-end" tool requires at least one resource that nobody produces.
// We allow a small number (auth-only / opaque types) but a flood means the producer side is broken.
const deadEnds = tools.filter((t) => {
  const reqs = requiredResourcesOf.get(t.id);
  if (!reqs || reqs.size === 0) return false;
  for (const r of reqs) {
    if (!(producersOf.get(r)?.length ?? 0)) return true;
  }
  return false;
});
check(`fewer than 5% of tools are dead-end (${deadEnds.length}/${tools.length})`,
  deadEnds.length < tools.length * 0.05,
  deadEnds.length ? `examples: ${deadEnds.slice(0, 3).map((t) => t.id).join(", ")}` : "");

console.log("\n── Section 4: README reachability via BFS ──");
// Build a directed graph: tool → resource (produces) and resource → tool (consumes).
// A user wants to reach tool T. Starting from "tools with no required inputs",
// BFS forward should reach T. We respect required-only consumes for solving.
const noInputTools = new Set(
  tools.filter((t) => !(requiredResourcesOf.get(t.id)?.size)).map((t) => t.id),
);

function reachable(targetTool: string): boolean {
  if (noInputTools.has(targetTool)) return true;
  const haveResources = new Set<string>();
  const usedTools = new Set<string>(noInputTools);
  // Seed: every produces-edge from a no-input tool yields its resource.
  for (const e of produces) if (noInputTools.has(e.source)) haveResources.add(e.target);
  let progress = true;
  while (progress) {
    progress = false;
    // Any tool whose required resources are all satisfied becomes "usable".
    for (const t of tools) {
      if (usedTools.has(t.id)) continue;
      const reqs = requiredResourcesOf.get(t.id);
      if (!reqs) continue; // covered by noInputTools already
      let ok = true;
      for (const r of reqs) if (!haveResources.has(r)) { ok = false; break; }
      if (!ok) continue;
      usedTools.add(t.id);
      progress = true;
      if (t.id === targetTool) return true;
      // Tool now usable → its produces become available resources.
      for (const e of produces) if (e.source === t.id) haveResources.add(e.target);
    }
  }
  return usedTools.has(targetTool);
}

for (const slug of [
  "GOOGLESUPER_REPLY_TO_THREAD",
  "GOOGLESUPER_SEND_EMAIL",
  "GITHUB_CREATE_AN_ISSUE_COMMENT",
  "GITHUB_GET_A_PULL_REQUEST",
  "GOOGLESUPER_CREATE_EVENT",
]) {
  check(`${slug} is reachable from no-input tools via BFS`, reachable(slug));
}

console.log("\n── Section 5: toolkit isolation ──");
// A googlesuper tool should not bind to a github-only resource (and vice versa),
// unless the resource is toolkit "any".
function toolkitOf(slug: string): string | undefined {
  return byId.get(slug)?.toolkit;
}
const crossWired = consumes.filter((e) => {
  const rTk = byId.get(e.source)?.toolkit;
  const tTk = byId.get(e.target)?.toolkit;
  if (!rTk || !tTk) return false;
  if (rTk === "any") return false;
  return rTk !== tTk;
});
check("no consumes edge crosses toolkits (excluding 'any')",
  crossWired.length === 0,
  crossWired.length
    ? `examples: ${crossWired.slice(0, 3).map((e) => `${e.source}→${e.target}`).join("; ")}`
    : "");
const crossWiredProd = produces.filter((e) => {
  const rTk = byId.get(e.target)?.toolkit;
  const tTk = byId.get(e.source)?.toolkit;
  if (!rTk || !tTk) return false;
  if (rTk === "any") return false;
  return rTk !== tTk;
});
check("no produces edge crosses toolkits (excluding 'any')",
  crossWiredProd.length === 0,
  crossWiredProd.length
    ? `examples: ${crossWiredProd.slice(0, 3).map((e) => `${e.source}→${e.target}`).join("; ")}`
    : "");

console.log("\n── Section 6: distribution sanity ──");
// Producer slugs that produce nothing useful (single-resource tool that nobody consumes).
const uselessProducers = produces.filter((e) => (consumersOf.get(e.target)?.length ?? 0) === 0);
check(`fewer than 10 produces edges land on resources nobody consumes (got ${uselessProducers.length})`,
  uselessProducers.length < 10);

// Top-5 most-consumed resources for sanity log.
const top = [...consumersOf.entries()]
  .sort((a, b) => b[1].length - a[1].length)
  .slice(0, 5);
console.log("  ℹ top consumed resources:");
for (const [rid, list] of top) console.log(`       • ${rid}  (${list.length} consumers)`);

// Average required-resources per consumer-tool — sanity that we're not over-binding.
const consumerTools = tools.filter((t) => (requiredResourcesOf.get(t.id)?.size ?? 0) > 0);
const avgReqs = consumerTools.length
  ? consumerTools.reduce((s, t) => s + (requiredResourcesOf.get(t.id)!.size), 0) / consumerTools.length
  : 0;
check(`avg required resources per consumer tool is reasonable (${avgReqs.toFixed(2)})`,
  avgReqs > 0.5 && avgReqs < 4);

console.log("\n══════════════════════════════════════════");
console.log(`Tier 3: ${pass} passed, ${fail} failed.`);
if (fail) {
  console.log("\nFailures:");
  for (const f of failures) console.log("  •", f);
  process.exit(1);
}
