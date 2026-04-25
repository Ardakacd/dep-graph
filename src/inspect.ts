import { readFileSync } from "fs";

const gh = JSON.parse(readFileSync("github_tools.json", "utf-8"));
const x = gh.find((s: any) => s.slug === "GITHUB_CREATE_AN_ISSUE_COMMENT");
console.log("top-level keys:", Object.keys(x));
console.log("output keys:", Object.keys(x.outputParameters));
console.log("has $defs at top?", !!x["$defs"]);
console.log("has $defs in output?", !!x.outputParameters["$defs"]);

// sample of slugs to understand verb patterns
const verbs = new Map<string, number>();
for (const t of gh) {
  const verb = t.slug.replace(/^GITHUB_/, "").split("_")[0];
  verbs.set(verb, (verbs.get(verb) ?? 0) + 1);
}
console.log("\ngithub verb prefixes:", [...verbs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20));

const gs = JSON.parse(readFileSync("googlesuper_tools.json", "utf-8"));
const verbsGs = new Map<string, number>();
for (const t of gs) {
  const verb = t.slug.split("_").slice(1, 2).join("_");
  verbsGs.set(verb, (verbsGs.get(verb) ?? 0) + 1);
}
console.log("\ngooglesuper top word after toolkit prefix:", [...verbsGs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25));

// distribution of toolkit prefixes inside googlesuper
const gsPrefix = new Map<string, number>();
for (const t of gs) {
  const p = t.slug.split("_")[0];
  gsPrefix.set(p, (gsPrefix.get(p) ?? 0) + 1);
}
console.log("\ngooglesuper sub-toolkits:", [...gsPrefix.entries()].sort((a, b) => b[1] - a[1]));
