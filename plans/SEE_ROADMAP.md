# Memor "See" — Product Roadmap to October 1, 2026

**Bae's role:** Programmer. Build what Mukur defines.  
**Mukur's role:** Product builder. Define what to build. Test on real developers.  
**North Star:** "See" is the Mona Lisa. Perfect, honest, truthful. Never wrong.

---

## The Four Laws of "See"

Before any feature ships, it must pass all four:

**Law 1 — Addiction**  
A developer who uses Memor once should want to open it again before their next AI commit. If they don't — the canvas failed to give them something they couldn't have known otherwise.

**Law 2 — LLM Efficiency**  
"See" must produce output that is as useful to an LLM (in Cursor via MCP) as it is to a human looking at the canvas. The graph must compress the codebase into a token-efficient, architecturally-aware context that makes LLM outputs better and cheaper.

**Law 3 — Beautiful in Usage**  
Not beautiful like a portfolio site. Beautiful like Vercel's dashboard — where every element earns its place, nothing is noise, and you understand the whole picture in 5 seconds. The traveler looking at Airbnb knows exactly what they're getting. The developer opening Memor must know exactly what their codebase is.

**Law 4 — The Mona Lisa Law**  
If Memor cannot be certain, it is silent. If the canvas is wrong, it apologizes and shows only what it knows is true. A wrong system label is worse than no label. A fabricated flow is worse than no flow. Silence is honest. Fabrication is a lie.

---

## What "See" Is Made Of

Three layers. All deterministic except Flows (AI on-demand).

```
┌─────────────────────────────────────────────────────────┐
│  ARCHITECTURE LAYER  (always visible, always deterministic) │
│                                                           │
│  Systems → Nodes on canvas                               │
│  Connections → Edges between nodes                       │
│  Subsystems → Nested inside system nodes                 │
│  Tech tags → React, NestJS, Prisma, etc.                 │
│  Entry points → The "front door" of each system          │
└──────────────────────────┬────────────────────────────── ┘
                           │
┌──────────────────────────▼────────────────────────────── ┐
│  HEALTH LAYER  (always visible, always deterministic)     │
│                                                           │
│  Dead files → grey nodes (imported by nothing)           │
│  Coupling danger → edge color (grey / orange / red)      │
│  Blast radius → node size / warning badge                │
│  Unused exports → small indicator on node                │
│  AI code concentration → heatmap (post-v1)               │
└──────────────────────────┬────────────────────────────── ┘
                           │
┌──────────────────────────▼────────────────────────────── ┐
│  FLOW LAYER  (on-demand only, AI-generated)               │
│                                                           │
│  User types: "how does auth work"                        │
│  AI gets: deterministic graph as context (not raw files) │
│  AI returns: flow with real file:line anchors            │
│  If AI cannot anchor to evidence → AI says so            │
└───────────────────────────────────────────────────────── ┘
```

---

## Launch Timeline

### PHASE 1 — Engine Reliability
**April 16–22, 2026 (this week)**  
**Goal:** Fix what's wrong before building what's new. A wrong canvas is worse than no canvas.

Fixes to ship:
- [ ] Tag leakage: per-system tags, not repo-root tags stamped on everything
- [ ] Express false classification: use `hasRuntimeDep` not `hasDep`
- [ ] Svelte/compiler-framework archetype: add missing archetype
- [ ] Chakra/ui-component-library mode: add missing repo mode
- [ ] Docs-site importance inversion: lower 0.72 → 0.48, raise ui-library 0.62 → 0.72
- [ ] Boilerplate flow gating: suppress FLOW_PATTERNS for library/framework repos
- [ ] MCP evidence stripping: mirror cli.ts fix in mcp.ts

**Mukur tests:** Run on nest, svelte, chakra-ui, express — verify classifications are now correct.

---

### PHASE 2 — Canvas Shell (Electron v0.1)
**April 23–30, 2026**  
**Goal:** Replace the HTML report with a real canvas. This is the paradigm shift.

Build:
- [ ] Electron app skeleton — opens a local directory
- [ ] No file tree. No sidebar. Only canvas.
- [ ] Systems as draggable nodes (name, type badge, file count)
- [ ] Connections as edges with coupling color (grey/orange/red)
- [ ] Health badges on nodes: dead file count, blast radius score
- [ ] Click a node → expand to subsystems
- [ ] Click an edge → show what the coupling is (imports, API calls)
- [ ] Bottom panel: headline + subheadline from `generateAhaSummary`

**Launch:** Private. Mukur shows this to his 2 developer contacts on the Sunday meeting.  
**Mukur tests:** Do they have an AHA moment in the first 5 seconds? Do they ask to keep using it?

---

### PHASE 3 — First Real Feedback Loop
**May 1–14, 2026**  
**Goal:** 10 real developers. Understand what breaks their trust and what earns it.

- [ ] One-click install for Mac (DMG)
- [ ] Opens any local JS/TS repo
- [ ] Handles error gracefully — if classification uncertain, show "Bae is not sure about this system"
- [ ] Basic onboarding: "Open a repo. See its architecture."
- [ ] Feedback button built in — sends Mukur a structured note (what was wrong, what was missing)

**Mukur tests:** Give to 10 developers building with Cursor/Copilot. Watch what they do in the first minute. Count AHA moments.  
**Success metric:** 3 out of 10 open it again the next day without being asked.

---

### PHASE 4 — Commit Diff Canvas (The Habit Trigger)
**May 15–31, 2026**  
**Goal:** The canvas updates after every git commit. This is what makes Memor daily, not occasional.

Build:
- [ ] Git watch: Memor detects new commits in the opened repo
- [ ] Re-runs analysis incrementally (not full scan — only changed files)
- [ ] Canvas highlights what changed architecturally:
  - New connection → new animated edge appears
  - Blast radius increased → node pulses / badge updates
  - Dead file created → grey node appears
  - Coupling tightened → edge changes color
- [ ] Commit panel: "Last commit changed: Auth system gained 2 new connections"
- [ ] No file diff. Architectural diff only.

**Launch:** v0.2.0 — announce to the 10 beta users. "Memor now watches your commits."  
**Mukur tests:** Do developers keep Memor open while they use Cursor? Do they check the canvas after AI commits code?

---

### PHASE 5 — LLM Output Format (MCP v2)
**June 1–15, 2026**  
**Goal:** "See" becomes the context layer for LLMs. This is the bridge to "Do."

Build:
- [ ] Compressed graph format: systems + connections + health signals in <2000 tokens
- [ ] MCP tool: `get_architecture_context(systemName?)` → returns compressed graph
- [ ] MCP tool: `get_blast_radius(filePath)` → returns affected systems
- [ ] MCP tool: `get_system_health(systemName)` → returns dead files, coupling, unused exports
- [ ] Cursor plugin documentation: how to use Memor MCP in Cursor rules

Why this matters: When Cursor asks "what does the auth system do?", it currently reads 40 files.  
With Memor MCP, it reads 1 compressed node with connections, health, entry points, and evidence flows.  
Fewer tokens. Better architectural awareness. More constrained output.

**Launch:** Blog post — "How Memor makes Cursor smarter about your codebase."  
**Mukur tests:** Run Cursor with and without Memor MCP on the same task. Measure: token count, architectural accuracy of output, number of incorrect cross-system references.

---

### PHASE 6 — Health Layer (Full Visual)
**June 16–30, 2026**  
**Goal:** The health layer becomes the reason CTOs buy Memor.

Build:
- [ ] Dead code view: filter canvas to show only unreachable files
- [ ] Coupling danger map: highlight red edges, show which systems are at risk
- [ ] Blast radius heatmap: color nodes by how many systems depend on them
- [ ] Unused exports list: per-system, per-file
- [ ] Memor Score: 0-100 architectural health score, updated after each commit
- [ ] Score history: "Your codebase score dropped from 78 to 61 in the last 10 commits"

**Launch:** v0.3.0 — Product Hunt soft launch. "See your codebase's architectural health."  
**Mukur tests:** Show to a CTO. Does the score + red coupling lines make them say "we need to fix this"?

---

### PHASE 7 — On-Demand Flows (AI Layer)
**July 1–31, 2026**  
**Goal:** Flows that are honest, specific, and file:line anchored — or silent.

Build:
- [ ] Search panel: "trace a payment / how does auth work / what happens when a webhook arrives"
- [ ] AI receives: compressed deterministic graph (systems, connections, health, entry points)
- [ ] AI returns: flow with real file:line anchors extracted from the graph
- [ ] If AI cannot anchor to evidence: "Bae cannot trace this flow with certainty. Here is what I know: [partial evidence]"
- [ ] Flows are never pre-built. Never boilerplate. Only on demand.
- [ ] Flow is saved: developer can pin flows to the canvas for future reference

**Launch:** v0.4.0 — Developer blog post: "Ask Memor how your codebase works. Get answers with file:line proof."

---

### PHASE 8 — Beauty Pass (Design Excellence)
**August 1–31, 2026**  
**Goal:** Mukur's 10 years of UI/UX applied to the canvas. Vercel-level clarity.

This is Mukur's phase. Bae implements. Mukur designs.

Design targets:
- [ ] 5-second rule: within 5 seconds of opening, one surprising true thing is visible
- [ ] Coupling danger lines: visually unmissable (red lines = action required)
- [ ] Node design: system type immediately recognizable (icon + color, not just text)
- [ ] Canvas feels alive: gentle animations on load, on commit, on interaction
- [ ] Mobile-ready canvas for quick checks (not full analysis, just the overview)
- [ ] Dark mode only. Developers live in dark mode.

**Mukur tests:** Show to a non-developer. Do they understand what they're looking at within 10 seconds? If yes, the design is working.

---

### PHASE 9 — Simulation Engine + QA
**September 1–15, 2026**  
**Goal:** Bae runs the corpus. No false claims go to the October demo.

Run simulation on 10-repo corpus:
- [ ] Classification accuracy ≥ 80%
- [ ] AHA moment rate ≥ 70% (7/10 repos)
- [ ] Boilerplate flow rate ≤ 40%
- [ ] False purpose override: 0%
- [ ] Time to first canvas: < 5 seconds

If any metric fails → fix before October 1. No exceptions.

---

### PHASE 10 — October 1 Demo
**September 16–30, 2026 (prep)**  
**Goal:** A 15-minute demo that makes Razorpay, Zerodha, Hasura, Postman, Cleartax say "when can we use this."

Demo script:
1. Open Memor on hoppscotch (they know it — API tool)
2. Canvas appears in <5 seconds. They see 4 systems, connections, health signals.
3. "This is your codebase. You didn't read a line." — 10 seconds in.
4. Click Auth system → see its connections, blast radius, entry file.
5. Search "how does auth work" → flow appears with file:line anchors.
6. Switch to a repo they own (bring a known open-source repo of theirs if possible)
7. Show commit diff canvas: "This is what your last AI commit did to your architecture."
8. Show Memor Score history: "Your score dropped here — this is when."
9. Show MCP in Cursor: "When your developers use Cursor with Memor, Cursor knows your architecture."

No slides. Canvas only.

---

## The "See" Stack (What We Are Building With)

| Layer | Technology |
|---|---|
| Desktop shell | Electron |
| Canvas renderer | React + a graph library (TBD: D3, Cytoscape, or React Flow) |
| Analysis engine | Existing TypeScript (src/) |
| LLM for Flows | Claude API (on-demand only, never pre-built) |
| MCP server | Existing mcp.ts (extended) |
| Git watch | chokidar or simple-git |

---

## What "See" Is Not Building (Stay Focused)

- No GitHub integration
- No web app (web = monetization later)
- No Python / Go support (JS/TS only until post-October)
- No PR review (memorum proved devs don't care)
- No team collaboration features (solo developer tool first)
- No cloud sync (local only until VC money)

---

## The Mona Lisa Principle in Code

Every output from "See" must trace to evidence or be silent.

```
System label → traces to package.json + file structure
Connection edge → traces to import statement or API call with file:line
Health signal → traces to specific file that is dead/coupled/unused
Flow step → traces to evidenceFile:evidenceLine or is marked "Bae is not certain"
Headline → traces to detected system composition, never fabricated
```

If the evidence chain breaks → show nothing, not a guess.
