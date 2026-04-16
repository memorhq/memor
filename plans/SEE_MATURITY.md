# "See" — 10 Iterations of Maturity

**From:** A broken CLI that sometimes lies  
**To:** The Mona Lisa of codebase understanding  

Each iteration has a name. A current state. What gets built. What Mukur tests.  
No iteration ships unless the previous one is stable.

---

## Maturity Map

```
ITERATION 1  →  Honest but ugly         (CLI, fixes engine bugs)
ITERATION 2  →  First canvas            (Electron shell, static nodes)
ITERATION 3  →  Opens anything          (Any local JS/TS repo, error handling)
ITERATION 4  →  Shows health            (Dead files, coupling colors, blast radius)
ITERATION 5  →  Watches commits         (Canvas updates after git commits — THE HABIT)
ITERATION 6  →  You can explore it      (Click, expand, drill down)
ITERATION 7  →  Speaks to LLMs          (MCP tools, compressed graph, token efficiency)
ITERATION 8  →  Answers questions       (On-demand AI flows from deterministic graph)
ITERATION 9  →  Looks like the Mona Lisa (Design pass — Vercel-level clarity)
ITERATION 10 →  Proven on 10 repos      (Simulation engine validates before October 1)
```

---

## ITERATION 1 — "Honest"
**Status:** Building now (April 16–22)  
**Theme:** We stop lying before we start showing.

### What "See" looks like today (before this iteration)
- CLI produces HTML
- Systems sometimes classified wrong (Express = api-service when it's a library)
- Tags from repo root stamped on every system
- Evidence fields stripped in cli.ts serialization
- Headline sometimes says "a end-to-end test suite" on a backend app
- Flows are mostly boilerplate templates, not real evidence

### What we build
- Fix tag leakage (`analyzeRepo.ts:269`)
- Fix Express classification (`classifySystemType.ts:237` → `hasRuntimeDep`)
- Fix Svelte = types-package (add `compiler-framework` archetype)
- Fix Chakra = product-domain-machine (add `ui-component-library` repo mode)
- Fix docs-site importance inversion (0.72 → 0.48)
- Fix boilerplate flow gating for library/framework repos
- Fix MCP evidence stripping (mirror cli.ts fix)

### What "See" looks like after
- CLI produces HTML that is honest
- System types are correct for: express, svelte, chakra, nest, hoppscotch
- Headline never overrides to a wrong purpose
- Flows that exist are real evidence flows or clearly marked "pattern"

### Mukur tests
Run memor on: express, svelte, chakra-ui, nest, hoppscotch  
Ask: Does every system label describe what it actually is?  
Pass bar: Zero false system types. Zero false headlines.

---

## ITERATION 2 — "First Canvas"
**Status:** April 23–30  
**Theme:** We replace the HTML report with a real picture. The paradigm shifts here.

### What "See" looks like at start of this iteration
- Honest HTML report
- No canvas. No nodes. No edges. Text and lists.

### What we build
- Electron app skeleton — no file tree, no sidebar, just canvas
- Systems rendered as nodes (circle or card): name, type badge, file count
- Connections rendered as edges: line between nodes
- Coupling strength: edge color (grey = loose, orange = medium, red = tight)
- Canvas layout: force-directed (systems find their natural positions)
- Headline + subheadline shown below canvas
- One repo hardcoded for this iteration (hoppscotch) to validate the design

### What "See" looks like after
- Open Electron → hoppscotch canvas appears
- 4 systems visible as nodes, connected by colored edges
- You see the architecture without reading a line of code
- First time the 5-second rule can be tested

### Mukur tests
Show to 2–3 developers (the Sunday meeting).  
Ask: What is this repo? (They should answer correctly in 5 seconds.)  
Ask: What surprises you? (There should be at least one answer.)  
Pass bar: 2 out of 3 developers have an AHA moment within 5 seconds.

---

## ITERATION 3 — "Opens Anything"
**Status:** May 1–14  
**Theme:** The canvas becomes a tool, not a demo.

### What we build
- File picker or drag-and-drop: open any local JS/TS repo
- Full analysis pipeline runs on the opened repo (not hardcoded)
- Error handling: if a system cannot be classified with confidence → shows "?" badge, not a wrong label
- Loading state: progress bar while analysis runs ("Scanning files... Detecting systems... Building connections...")
- Empty state: if repo has no detectable systems → "Bae could not map this codebase. Try a JS/TS repo under 100k lines."
- One-click Mac installer (DMG)

### What "See" looks like after
- Any developer can download Memor, open their own repo, and see the canvas
- Nothing fabricated. Uncertain systems are honest about their uncertainty.
- First public distribution

### Mukur tests
Give to 10 developers who are actively using Cursor/Copilot.  
Let them open their own repos.  
Watch: What do they click first? Where do they get confused? Do they come back tomorrow?  
Pass bar: 3 out of 10 open it again the next day without being asked.

---

## ITERATION 4 — "Shows Health"
**Status:** May 15–31  
**Theme:** The canvas becomes useful, not just interesting.

### What we build
- Dead files: files imported by nothing → grey ghost nodes on canvas
- Unused exports: small indicator dot on system node
- Blast radius: node size scales with blast radius score (bigger = more downstream impact)
- Coupling danger: red edge with thickness proportional to coupling strength
- Health panel: click a system → side panel shows "3 dead files, 2 unused exports, blast radius 72"
- Memor Score: 0–100 architectural health score shown in top bar

### What "See" looks like after
- Open canvas → immediately see which systems are risky (big nodes, red edges)
- Know where to be careful before writing a single line
- Health is not a report — it is painted on the canvas

### Mukur tests
Show to a CTO or tech lead.  
Ask: Where is the most dangerous part of this codebase?  
Pass bar: They point to the right system (the one with red edges / high blast radius) within 10 seconds.

---

## ITERATION 5 — "Watches Commits" ← THE HABIT TRIGGER
**Status:** June 1–15  
**Theme:** This iteration is why Memor becomes a habit. Everything before this is a one-time use. After this — it is daily.

### What we build
- Git watcher: Memor detects new commits in the opened repo (using `chokidar` or `simple-git`)
- Incremental re-analysis: only re-analyzes files touched by the commit (not full scan)
- Canvas diff: what changed architecturally
  - New connection added → new animated edge appears with pulse
  - Blast radius increased → node badge updates with animation
  - Dead file created → grey ghost node appears
  - Coupling tightened → edge changes color
  - System gained new entry point → node indicator changes
- Commit panel at bottom: "Last commit — Auth system gained 2 connections. Blast radius: 54 → 72."
- No file diff shown. Architectural diff only. The code is handled by git. Memor handles the architecture.

### What "See" looks like after
- Developer uses Cursor, AI writes code, they commit
- Canvas updates automatically — they see what AI built to the architecture
- They did not read a line. They know what changed.
- This is the core product promise. Delivered.

### Mukur tests
Developer uses Cursor to add a feature to a repo with Memor open.  
Watch: Do they look at the canvas after the commit?  
Pass bar: They look without being asked. They react to something on the canvas.

---

## ITERATION 6 — "You Can Explore It"
**Status:** June 16–30  
**Theme:** The canvas becomes interactive. You drill down, not just look.

### What we build
- Click a system node → expands to show subsystems inside
- Click a subsystem → shows entry points, key files, tech tags
- Click an edge → shows what the connection is ("42 imports", "3 API calls to /auth/sign-in")
- Hover a node → shows tooltip: blast radius, dead files, top entry file
- Search: type a system name → canvas zooms and highlights
- Zoom + pan: pinch/scroll to zoom, drag to pan
- Minimap: small overview of full canvas in corner when zoomed in

### What "See" looks like after
- Canvas is not just a picture — it is a navigable space
- Developer can drill from repo → system → subsystem → entry file
- Never opens a file browser. Never needs to. The canvas is the explorer.

### Mukur tests
Give to a new developer joining a team.  
Ask them to find: where does auth live? What does the payment system connect to?  
Pass bar: They find the answer using the canvas only, in under 30 seconds.

---

## ITERATION 7 — "Speaks to LLMs"
**Status:** July 1–15  
**Theme:** "See" becomes the context layer for every LLM working on your codebase.

### What we build
- Compressed graph format: per-system JSON in <400 tokens (systems, connections, health, conventions, rules)
- MCP tool: `get_architecture_context(systemName?)` → compressed graph
- MCP tool: `get_blast_radius(filePath)` → affected systems list
- MCP tool: `get_system_health(systemName)` → dead files, coupling, unused exports
- Rules field: auto-derived from graph — "do not couple Auth to Payment", "follow NestJS controller pattern", "blast radius 72 — warn before adding coupling"
- Cursor integration guide: how to add Memor MCP to your Cursor rules file

### What "See" looks like after
- Cursor uses Memor MCP before generating code
- LLM gets 400 tokens of architectural context instead of 40,000 tokens of raw files
- LLM follows system boundary rules automatically
- Developer sees: "Cursor used Memor context for this generation"

### Mukur tests
Run the same Cursor task with and without Memor MCP active.  
Measure: token count difference. Count how many times Cursor generates code that violates system boundaries.  
Pass bar: At least 50% token reduction. Zero boundary violations with Memor active.

---

## ITERATION 8 — "Answers Questions"
**Status:** July 16–31  
**Theme:** You can ask the canvas anything about the codebase. It answers with proof.

### What we build
- Search panel: natural language query ("how does auth work", "trace a payment", "what happens when a webhook arrives")
- AI generates flow using deterministic graph as context (NOT raw files)
- Each flow step has: file:line anchor, system name, handler name
- If AI cannot anchor to evidence → "Bae is not certain about this step. Here is what I know: [partial evidence]"
- Flow is rendered ON the canvas — edges light up to show the path through systems
- Flows can be pinned: save a flow to the canvas for future reference
- No pre-built flows. No boilerplate. Every flow is generated fresh from evidence.

### What "See" looks like after
- Canvas answers questions with proof
- "How does auth work?" → lit-up path through 4 systems, 6 files, 8 steps — each with file:line
- Developer trusts the answer because it traces to real code
- This is the "wow" moment for the October demo

### Mukur tests
Ask 5 questions about a codebase you know well.  
Grade each answer: Does it trace to real files? Is it accurate?  
Pass bar: 4 out of 5 answers are architecturally accurate with real file:line anchors.

---

## ITERATION 9 — "The Mona Lisa"
**Status:** August 1–31  
**Theme:** Mukur's 10 years of UI/UX applied. Beauty in usage, not just appearance.

### What we build (Mukur designs, Bae implements)
- 5-second rule: the most surprising true thing is visible within 5 seconds of opening
- Node design: type immediately recognizable by shape + color + icon (not just text label)
- Coupling danger lines: visually unmissable — red glowing edges for high coupling
- Canvas animation: systems appear with gentle physics on load
- Commit diff animation: changed nodes pulse, new edges draw in
- Dark mode only (developers live in dark mode)
- Typography: system names prominent, metadata secondary, noise eliminated
- Empty states are beautiful: not error pages, but honest quiet states
- Micro-interactions: hover, click, expand all feel intentional and responsive

### Design reference targets
- Layout clarity: Vercel dashboard — everything earns its place
- Data density: AWS architecture diagrams — complex but readable
- Visual trust: Airbnb listing — you know what you're getting in 3 seconds
- Emotional tone: calm, precise, confident — not flashy, not clinical

### What "See" looks like after
- A non-developer looks at the canvas and says "I understand what this does"
- The architecture IS the UI. No chrome, no sidebar, no report. Just the picture.
- Screenshots of the canvas get shared on Twitter without any caption needed

### Mukur tests
Show to a non-developer (designer, product manager, or founder).  
Ask: What is this? What is the most important thing on the screen?  
Pass bar: They answer both correctly in under 10 seconds.

---

## ITERATION 10 — "Proven"
**Status:** September 1–30  
**Theme:** We do not guess that it works. We prove it. Then we demo.

### What we build
- Simulation engine CLI: `memor simulate ./corpus-list.txt`
- Runs analysis on 10-repo corpus automatically
- Scores: efficiency, classification accuracy, AHA rate, boilerplate flow rate, false purpose overrides
- Outputs scorecard JSON + human-readable summary
- Any score below target → flagged, blocked from demo

### Corpus (10 repos, covering full type matrix)
| Repo | Type | Known classification |
|---|---|---|
| hoppscotch/hoppscotch | product monorepo | 4 systems, backend + frontend |
| nestjs/nest | framework-core | backend-framework |
| expressjs/express | single api-service | 1 system, minimal |
| reduxjs/redux-toolkit | library-tooling | library, not app |
| chakra-ui/chakra-ui | ui-component-library | NOT product-domain-machine |
| sveltejs/svelte | compiler-framework | NOT types-package |
| twentyhq/twenty | product monorepo | backend + frontend + shared |
| vercel/next.js | framework-core | with platform adapters |
| calcom/cal.com | full-stack-app | Next.js + API |
| facebook/docusaurus | documentation-site | docs framework |

### Pass targets (all required before October 1)
| Metric | Target |
|---|---|
| Classification accuracy | ≥ 80% |
| AHA moment rate | ≥ 70% (7/10 repos) |
| Boilerplate flow rate | ≤ 40% |
| False purpose overrides | 0% |
| Canvas load time | < 5 seconds |

### October 1 demo
- Open Memor on hoppscotch live
- Canvas appears in < 5 seconds
- Ask: "how does auth work" → flow with file:line appears
- Show commit diff: "this is what your last AI commit did to the architecture"
- Show MCP in Cursor: "this is what Cursor knows about your codebase with Memor"
- No slides. No narration. The canvas speaks.

---

## The Maturity at a Glance

| Iteration | Name | Core User Experience |
|---|---|---|
| 1 | Honest | "The CLI doesn't lie anymore" |
| 2 | First Canvas | "I can see the architecture" |
| 3 | Opens Anything | "I can open my own repo" |
| 4 | Shows Health | "I can see what's dangerous" |
| 5 | Watches Commits | "I open Memor every time AI commits" |
| 6 | Explore It | "I navigate the canvas like a map" |
| 7 | Speaks to LLMs | "Cursor knows my architecture" |
| 8 | Answers Questions | "I ask Memor how anything works" |
| 9 | The Mona Lisa | "The canvas is beautiful and clear" |
| 10 | Proven | "We verified it works. Ship it." |
