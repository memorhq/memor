## Iteration Title

Three Bug Fixes Discovered from Hoppscotch Validation

---

## Date-Time

2026-04-16 14:00:00

---

## Goal

The previous session validated Memor against hoppscotch and found three bugs. Fix all three before any public launch.

---

## Bugs Fixed

### Bug 1: False positive purpose detection (`.spec.ts` counted as Cypress)

**Root cause:** `detectRepoPurpose.ts` counted `.spec.ts` and `.spec.js` files as Cypress spec evidence. Hoppscotch has 171 `.spec.ts` files — all Vitest unit tests, not Cypress. This triggered `e2e-testing-suite` at medium confidence → headline override fired.

**Wrong headline produced:**
```
hoppscotch is a end-to-end test suite — 171 Cypress spec / .cy.* files.
```

**Fix:** Changed spec file predicate to only match `.cy.ts/js/tsx/jsx`. These are unambiguously Cypress. `.spec.*` files are Vitest/Jest in the majority of JS/TS codebases and must not be used as Cypress evidence.

```typescript
// Before
(n) => /\.cy\.(jsx?|tsx?)$/.test(n) || (n.endsWith(".spec.js") || n.endsWith(".spec.ts"))

// After
(n) => /\.cy\.(jsx?|tsx?)$/.test(n)
```

Also adjusted threshold: fires at `specCount >= 5` (was 10) since `.cy.*` files are already unambiguous, so even a small count is meaningful.

---

### Bug 2: Grammar — "a end-to-end" (article before vowel)

**Root cause:** `buildHeadline()` in `generateAhaSummary.ts` always used `"a"` before the purpose phrase, regardless of whether it started with a vowel sound.

**Fix:** Added vowel detection:

```typescript
const article = /^[aeiou]/i.test(purposePhrase) ? "an" : "a";
return `${repoName} is ${article} ${purposePhrase}${evidenceNote}.`;
```

Affected purposes: "end-to-end test suite" → "an end-to-end test suite". API backend service → "an API backend service".

---

### Bug 3: Evidence flows stripping `evidenceFile`, `evidenceLine`, `derivedFrom` (critical)

**Root cause:** Two places in the serialization chain were dropping evidence fields:

1. `RepoFlowSummary` type in `generateRepoStory.ts` defined steps as `{ label: string; description: string }[]` — no evidence fields in the type.

2. `cli.ts` mapped `RepoFlow[]` → `repoStory.flows` with an explicit object spread that listed only: `label`, `description`, `whyItMatters`, `systemName`, `zoneName`. `evidenceFile`, `evidenceLine`, `handlerName`, `derivedFrom`, and `structuralReason` were all dropped.

The flows were built correctly in memory by `buildEvidenceFlows()` — that function sets all fields. But by the time the data reached the frontend, the fields were gone.

**Fix:**

Extended `RepoFlowSummary` in `generateRepoStory.ts`:
```typescript
export type RepoFlowSummary = {
  id: string;
  title: string;
  type: string;
  confidence: string;
  isMain?: boolean;
  derivedFrom?: string;
  structuralReason?: string;
  steps: {
    label: string;
    description: string;
    systemName?: string;
    zoneName?: string;
    evidenceFile?: string;
    evidenceLine?: number;
    handlerName?: string;
  }[];
};
```

Updated mapping in `cli.ts` to pass through all fields.

---

## What Was Observed After Fix

**Hoppscotch (re-run post-fix):**

```
headline: hoppscotch is a product monorepo with hoppscotch-backend,
          hoppscotch-agent, hoppscotch-desktop backed by 6 shared packages.

purpose: null  ← correctly no override

flows:
  ID: evidence-routes-hoppscotch-backend-access-tokens
    derivedFrom: "evidence"  ✓
    step[0] evidenceFile: src/access-token/access-token.controller.ts  ✓
    step[0] evidenceLine: 38  ✓
    step[0] keys: [label, description, systemName, evidenceFile, evidenceLine, handlerName]  ✓

  ID: evidence-routes-hoppscotch-backend-ping
    evidenceFile: src/app.controller.ts:7  ✓

  ID: evidence-routes-hoppscotch-backend-auth
    evidenceFile: src/auth/auth.controller.ts:42  ✓

  ID: evidence-routes-hoppscotch-backend-health
    evidenceFile: src/health/health.controller.ts:19  ✓
```

All four flows: `derivedFrom: "evidence"`, real file:line anchors, no false classification.

---

## Evaluation

### Was the root cause correctly identified?

Yes. The serialization chain in `cli.ts` was the bottleneck — `buildEvidenceFlows()` was always correct. The data was computed and immediately dropped.

### Is there a similar issue in the MCP path?

Yes — `mcp.ts` has an identical step mapping that drops evidence fields. Not fixed in this iteration (MCP outputs are consumed by AI assistants, not the frontend). Tracked for follow-up.

### Confidence in fix?

High. Verified by inspecting the live HTML page served at localhost:9292 — all fields present in the JSON data structure.

---

## Before vs After

| Check | Before | After |
|---|---|---|
| Hoppscotch headline | "a end-to-end test suite" (wrong) | "product monorepo with hoppscotch-backend..." (correct) |
| Purpose | `e2e-testing-suite (medium)` (false positive) | `null` (correctly absent) |
| Flow derivedFrom | `None` | `"evidence"` |
| Flow evidenceFile | absent | `src/access-token/access-token.controller.ts` |
| Flow evidenceLine | absent | `38` |

---

## Next Best Step

MCP path has the same stripping bug — `mcp.ts` step mapping drops `evidenceFile`/`evidenceLine`/`derivedFrom`. Fix mirrors `cli.ts` fix exactly.

Beyond that: the launch benchmark has been defined. Next focus should be the 10-repo validation pass across the repo type matrix (monorepos, framework cores, single services, frontend apps, CLIs, docs sites) before public release.

---

## Status

win
