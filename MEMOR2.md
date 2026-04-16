# Memor 2 — The Plan

**Written:** 2026-04-16  
**Author:** Mukur (founder) + Claude session  
**Status:** Active plan. April 30 deadline for "See". May 2026 for "Do" planning.

---

## The Core Thesis

**The Developer is the Builder. AI is the Programmer. Memor is the suit.**

Tony Stark is still Iron Man when the suit is in the attic — but no one sees it. The suit does not fight for Tony. Tony fights. The suit keeps Tony in command while amplifying his execution.

In the AI-companion era, AI writes code well. The problem is not that AI writes bad code. The problem is that **the developer stops understanding the codebase they own.** They watch AI produce files and folders and they drift. They lose the mental model. They become dependent on AI to explain what AI just built. That is not a developer — that is a spectator.

Memor 2 is the suit. It keeps the developer connected to their own codebase as AI writes it.

When AI writes code:
- The canvas updates — which module changed, what connection was added, what coupling tightened
- The developer sees the blast radius of the last commit without reading a single file
- The developer stays the Builder — understanding, directing, owning
- AI stays the Programmer — implementing, not deciding

The file/folder paradigm was designed for humans navigating source files one at a time. That era is over. Memor 2 is not a replacement for VS Code. It is a **live architectural view of what AI is building on your behalf**, so you never lose the plot.

A developer opens Memor 2 not just when joining a new codebase. They keep it open beside their editor every day — the way a pilot keeps the cockpit instruments on while flying. The instruments do not fly the plane. The pilot does. But without instruments, the pilot is blind.

---

## What Memor 2 Is

A **native Electron desktop app** that replaces the file/folder paradigm with a **canvas** — a painting of the codebase, not a report about it.

Three layers, presented simultaneously on the canvas:

### Layer 1 — Architecture (deterministic, always visible)
- Systems as nodes  
- Subsystems as nested nodes  
- Connections between systems as edges (imports, API calls, message queues)  
- Every node and edge traces to a real file:line — or it does not appear  
- No guessing. Silence over fabrication.

### Layer 2 — Health (deterministic, always visible)
- Dead files: files imported by nothing  
- Unused exports: exports never consumed  
- Blast radius as warning: "changing this system affects 8 others" — displayed, not blocked  
- Over-coupling: systems with too many inbound/outbound connections  
- Technical debt signals: AI-generated code patterns (repetition, thin abstractions, inconsistent conventions)  
- All findings trace to file:line evidence

### Layer 3 — Flows (AI-generated, on demand only)
- Never pre-built. Never boilerplate.  
- User types a search: "how does auth work" / "trace a payment" / "what happens when a webhook arrives"  
- AI generates the flow using the **deterministic architecture graph as context** — not raw files  
- Because the graph is a compressed, structured representation (systems, subsystems, connections, blast radius), the AI needs fewer tokens and has architectural awareness that Cursor/Copilot lack  
- The flow answer is specific: real file:line anchors, real handler names, real system names  
- If the deterministic graph cannot support a confident answer, the AI says so — it does not fabricate

---

## What Memor 2 Is Not

- Not a CLI output renderer  
- Not a GitHub extension  
- Not a web app (web exists only for cloud-hosted monetization, not as the primary experience)  
- Not a PR review tool (memorum proved devs don't care)  
- Not a replacement for an IDE — you still write code in VS Code or Cursor  
- Not a universal polyglot tool — **JS/TS only**, <100k lines of code

---

## "Do" — The Code Builder Agent (May 2026)

The second half of the product. Not being built until "See" ships.

**The thesis:** When an LLM is given a deterministic codebase graph with explicit rules (system boundaries, blast radius, coupling constraints), it produces more constrained, more consistent, more architecturally-aware code than when given raw files.

Cursor is **file-aware**. Memor's agent is **system-aware**.

Before generating code:
- The agent knows which system the change belongs to  
- The agent knows what other systems it may affect (blast radius)  
- The agent knows the coupling constraints of the target system  
- The agent knows the file conventions of that system (from pattern detection)  
- The agent uses this graph as its context instead of scanning raw files

Expected outcome stated by founder: "50-60% deterministic flows from LLM + deterministic graph" — meaning the LLM's output has architectural coherence that pure file-based agents cannot achieve.

---

## Scope Constraints (Non-Negotiable)

| Constraint | Reason |
|---|---|
| JS/TS only | Depth over breadth. Tree-sitter AST, NestJS/Express/Next.js patterns — mastered, not guessed. |
| <100k lines of code | Focus on the codebases where a new developer needs orientation, not billion-line monorepos |
| 80%+ accuracy or silence | The MRI rule. One wrong label destroys trust. Silence is honest. |
| No GitHub integration | Devs don't give repo access to external tools. Open-source repos for demos only. |
| No file tree | The canvas IS the product. A file tree sidebar defeats the paradigm. |

---

## Timeline

### April 16–30, 2026 — "See" ships
Must complete:

**Week 1 (Apr 16–22): Engine reliability**
- [ ] Fix tag leakage: per-system tags from system's own `package.json`, not repo-root (analyzeRepo.ts:269-273)
- [ ] Fix Express false classification: `hasRuntimeDep` not `hasDep` (classifySystemType.ts:237)
- [ ] Fix Svelte/compiler-framework archetype: add `compiler-framework` kind (detectPackageArchetype.ts)
- [ ] Fix Chakra/ui-component-library mode: add mode with incidental-runnable guard (detectRepoMode.ts)
- [ ] Fix importance inversion: docs-site 0.72 → 0.48, ui-library 0.62 → 0.72 (systemRanking.ts)
- [ ] Fix boilerplate flow gating: no FLOW_PATTERNS output for library/framework repos
- [ ] Fix MCP evidence stripping: mirror cli.ts fix in mcp.ts (mcp.ts step mapping)
- [ ] Add heuristics directory: `known-packages.json`, `framework-patterns.json`, `repo-mode-signals.json`

**Week 2 (Apr 23–30): Electron canvas shell**
- [ ] Electron app skeleton: opens a local directory, no file tree
- [ ] Canvas renderer: systems as nodes, connections as edges — static layout
- [ ] Architecture layer: nodes display system name, type, file count, tech tags
- [ ] Health layer: dead file count badge, coupling strength indicators on edges
- [ ] Flow panel: search input → AI query → structured response with file:line anchors
- [ ] Validate against 10 repos: express, redux-toolkit, nest, svelte, chakra-ui, hoppscotch, twenty (backend), twenty (frontend), a docs site, a CLI

### May 2026 — "Do" planning
- Architecture design for code builder agent
- Prompt design: deterministic graph → LLM context format
- Constraint propagation: blast radius as code generation rules
- First prototype: single-system code generation with graph context

### June–September 2026 — Build and validate
- Iterate on "See" based on real-world testing
- Build "Do" toward functional prototype
- Demo preparation: open-source repos only

### October 1, 2026 — Bangalore demo
- Audience: Razorpay, Zerodha, Hasura, Postman, Cleartax (Indian unicorn founders/tech leads)
- Demo format: open Memor 2 on a well-known open-source repo they know
- Show: canvas appears in seconds, architecture is accurate, health signals are real, one on-demand flow search
- Then show "Do": make a change in one system, agent respects boundaries and blast radius
- No slides. The canvas is the demo.

---

## The Demo Repos (October 1)

| Repo | Why |
|---|---|
| hoppscotch/hoppscotch | Razorpay/Postman audience knows it — API tool, monorepo, clear systems |
| nestjs/nest | NestJS is widely used in Indian backend teams |
| supabase/supabase | Cloud backend everyone has heard of |
| calcom/cal.com | Startup-adjacent, Next.js + backend, realistic architecture |
| twentyhq/twenty | CRM — product monorepo, good complexity |

---

## What Makes This Hard

1. **Determinism is unforgiving.** One wrong system label and the demo dies. Every engine fix in Week 1 is mandatory, not optional.

2. **Canvas layout is an unsolved design problem.** How do you lay out 12 systems with 40 connections and make it readable in 800×600 pixels? This is 10 years of UI/UX applied to one hard problem.

3. **On-demand flows require a prompt design that hasn't been built.** The graph-to-LLM-context format needs to be compact enough to fit in a context window but rich enough to produce file:line-anchored answers.

4. **Solo founder.** Everything above is one person. Sequencing and cutting scope ruthlessly is survival.

---

## What Gets Cut

If April 30 is at risk, cut in this order:
1. Cut MCP fixes — AI assistants, not users, consume that path
2. Cut heuristics directory — ship it as hardcoded fallbacks, refactor later
3. Cut Electron — ship as enhanced HTML viewer served locally (the current cli.ts approach)
4. **Do NOT cut:** tag leakage fix, Express classification fix, importance inversion fix — these corrupt the canvas

The canvas must be accurate before it is beautiful.

---

## The Single Sentence

> Memor 2 keeps the developer as the Builder while AI writes the code — a live canvas of the codebase that updates as AI commits, so the developer never loses the architectural plot.

---

## Open Questions

1. What is the optimal graph layout algorithm for the canvas? (Force-directed? Hierarchical? Zone-grouped?)
2. What is the LLM-context format for the deterministic graph that produces the best on-demand flows?
3. How does the canvas handle repos at the boundary of 100k lines without degrading?
4. What is the pricing model? Per seat? Per repo? Free for open-source?

These are not blockers for April 30. They are May+ problems.
