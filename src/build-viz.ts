import { readFileSync, writeFileSync } from "fs";

const graph = JSON.parse(readFileSync("graph.json", "utf-8"));

// Embed the graph data directly into the HTML — single self-contained file.
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Composio Tool Dependency Graph — Google Super + GitHub</title>
<script src="https://unpkg.com/cytoscape@3.30.4/dist/cytoscape.min.js"></script>
<script src="https://unpkg.com/layout-base@2.0.1/layout-base.js"></script>
<script src="https://unpkg.com/cose-base@2.2.0/cose-base.js"></script>
<script src="https://unpkg.com/cytoscape-fcose@2.2.0/cytoscape-fcose.js"></script>
<style>
  html, body { margin:0; padding:0; height:100%; font-family: -apple-system, system-ui, Segoe UI, sans-serif; background:#0e0f12; color:#e6e6e6; }
  #cy { position:absolute; top:0; bottom:0; left:340px; right:0; }
  #side {
    position:absolute; top:0; bottom:0; left:0; width:340px;
    box-sizing:border-box; padding:14px; overflow:auto;
    background:#15171c; border-right:1px solid #2a2d35;
  }
  h1 { font-size:14px; margin:0 0 4px 0; }
  h2 { font-size:12px; margin:14px 0 6px 0; color:#9aa0a6; text-transform:uppercase; letter-spacing:0.05em; }
  p { font-size:12px; line-height:1.45; color:#c8ccd0; }
  .small { font-size:11px; color:#9aa0a6; }
  input[type=search] {
    width:100%; box-sizing:border-box; padding:6px 8px;
    background:#0e0f12; color:#e6e6e6; border:1px solid #2a2d35; border-radius:4px;
    font-size:12px; outline:none;
  }
  input[type=search]:focus { border-color:#4a90e2; }
  .legend { font-size:11px; line-height:1.7; }
  .swatch { display:inline-block; width:10px; height:10px; border-radius:50%; margin-right:6px; vertical-align:middle; }
  .filter-btn {
    display:inline-block; padding:3px 8px; margin:2px 4px 2px 0; font-size:11px;
    background:#1f2128; color:#c8ccd0; border:1px solid #2a2d35; border-radius:3px; cursor:pointer;
  }
  .filter-btn.active { background:#4a90e2; color:#fff; border-color:#4a90e2; }
  .resource-row {
    display:flex; justify-content:space-between; padding:3px 0; font-size:11px;
    cursor:pointer; border-bottom:1px solid #1f2128;
  }
  .resource-row:hover { color:#4a90e2; }
  .resource-row .count { color:#9aa0a6; }
  #details { font-size:11px; line-height:1.4; }
  #details code {
    background:#1f2128; padding:1px 4px; border-radius:3px; font-size:10.5px;
    word-break:break-all;
  }
  .tooltip {
    position:absolute; pointer-events:none;
    padding:6px 10px; background:#1f2128; border:1px solid #2a2d35; border-radius:4px;
    font-size:11px; max-width:340px; z-index:99; display:none; line-height:1.4;
  }
  .badge { display:inline-block; padding:1px 5px; border-radius:8px; font-size:10px; font-weight:600; }
  .badge.gh  { background:#3e2a4f; color:#e9d8fd; }
  .badge.gs  { background:#1a4a3a; color:#a7f3d0; }
  .badge.res { background:#3b2f10; color:#fde68a; }
</style>
</head>
<body>
<div id="side">
  <h1>Tool Dependency Graph</h1>
  <p class="small">Composio toolkits: <b>Google Super</b> + <b>GitHub</b>.<br>
  Resource nodes (yellow) sit between producer tools (LIST/SEARCH/CREATE) that emit them and consumer tools that need them as input.</p>

  <h2>Search</h2>
  <input type="search" id="search" placeholder="Find a tool or resource…" autocomplete="off">

  <h2>View</h2>
  <div>
    <span class="filter-btn active" data-view="resources">Resources only</span>
    <span class="filter-btn" data-view="full">Full graph</span>
  </div>
  <div>
    <span class="filter-btn active" data-tk="all">All</span>
    <span class="filter-btn" data-tk="googlesuper">Google</span>
    <span class="filter-btn" data-tk="github">GitHub</span>
  </div>
  <div>
    <span class="filter-btn" id="toggle-labels">Show all labels</span>
    <span class="filter-btn" id="reset-view">Reset view</span>
  </div>
  <p class="small" style="margin-top:8px">Tool labels appear when zoomed in. Click a node to focus.</p>

  <h2>Legend</h2>
  <div class="legend">
    <div><span class="swatch" style="background:#fbbf24"></span>Resource (e.g. thread_id, repo)</div>
    <div><span class="swatch" style="background:#34d399"></span>Producer tool (LIST / SEARCH / CREATE)</div>
    <div><span class="swatch" style="background:#60a5fa"></span>Consumer tool (needs an ID)</div>
    <div><span class="swatch" style="background:#a78bfa"></span>Both producer + consumer</div>
    <div><span class="swatch" style="background:#6b7280"></span>Standalone (only user input)</div>
  </div>

  <h2>Resources <span class="small">(${graph.stats.resourceCount})</span></h2>
  <div id="resource-list"></div>

  <h2>Selection</h2>
  <div id="details"><span class="small">Click a node to see details.</span></div>

  <h2>Stats</h2>
  <div class="small">
    Tools: <b>${graph.stats.toolCount}</b> (Google ${graph.stats.byToolkit.googlesuper} · GitHub ${graph.stats.byToolkit.github})<br>
    Resources: <b>${graph.stats.resourceCount}</b><br>
    Edges: <b>${graph.stats.edgeCount}</b><br>
    Producer tools: <b>${graph.stats.producerToolCount}</b><br>
    Consumer tools: <b>${graph.stats.consumerToolCount}</b><br>
    No-input tools: <b>${graph.stats.noInputs}</b><br>
    Pure-user-entry-points: <b>${graph.stats.pureUserEntryPoints}</b>
  </div>
</div>
<div id="cy"></div>
<div id="tooltip" class="tooltip"></div>
<script>
const GRAPH = ${JSON.stringify(graph)};

// ── Build cytoscape elements ──
function nodeColor(n) {
  if (n.type === "resource") return "#fbbf24";
  const isProd = (n.produces?.length ?? 0) > 0;
  const isCons = (n.consumes?.length ?? 0) > 0;
  if (isProd && isCons) return "#a78bfa";
  if (isProd) return "#34d399";
  if (isCons) return "#60a5fa";
  return "#6b7280";
}
function nodeShape(n) { return n.type === "resource" ? "round-rectangle" : "ellipse"; }
function nodeSize(n) {
  if (n.type === "resource") return 36;
  const fanIn = GRAPH.edges.filter(e => e.target === n.id).length;
  const fanOut = GRAPH.edges.filter(e => e.source === n.id).length;
  return Math.min(40, 14 + Math.sqrt(fanIn + fanOut) * 4);
}

const allElements = [
  ...GRAPH.nodes.map(n => ({
    data: {
      id: n.id, label: n.type === "resource" ? n.label : n.label,
      type: n.type, toolkit: n.toolkit ?? "resource",
      color: nodeColor(n), shape: nodeShape(n), size: nodeSize(n),
      raw: n,
    }
  })),
  ...GRAPH.edges.map((e, i) => ({
    data: { id: "e" + i, source: e.source, target: e.target, kind: e.kind, param: e.param ?? "", required: e.required ?? true }
  })),
];

const cy = cytoscape({
  container: document.getElementById("cy"),
  elements: allElements,
  wheelSensitivity: 0.2,
  style: [
    {
      selector: "node",
      style: {
        "background-color": "data(color)",
        "shape": "data(shape)",
        "width": "data(size)",
        "height": "data(size)",
        "border-width": 1,
        "border-color": "#0e0f12",
        "label": "",  // tool labels hidden by default; toggled by zoom + selection
        "color": "#e6e6e6",
        "font-size": 9,
        "text-outline-width": 2,
        "text-outline-color": "#0e0f12",
        "text-valign": "center",
        "text-halign": "center",
        "min-zoomed-font-size": 6,
      }
    },
    {
      selector: "node[type = 'resource']",
      style: {
        "label": "data(label)",
        "font-size": 13, "font-weight": "bold",
        "border-width": 3, "border-color": "#fcd34d",
        "padding": 8,
        "text-background-color": "#0e0f12",
        "text-background-opacity": 0.85,
        "text-background-padding": 3,
        "text-background-shape": "round-rectangle",
        "shadow-blur": 18,
        "shadow-color": "#fbbf24",
        "shadow-opacity": 0.45,
      }
    },
    {
      selector: ".show-labels node[type = 'tool']",
      style: { "label": "data(label)", "font-size": 8 }
    },
    {
      selector: "node.label-on",
      style: {
        "label": "data(label)",
        "font-size": 11,
        "min-zoomed-font-size": 0,
      }
    },
    {
      selector: "edge",
      style: {
        "width": 1,
        "line-color": "#2a2d35",
        "target-arrow-color": "#2a2d35",
        "target-arrow-shape": "triangle",
        "arrow-scale": 0.7,
        "curve-style": "bezier",
        "opacity": 0.25,
      }
    },
    {
      selector: "edge[kind = 'produces']",
      style: { "line-color": "#34d399", "target-arrow-color": "#34d399", "opacity": 0.35 }
    },
    {
      selector: "edge[kind = 'consumes']",
      style: { "line-color": "#60a5fa", "target-arrow-color": "#60a5fa", "opacity": 0.2 }
    },
    {
      selector: "edge[required = false]",
      style: { "line-style": "dashed", "opacity": 0.15 }
    },
    {
      selector: ".faded",
      style: { "opacity": 0.05 }
    },
    {
      selector: ".highlighted",
      style: { "opacity": 1, "z-index": 10, "border-color": "#ffffff", "border-width": 2 }
    },
    {
      selector: "edge.highlighted",
      style: { "width": 2.5, "opacity": 1, "z-index": 10 }
    },
    {
      selector: ".faded",
      style: { "opacity": 0.04 }
    },
  ],
});

// expose for E2E tests
window.cy = cy;

let currentView = "resources";
let currentToolkit = "all";

function applyView() {
  cy.startBatch();
  cy.elements().removeClass("hidden faded highlighted");
  cy.elements().style("display", "element");

  // Toolkit filter — applies to BOTH tool and resource nodes.
  // Resources whose toolkit is "any" stay visible (cross-toolkit shared resources).
  cy.nodes().forEach(n => {
    const raw = n.data("raw");
    if (currentToolkit === "all") return;
    const tk = raw.toolkit;
    if (tk === "any") return;
    if (tk !== currentToolkit) n.style("display", "none");
  });
  // hide edges whose endpoints are hidden
  cy.edges().forEach(e => {
    if (e.source().style("display") === "none" || e.target().style("display") === "none") {
      e.style("display", "none");
    }
  });

  if (currentView === "resources") {
    // hide tool nodes that aren't connected to any resource (i.e. standalone),
    // and collapse the rest by hiding tools that have only one neighbor.
    // Actually for the "resources only" view: show resource nodes plus tool nodes
    // immediately adjacent if user hovers; here we just hide all tool nodes.
    cy.nodes().forEach(n => {
      if (n.data("type") === "tool") n.style("display", "none");
    });
    cy.edges().forEach(e => e.style("display", "none"));
    // resource-resource visualization is empty by design — instead show resources
    // arranged in a grid with size proportional to tool count.
    runResourceLayout();
  } else {
    runFullLayout();
  }
  cy.endBatch();
}

function runResourceLayout() {
  const res = cy.nodes("[type = 'resource']");
  const layout = res.layout({
    name: "concentric",
    concentric: function (n) {
      // larger circles for resources with more producers+consumers
      const id = n.id().slice(3);
      const prods = GRAPH.edges.filter(e => e.kind === "produces" && e.target === n.id()).length;
      const cons = GRAPH.edges.filter(e => e.kind === "consumes" && e.source === n.id()).length;
      return prods + cons;
    },
    levelWidth: () => 1,
    minNodeSpacing: 50,
    spacingFactor: 1.4,
    animate: false,
  });
  layout.run();
}

function runFullLayout() {
  const visibleNodes = cy.nodes().filter(n => n.style("display") !== "none");
  const visibleEdges = cy.edges().filter(e => e.style("display") !== "none");
  const collection = visibleNodes.union(visibleEdges);
  const layout = collection.layout({
    name: "fcose",
    quality: "proof",
    animate: false,
    randomize: true,
    // generous spacing — graph has 1300+ nodes so default is way too cramped
    nodeRepulsion: () => 60000,
    idealEdgeLength: (e) => e.data("kind") === "produces" ? 220 : 280,
    edgeElasticity: () => 0.3,
    nodeSeparation: 220,
    gravity: 0.15,
    gravityRangeCompound: 1.5,
    nestingFactor: 0.6,
    numIter: 3000,
    fit: true, padding: 60,
    tile: true,
    sampleSize: 30,
    samplingType: true,
  });
  layout.run();
}

// ── Resource list in sidebar ──
const resList = document.getElementById("resource-list");
const sortedRes = GRAPH.nodes
  .filter(n => n.type === "resource")
  .map(r => {
    const prods = GRAPH.edges.filter(e => e.kind === "produces" && e.target === r.id).length;
    const cons = GRAPH.edges.filter(e => e.kind === "consumes" && e.source === r.id).length;
    return { ...r, prods, cons };
  })
  .sort((a, b) => (b.prods + b.cons) - (a.prods + a.cons));
for (const r of sortedRes) {
  const div = document.createElement("div");
  div.className = "resource-row";
  div.innerHTML = \`<span>\${r.label}</span><span class="count">\${r.prods}p · \${r.cons}c</span>\`;
  div.onclick = () => focusNode(r.id);
  resList.appendChild(div);
}

// ── Hover tooltip ──
const tooltip = document.getElementById("tooltip");
cy.on("mouseover", "node", (e) => {
  const n = e.target;
  const raw = n.data("raw");
  if (raw.type === "resource") {
    tooltip.innerHTML = \`<b>\${raw.label}</b> <span class="badge res">resource</span><br>
      <span class="small">producers: \${GRAPH.edges.filter(x=>x.kind==='produces'&&x.target===raw.id).length}<br>
      consumers: \${GRAPH.edges.filter(x=>x.kind==='consumes'&&x.source===raw.id).length}</span>\`;
  } else {
    const tkBadge = raw.toolkit === "github" ? "gh" : "gs";
    tooltip.innerHTML = \`<b>\${raw.label}</b> <span class="badge \${tkBadge}">\${raw.toolkit}</span><br>
      <code>\${raw.id}</code><br>
      <span class="small">\${(raw.description ?? "").slice(0, 200)}</span>\`;
  }
  tooltip.style.display = "block";
});
cy.on("mousemove", (e) => {
  const ev = e.originalEvent;
  tooltip.style.left = (ev.clientX + 14) + "px";
  tooltip.style.top = (ev.clientY + 14) + "px";
});
cy.on("mouseout", "node", () => { tooltip.style.display = "none"; });

// ── Click: focus node ──
function focusNode(id) {
  const node = cy.getElementById(id);
  if (!node || !node.length) return;
  // make sure we're in full view if user clicks a tool
  if (node.data("type") === "tool" && currentView === "resources") {
    document.querySelector('.filter-btn[data-view="full"]').click();
  }
  node.style("display", "element");

  cy.elements().removeClass("highlighted faded label-on");
  const neighborhood = node.closedNeighborhood();
  cy.elements().not(neighborhood).addClass("faded");
  neighborhood.addClass("highlighted");
  // always show labels for the selected tool + its neighbors
  neighborhood.nodes().filter("[type='tool']").addClass("label-on");

  cy.animate({ center: { eles: node }, zoom: 1.6 }, { duration: 400 });

  showDetails(id);
}

function showDetails(id) {
  const det = document.getElementById("details");
  const raw = cy.getElementById(id).data("raw");
  if (!raw) return;
  if (raw.type === "resource") {
    const prods = GRAPH.edges.filter(e=>e.kind==='produces'&&e.target===id).map(e=>e.source);
    const cons = GRAPH.edges.filter(e=>e.kind==='consumes'&&e.source===id);
    det.innerHTML = \`<b>\${raw.label}</b> <span class="badge res">resource</span><br><br>
      <b>Producers (\${prods.length})</b> — tools that emit this:<br>
      \${prods.slice(0,20).map(s=>\`<code>\${s}</code>\`).join("<br>") || "<span class='small'>(none recognized)</span>"}<br><br>
      <b>Consumers (\${cons.length})</b> — tools that need this as input:<br>
      \${cons.slice(0,20).map(c=>\`<code>\${c.target}</code> via <i>\${c.param}</i>\`).join("<br>")}
      \${cons.length>20?\`<br><span class="small">…and \${cons.length-20} more</span>\`:""}\`;
  } else {
    const incoming = GRAPH.edges.filter(e=>e.kind==='consumes'&&e.target===id);
    const outgoing = GRAPH.edges.filter(e=>e.kind==='produces'&&e.source===id);
    const tkBadge = raw.toolkit === "github" ? "gh" : "gs";
    det.innerHTML = \`<b>\${raw.label}</b> <span class="badge \${tkBadge}">\${raw.toolkit}</span><br>
      <code>\${id}</code><br><br>
      <span class="small">\${raw.description ?? ""}</span><br><br>
      <b>Needs (resource inputs):</b><br>
      \${incoming.length ? incoming.map(e=>\`• <i>\${e.param}</i>\${e.required===false?" <span class='small'>(optional)</span>":""} ← <b>\${e.source.replace(/^R::/,"")}</b>\`).join("<br>") : "<span class='small'>(none — pure user input)</span>"}<br><br>
      <b>Produces:</b><br>
      \${outgoing.length ? outgoing.map(e=>\`• <b>\${e.target.replace(/^R::/,"")}</b>\`).join("<br>") : "<span class='small'>(none — terminal action)</span>"}\`;
  }
}

cy.on("tap", "node", (e) => focusNode(e.target.id()));
cy.on("tap", (e) => { if (e.target === cy) {
  cy.elements().removeClass("highlighted faded");
  if (!allLabels) cy.elements().filter("[type='tool']").removeClass("label-on");
  document.getElementById("details").innerHTML = "<span class='small'>Click a node to see details.</span>";
} });

// ── Filter buttons ──
document.querySelectorAll(".filter-btn[data-view]").forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll(".filter-btn[data-view]").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    currentView = btn.dataset.view;
    applyView();
  };
});
document.querySelectorAll(".filter-btn[data-tk]").forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll(".filter-btn[data-tk]").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    currentToolkit = btn.dataset.tk;
    applyView();
    // Re-run layout for the visible subset and fit camera to it
    if (currentView === "full") runFullLayout();
    setTimeout(() => cy.fit(cy.nodes().filter(n => n.style("display") !== "none"), 60), 50);
  };
});

// ── Search ──
const search = document.getElementById("search");
search.oninput = () => {
  const q = search.value.toLowerCase().trim();
  if (!q) { cy.elements().removeClass("highlighted faded"); return; }
  const matches = cy.nodes().filter(n => {
    const raw = n.data("raw");
    return raw.id.toLowerCase().includes(q) || (raw.label ?? "").toLowerCase().includes(q);
  });
  if (!matches.length) return;
  if (currentView === "resources") {
    document.querySelector('.filter-btn[data-view="full"]').click();
  }
  matches.style("display", "element");
  cy.elements().removeClass("highlighted faded");
  cy.elements().addClass("faded");
  matches.removeClass("faded").addClass("highlighted");
  matches.neighborhood().style("display", "element").removeClass("faded");
  if (matches.length === 1) cy.animate({ center: { eles: matches[0] }, zoom: 1.2 }, { duration: 350 });
};

// ── Zoom-aware tool labels ──
function updateLabelsForZoom() {
  const z = cy.zoom();
  if (z >= 1.4) {
    cy.container().classList?.add("show-labels");
    cy.elements().forEach(()=>{}); // no-op to keep linter quiet
    cy.style().selector(".cy-show-labels-on").style({}).update();
    document.getElementById("cy").classList.add("show-labels");
  } else {
    document.getElementById("cy").classList.remove("show-labels");
  }
}
// Cytoscape's class only applies to elements; for a container-level CSS-style class
// we instead toggle a class on cy and use it via a selector.
cy.on("zoom", () => {
  const z = cy.zoom();
  if (z >= 1.4) cy.elements().filter("[type='tool']").addClass("label-on");
  else cy.elements().removeClass("label-on");
});

// ── Toggle all-labels button ──
let allLabels = false;
document.getElementById("toggle-labels").onclick = function () {
  allLabels = !allLabels;
  this.classList.toggle("active", allLabels);
  if (allLabels) {
    cy.elements().filter("[type='tool']").addClass("label-on");
    // Zoom in so labels are actually legible — at default fit zoom (~0.2)
    // even font-size:11 renders sub-pixel.
    cy.animate({ zoom: 1.6, center: { eles: cy.nodes()[":visible"] } }, { duration: 400 });
  } else {
    cy.elements().filter("[type='tool']:not(.highlighted)").removeClass("label-on");
  }
};

// ── Reset view ──
document.getElementById("reset-view").onclick = () => {
  cy.elements().removeClass("highlighted faded label-on");
  document.getElementById("details").innerHTML = "<span class='small'>Click a node to see details.</span>";
  document.getElementById("search").value = "";
  // Force visible "snap back" animation even if camera was already at fit
  cy.animate({ zoom: cy.zoom() * 0.6 }, { duration: 150, complete: () => {
    const visible = cy.nodes().filter(n => n.style("display") !== "none");
    cy.animate({ fit: { eles: visible, padding: 60 } }, { duration: 350 });
  }});
  // Also turn off "Show all labels" mode if it was on
  if (allLabels) {
    allLabels = false;
    document.getElementById("toggle-labels").classList.remove("active");
  }
};

applyView();
</script>
</body>
</html>
`;

writeFileSync("graph.html", html);
console.log("graph.html written.");
