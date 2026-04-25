// Tier 1 — data validation tests over graph.json.
// Pure data tests: integrity, semantic spot-checks, coverage.
// Exits non-zero on any failure so this can gate submission.

import { readFileSync } from "fs";

type Edge = { source: string; target: string; kind: "produces" | "consumes"; param?: string; required?: boolean };
type Node = { id: string; type: "tool" | "resource"; label: string; toolkit?: string; produces?: string[]; consumes?: string[] };

const g = JSON.parse(readFileSync("graph.json", "utf-8")) as { nodes: Node[]; edges: Edge[]; stats: any };

let pass = 0, fail = 0;
const failures: string[] = [];

function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log("  ✔", name); }
  else { fail++; failures.push(`${name}${detail ? " — " + detail : ""}`); console.log("  ✘", name, detail ?? ""); }
}

console.log("\n── Section 1: edge integrity ──");
const nodeIds = new Set(g.nodes.map((n) => n.id));
const danglingSources = g.edges.filter((e) => !nodeIds.has(e.source));
const danglingTargets = g.edges.filter((e) => !nodeIds.has(e.target));
check("every edge.source resolves to a node", danglingSources.length === 0, `dangling: ${danglingSources.length}`);
check("every edge.target resolves to a node", danglingTargets.length === 0, `dangling: ${danglingTargets.length}`);

const producesEdges = g.edges.filter((e) => e.kind === "produces");
const consumesEdges = g.edges.filter((e) => e.kind === "consumes");

const byId = new Map(g.nodes.map((n) => [n.id, n] as const));
const producesShapeBad = producesEdges.filter(
  (e) => byId.get(e.source)?.type !== "tool" || byId.get(e.target)?.type !== "resource",
);
const consumesShapeBad = consumesEdges.filter(
  (e) => byId.get(e.source)?.type !== "resource" || byId.get(e.target)?.type !== "tool",
);
check('every "produces" edge is tool → resource', producesShapeBad.length === 0, `bad: ${producesShapeBad.length}`);
check('every "consumes" edge is resource → tool', consumesShapeBad.length === 0, `bad: ${consumesShapeBad.length}`);
check("all consumes edges have a param name", consumesEdges.every((e) => typeof e.param === "string" && e.param.length > 0));

const noDuplicateProduces = producesEdges.length === new Set(producesEdges.map((e) => e.source + "→" + e.target)).size;
const noDuplicateConsumes = consumesEdges.length === new Set(consumesEdges.map((e) => e.source + "→" + e.target + "::" + e.param)).size;
check("no duplicate produces edges", noDuplicateProduces);
check("no duplicate consumes edges (per param)", noDuplicateConsumes);

console.log("\n── Section 2: resource & tool node sanity ──");
const resources = g.nodes.filter((n) => n.type === "resource");
const tools = g.nodes.filter((n) => n.type === "tool");
check(`tool node count > 1000 (got ${tools.length})`, tools.length > 1000);
check(`resource node count between 30 and 100 (got ${resources.length})`, resources.length >= 30 && resources.length <= 100);
check("every tool has a toolkit", tools.every((t) => t.toolkit === "googlesuper" || t.toolkit === "github"));

const orphanResources = resources.filter((r) => {
  const inProd = producesEdges.some((e) => e.target === r.id);
  const outCons = consumesEdges.some((e) => e.source === r.id);
  return !inProd && !outCons;
});
check("no resources are completely orphaned", orphanResources.length === 0,
  orphanResources.length ? "orphans: " + orphanResources.map((r) => r.label).join(", ") : "");

const consumerOnlyResources = resources.filter((r) => {
  const inProd = producesEdges.some((e) => e.target === r.id);
  const outCons = consumesEdges.some((e) => e.source === r.id);
  return !inProd && outCons;
});
// "Consumer-only" resources are real (e.g. a resource we know how to consume but nothing
// in this toolkit produces it), but they're a coverage gap — log them.
if (consumerOnlyResources.length > 0) {
  console.log(`  ℹ ${consumerOnlyResources.length} resource(s) have consumers but no producers:`);
  for (const r of consumerOnlyResources) console.log("       •", r.label, "(", r.id, ")");
}

console.log("\n── Section 3: README canonical examples ──");

function expectTool(slug: string) {
  const n = byId.get(slug);
  check(`tool exists: ${slug}`, !!n && n.type === "tool", n ? "" : "missing");
  return n;
}

function expectConsumes(slug: string, resourceKey: string, paramHint?: string) {
  const edges = consumesEdges.filter((e) => e.target === slug && e.source === `R::${resourceKey}`);
  const ok = edges.length > 0 && (paramHint === undefined || edges.some((e) => e.param === paramHint));
  check(`${slug} consumes ${resourceKey}${paramHint ? " via " + paramHint : ""}`, ok,
    ok ? "" : `found edges: ${edges.map((e) => e.param).join(", ") || "none"}`);
}

function expectProduces(slug: string, resourceKey: string) {
  const has = producesEdges.some((e) => e.source === slug && e.target === `R::${resourceKey}`);
  check(`${slug} produces ${resourceKey}`, has);
}

function expectProducerExists(resourceKey: string, slugMatch: string | RegExp) {
  const producers = producesEdges.filter((e) => e.target === `R::${resourceKey}`).map((e) => e.source);
  const ok = producers.some((s) => typeof slugMatch === "string" ? s === slugMatch : slugMatch.test(s));
  check(`resource ${resourceKey} has producer matching ${slugMatch}`, ok,
    ok ? "" : `producers: ${producers.slice(0, 5).join(", ")}…`);
}

// README example 1: GMAIL_REPLY_TO_THREAD ← thread_id ← GMAIL_LIST_THREADS
expectTool("GOOGLESUPER_REPLY_TO_THREAD");
expectConsumes("GOOGLESUPER_REPLY_TO_THREAD", "gmail_thread", "thread_id");
expectProducerExists("gmail_thread", "GOOGLESUPER_LIST_THREADS");

// README example 2: SEND_EMAIL ← email_address ← SEARCH_PEOPLE / GET_CONTACTS / GET_PEOPLE
expectTool("GOOGLESUPER_SEND_EMAIL");
expectConsumes("GOOGLESUPER_SEND_EMAIL", "email_address", "recipient_email");
expectProducerExists("email_address", "GOOGLESUPER_SEARCH_PEOPLE");
expectProducerExists("email_address", "GOOGLESUPER_GET_CONTACTS");
expectProducerExists("email_address", "GOOGLESUPER_GET_PEOPLE");

// GitHub canonical: CREATE_AN_ISSUE_COMMENT ← repository + issue → produces comment
expectTool("GITHUB_CREATE_AN_ISSUE_COMMENT");
expectConsumes("GITHUB_CREATE_AN_ISSUE_COMMENT", "repository", "repo");
expectConsumes("GITHUB_CREATE_AN_ISSUE_COMMENT", "issue", "issue_number");
expectProduces("GITHUB_CREATE_AN_ISSUE_COMMENT", "comment");
expectProducerExists("issue", "GITHUB_LIST_REPOSITORY_ISSUES");
expectProducerExists("repository", /SEARCH_REPOSITORIES|FIND_REPOSITORIES|LIST_REPOSITORIES/);

// Calendar event with attendees + calendar_id
expectTool("GOOGLESUPER_CREATE_EVENT");
expectConsumes("GOOGLESUPER_CREATE_EVENT", "email_address", "attendees");
expectConsumes("GOOGLESUPER_CREATE_EVENT", "calendar", "calendar_id");
expectProduces("GOOGLESUPER_CREATE_EVENT", "calendar_event");

// More: comment-on-PR / list-pulls / get-gist etc.
expectTool("GITHUB_CREATE_A_GIST");
expectProduces("GITHUB_CREATE_A_GIST", "gist");

expectTool("GITHUB_LIST_PULL_REQUESTS");
expectProduces("GITHUB_LIST_PULL_REQUESTS", "pull_request");

expectTool("GITHUB_GET_A_PULL_REQUEST");
expectConsumes("GITHUB_GET_A_PULL_REQUEST", "pull_request", "pull_number");

console.log("\n── Section 4: producer verb hygiene ──");
// Producer tools should mostly be LIST/SEARCH/FIND/CREATE/GET-without-args.
// A producer whose slug starts with DELETE/UPDATE/REMOVE etc is suspicious.
const badVerbs = ["DELETE", "UPDATE", "REMOVE", "PATCH", "DISABLE", "ARCHIVE", "TRASH", "CLEAR", "CANCEL", "STOP"];
const suspiciousProducers = tools.filter((t) => {
  const isProd = (t.produces?.length ?? 0) > 0;
  if (!isProd) return false;
  // CREATE_OR_UPDATE is an idempotent upsert — leading CREATE makes it a legit producer.
  if (/CREATE_OR_UPDATE/.test(t.id)) return false;
  const tokens = t.id.split("_");
  return tokens.some((tk) => badVerbs.includes(tk));
});
check("no producer tools use destructive/mutate verbs in slug", suspiciousProducers.length === 0,
  suspiciousProducers.length ? `suspicious: ${suspiciousProducers.slice(0, 5).map((t) => t.id).join(", ")}` : "");

console.log("\n── Section 5: stats sanity ──");
check("toolCount matches node array", g.stats.toolCount === tools.length);
check("edge count matches stats", g.stats.edgeCount === g.edges.length);
check("googlesuper toolkit count", g.stats.byToolkit.googlesuper === tools.filter((t) => t.toolkit === "googlesuper").length);
check("github toolkit count", g.stats.byToolkit.github === tools.filter((t) => t.toolkit === "github").length);

console.log("\n── Section 6: coverage report (informational) ──");
console.log(`  ${tools.length} tools total, ${tools.filter(t => (t.produces?.length ?? 0) > 0).length} producers, ${tools.filter(t => (t.consumes?.length ?? 0) > 0).length} consumers`);
console.log(`  ${resources.length} resources, ${producesEdges.length} produces edges, ${consumesEdges.length} consumes edges`);
console.log(`  edges with required=false (optional precursors): ${consumesEdges.filter((e: any) => e.required === false).length}`);

console.log("\n══════════════════════════════════════════");
console.log(`Tier 1: ${pass} passed, ${fail} failed.`);
if (fail) {
  console.log("\nFailures:");
  for (const f of failures) console.log("  •", f);
  process.exit(1);
}
