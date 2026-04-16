## Iteration Title

MVP3 — Route Detection, DB Operation Detection, Evidence-Backed Flows

---

## Date-Time

2026-04-15 18:00:00

---

## Goal

Replace Memor's template-based flow system with flows derived from real code evidence. Implement AST-based route detection (Express, Fastify, NestJS) and database operation detection (Prisma, Drizzle, Mongoose, Knex, raw SQL). Establish the `derivedFrom: "evidence" | "pattern"` distinction across all flows.

---

## Context

Memor violated its own product law ("MRI not poet") in the flow layer. Flows like "Inbound HTTP request → Router dispatches → Service logic runs → Database" were template strings assembled from framework shape, not actual code. They looked confident but pointed to nothing real. This was identified as the primary law violation after the Memor Law was formally stated.

Secondary drivers:
- Single-package repos showed "self-contained system, no dependencies" for impact — useless for developers
- AHA headline called any single-system unknown-mode repo "a monorepo" regardless of system count
- Template flows had `whyItMatters` fields with pure narration ("The user sees the result — the whole flow exists to serve this moment")

---

## What Was Done

**New files:**
- `src/scanner/walkImports.ts` — AST-based import path extractor using @babel/parser. Returns relative import paths from any JS/TS/JSX/TSX file. No native binaries.
- `src/scanner/buildImportGraph.ts` — Builds reverse dependency map (file → importers). Computes `hotFiles` (ranked by direct importer count) and `interconnectednessScore` (0–100). Skips test/example/demo dirs.
- `src/scanner/detectRoutes.ts` — Detects HTTP route registrations from source files. Handles: Express/Hono/Koa (`app.get('/path', handler)`), Fastify (`fastify.route({method, url})`), NestJS (`@Controller` + `@Get/Post/...` decorators including object form `@Controller({path: '...'})` and `export class`). Each result: `{method, path, file, line, handlerName, framework, confidence}`.
- `src/scanner/detectDBOps.ts` — Detects real DB operations. Handles: Prisma (`prisma.model.method()`), Drizzle (`.select()/.insert()` off `db`), Mongoose (PascalCase model + CRUD method), Knex (`knex('table')`), Sequelize, raw SQL strings/template literals. Each result: `{operation, model, client, file, line, confidence}`.

**Modified files:**
- `src/types.ts` — Added `detectedRoutes?: DetectedRoute[]`, `detectedDBOps?: DBOperation[]` to `MemorSystem`. Added `evidenceFile?`, `evidenceLine?`, `handlerName?` to `FlowStep`. Added `FlowDerivation = "evidence" | "pattern"`. Added `derivedFrom?: FlowDerivation` to `FlowSkeleton`. Deprecated `whyItMatters` in `FlowStep`.
- `src/builders/analyzeRepo.ts` — Phase 6b: after internal architecture, runs `detectRoutes` for `api-service`/`web-app`/`worker` systems and `detectDBOperations` for all non-support systems. Best-effort (never blocks analysis).
- `src/builders/generateRepoFlows.ts` — Added `buildEvidenceFlows()` function. Evidence flows are prepended to all repo-level flows. Each evidence flow step carries `evidenceFile` + `evidenceLine`. Added `derivedFrom` to `RepoFlow` type. Deprecated `whyItMatters` (kept in type to avoid mass edits of 1200-line template body).
- `src/builders/analyzeChangeImpact.ts` — Added `ImportGraphStats` parameter. For self-contained (no cross-system connections) primary systems, shows real hot files by importer count instead of "self-contained, no dependencies." Blast radius score now reflects actual interconnectedness.
- `src/cli.ts` — Builds import graph for self-contained primary systems before calling `analyzeChangeImpact`. Route/DB stats flow through analysis pipeline.
- `src/builders/generateAhaSummary.ts` — Fixed `buildHeadline` for unknown-mode repos. Single-system repos now get type-specific headlines ("is an API service built with React and Express"). Grammar fix for "1 zones" → "1 zone". Single runnable uses "an app", multiple runnables use "a monorepo".

**Dependencies added:**
- `@babel/parser` — pure JavaScript AST parser, no native binaries
- `@babel/traverse` (installed but not used — manual AST walk used instead)

---

## What Was Tested or Observed

**Route detection — NestJS (nest/integration/hello-world):**
```
GET  /hello                  src/hello/hello.controller.ts:10  greeting
GET  /hello/async            src/hello/hello.controller.ts:16  asyncGreeting
GET  /host                   src/host/host.controller.ts:13    greeting
GET  /host/local-pipe/:id    src/host/host.controller.ts:29    localPipe
```
15 routes, 85ms. Each has real file:line.

**DB detection — cal.com/apps/api:**
81 DB ops detected. Examples:
```
prisma  booking      findUnique   repositories/bookings.repository.ts:15
prisma  booking      findMany     repositories/bookings.repository.ts:23
prisma  eventType    create       event-types.repository.ts:31
```

**Evidence flows — cal.com:**
```
FLOW: api /v2 routes | derivedFrom: evidence | confidence: high
  GET /v2/bookings          → v2/src/.../bookings.controller.ts:133
  GET /v2/bookings/:bookingUid → v2/src/.../bookings.controller.ts:168
  GET /v2/bookings/:bookingUid/reschedule → ...controller.ts:182
```

**Import graph — fastify:**
```
Total files: 51, Score: 88
lib/symbols: 19 importers
lib/errors:  17 importers
types/utils: 13 importers
```
Impact summary: "fastify is internally interconnected — 2 core modules imported by most of the codebase (e.g. symbols used by 37% of files)."

**AHA headline fix:**
- Before: "test-coverage-ui is a monorepo with test-coverage-ui and 0 shared packages across 1 zones."
- After:  "test-coverage-ui is an API service built with React and Express."

**Timing:**
- express: 0.14s
- fastify: 0.17s
- nest:    0.50s
- cal.com: 3.0s (large monorepo, 30 systems, 81 routes + 81 DB ops detected)

---

## Wins

- Route detection is real: every step points to a file and line number
- DB detection is real: model + operation + file:line
- Evidence flows and pattern flows are now structurally distinct (`derivedFrom`)
- Single-package impact view no longer says "self-contained, no dependencies" — shows actual internal blast radius based on import counts
- AHA headline is type-specific and grammatically correct for single-system repos
- Zero regressions across express, fastify, nest, redux-toolkit, cal.com
- NestJS decorator detection handles both string form `@Controller('/path')` and object form `@Controller({path: '/path', host: '...'})`
- `export class` controllers properly detected (not just bare class declarations)

---

## Failures / Weaknesses

1. **Frontend does not yet distinguish evidence vs pattern flows visually.** The `derivedFrom` field exists on flows and steps have `evidenceFile`/`evidenceLine`, but the React UI renders all flows identically. A developer sees evidence flows and template flows in the same style — no indication of which is trustworthy.

2. **`whyItMatters` field still exists** in the type and in ~50+ places in `generateRepoFlows.ts`. It's deprecated but not removed. The narration is still serialized into the output (even if not rendered). This is a technical debt that violates the law in the data layer even if not in the view layer.

3. **Template flows still run after evidence flows.** If a repo has evidence flows from routes AND still triggers pattern flows (e.g. "User journey", "Data request flow", "Development loop"), both appear. The pattern flows add noise — they should be suppressed when evidence flows exist for the same system.

4. **No call chain tracing.** Route detection stops at the handler function. We don't follow what the handler calls (service functions, DB operations from within a handler). So a flow step shows `GET /v2/bookings → bookings.controller.ts:133` but not what `bookings.controller.ts:133` calls next.

5. **DB ops not linked to routes.** We detect routes in one pass and DB ops in another — no connection is made between "this route calls this DB operation." The evidence chain is incomplete.

6. **NestJS route detection skips non-HTTP patterns.** `@MessagePattern`, `@EventPattern`, gRPC decorators are not detected. Microservice controllers show 0 routes.

7. **Express repos with no registered routes show 0.** Express itself is a framework, not an app. This is correct behavior but the route detection is not running on app-level repos because those weren't in the test set. Need to test against actual Express apps.

8. **Drizzle detection is weak.** Only detects direct `db.select/insert/update/delete` — misses chained forms like `db.select({...}).from(users).where(...)`. Model name is not extracted.

9. **`buildFlowSkeletons.ts` (per-system flows) not updated.** The per-system `FlowSkeleton[]` on each `MemorSystem` still uses the old template builder. These flow skeletons are shown in the Focus View. They don't use `detectedRoutes` yet.

---

## Analysis

The core infrastructure is in place: real AST parsing, real route extraction, real DB detection, evidence vs pattern flow distinction. This is the right foundation.

The biggest gap is the **rendering layer**. The data is correct but the UI treats evidence flows and pattern flows identically. This means the developer gets no signal about which flows to trust. Under the Memor Law, this is still a problem — truth must be *visible*, not just present in the data.

The second gap is the **incomplete evidence chain**. Route → handler is detected. Handler → service → DB is not. So the flow is still half-evidence. A developer seeing `GET /v2/bookings → bookings.controller.ts:133` doesn't know what that controller does. The next step is call chain tracing within handler bodies.

Pattern: every new layer of evidence (routes → call chains → DB ops) makes flows more real. We're one layer deep. Two more layers needed for full chain.

---

## Next Best Step

**Suppress pattern flows for systems that already have evidence flows.**

In `generateRepoFlows.ts`, after building evidence flows, skip any pattern flow whose primary system already has detected routes. This immediately removes template noise from repos where we have real data. Zero new code required — just a filter condition in the existing pattern loop.

This is the smallest evolutionary unit that removes a law violation without requiring new infrastructure.

---

## Status

partial win
