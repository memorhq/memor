# Memor MVP2 — What's Next

> Created: April 9, 2026
> Status: Planning
> Goal: Make memor useful for **all** repo shapes, not just monorepos

---

## Where We Are (MVP1 — Done)

- 4 AHA moments from developers
- Website live at memor.dev
- GitHub ready, PR template in place
- CLI + browser UI with 4 views: Overview, Structure, Flow, Impact
- MCP integration for AI-assisted workflows
- Strong results on monorepos (cal.com: 31 systems, AFFiNE: 29 systems)
- Single-package detection fix shipped (Express, Fastify now detected)

## Benchmarking Findings

| Repo | Type | Result |
|------|------|--------|
| Express | Single-package (lib/) | Fixed — detected, but shallow (no flows, minimal impact) |
| Fastify | Single-package (lib/) | Fixed — detected as framework-core, still shallow |
| cal.com | Turborepo monorepo | Strong — all 4 views rich and accurate |
| AFFiNE | Mixed monorepo (Electron + web) | Strong — multi-runtime detected correctly |

**Core insight**: Memor is a monorepo tool today. Single-package repos get detected but produce shallow output. MVP2 closes this gap.

---

## MVP2 Priorities

### P0 — Single-Package Depth (Week 1)

The #1 gap. A developer running memor on their single Express/Fastify/Next.js app sees a correct but shallow result. They need to see internal structure.

**1. Internal zone detection for single-package repos**
- When memor detects a single primary system, analyze its internal folder structure
- Treat `lib/`, `src/`, `app/`, `routes/`, `middleware/`, `models/`, `utils/` as zones
- Show these as navigable structure in the Structure view
- This makes the Structure view useful even with 1 system

**2. Internal flow detection**
- For common patterns (Express/Fastify/Koa), detect the middleware pipeline flow
- For Next.js apps, detect the page → API → data flow
- For generic apps, detect entry point → core logic → output patterns
- These should appear in the Flow view as internal flows

**3. Block-level connections**
- Current connections are system-to-system. Within a single package, map which internal blocks depend on which
- `routes/` depends on `middleware/` depends on `models/` — show this as an internal dependency graph

---

### P1 — Parser Foundation (Week 1-2)

Prerequisite for deeper analysis. Current regex-based import extraction is fragile.

**4. Tree-sitter integration for TS/JS**
- Replace regex import extraction with Tree-sitter queries
- Start with TS/JS only (`.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.mts`)
- Same output format, same downstream behavior — drop-in replacement
- This unblocks export-level connections and multi-language support later

**5. Export-level connection mapping**
- Instead of "System A connects to System B", show "System A imports `createUser` and `validateToken` from System B"
- Makes Impact view dramatically more precise
- Enables future Dynamic Impact feature

---

### P2 — Polish & Trust (Week 2)

Things that affect whether a developer trusts the output.

**6. Confidence improvements**
- Express still shows "Moderate confidence" — when we detect a primary system correctly, confidence should reflect that
- Remove the "try scoping to a subdirectory" suggestion when the root system is properly detected
- Confidence should scale with how much memor actually understood, not just system count

**7. Repo mode for single-package**
- Express shows as "unknown" repo mode. It should be "library-tooling" or "framework-core"
- Fastify correctly gets "framework-core" — Express should too
- Review the scoring heuristics in `detectRepoMode` for single-package repos

**8. Empty state improvements**
- "No flows detected" is a dead end. Show something useful instead:
  - "This is a single-package repo. Memor detects flows across multi-system architectures. Try running on a monorepo, or check back — internal flow detection is coming soon."
  - Or show a simplified view of the entry point → dependency chain

---

### P3 — Anticipated Feedback (Week 2-3)

Based on what the senior dev asked and what Sunday's tester might surface.

**9. Dynamic Impact (design only)**
- Don't build it yet. Design the API: `predict_impact({ description, systemHint? })`
- Document what data the finer-grained graph needs to provide
- Prototype the intent → scope resolution step (map natural language to systems/blocks)
- Ship as MCP tool first, UI later

**10. Multi-language awareness**
- memor already detects Python/Go/Rust files but only for labeling
- With Tree-sitter, extend import scanning to Python (`import`, `from ... import`)
- Even basic Python support opens memor to a much larger audience

**11. CLI experience**
- First-run experience: when a user runs `npx memor` for the first time, what do they see in the terminal before the browser opens?
- Progress indicators during analysis (especially for large repos)
- Better error messages when analysis produces low-confidence results

---

## Decision Log

| Decision | Rationale |
|----------|-----------|
| Tree-sitter over TypeScript Compiler API | Memor's value is structural, not type-level. Tree-sitter is language-agnostic and fast. TS Compiler API can be layered in later for narrow deep-dive use cases. |
| Internal zones before parser upgrade | Internal zone detection can work with filesystem heuristics today. Parser upgrade enables deeper analysis but isn't blocking the most visible gap. |
| Dynamic Impact is design-only in MVP2 | Needs finer-grained edges (parser + export-level connections) as prerequisite. Building it now would be a gimmick, not a real tool. |

---

## Success Criteria for MVP2

- [ ] Running memor on Express produces useful Structure and Flow output
- [ ] Running memor on a typical single-package Next.js app shows internal zones
- [ ] Import extraction uses Tree-sitter instead of regex for TS/JS
- [ ] No regression on monorepo analysis (cal.com, AFFiNE stay identical)
- [ ] At least 2 new developers have an AHA moment on single-package repos

---

## Depends On

- **Sunday's test feedback** — may reprioritize P0 vs P1 based on what the tester surfaces
- **Benchmarking on Next.js** — haven't tested a large monorepo at scale yet (may reveal performance issues)
- **Tree-sitter WASM vs native** — need to decide on binding strategy before starting parser work
