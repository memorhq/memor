## Iteration Title

Suppress HTTP Template Flows When Evidence Flows Exist

---

## Date-Time

2026-04-15 17:22:00

---

## Goal

Remove template-based HTTP pattern flows (web-user-journey, web-data-flow, express-server-flow) from repos where real route evidence already exists. Under the Memor Law, a template flow alongside evidence flows is noise — it dilutes signal and misleads developers about which flows to trust.

---

## Context

MVP3 left a specific weakness: evidence flows and pattern flows coexisted in the output. A repo like cal.com/apps/api would show:
1. Real evidence flows: `GET /v2/bookings → bookings.controller.ts:133`
2. Template flows: "User action triggers request → API handles → DB → Render response"

The second is narration with no code anchor. It violates the Memor Law. It also creates confusion — the developer can't tell which flows point to real code.

The iteration note from MVP3 identified this as the "Next Best Step": filter pattern flows for systems that already have detected routes.

---

## What Was Done

**Modified:** `src/builders/generateRepoFlows.ts`

Added two new structures in the `generateRepoFlows()` function, before the pattern loop:

1. `systemTypesWithEvidence` — a Set of system types (`api-service`, `web-app`, `worker`) that have detected routes
2. `HTTP_TEMPLATE_PATTERNS` — a Set of pattern IDs that are redundant when evidence exists:
   - `web-user-journey` — "Browser → Frontend → API → DB" (generic, no code anchors)
   - `web-data-flow` — "User action → API handles → DB → Render" (generic)
   - `express-server-flow` — "HTTP request arrives → Route handlers → DB → Response" (generic)
3. `hasHttpEvidence` — boolean derived from `systemTypesWithEvidence`

In the pattern loop, added a guard before `pattern.match(ctx)`:
```typescript
if (hasHttpEvidence && HTTP_TEMPLATE_PATTERNS.has(pattern.id)) continue;
```

Non-HTTP patterns (web-dev-loop, backend-module-system, library-api-flow, build-infra, etc.) are not affected — they remain even when route evidence exists because they describe orthogonal concerns (dev workflow, DI system, build pipeline).

---

## What Was Tested or Observed

**cal.com/apps/api (api-service with 81 routes):**
```
Before: 5+ flows including web-user-journey, web-data-flow, express-server-flow + evidence flows
After:  2 flows, both evidence
  [evidence] evidence-routes-api-health: api /health routes (confidence: high)
  [evidence] evidence-routes-api-v2: api /v2 routes (confidence: high)
```

**redux-toolkit (library, no routes):**
```
Before: 2 pattern flows
After:  2 pattern flows (unchanged — no route evidence, no suppression)
  [pattern] library-api-flow: toolkit API flow
  [pattern] library-runtime-flow: toolkit processing pipeline
```

**nest (shared-packages, no routes detected):**
```
4 pattern flows: backend-request-pipeline, backend-module-system, library-api-flow, library-runtime-flow
All preserved — backend-request-pipeline is for framework repos (NestJS itself), not app repos, so not in suppression list
```

---

## Wins

- cal.com API now shows only clean, evidence-backed flows — zero template noise
- Repos without route evidence are fully unaffected
- The `web-dev-loop` pattern (development loop) is not suppressed — it describes the dev workflow cycle, not request flow, and remains valid even for repos with evidence
- Build is clean (tsc --noEmit passes)
- Zero regressions on redux-toolkit, nest, fastify

---

## Failures / Weaknesses

1. **`web-dev-loop` is still a template.** It's not suppressed (correctly — it describes devex, not request flow). But it still has no code evidence. It's narration about git → build → test → deploy. Not yet actionable.

2. **`backend-request-pipeline` is not suppressed** even when the analyzed repo is an Express/Fastify APP (not the framework itself). If someone analyzes their own Express app and Memor detects zero routes (because the app uses non-standard patterns or the route detector missed them), the template pipeline still appears. This is an edge case but a real one.

3. **No visual distinction in the UI.** Evidence flows and pattern flows still render identically in the frontend. The `derivedFrom` field exists but is not shown. A developer still cannot see at a glance which flows to trust.

4. **Suppression happens at system-type level, not system-instance level.** If a repo has two `api-service` systems and only one has routes detected, the pattern flows are still suppressed for both because `systemTypesWithEvidence` contains `"api-service"`. This is acceptable conservatism (evidence in any API service means the template is redundant) but could miss edge cases.

5. **Template flows for the dev loop (`web-dev-loop`) still use `whyItMatters` narration.** Not yet removed.

---

## Analysis

The suppression is correct and the implementation is minimal (one guard condition, one set). The Memor Law is now enforced at the flow generation layer for HTTP repos:

> "If Memor cannot derive a flow from real code, it must not invent one."

For API service repos with routes detected, Memor no longer invents flows. It only shows what it found.

The remaining gap is the UI — the data is honest but the display is uniform. Evidence flows and pattern flows look identical in the React frontend. A developer reading the output has no visual cue that some flows are anchored to real code and others are structural guesses. This is the next law violation to fix.

---

## Next Best Step

**Add visual evidence anchors to flow steps in the frontend.**

For steps with `evidenceFile` + `evidenceLine`: render a `file:line` badge/link below the step label.
For flows with `derivedFrom: "evidence"`: show a green "evidence" chip or label.
For flows with `derivedFrom: "pattern"` (or absent): show a grey "inferred" label.

This makes truth *visible*, not just present in the data. A developer should immediately see which flows point to real code.

---

## Status

win
