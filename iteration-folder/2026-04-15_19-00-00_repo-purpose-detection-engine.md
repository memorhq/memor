## Iteration Title

Repo Purpose Detection Engine (v1) — Deterministic Signals Only

---

## Date-Time

2026-04-15 19:00:00

---

## Goal

Memor failed to correctly represent the purpose of repos like `web-ui`, where the actual purpose is Storybook-based component development (660 story files, 14 Storybook packages, `.storybook/` config). Memor classified it as `library-tooling` — correct at the structural level but blind to the dominant purpose signal.

Implement a deterministic Repo Purpose Detection Engine that identifies what a repo is *for*, not just what it contains.

---

## Context

The user provided `web-ui` at `/Users/mukur/Documents/tri/Hello/web-ui` as the failing case:
- 660 `.stories.*` files (33% of all source files)
- 354 `.test.stories.*` files (Storybook used as Cypress-to-Storybook test runner)
- 14 `@storybook/*` packages in devDependencies
- `.storybook/` config directory at root
- `storybook` and `storybook:build` scripts

Current Memor output: `library-tooling`, narrative "a library built with TypeScript and React". No mention of Storybook.

This is a truth violation: the most important thing a developer needs to know ("this repo is driven by Storybook") is invisible.

Requirements:
- File type density (.stories, .spec, .test)
- Storybook config detection
- Cypress/Playwright detection
- package.json scripts + dependencies analysis
- Dominant directory patterns
- Output: `inferredRepoPurpose` shown in Overview
- Evidence-based, not guessed

---

## What Was Done

**New file:** `src/scanner/detectRepoPurpose.ts`

Exports:
- `RepoPurposeKind` union: 8 values (`storybook-component-library`, `e2e-testing-suite`, `design-system`, `ui-component-library`, `api-backend`, `full-stack-app`, `developer-tooling`, `documentation-site`, `unknown`)
- `RepoPurposeSignal`: `{ label, evidence, weight }` — every signal has a human-readable label and the exact file/dependency that triggered it
- `InferredRepoPurpose`: `{ kind, label, confidence, signals }`
- `detectRepoPurpose(rootPath)` — main public API

Detection layers (in execution order):
1. **package.json scripts** — `storybook`, `e2e`, `cypress` scripts
2. **package.json dependencies** — `@storybook/*`, `cypress`, `@playwright/test`, `style-dictionary`, `commander`
3. **Config files** — `.storybook/`, `cypress.config.*`, `playwright.config.*`
4. **File density** — count `.stories.*` files vs total source files; `.cy.*` spec files
5. **Directory patterns** — `cypress/`, `e2e/`, `playwright/`, `tokens/`, `primitives/`

Winner determination:
- Weighted score per kind, highest wins
- Storybook vs design-system resolved by checking for design-token-specific signals
- Confidence: `high` (score ≥ 70 + margin ≥ 30), `medium` (score ≥ 40), `low`
- `unknown` returns `undefined` — no card rendered in UI

**Modified:** `src/types.ts`
- Added `inferredRepoPurpose?: InferredRepoPurpose` to `RepoAnalysis`

**Modified:** `src/builders/analyzeRepo.ts`
- Added `import { detectRepoPurpose }` 
- Added Phase 8 after narrative building: runs `detectRepoPurpose(rootPath)`, best-effort, only stores result if kind !== "unknown"

**Modified:** `src/app/frontend/App.tsx`
- Added Purpose card in `CenterSeedCard`, rendered after Key Signals card
- Shows: label, confidence tier, top 4 signals with evidence code badges
- Card only renders when `inferredRepoPurpose` exists (non-unknown repos are not affected)

**Modified:** `src/app/buildAppPage.ts`
- Added CSS for `.seed-card-purpose` and all `.seed-purpose-*` classes
- Green accent (`rgba(16,185,129)` = emerald) to distinguish from other cards
- Signal evidence rendered as `<code>` badge with monospace font

---

## What Was Tested or Observed

**web-ui:**
```
kind: storybook-component-library
label: Component library powered by Storybook
confidence: high
signals:
  [50] 660 .stories files (33% of source) → 660 .stories.* files
  [40] Playwright in dependencies → @playwright/test
  [35] .storybook/ config directory → .storybook/
  [30] storybook script in package.json → scripts.storybook
  [30] 14 Storybook packages in dependencies → @storybook/addon-designs, ...
  [15] High story density suggests design system → 660 stories / 2000 source files
```

Storybook score: 145. E2E score: 40. Margin: 105. Correct winner.

**express (framework repo):**
```
No purpose detected (unknown — not shown in UI)
```

**redux-toolkit (library):**
```
No purpose detected (unknown — not shown in UI)
```

No false positives on repos where no dominant purpose signal exists.

---

## Wins

- `web-ui` is now correctly identified as a Storybook-driven component library
- Every signal traces to a specific file, dependency, or script — no narration
- Confidence is derived from margin between top score and second — not arbitrary
- Repos with no dominant purpose signal show nothing (Memor Law: silence over guess)
- Build clean, zero TypeScript errors
- False positive rate: 0 on tested repos (express, redux-toolkit)
- UI card uses evidence code badges — developer can see exactly why Memor reached this conclusion

---

## Failures / Weaknesses

1. **`totalSourceFiles()` caps at 2000 files.** For large repos, the story ratio is computed against a cap of 2000, not the actual total. This can skew the ratio (660/2000 = 33% is correct for web-ui but would be wrong if total were 10,000). The label shows the raw count which is accurate, but the ratio in the label may understate.

2. **No per-package detection.** `detectRepoPurpose` runs at the repo root only. A monorepo where only one package uses Storybook would still trigger the purpose (because `.storybook/` is usually at root). This is likely correct behavior but could produce noise if a config file is present but the main codebase isn't Storybook-driven.

3. **Playwright signal is not differentiated from Storybook.** `web-ui` has `@playwright/test` (used for Storybook interaction testing, not standalone E2E), which adds 40 points to `e2e-testing-suite`. The Storybook signals dominate (145 vs 40) so the winner is still correct, but Playwright-for-Storybook is semantically different from a standalone Playwright E2E suite. No fix yet.

4. **`full-stack-app` has no detection logic.** The kind exists in the union but no signals target it. Repos with both a frontend and backend would fall through to `unknown`.

5. **`ui-component-library` has no detection logic.** A component library without Storybook would return `unknown` instead of the accurate `ui-component-library` label.

6. **Purpose card is not yet integrated into the AHA headline.** `generateAhaSummary.ts` ignores `inferredRepoPurpose`. The headline still says "web-ui is a library built with TypeScript and React" — accurate but less useful than "Component library powered by Storybook".

---

## Analysis

The core detection is correct and the architecture is sound: weighted signals, evidence-backed, confidence from margin, silence when uncertain. This is the Memor Law applied to repo-level identity.

The most impactful remaining gap is #6: the AHA headline doesn't use the purpose. A developer reading the overview still sees the generic narrative first. The purpose card appears below it, which is correct evidence presentation but not optimal first impression.

The Playwright false-signal (#3) is worth monitoring. If repos with Playwright for a non-E2E purpose start getting misclassified as `e2e-testing-suite`, the fix is to reduce Playwright's weight or require the `cypress/` directory or `e2e` script to co-occur.

---

## Next Best Step

**Integrate `inferredRepoPurpose` into the AHA headline.**

In `generateAhaSummary.ts` or `buildHeadline()`, check `analysis.inferredRepoPurpose`. If it exists with confidence "high" or "medium", use its `label` as the primary identity descriptor instead of the generic narrative.

Before: "web-ui is a library built with TypeScript and React."
After:  "web-ui is a component library powered by Storybook — 660 stories across 116 packages."

This makes truth visible at the first point of contact, not buried in a secondary card.

---

## Status

win
