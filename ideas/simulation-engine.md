# Simulation Engine — Bae's Internal Validation System

**Origin:** Mukur's instruction to Bae on 2026-04-16
**Purpose:** Run simulations on real repos to calculate: efficiency, usefulness, habit-builder score, and AHA moments — before shipping to real developers.

---

## Why This Exists

Bae cannot feel the developer's pain. But Bae can simulate it.

Every time Memor changes, Bae should run a simulation: open 10 repos, measure what the output looks like from a developer's eyes, score it, and report back. Not "the code compiles" — but "would a developer get an AHA moment from this?"

That is the difference between a passing test and a useful product.

---

## What the Simulation Measures

### 1. Efficiency Score
- Time from `memor ./repo` to first meaningful output (target: <5 seconds)
- Number of systems detected vs ground truth (manually known)
- Classification accuracy: correct type (api-service, web-app, etc.) vs wrong

### 2. Usefulness Score
- Does the headline describe what the repo actually IS? (1–5 rating)
- Are the top 3 systems the ones a developer would actually care about?
- Does the recommended start file make sense for a new developer?
- Are flows real (evidence) or boilerplate (pattern)?

### 3. Habit Builder Score
- Would a developer come back to this canvas tomorrow?
- Does the health layer show something actionable? (dead files, coupling warnings)
- Is there at least 1 signal that changes between commits?
- Does the canvas update feel "alive" or "static"?

### 4. AHA Moment Score
- Is there one thing on the canvas the developer did NOT know before looking?
- Does the blast radius surface a non-obvious dependency?
- Does the connection graph reveal a coupling the developer didn't intend?

**A 0 on AHA = useless tool. A 1+ on AHA = reason to come back.**

---

## The Simulation Test Corpus

10 repos, covering the full type matrix:

| Repo | Type | Known ground truth |
|---|---|---|
| hoppscotch/hoppscotch | product monorepo | ✓ validated |
| nestjs/nest | framework-core | backend-framework |
| expressjs/express | single api-service | minimal, 1 system |
| reduxjs/redux-toolkit | library-tooling | library, not app |
| chakra-ui/chakra-ui | ui-component-library | NOT monorepo-app |
| sveltejs/svelte | compiler-framework | NOT types-package |
| twentyhq/twenty | product monorepo | backend + frontend |
| vercel/next.js | framework-core | with platform adapters |
| calcom/cal.com | full-stack-app | Next.js + api |
| facebook/docusaurus | documentation-site | docs framework |

---

## How Bae Runs a Simulation

```
For each repo in corpus:
  1. Run memor analysis
  2. Score: efficiency, usefulness, habit, AHA
  3. Flag any classification errors (wrong type, false purpose override)
  4. Flag any flows that are pure boilerplate (no evidenceFile)
  5. Produce a scorecard

Aggregate:
  - Overall accuracy %
  - AHA moment rate (% of repos with at least 1)
  - Boilerplate flow rate (% of flows that are pattern, not evidence)
  - False purpose override rate
```

---

## The Target Before Public Launch

| Metric | Target |
|---|---|
| Classification accuracy | ≥ 80% correct system types |
| AHA moment rate | ≥ 70% of repos (7/10) |
| Boilerplate flow rate | ≤ 40% (mostly evidence flows) |
| False purpose override | 0% (zero false headlines) |
| Efficiency (time to output) | < 5 seconds on <100k line repos |

If these targets are not met, Memor does not ship to Product Hunt.

---

## Next Step

Build a CLI command: `memor simulate ./corpus-list.txt`
- Takes a list of repo paths
- Runs analysis on each
- Outputs a scorecard JSON
- Bae reads the scorecard and flags regressions

This is Memor's CI — not for code correctness, but for product usefulness.
