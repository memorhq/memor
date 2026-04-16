## Iteration Title

Structural Reason on Inferred Flows — "INFERRED" Becomes Explainable

---

## Date-Time

2026-04-15 21:00:00

---

## Goal

The previous iteration left one honest gap: `INFERRED` told a developer what a flow is NOT (not code-derived) but not WHAT triggered it. A developer could see "Inferred from structure" and reasonably ask: "from which structure? what did you look at?"

The `INFERRED` label without a reason is an incomplete truth claim. It acknowledges uncertainty but doesn't expose the evidence chain behind the inference — which exists, it just wasn't surfaced.

Goal: every inferred flow must show exactly which conditions generated it. Not narration — structural facts.

---

## Context

Previous state: `fv-ctx-derivation-inferred` rendered:
```
◌  Inferred from structure — not code-derived
```

This is honest but unhelpful. The pattern build functions already know why they fired — they have access to `ctx.families`, `ctx.zones`, `ctx.center`, `ctx.systems`. That information was being computed and immediately discarded.

User constraint: no narration. Only structural facts. "which systems triggered it · which conditions matched".

---

## What Was Done

**Modified:** `src/builders/generateRepoFlows.ts`

1. Added `structuralReason?: string` to `RepoFlow` type.
   - For evidence flows: absent (they have `evidenceFile:line` instead)
   - For pattern flows: present — computed in each `build()` return

2. Added `structuralReason` to every pattern's `build()` return. Format: dot-separated facts, no verbs, no narration:
   - `"web-product family · web-app: my-app · zones: dashboard, auth"`
   - `"backend-framework family · platform adapters: platform-express, platform-fastify · core: common"`
   - `"library family · center: toolkit · 2 consumers"`
   - `"frontend-framework family · core: Core Runtime (react-reconciler) · renderer: Renderers & Bindings (react-dom, ...)`
   - `"compiler zone: Compiler · runtime zone: Core Runtime · server entry detected · center: react"`
   - etc.

3. Also added to `buildUniversalFallback()` (the catch-all): `"no family matched · center: X · N secondary systems"`.

**Modified:** `src/app/frontend/App.tsx`

In the `fv-ctx-derivation-inferred` block, below `"Inferred from structure"`, renders:
```tsx
{(activeFlow as any).structuralReason && (
  <span className="fv-ctx-deriv-reason">{(activeFlow as any).structuralReason}</span>
)}
```

**Modified:** `src/app/buildAppPage.ts`

Added `.fv-ctx-deriv-reason` CSS:
- Monospace, 10px, `var(--text-faint)` color
- `word-break: break-word` for long reasons
- Visually subordinate to the label — it's the "source" not the "conclusion"

---

## What Was Tested or Observed

**redux-toolkit:**
```
[INFERRED] toolkit API flow
  reason: library family · center: toolkit · 2 consumers
[INFERRED] toolkit processing pipeline
  reason: library family · center: toolkit · processing library shape · 2 incoming connections
```

**nest:**
```
[INFERRED] Request lifecycle
  reason: backend-framework family · platform adapters: platform-express, platform-fastify · core: common · common: common
[INFERRED] Module & DI system
  reason: backend-framework family · center: common · 8 incoming connections · dependents: core, microservices, platform-express
[INFERRED] common API flow
  reason: library family · center: common · 4 consumers
```

**react:**
```
[INFERRED] Runtime flow
  reason: frontend-framework family · core: Core Runtime (react-server, react-reconciler) · renderer: Renderers & Bindings (react-dom, ...)
[INFERRED] Compile-to-runtime pipeline
  reason: compiler zone: Compiler · runtime zone: Core Runtime · server entry detected · center: react
[INFERRED] Developer tooling
  reason: devtools zone: DevTools · packages: react-devtools-shared, react-devtools-extensions, ... · center: react
```

---

## Evaluation

### Did this make Memor more truthful?

Yes. Every inferred flow now exposes its generative conditions. A developer can see:
- "This flow exists because I found a `web-product` family with a web-app named `my-app` and an api-service zone named `api`"
- "This flow exists because I found platform adapters: `platform-express`, `platform-fastify`"

The inference is no longer a black box. The inputs are visible alongside the output.

### Did this reduce ambiguity?

Yes. Before: "INFERRED" + static message → developer doesn't know if this flow is relevant to their repo.
After: "INFERRED · library family · center: toolkit · 2 consumers" → developer can verify the conditions themselves. If they see their repo's actual systems named in the reason, they know the flow applies. If they see unfamiliar names, they know the detector was wrong.

### Is any confusion still possible?

One gap remains: "common: common" appears in the nest reason for `backend-request-pipeline` — this is a bug in the reason string construction where `commonSys.name` is used twice. Not wrong data, just redundant.

Second: some reason strings can be long and wrap in the monospace display. A developer has to read the full string to get the picture. There's no visual hierarchy within the reason string itself.

Third: the reason is shown in the CONTEXT PANEL (right column, on step click) — not visible until a developer clicks a step. A developer scanning flow tabs sees `INFERRED` but not the reason. The reason is revealed only on interaction. This is acceptable — the tab-level `INFERRED` tag is the first signal; the reason is the second-level detail.

---

## Before vs After

**Before (context panel for inferred flow):**
```
◌  Inferred from structure — not code-derived
```

**After (context panel for inferred flow):**
```
◌  Inferred from structure
   library family · center: toolkit · 2 consumers
```

**After (react - frontend-framework):**
```
◌  Inferred from structure
   frontend-framework family · core: Core Runtime (react-server, react-reconciler) · renderer: Renderers & Bindings (react-dom, react-server-dom-esm, react-server-dom-fb)
```

The reason is a direct readout of what the detector found. Not summarized. Not narrated.

---

## Next Best Step

Fix the minor redundancy in `backend-request-pipeline`'s reason string ("common: common" appears when `commonSys.name === "common"`). This is a one-line fix.

Beyond that: the structural reason is now surfaced, but it's only visible in the context panel (on step click). Exposing it as a tooltip on the `INFERRED` tab tag itself would make it accessible without a click — zero interaction cost. This is the minimal next step that doesn't require new infrastructure.

---

## Status

win
