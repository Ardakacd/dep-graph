import { readFileSync } from "fs";

const g = JSON.parse(readFileSync("graph.json", "utf-8"));

function inspect(slug: string) {
  const n = g.nodes.find((x: any) => x.id === slug);
  if (!n) {
    console.log("(not found)", slug);
    return;
  }
  console.log("\n──", n.id, "──");
  console.log("  produces:", n.produces);
  console.log("  consumes:", n.consumes);
  console.log("  paramSummary:", n.paramSummary);
  for (const r of n.consumes ?? []) {
    const producers = g.edges
      .filter((e: any) => e.kind === "produces" && e.target === `R::${r}`)
      .map((e: any) => e.source);
    console.log(`  → ${r} producers (${producers.length}):`);
    for (const p of producers.slice(0, 6)) console.log("      ", p);
  }
}

// Hunt for canonical examples
const slugsLike = (re: RegExp) =>
  g.nodes.filter((n: any) => n.type === "tool" && re.test(n.id)).map((n: any) => n.id);

console.log("REPLY+THREAD candidates:", slugsLike(/REPLY.*THREAD|THREAD.*REPLY/));
console.log("SEND_EMAIL candidates:", slugsLike(/SEND.*EMAIL|GMAIL_SEND/));
console.log("CREATE_ISSUE_COMMENT candidates:", slugsLike(/CREATE_AN_ISSUE_COMMENT|ISSUE_COMMENT/));

console.log("\n--- detail ---");
inspect("GOOGLESUPER_REPLY_TO_THREAD");
inspect("GOOGLESUPER_SEND_EMAIL");
inspect("GITHUB_CREATE_AN_ISSUE_COMMENT");
inspect("GITHUB_LIST_REPOSITORY_ISSUES");
inspect("GITHUB_GET_A_REPOSITORY");

// Show top resources & their producers
console.log("\n--- producer slugs for 'repository' ---");
const repoProducers = g.edges
  .filter((e: any) => e.kind === "produces" && e.target === "R::repository")
  .map((e: any) => e.source);
for (const s of repoProducers) console.log("  ", s);

console.log("\n--- producer slugs for 'gmail_thread' ---");
const threadProducers = g.edges
  .filter((e: any) => e.kind === "produces" && e.target === "R::gmail_thread")
  .map((e: any) => e.source);
for (const s of threadProducers) console.log("  ", s);

console.log("\n--- producer slugs for 'contact' ---");
const cProducers = g.edges
  .filter((e: any) => e.kind === "produces" && e.target === "R::contact")
  .map((e: any) => e.source);
for (const s of cProducers) console.log("  ", s);
