import { readFileSync, writeFileSync } from "fs";

type Tool = {
  slug: string;
  name: string;
  description: string;
  inputParameters: {
    properties?: Record<string, { type?: string; description?: string }>;
    required?: string[];
  };
  toolkit: { slug: string };
};

// Verbs that yield IDs/objects you can chain into the next tool.
// LIST / SEARCH / FIND / LOOKUP / QUERY / AUTOCOMPLETE — discovery (multi-result).
// CREATE / INSERT — creation (single new entity returned).
// GET is treated as a producer ONLY when the tool takes no required args (e.g.
// GET_THE_AUTHENTICATED_USER), since otherwise GET requires the ID it returns.
const LOOKUP_VERBS = new Set(["LIST", "SEARCH", "FIND", "LOOKUP", "QUERY", "AUTOCOMPLETE", "FETCH"]);
const CREATE_VERBS = new Set(["CREATE", "INSERT"]);
const ALL_VERBS = new Set([...LOOKUP_VERBS, ...CREATE_VERBS, "GET"]);

const PREPOSITIONS = new Set(["BY", "FOR", "IN", "OF", "FROM", "TO", "AS", "WITH", "AT", "ON"]);
const ARTICLES = new Set(["A", "AN", "THE"]);

const FREEFORM_PARAMS = new Set([
  "body", "subject", "title", "content", "text", "message", "description", "comment",
  "query", "q", "search_query", "filter", "labels",
  "data", "value", "values", "html", "markdown", "note", "summary",
  "due", "starts_at", "ends_at", "from", "to", "cc", "bcc",
  "location", "color", "icon", "kind",
  "scope", "scopes", "level", "language",
  "page", "per_page", "limit", "offset", "max_results", "page_size", "page_token",
  "sort", "order", "order_by", "direction", "since", "until",
  "include", "exclude", "fields", "format", "mime_type", "encoding",
  "active", "enabled", "disabled", "draft", "private", "public", "force",
  "include_all_metadata", "include_spam_trash", "exclude_chats",
  "user_ip", "ip", "user_agent",
  "config", "options", "settings", "metadata", "properties", "params", "parameters",
  "requests", "request", "operations", "items", "entries", "rows", "columns",
  "range", "ranges", "start", "end", "start_date", "end_date", "start_time", "end_time",
  "amount", "currency", "phone", "phone_number",
  "type", "state", "visibility", "permission", "permissions", "role",
]);

const DOMAIN_VALUE_PARAMS = new Set([
  "first_name", "last_name", "display_name",
  "head", "base", "head_branch", "base_branch",
  "secret_name", "environment_name", "package_type", "package_version",
  "topic", "license", "address",
  "client_id", "client_secret", "secret",
]);

type ResourceDef = {
  key: string;
  label: string;
  toolkit: "googlesuper" | "github" | "any";
  paramAliases: string[];
  // The "primary noun" of this resource — must match the tail noun of a producer slug
  // (after stripping qualifier prepositions and articles).
  // Multiple synonyms allowed; the first is the canonical one.
  nouns: string[];
  // Optional list of explicit producer slugs (used when the producer's slug doesn't
  // mention this resource by name, but it still emits values you can use as input.
  // e.g. SEARCH_PEOPLE returns email addresses on each Person object.)
  manualProducers?: string[];
};

const RESOURCES: ResourceDef[] = [
  // ── Gmail ──
  { key: "gmail_thread", label: "Gmail Thread", toolkit: "googlesuper",
    paramAliases: ["thread_id", "threadId"], nouns: ["THREAD", "THREADS"] },
  { key: "gmail_message", label: "Gmail Message", toolkit: "googlesuper",
    paramAliases: ["message_id", "messageId", "msg_id", "messageIds"], nouns: ["MESSAGE", "MESSAGES", "EMAIL", "EMAILS"] },
  { key: "gmail_label", label: "Gmail Label", toolkit: "googlesuper",
    paramAliases: ["label_id", "labelId", "label_ids", "labelIds"], nouns: ["LABEL", "LABELS"] },
  { key: "gmail_draft", label: "Gmail Draft", toolkit: "googlesuper",
    paramAliases: ["draft_id", "draftId"], nouns: ["DRAFT", "DRAFTS"] },
  { key: "gmail_filter", label: "Gmail Filter", toolkit: "googlesuper",
    paramAliases: ["filter_id", "filterId"], nouns: ["FILTER", "FILTERS"] },
  // ── Calendar ──
  { key: "calendar", label: "Calendar", toolkit: "googlesuper",
    paramAliases: ["calendar_id", "calendarId"], nouns: ["CALENDAR", "CALENDARS", "CALENDAR_LIST"] },
  { key: "calendar_event", label: "Calendar Event", toolkit: "googlesuper",
    paramAliases: ["event_id", "eventId"], nouns: ["EVENT", "EVENTS"] },
  { key: "calendar_acl", label: "Calendar ACL Rule", toolkit: "googlesuper",
    paramAliases: ["rule_id", "ruleId", "acl_id"], nouns: ["ACL", "ACLS"] },
  // ── Drive ──
  { key: "drive_file", label: "Drive File", toolkit: "googlesuper",
    paramAliases: ["file_id", "fileId"], nouns: ["FILE", "FILES"] },
  { key: "drive_folder", label: "Drive Folder", toolkit: "googlesuper",
    paramAliases: ["folder_id", "folderId", "parent", "parent_id", "parentId"], nouns: ["FOLDER", "FOLDERS"] },
  { key: "drive_permission", label: "Drive Permission", toolkit: "googlesuper",
    paramAliases: ["permission_id", "permissionId"], nouns: ["PERMISSION", "PERMISSIONS"] },
  { key: "drive_revision", label: "Drive Revision", toolkit: "googlesuper",
    paramAliases: ["revision_id", "revisionId"], nouns: ["REVISION", "REVISIONS"] },
  { key: "drive_comment", label: "Drive Comment", toolkit: "googlesuper",
    paramAliases: ["comment_id", "commentId"], nouns: ["COMMENT", "COMMENTS"] },
  // ── Docs ──
  { key: "google_doc", label: "Google Doc", toolkit: "googlesuper",
    paramAliases: ["document_id", "documentId"], nouns: ["DOCUMENT", "DOCUMENTS"] },
  // ── Sheets ──
  { key: "spreadsheet", label: "Spreadsheet", toolkit: "googlesuper",
    paramAliases: ["spreadsheet_id", "spreadsheetId"], nouns: ["SPREADSHEET", "SPREADSHEETS"] },
  { key: "sheet", label: "Sheet (within spreadsheet)", toolkit: "googlesuper",
    paramAliases: ["sheet_id", "sheetId"], nouns: ["SHEET", "SHEETS"] },
  // ── Slides ──
  { key: "presentation", label: "Slides Presentation", toolkit: "googlesuper",
    paramAliases: ["presentation_id", "presentationId"], nouns: ["PRESENTATION", "PRESENTATIONS"] },
  // ── Tasks ──
  { key: "tasklist", label: "Tasklist", toolkit: "googlesuper",
    paramAliases: ["tasklist_id", "tasklistId"], nouns: ["TASKLIST", "TASKLISTS", "TASK_LIST", "TASK_LISTS"] },
  { key: "task", label: "Task", toolkit: "googlesuper",
    paramAliases: ["task_id", "taskId"], nouns: ["TASK", "TASKS"] },
  // ── Contacts / People ──
  { key: "contact", label: "Contact / Person", toolkit: "googlesuper",
    paramAliases: ["resource_name", "resourceName", "person_id", "personId"],
    nouns: ["CONTACT", "CONTACTS", "PEOPLE", "PERSON", "PERSONS"] },
  // ── Photos ──
  { key: "media_item", label: "Media Item / Photo", toolkit: "googlesuper",
    paramAliases: ["media_item_id", "mediaItemId"], nouns: ["MEDIA_ITEM", "MEDIA_ITEMS"] },
  { key: "album", label: "Photo Album", toolkit: "googlesuper",
    paramAliases: ["album_id", "albumId"], nouns: ["ALBUM", "ALBUMS"] },

  // ── GitHub ──
  { key: "repository", label: "GitHub Repository", toolkit: "github",
    paramAliases: ["repo", "repository", "repository_name", "repository_id"],
    nouns: ["REPO", "REPOS", "REPOSITORY", "REPOSITORIES"] },
  { key: "user", label: "GitHub User", toolkit: "github",
    paramAliases: ["username", "user_id", "userId"], nouns: ["USER", "USERS"] },
  { key: "org", label: "GitHub Organization", toolkit: "github",
    paramAliases: ["org", "organization"], nouns: ["ORG", "ORGS", "ORGANIZATION", "ORGANIZATIONS"] },
  { key: "team", label: "GitHub Team", toolkit: "github",
    paramAliases: ["team_slug", "team_id"], nouns: ["TEAM", "TEAMS"] },
  { key: "issue", label: "GitHub Issue", toolkit: "github",
    paramAliases: ["issue_number"], nouns: ["ISSUE", "ISSUES"] },
  { key: "pull_request", label: "GitHub Pull Request", toolkit: "github",
    paramAliases: ["pull_number"], nouns: ["PULL", "PULLS", "PULL_REQUEST", "PULL_REQUESTS"] },
  { key: "discussion", label: "GitHub Discussion", toolkit: "github",
    paramAliases: ["discussion_number"], nouns: ["DISCUSSION", "DISCUSSIONS"] },
  { key: "comment", label: "GitHub Comment", toolkit: "github",
    paramAliases: ["comment_id", "comment_number"], nouns: ["COMMENT", "COMMENTS"] },
  { key: "review", label: "PR Review", toolkit: "github",
    paramAliases: ["review_id"], nouns: ["REVIEW", "REVIEWS"] },
  { key: "reaction", label: "GitHub Reaction", toolkit: "github",
    paramAliases: ["reaction_id"], nouns: ["REACTION", "REACTIONS"] },
  { key: "release", label: "GitHub Release", toolkit: "github",
    paramAliases: ["release_id"], nouns: ["RELEASE", "RELEASES"] },
  { key: "asset", label: "Release Asset", toolkit: "github",
    paramAliases: ["asset_id"], nouns: ["ASSET", "ASSETS"] },
  { key: "branch_obj", label: "GitHub Branch", toolkit: "github",
    paramAliases: ["branch", "branch_name"], nouns: ["BRANCH", "BRANCHES"] },
  { key: "commit", label: "GitHub Commit", toolkit: "github",
    paramAliases: ["commit_sha", "sha", "ref"], nouns: ["COMMIT", "COMMITS"] },
  { key: "tag_obj", label: "GitHub Tag", toolkit: "github",
    paramAliases: ["tag", "tag_name"], nouns: ["TAG", "TAGS"] },
  { key: "gist", label: "GitHub Gist", toolkit: "github",
    paramAliases: ["gist_id"], nouns: ["GIST", "GISTS"] },
  { key: "workflow", label: "GitHub Workflow", toolkit: "github",
    paramAliases: ["workflow_id"], nouns: ["WORKFLOW", "WORKFLOWS"] },
  { key: "workflow_run", label: "Workflow Run", toolkit: "github",
    paramAliases: ["run_id"], nouns: ["WORKFLOW_RUN", "WORKFLOW_RUNS"] },
  { key: "job", label: "Workflow Job", toolkit: "github",
    paramAliases: ["job_id"], nouns: ["JOB", "JOBS"] },
  { key: "runner", label: "GitHub Runner", toolkit: "github",
    paramAliases: ["runner_id"], nouns: ["RUNNER", "RUNNERS"] },
  { key: "artifact", label: "Workflow Artifact", toolkit: "github",
    paramAliases: ["artifact_id"], nouns: ["ARTIFACT", "ARTIFACTS"] },
  { key: "webhook", label: "GitHub Webhook", toolkit: "github",
    paramAliases: ["hook_id"], nouns: ["HOOK", "HOOKS", "WEBHOOK", "WEBHOOKS"] },
  { key: "label_obj", label: "GitHub Label", toolkit: "github",
    paramAliases: ["label_id"], nouns: ["LABEL", "LABELS"] },
  { key: "milestone", label: "GitHub Milestone", toolkit: "github",
    paramAliases: ["milestone_number", "milestone_id"], nouns: ["MILESTONE", "MILESTONES"] },
  { key: "project", label: "GitHub Project", toolkit: "github",
    paramAliases: ["project_id", "project_number"], nouns: ["PROJECT", "PROJECTS"] },
  { key: "card", label: "Project Card", toolkit: "github",
    paramAliases: ["card_id"], nouns: ["CARD", "CARDS"] },
  { key: "column", label: "Project Column", toolkit: "github",
    paramAliases: ["column_id"], nouns: ["COLUMN", "COLUMNS"] },
  { key: "deployment", label: "GitHub Deployment", toolkit: "github",
    paramAliases: ["deployment_id"], nouns: ["DEPLOYMENT", "DEPLOYMENTS"] },
  { key: "check_run", label: "Check Run", toolkit: "github",
    paramAliases: ["check_run_id"], nouns: ["CHECK_RUN", "CHECK_RUNS"] },
  { key: "check_suite", label: "Check Suite", toolkit: "github",
    paramAliases: ["check_suite_id"], nouns: ["CHECK_SUITE", "CHECK_SUITES"] },
  { key: "codespace", label: "Codespace", toolkit: "github",
    paramAliases: ["codespace_name"], nouns: ["CODESPACE", "CODESPACES"] },
  { key: "package", label: "GitHub Package", toolkit: "github",
    paramAliases: ["package_name"], nouns: ["PACKAGE", "PACKAGES"] },
  { key: "deploy_key", label: "Deploy/SSH/GPG Key", toolkit: "github",
    paramAliases: ["key_id", "gpg_key_id"], nouns: ["KEY", "KEYS", "DEPLOY_KEY", "DEPLOY_KEYS", "GPG_KEY", "GPG_KEYS", "SSH_SIGNING_KEY", "SSH_SIGNING_KEYS"] },
  { key: "package_version", label: "Package Version", toolkit: "github",
    paramAliases: ["package_version_id"], nouns: ["PACKAGE_VERSION", "PACKAGE_VERSIONS"] },
  { key: "role", label: "Org/Repo Role", toolkit: "github",
    paramAliases: ["role_id"], nouns: ["ROLE", "ROLES"] },
  { key: "invitation", label: "Invitation", toolkit: "github",
    paramAliases: ["invitation_id"], nouns: ["INVITATION", "INVITATIONS"] },
  { key: "ghsa", label: "Security Advisory", toolkit: "github",
    paramAliases: ["ghsa_id"], nouns: ["ADVISORY", "ADVISORIES", "SECURITY_ADVISORY", "SECURITY_ADVISORIES"] },
  { key: "ruleset", label: "Repo Ruleset", toolkit: "github",
    paramAliases: ["ruleset_id"], nouns: ["RULESET", "RULESETS"] },
  { key: "alert", label: "Security Alert", toolkit: "github",
    paramAliases: ["alert_number"], nouns: ["ALERT", "ALERTS"] },
  { key: "conference_record", label: "Meet Conference Record", toolkit: "googlesuper",
    paramAliases: ["conference_record_id", "conferenceRecordId"],
    nouns: ["CONFERENCE_RECORD", "CONFERENCE_RECORDS"] },
  { key: "delivery", label: "Webhook Delivery", toolkit: "github",
    paramAliases: ["delivery_id"], nouns: ["DELIVERY", "DELIVERIES"] },

  // Cross-toolkit "soft" resources: discoverable via lookup tools but the param is
  // typically a string the user gives directly (e.g. an email address). Including
  // them captures the README's second example: "if you give a name it should fetch
  // the name from contacts and then you can send the email".
  { key: "email_address", label: "Email Address", toolkit: "any",
    paramAliases: [
      "recipient_email", "email", "email_address",
      "recipient", "recipients",
      "to", "cc", "bcc",
      "attendees", "guests",
    ],
    nouns: ["EMAIL_ADDRESS", "EMAIL_ADDRESSES"],
    // Contact / People lookups don't have EMAIL in their slug but their output
    // includes email addresses, so register them explicitly.
    manualProducers: [
      "GOOGLESUPER_SEARCH_PEOPLE",
      "GOOGLESUPER_GET_PEOPLE",
      "GOOGLESUPER_GET_CONTACTS",
    ],
  },
];

// ── Load tools ──
const gs: Tool[] = JSON.parse(readFileSync("googlesuper_tools.json", "utf-8"));
const gh: Tool[] = JSON.parse(readFileSync("github_tools.json", "utf-8"));
const tools = [...gs, ...gh];
const bySlug = new Map(tools.map((t) => [t.slug, t]));

function slugTokens(slug: string): string[] {
  return slug.split("_").slice(1); // drop GITHUB / GOOGLESUPER
}

// Locate the LAST verb in the slug; everything before it is generally a modifier
// like BATCH, MULTI, etc. Returns -1 if no recognized verb.
function lastVerbIndex(tokens: string[]): number {
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (ALL_VERBS.has(tokens[i]!)) return i;
  }
  return -1;
}

// Extract the "head noun phrase" of a slug: the noun group immediately after the
// verb, before any prepositional qualifier. Strips articles.
//   LIST_GISTS_FOR_A_USER → ["GISTS"]
//   GET_A_PACKAGE_FOR_A_USER → ["PACKAGE"]
//   BATCH_GET_MEDIA_ITEMS → ["MEDIA_ITEMS", "ITEMS"]
//   LIST_PULL_REQUESTS_FILES → ["PULL_REQUESTS_FILES", "REQUESTS_FILES", "FILES"]
function getHeadNouns(slug: string): string[] {
  const tokens = slugTokens(slug);
  const vi = lastVerbIndex(tokens);
  if (vi === -1) return [];
  const after = tokens.slice(vi + 1);
  // truncate at first preposition
  let cut = after.length;
  for (let i = 0; i < after.length; i++) {
    if (PREPOSITIONS.has(after[i]!)) { cut = i; break; }
  }
  let nouns = after.slice(0, cut);
  // strip leading articles
  while (nouns.length && ARTICLES.has(nouns[0]!)) nouns.shift();
  if (nouns.length === 0) return [];
  // emit progressive suffix joins for multi-word matches
  const candidates: string[] = [];
  for (let i = 0; i < nouns.length; i++) {
    candidates.push(nouns.slice(i).join("_"));
  }
  return candidates;
}

function verbCategory(slug: string): "lookup" | "create" | "get" | "other" {
  const tokens = slugTokens(slug);
  for (const t of tokens) {
    if (LOOKUP_VERBS.has(t)) return "lookup";
    if (CREATE_VERBS.has(t)) return "create";
    if (t === "GET") return "get";
  }
  return "other";
}

// ── Build resource → producer slugs ──
const producersByResource = new Map<string, Set<string>>();
for (const r of RESOURCES) producersByResource.set(r.key, new Set());

const nounLookup = new Map<string, ResourceDef>(); // toolkit::NOUN → resource
for (const r of RESOURCES) {
  for (const n of r.nouns) nounLookup.set(`${r.toolkit}::${n}`, r);
}

for (const t of tools) {
  const cat = verbCategory(t.slug);
  if (cat === "other") continue;
  // GET only counts as producer if no required args — i.e. discovery from context only.
  if (cat === "get") {
    const required = t.inputParameters.required ?? [];
    if (required.length > 0) continue;
  }
  const heads = getHeadNouns(t.slug);
  for (const noun of heads) {
    // Resources scoped to this toolkit OR cross-toolkit ("any")
    for (const r of [
      nounLookup.get(`${t.toolkit.slug}::${noun}`),
      nounLookup.get(`any::${noun}`),
    ]) {
      if (r) producersByResource.get(r.key)!.add(t.slug);
    }
  }
}

// Apply manual producer overrides
for (const r of RESOURCES) {
  if (!r.manualProducers) continue;
  for (const slug of r.manualProducers) {
    if (bySlug.has(slug)) producersByResource.get(r.key)!.add(slug);
  }
}

// ── Param classification (toolkit-scoped) ──
// Aliases scoped per toolkit so that e.g. `user_id` resolves to the GitHub User
// resource on a github tool, but is treated as user-input on a googlesuper tool
// (where user_id usually means "me").
const aliasToResourceByToolkit = new Map<string, Map<string, string>>();
for (const tk of ["googlesuper", "github"]) aliasToResourceByToolkit.set(tk, new Map());

for (const r of RESOURCES) {
  const tks = r.toolkit === "any" ? ["googlesuper", "github"] : [r.toolkit];
  for (const tk of tks) {
    for (const a of r.paramAliases) {
      aliasToResourceByToolkit.get(tk)!.set(a.toLowerCase(), r.key);
    }
  }
}

// For "any" lookups (used by main() to decide which optional params to track regardless
// of toolkit). Keep the loose one too.
const aliasToResource = new Map<string, string>();
for (const r of RESOURCES) {
  for (const a of r.paramAliases) {
    if (!aliasToResource.has(a.toLowerCase())) aliasToResource.set(a.toLowerCase(), r.key);
  }
}

type ParamClass =
  | { kind: "resource"; param: string; resourceKey: string }
  | { kind: "user"; param: string }
  | { kind: "domain"; param: string }
  | { kind: "unknown"; param: string };

function classifyParam(name: string, toolkit: string): ParamClass {
  const lower = name.toLowerCase();
  const tkMap = aliasToResourceByToolkit.get(toolkit);
  if (tkMap?.has(lower)) {
    return { kind: "resource", param: name, resourceKey: tkMap.get(lower)! };
  }
  if (FREEFORM_PARAMS.has(lower)) return { kind: "user", param: name };
  if (DOMAIN_VALUE_PARAMS.has(lower)) return { kind: "domain", param: name };
  if (/(_id|_ids|Id|Ids|_number|_sha|_slug|_name)$/.test(name)) {
    return { kind: "unknown", param: name };
  }
  return { kind: "user", param: name };
}

// ── Build BIPARTITE graph: resource nodes + tool nodes ──
type Node = {
  id: string;
  type: "tool" | "resource";
  label: string;
  toolkit?: string;
  description?: string;
  produces?: string[];
  consumes?: string[];
  paramSummary?: { resource: number; user: number; domain: number; unknown: number };
  verbCategory?: "lookup" | "create" | "get" | "other";
};

type Edge = {
  source: string;
  target: string;
  kind: "produces" | "consumes";
  param?: string;
};

const nodes: Node[] = [];
const edges: Edge[] = [];

// resource nodes
for (const r of RESOURCES) {
  nodes.push({ id: `R::${r.key}`, type: "resource", label: r.label, toolkit: r.toolkit });
}

// tool nodes + edges
for (const t of tools) {
  const required = new Set(t.inputParameters.required ?? []);
  const allProps = Object.keys(t.inputParameters.properties ?? {});
  // Track every required param + every optional param that maps to a known resource —
  // optional resource params still represent valid precursor relationships.
  const tracked: { name: string; required: boolean }[] = [];
  for (const name of allProps) {
    if (required.has(name)) {
      tracked.push({ name, required: true });
    } else {
      // optional: include only if it maps to a known resource for THIS toolkit
      const tkMap = aliasToResourceByToolkit.get(t.toolkit.slug);
      if (tkMap?.has(name.toLowerCase())) tracked.push({ name, required: false });
    }
  }
  const classified = tracked.map((p) => ({ name: p.name, required: p.required, class: classifyParam(p.name, t.toolkit.slug) }));
  const summary = { resource: 0, user: 0, domain: 0, unknown: 0 };
  for (const c of classified) summary[c.class.kind] += 1;

  const produces: string[] = [];
  for (const [key, set] of producersByResource) {
    if (set.has(t.slug)) produces.push(key);
  }
  const consumes = [...new Set(classified.filter((c) => c.class.kind === "resource").map((c) => (c.class as any).resourceKey))];

  nodes.push({
    id: t.slug,
    type: "tool",
    label: t.name || t.slug,
    toolkit: t.toolkit.slug,
    description: t.description,
    produces,
    consumes,
    paramSummary: summary,
    verbCategory: verbCategory(t.slug),
  });

  for (const r of produces) {
    edges.push({ source: t.slug, target: `R::${r}`, kind: "produces" });
  }
  for (const c of classified) {
    if (c.class.kind !== "resource") continue;
    const rk = (c.class as any).resourceKey as string;
    edges.push({ source: `R::${rk}`, target: t.slug, kind: "consumes", param: c.name, required: c.required } as any);
  }
}

// ── Stats ──
const stats = {
  toolCount: tools.length,
  resourceCount: RESOURCES.length,
  edgeCount: edges.length,
  byToolkit: {
    googlesuper: tools.filter((t) => t.toolkit.slug === "googlesuper").length,
    github: tools.filter((t) => t.toolkit.slug === "github").length,
  },
  producerToolCount: nodes.filter((n) => n.type === "tool" && (n.produces?.length ?? 0) > 0).length,
  consumerToolCount: nodes.filter((n) => n.type === "tool" && (n.consumes?.length ?? 0) > 0).length,
  pureUserEntryPoints: nodes.filter(
    (n) => n.type === "tool" && (n.paramSummary?.resource ?? 0) === 0 && (n.paramSummary?.unknown ?? 0) === 0 && Object.values(n.paramSummary ?? {}).reduce((a, b) => a + b, 0) > 0,
  ).length,
  noInputs: nodes.filter((n) => n.type === "tool" && Object.values(n.paramSummary ?? {}).reduce((a, b) => a + b, 0) === 0).length,
  producersPerResource: [...producersByResource.entries()]
    .map(([k, v]) => ({ resource: k, producerCount: v.size }))
    .sort((a, b) => b.producerCount - a.producerCount),
  unknownTopParams: (() => {
    const m = new Map<string, number>();
    for (const n of nodes) {
      if (n.type !== "tool") continue;
      const required = bySlug.get(n.id)?.inputParameters.required ?? [];
      for (const p of required) {
        if (classifyParam(p, bySlug.get(n.id)!.toolkit.slug).kind === "unknown") m.set(p, (m.get(p) ?? 0) + 1);
      }
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25);
  })(),
};

writeFileSync("graph.json", JSON.stringify({ nodes, edges, stats }, null, 2));
console.log("graph.json written.");
console.log("nodes:", nodes.length, "(", tools.length, "tools +", RESOURCES.length, "resources )");
console.log("edges:", edges.length);
console.log("producer tools:", stats.producerToolCount, "consumer tools:", stats.consumerToolCount);
console.log("no-input tools:", stats.noInputs, "pure-user-entry-points:", stats.pureUserEntryPoints);
console.log("\nproducers per resource (top 25):");
for (const r of stats.producersPerResource.slice(0, 25)) {
  console.log("  ", r.producerCount.toString().padStart(3), r.resource);
}
console.log("\ntop unknown id-like params (potential gaps):");
for (const [k, v] of stats.unknownTopParams) console.log("  ", v.toString().padStart(3), k);
