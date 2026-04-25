# Tool Dependency Graph — Composio (googlesuper + github)

A bipartite dependency graph over Composio's `googlesuper` and `github` toolkits
that captures which tool actions need precursor actions to obtain their inputs.

For example, `GMAIL_REPLY_TO_THREAD` needs a `thread_id` — which
`GMAIL_LIST_THREADS` produces. The graph models this as:

```
GMAIL_LIST_THREADS  ──produces──▶  thread_id  ──consumes──▶  GMAIL_REPLY_TO_THREAD
```

## Numbers

- **1304** tools (~700 googlesuper, ~600 github)
- **64** resources (`thread_id`, `repository`, `issue`, `email_address`, …)
- **1732** edges (220 produces + 1512 consumes; 119 marked optional)

## Live visualization

Open `graph.html` in a browser. It's a single self-contained file — Cytoscape.js
+ fcose force-directed layout, with toolkit and view filters, click-to-inspect
panel, and dashed lines for optional precursors.

## Pipeline

```
COMPOSIO_API_KEY=… sh scaffold.sh        # mints OpenRouter key, writes .env
node --experimental-strip-types src/fetch-tools.ts   # → *_tools.json
node --experimental-strip-types src/build-graph.ts   # → graph.json
node --experimental-strip-types src/build-viz.ts     # → graph.html
```

## How edges are inferred

- **Producer detection**: tool slugs whose verb is in `LIST/SEARCH/FIND/GET/CREATE/…`
  produce a resource named after the head noun (with prepositional qualifiers
  stripped: `LIST_GISTS_FOR_A_USER` → produces `gist`, not `user`).
- **Consumer detection**: each `inputParameters` property is matched against a
  toolkit-scoped alias map (`thread_id`, `repo`, `pull_number`, `attendees`, …).
  Required and optional params both create edges; optional ones are flagged.
- **Manual overrides** for cases the slug can't express — e.g. `SEARCH_PEOPLE`
  produces `email_address` even though the slug doesn't say so.

## Tests

Four tiers, 122 assertions, all green.

```bash
node --experimental-strip-types src/test-graph.ts     # data integrity (40)
node --experimental-strip-types src/test-html.ts      # HTML smoke (41)
node --experimental-strip-types src/test-semantic.ts  # semantic deep-check (26)
node --experimental-strip-types src/test-browser.ts   # Playwright browser (15)
node_modules/.bin/tsc --noEmit                        # zero type errors
```

The semantic deep-check verifies that all README canonical examples
(`REPLY_TO_THREAD`, `SEND_EMAIL`, `CREATE_AN_ISSUE_COMMENT`, `CREATE_EVENT`,
`GET_A_PULL_REQUEST`) are reachable from "no-input" producer tools via BFS.
The browser test loads the page in headless Chromium, exercises every filter
button, asserts cytoscape state changes, and confirms zero console errors.

## Layout

```
src/
  fetch-tools.ts     pull raw tool specs from Composio
  build-graph.ts     emit graph.json from raw specs
  build-viz.ts       emit graph.html from graph.json
  test-*.ts          four test tiers
graph.json           the dependency graph
graph.html           interactive visualization (open in browser)
*_tools.json         raw fetched specs (kept for reproducibility)
```
