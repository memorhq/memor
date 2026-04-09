# Future Implementations for Memor

Ranked by developer value. Each feature maps to the 6 developer roles: New Hire, Tech Lead, Senior Dev, OSS Contributor, Engineering Manager, Freelancer.

---

## 1. PR Impact Analysis (git diff awareness)

Today memor analyzes a static snapshot. If it could analyze a git diff or branch comparison, it would show: "This PR touches 3 systems, blast radius 67, affects the checkout flow at step 4."

**Who it helps:**

- **Tech Lead**: Reviews PRs with data instead of mental mapping. Memor could comment on GitHub PRs automatically.
- **Senior Dev**: Before opening a PR, they run `memor diff main` and get a blast radius report for their changes.
- **Eng Manager**: Dashboard of "riskiest PRs this sprint" based on blast radius scores.

**Why it's #1:** Every developer, every day, every PR. This makes memor a daily-use tool, not a one-time exploration tool.

---

## 2. Dynamic Impact — "What if I change X?"

Instead of selecting an existing system, the user describes a planned change in natural language — "I want to replace Prisma with Drizzle" — and memor shows the predicted impact across all flows and systems.

**Who it helps:**

- **Senior Dev**: Plans refactors with confidence before writing code
- **Tech Lead**: Evaluates architectural proposals with quantified impact
- **Freelancer**: Scopes client requests accurately — "switching your ORM would touch 8 systems"

**Implementation path:** Requires finer-grained graphs (block/export level), intent-to-scope resolution (possibly LLM-assisted), and change-type-aware traversal.

---

## 3. Shareable Static Reports

Export memor output as a static HTML page or PDF that can be shared without running memor. Embed in Confluence, attach to PRs, send to clients.

**Who it helps:**

- **Freelancer**: Send the client an architecture report before the first meeting — instant credibility
- **Eng Manager**: Attach architecture snapshots to quarterly reviews
- **OSS Contributor**: Maintainers embed memor output in CONTRIBUTING.md — contributors get instant orientation without cloning

**Implementation:** `memor --export report.html` generates a self-contained HTML file with all 4 views baked in.

---

## 4. CI / Architecture Guard

Run memor in CI and fail the build if: a new coupling is introduced between zones that shouldn't be coupled, blast radius exceeds a threshold, or a system's connection count crosses a limit.

**Who it helps:**

- **Tech Lead**: Enforce architecture boundaries automatically — "no direct imports from UI layer to Data layer"
- **Senior Dev**: Refactoring protection — CI catches unintended new dependencies
- **Eng Manager**: Architecture quality metrics over time in CI dashboards

**Implementation:** `memor guard --max-blast-radius 70 --forbidden-coupling "UI->Data"` returns exit code 1 on violation.

---

## 5. Multi-Language Support (Python, Go, Java)

Memor today is TypeScript/JavaScript only. Tree-sitter-based parsing would unlock Python (Django, FastAPI), Go (microservices), Java (Spring Boot), and Rust.

**Who it helps:**

- **All roles**: The same "10-second orientation" for any codebase, not just JS/TS
- **Freelancer**: Most client projects aren't just JS — Python backends, Go microservices
- **OSS Contributor**: The majority of popular open-source projects are not JavaScript

**Implementation path:** Tree-sitter grammars for import/export extraction per language. Structure detection (systems, zones) is already language-agnostic. Flow and impact logic needs language-aware import resolution.

---

## 6. Team Ownership Mapping (CODEOWNERS integration)

Parse `CODEOWNERS` or git blame to map systems to teams. Show "Team A owns 4 systems across 2 zones, Team B owns 8 systems in 1 zone."

**Who it helps:**

- **Eng Manager**: Team allocation becomes data-driven — "Team B owns too many systems, we need to split"
- **Tech Lead**: PR routing — "This PR touches billing (Team A) and auth (Team B), you need cross-team review"
- **New Hire**: "Who do I ask about the billing system?" — memor tells them the team, not just the files

**Implementation:** Parse CODEOWNERS, map paths to systems, add `owner` field to MemorSystem, show in Overview and Structure detail panels.

---

## 7. Temporal / Historical View — "How is the architecture changing?"

Run memor on multiple git snapshots and show: which systems are growing, which are shrinking, which couplings are getting tighter over time, which zones are becoming bottlenecks.

**Who it helps:**

- **Eng Manager**: "Our core-api blast radius went from 45 to 82 in 6 months — we have an architectural debt problem." This is the data they need to justify refactoring to leadership.
- **Tech Lead**: Spot architectural drift before it becomes a crisis — "auth and billing coupling has increased 40% since Q2"

**Implementation:** `memor history --since 6m` runs analysis on HEAD, HEAD~30, HEAD~60, etc. and diffs the RepoAnalysis results. New view: Timeline showing system count, coupling count, blast radius over time.

---

## 8. Function-Level / Export-Level Depth

Current connections are system-to-system. With Tree-sitter, memor could show: "billing exports `calculateInvoice()` which is consumed by subscriptions, webhooks, and admin-panel."

**Who it helps:**

- **Senior Dev**: Refactoring at function level — "If I change this export, exactly 3 consumers break"
- **New Hire**: "What does billing actually expose?" — see the public API surface of any system
- **Tech Lead**: Detect over-exposed systems — "billing exports 47 functions, only 12 are used"

**Implementation:** Tree-sitter extracts exported symbols per system. Import resolution maps consumers to specific exports. New "Exports" section in Structure detail panel.

---

## 9. Search / "Ask Memor"

Natural language search: "Where does payment processing happen?" returns the system, zone, flow step, and file paths.

**Who it helps:**

- **New Hire**: Instead of browsing the Structure view manually, they type their question
- **OSS Contributor**: "Where does email sending happen?" — direct answer with file paths
- **Freelancer**: Fastest possible onboarding — ask, don't browse

**Implementation options:**
- Simple: keyword search across system names, descriptions, flow labels, zone names — no LLM needed
- Advanced: MCP integration where an AI assistant queries memor's structured data

---

## 10. Test Coverage Mapping

Show which systems have tests, which don't, and which high-impact systems are untested — the riskiest blind spots.

**Who it helps:**

- **Eng Manager**: "Our highest blast-radius system has 0% test coverage" — this is the most dangerous sentence in engineering, and memor could surface it
- **Tech Lead**: Prioritize test writing by risk — test the highest-impact untested systems first
- **Senior Dev**: Before refactoring, know which affected systems have a safety net and which don't

**Implementation:** Detect test directories/files per system (already partially done via `inferredSupportRole: "test-harness"`). Cross-reference test file count with system importance score. Add "Test Coverage" indicator to Impact view.

---

## Priority Matrix

| Priority | Feature | Daily Use? | Unique to Memor? | Implementation Effort |
|---|---|---|---|---|
| 1 | PR Impact Analysis | Yes | Yes | Medium |
| 2 | Dynamic Impact | Weekly | Yes | High |
| 3 | Shareable Reports | Weekly | No | Low |
| 4 | CI Architecture Guard | Every commit | Yes | Medium |
| 5 | Multi-Language | Yes | No | High |
| 6 | Team Ownership | Weekly | No | Low |
| 7 | Temporal View | Monthly | Yes | Medium |
| 8 | Function-Level Depth | Daily | No | High |
| 9 | Search | Daily | No | Low-Medium |
| 10 | Test Coverage | Weekly | Partially | Medium |

---

## Strategic Note

Features 1-4 (PR Impact, Dynamic Impact, Shareable Reports, CI Guard) are about making memor a **workflow tool** — something developers use every day, not just when they join a project. This is the difference between a tool people try once and a tool people can't live without.

Features 5-8 (Multi-Language, Ownership, Temporal, Function-Level) are about **depth and reach** — making memor work for more codebases and surface deeper insights.

Features 9-10 (Search, Test Coverage) are **convenience and trust** — making the existing experience smoother and more actionable.

The highest-leverage path: ship PR Impact Analysis first. It turns memor from "run once to understand" into "run on every PR to stay safe."
