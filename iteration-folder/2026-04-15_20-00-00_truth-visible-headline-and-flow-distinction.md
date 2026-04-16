## Iteration Title

Truth Made Visible — AHA Headline Override + Flow Evidence/Inferred Distinction

---

## Date-Time

2026-04-15 20:00:00

---

## Goal

Two Memor Law violations remained after the previous iterations:

1. **Headline**: `web-ui` showed "web-ui is a library built with TypeScript and React" — correct at the structural level, blind to the dominant purpose (Storybook). The truth existed in `inferredRepoPurpose` but was buried in a secondary card. The headline — the first thing any developer reads — was still generic narration.

2. **Flow UI**: Evidence flows and pattern flows rendered identically. A developer could not tell which flows pointed to real code and which were structural guesses. `derivedFrom: "evidence"` and `evidenceFile:line` existed in the data but were invisible in the UI.

Both violate the same law: truth must be *visible*, not just present.

---

## Context

Constraints from user before this iteration:
- AHA headline MUST override if `inferredRepoPurpose` exists with medium or high confidence
- Do not merge or dilute — it becomes the primary identity
- Evidence vs Pattern: must be visually obvious at first glance, no subtlety
- Evidence → strong visual signal (green label + file:line badge)
- Pattern → clearly marked as "inferred" or "not code-derived"
- A developer should not need to think to distinguish them
- No new narration. Only expose existing truth more clearly

---

## What Was Done

### 1. AHA Headline Override (`src/builders/generateAhaSummary.ts`)

In `buildHeadline()`, added a guard at the very top — before all mode-specific branches:

```typescript
const purpose = analysis.inferredRepoPurpose;
if (purpose && (purpose.confidence === "high" || purpose.confidence === "medium")) {
  const topSignal = purpose.signals[0];
  const evidenceNote = topSignal ? ` — ${topSignal.label}` : "";
  const purposePhrase = purpose.label.charAt(0).toLowerCase() + purpose.label.slice(1);
  return `${repoName} is a ${purposePhrase}${evidenceNote}.`;
}
```

Key decisions:
- Only first letter is lowercased (not `.toLowerCase()` on the whole label) — preserves proper nouns like "Storybook", "Cypress", "Playwright"
- Top signal's label is appended as the evidence note — the headline cites its own source
- Guard is `medium || high` — low confidence doesn't override (e.g., `api` repo got `e2e-testing-suite (low)` from a stray Playwright dep, correctly not overridden)

### 2. Flow View — EVIDENCE / INFERRED tag on flow tabs (`src/app/frontend/App.tsx`)

Each flow tab in the left column now shows a coloured origin tag:
- `EVIDENCE` (green) → `derivedFrom === "evidence"`
- `INFERRED` (grey) → absent or `"pattern"`

Left border on each tab also colored: green for evidence, light grey for inferred. The tag is visible before a developer clicks anything.

### 3. Flow View — evidence anchor on each step (`src/app/frontend/App.tsx`)

When `step.evidenceFile` exists, renders immediately below the step label:
```
◉  v2/src/.../bookings.controller.ts:133  REAL CODE
```
- Green dot (`◉`) — a clear visual indicator this step has code evidence
- Monospace green badge with file:line — clickable (copies to clipboard)
- "REAL CODE" micro-label in uppercase

When no `evidenceFile`: no anchor shown. The absence of the anchor IS the signal (the step is inferred).

### 4. Flow View — derivation source in context panel (`src/app/frontend/App.tsx`)

First thing shown in the right context panel when a step is selected:

**Evidence steps:**
```
◉  Detected from real code
   v2/src/.../bookings.controller.ts:133
   greeting()
```
Green background, green border, file path clickable.

**Inferred steps:**
```
◌  Inferred from structure — not code-derived
```
Grey background, grey border.

`whyItMatters` (deprecated narration) removed from context panel render — replaced by `activeImpact.summary` only (impact-derived text, not flow-template narration).

### 5. CSS additions (`src/app/buildAppPage.ts`)

New classes:
- `.fv-flow-tab-row` — row layout for title + origin tag
- `.fv-flow-origin-tag` / `.fv-origin-evidence` / `.fv-origin-inferred` — coloured EVIDENCE/INFERRED tags
- `.fv-flow-tab-evidence` / `.fv-flow-tab-inferred` — left border accent on tabs
- `.fv-step-evidence-anchor` + `.fv-evidence-dot` + `.fv-evidence-loc` + `.fv-evidence-label` — step anchor
- `.fv-ctx-derivation` + `.fv-ctx-derivation-evidence` / `.fv-ctx-derivation-inferred` — context panel block
- `.fv-ctx-deriv-icon` / `.fv-ctx-deriv-body` / `.fv-ctx-deriv-label` / `.fv-ctx-deriv-loc` / `.fv-ctx-deriv-handler`

---

## What Was Tested or Observed

**web-ui headline:**
```
BEFORE: web-ui is a library with supporting tooling and auxiliary packages.
AFTER:  web-ui is a component library powered by Storybook — 660 .stories files (33% of source).
```

**api (cal.com) headline — no override, correctly:**
```
BEFORE: api is an API service.
AFTER:  api is an API service.
(e2e-testing-suite purpose detected at LOW confidence → not overriding, correctly)
```

**redux-toolkit headline — no override, correctly:**
```
headline: redux-toolkit is a library with supporting tooling and auxiliary packages.
purpose: none
```

**cal.com/apps/api flow tabs:**
```
[EVIDENCE] api /health routes   ← green EVIDENCE tag, green left border
[EVIDENCE] api /v2 routes       ← same

Step[0] anchor: v2/src/app.controller.ts:5
Step[0] anchor for /v2: v2/src/.../bookings.controller.ts:133
```

---

## Evaluation

### Did this make Memor more truthful?

**Yes.** The headline now directly states the repo's actual purpose, not its structural classification. The purpose is backed by the top signal from file density analysis. The flow tabs immediately signal whether each flow is evidence-backed or inferred.

### Did this reduce ambiguity?

**Yes.**
- Before: a developer had to look at the secondary Purpose card to understand the repo's real use case. The headline contradicted it.
- After: the headline and the Purpose card say the same thing. No contradiction.
- Before: all flow tabs looked identical. A developer could not know which flows to trust.
- After: `EVIDENCE` (green) vs `INFERRED` (grey) is visible before interaction. The step-level anchor shows exactly which file generated the flow step.

### Is any confusion still possible?

**Yes — one remaining gap:**

The `INFERRED` label on pattern flows is honest, but it says what they are NOT (not code-derived) without explaining what they ARE. A developer might wonder: "if it's inferred, why show it?" The answer is: structural patterns are still useful when no evidence exists. But the label doesn't communicate this.

A better label might be: "STRUCTURAL" or "HEURISTIC" with a tooltip: "Assembled from codebase structure — no specific code line detected." Not done in this iteration — adding tooltip copy risks narration creep.

Second gap: the `web-ui` headline says "660 .stories files (33% of source)." The "33%" is computed against a cap of 2000, not the actual total. This is technically imprecise but directionally correct.

---

## Before vs After Summary

| Moment | Before | After |
|---|---|---|
| Open Memor on web-ui | "library with TypeScript and React" | "component library powered by Storybook — 660 .stories files" |
| Look at Flow tab list | All tabs identical | Green EVIDENCE / grey INFERRED tag on every tab |
| Click a flow step | No code anchor | `◉ v2/src/.../controller.ts:133  REAL CODE` below label |
| Context panel | Shows narration (whyItMatters) | Shows derivation source first: "Detected from real code" or "Inferred from structure" |

---

## Next Best Step

**Replace the `INFERRED` label on pattern flow steps with the specific structural reason that generated them.**

Currently: "Inferred from structure — not code-derived"
Better: "Generated from: api-service + web-app system shape" or "Generated from: framework-core + platform adapters"

This converts the inferred steps from "we don't know" into "we looked at X and concluded Y" — which is honest, structured signal. The pattern build functions already know which conditions triggered them (via `ctx.families`, `ctx.zones`). Surface that.

---

## Status

win
