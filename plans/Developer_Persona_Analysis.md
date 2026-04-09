# How Memor Solves Real Problems for 6 Developer Roles

---

## Role 1: The New Hire (0-90 days at a company)

### Their reality

They just joined a team with a 200k+ line monorepo. They have a Jira ticket that says "Fix the webhook retry logic in the billing service." They open the repo and see 47 directories. They don't know which directory is "billing." They don't know what calls what. They spend 3 days asking teammates "where does X live?" and tracing `import` statements manually before writing a single line of code.

### What they do today

- Read outdated Confluence pages that describe the architecture from 2 years ago
- Ask senior devs to do a "walkthrough" (which takes 1-2 hours of someone else's time)
- Randomly open files and try to piece together mental models
- Use `grep` to find function names and trace call chains manually

### How memor helps them — specifically

**Overview (first 10 seconds):**

- They see "product-domain-machine" with "31 systems (3 primary, 6 secondary, 22 support)" and immediately understand the scale
- Tech chips show "Next.js, Prisma, tRPC, TypeScript" — now they know the stack without asking anyone
- Entry point shows `apps/web/src/app/layout.tsx` with "app shell — wraps all pages" — they know where to start reading
- Flow preview shows "User visits → App routes → tRPC handler → Prisma query → Response" — they understand the runtime story in one glance

**Structure (next 2 minutes):**

- Radial map shows zones: "API / BFF Layer", "Core Domain", "UI Layer", "Data Layer" — they now see the architecture as zones, not folders
- They click "Core Domain" zone and see the systems inside: `billing`, `auth`, `users`, `subscriptions`
- They click `billing` and the detail panel shows: "Why it matters: Shared foundation that auth and subscriptions rely on" — now they understand the dependency direction
- Connection arrows show `billing → prisma-client` (relies on) and `webhooks ← billing` (consumed by) — they found the webhook system without asking anyone

**Flow (next 5 minutes):**

- They select the "Webhook Processing" flow and see step-by-step: Webhook received → Validate signature → Route to handler → Update billing state → Notify subscribers
- Each step shows the system responsible and the key files — they now know exactly which files to open
- Copy button on file paths — they paste directly into their editor

**Impact (before their PR):**

- They select `billing` and see 7 systems affected, 3 high-risk — they know the blast radius of their change BEFORE they write code
- "What could break" tells them: "subscriptions may receive stale or incorrect data" — they now know to test subscriptions too

### Their aha moment

"I understood in 10 minutes what would have taken me a week of asking around."

### What they'd tell their manager

"Can we run this on every new hire's first day? It would cut onboarding from 2 weeks to 2 days."

---

## Role 2: The Tech Lead / Architect

### Their reality

They review 15-20 PRs per week. They have to assess: "Does this PR break anything? Does it violate our architecture boundaries? Is the developer touching the right system?" They also plan quarterly roadmaps and need to estimate how hard features are based on how many systems they touch. They hold the "mental model" of the architecture in their head, and they are the bottleneck.

### What they do today

- Review PRs by reading diffs and mentally mapping file changes to their mental architecture model
- Draw architecture diagrams on whiteboards that go stale within a sprint
- Answer the same "where does X live?" questions from 5 different team members every week
- Estimate effort by gut feel because they can't quickly quantify system dependencies

### How memor helps them — specifically

**Overview — architecture health dashboard:**

- Quality banner shows "Moderate confidence — 26/31 connected" — they immediately see 5 orphaned systems that may be dead code or missing connections
- Key Signals: "core-api impacts 12 systems — high blast radius" — they know where to enforce stricter review policies
- Coupling signal: "auth and billing are tightly coupled — changes may ripple across dependent modules" — this confirms (or reveals) an architectural concern they suspected

**Structure — the living diagram that never goes stale:**

- Instead of a Miro board they drew 6 months ago, they point the team to memor's Structure view — it is always current because it reads the code
- Zone drill-down shows exactly which systems belong to which architectural layer — they can verify boundary violations
- "Why it matters" on each system tells them the actual dependency reason, not a guess

**Impact — PR review superpower:**

- Before reviewing a PR that touches `auth`, they check Impact: `auth` is "architectural — 82/100 blast radius, touches 14 systems across 4 zones"
- Now they know this PR needs extra scrutiny, integration tests, and maybe a feature flag
- They can tell the developer: "Your change affects billing, subscriptions, and webhooks — did you test those?" with data, not just intuition

**Flow — planning and estimation:**

- When planning a new feature that affects the checkout flow, they open Flow view and see every system involved in the checkout pipeline
- They count: 4 systems, 2 zones, 1 high-impact step — this becomes their sprint estimate basis
- They can show product managers: "Here's WHY this feature takes 3 sprints, not 1 — look at the blast radius"

### Their aha moment

"This is the diagram I've been maintaining manually for 2 years, except it's always accurate and I didn't have to draw it."

### What they'd tell their team

"Run memor before every sprint planning. No more estimation by gut feel."

---

## Role 3: The Senior Developer Doing a Refactor

### Their reality

They need to extract a shared utility from a monolith, rename a core module, or migrate from one database client to another. They know the change is "big" but they can't quantify HOW big. They've been burned before — a "simple rename" cascaded into 3 broken services and a hotfix at 2 AM. They are cautious to the point of paralysis.

### What they do today

- Manually trace imports: `grep -r "import.*from.*old-module"` across the entire repo
- Build a spreadsheet of affected files and try to group them by "service"
- Ask teammates: "Does anyone know what uses this?" in Slack
- Make the change, run all tests, and pray nothing was missed
- Often discover hidden consumers 2 days later in production

### How memor helps them — specifically

**Impact — the refactoring safety net:**

- They select the module they want to refactor and immediately see: 6 direct dependents, 3 indirect, blast radius 67/100 "broad"
- Each dependent shows: risk level (high/medium/low), impact type (runtime/build/API), and a specific reason ("imports auth utilities from shared-lib")
- "What could break" gives them behavioral predictions: "subscriptions may receive stale or incorrect data" — not just "this file imports that file"
- Impact path shows the cascade: `shared-lib → auth → billing → webhooks` — they can see the 3-hop chain
- Key files on each affected system — they now have a checklist of files to verify

**Structure — understanding the dependency direction:**

- Detail panel on the target module shows "outgoing: relies on prisma-client" and "incoming: consumed by auth, billing, users" — they know the direction of the dependency, not just that a connection exists
- "Why it matters: Shared runtime foundation other packages build upon" — they understand they're touching a foundation, not a leaf

**Flow — knowing which runtime paths break:**

- They check Flow view and see 3 flows that mention their module in steps
- Step-level whisper says "Core system — affects 8 systems across 3 zones" — this tells them the RUNTIME blast, not just the import-time blast
- They now know: the checkout flow, the auth flow, and the webhook flow all touch this module — they have a test plan

### Their aha moment

"I can see every system that depends on this before I touch it. No more surprise breakages at 2 AM."

### What they'd tell the team

"Run memor impact check on every refactoring PR. It's a 10-second safety net."

---

## Role 4: The Open Source Contributor

### Their reality

They found a bug in a popular open-source framework (Next.js, cal.com, Fastify). They want to fix it and submit a PR. They clone the repo and see 500+ files across dozens of packages. They have no idea where to start. The CONTRIBUTING.md says "look at the code" which is not helpful. They spend 2 hours navigating directories, give up, and move on. The bug stays unfixed.

### What they do today

- Read README and CONTRIBUTING.md (usually outdated or vague)
- Browse GitHub file tree, clicking random directories
- Search for error messages or function names with `grep`
- Open issues and ask "where does this logic live?" — sometimes wait days for a response
- Give up on 60%+ of intended contributions because the codebase is too intimidating

### How memor helps them — specifically

**Overview — instant orientation (replaces the missing architecture doc):**

- They run `npx memor .` and in 5 seconds see: "cal.com — product-domain-machine — 31 systems, 7 zones"
- Tech chips: "Next.js, Prisma, tRPC, Turborepo" — they know the stack
- Entry point: `apps/web/src/app/layout.tsx` — "app shell, start reading here"
- Flow preview: "User visits → App routes → tRPC → Prisma → Response" — they understand the architecture in 10 seconds

**Structure — finding where the bug lives:**

- They know the bug is in "booking confirmation emails." They look at the zone map and see "Core Domain" zone
- They drill into Core Domain and find `bookings`, `emails`, `notifications` systems
- They click `emails` and the detail panel shows: description, connections, and key files — they found the right directory in 30 seconds

**Flow — understanding the path to the bug:**

- They check Flow and find a "Booking Confirmation" flow
- Step 3: "Send confirmation email" — system: `emails`, files: `packages/emails/src/templates/booking-confirmation.tsx`
- They copy the path, open the file, and they're looking at the bug

### Their aha moment

"I went from 'cloned the repo' to 'found the exact file' in under 2 minutes. I didn't need to ask anyone."

### What they'd tell the maintainers

"You should add memor to your CONTRIBUTING.md. It would double your contributor count."

---

## Role 5: The Engineering Manager

### Their reality

They manage a team of 8-12 developers across a growing codebase. They need to answer questions from leadership: "How complex is our system? What's our biggest technical risk? Why does this feature take so long? Why do we keep having incidents in the billing module?" They can't read the code themselves — they rely on developers to explain the architecture, and every developer gives a different mental model.

### What they do today

- Ask tech leads for architecture overviews — get different answers from different people
- Look at incident reports and try to find patterns ("billing broke again")
- Estimate complexity by counting files or packages — a meaningless metric
- Use gut feel to allocate team members to projects
- Can't justify technical debt work to leadership because they can't show the risk

### How memor helps them — specifically

**Overview — the executive briefing:**

- One screen shows: 31 systems, 3 primary, 22 support, 7 zones — they can tell leadership "we have 31 interconnected systems across 7 architectural zones"
- Key Signals: "core-api impacts 12 systems — high blast radius" — they can tell leadership: "THIS is why billing keeps breaking — it's a high-coupling hub that touches 12 other systems"
- Quality confidence: "Moderate — 26/31 connected" — they have a system health metric

**Impact — justifying technical debt work:**

- They show leadership the Impact view for `core-api`: blast radius 85/100, architectural level, affects 14 systems
- "This is why we need to refactor core-api. Every change here risks breaking 14 systems. Here's the visual proof."
- This turns "trust me, we need to refactor" into "look at the blast radius graph — this is a quantified risk"

**Structure — team allocation:**

- They see 7 zones. They can now assign teams to zones instead of to directories
- "Team A owns API Layer (4 systems), Team B owns Core Domain (8 systems)" — this is systems-level thinking, not file-level

**Flow — incident root cause:**

- After a production incident, they open Flow view and trace the checkout flow
- Step 4 is marked "High impact — affects 8 systems across 3 zones" — they can see exactly where the bottleneck is
- They can tell leadership: "The incident happened at step 4, which is a high-impact chokepoint. Here's the blast radius."

### Their aha moment

"I can finally show leadership WHY things break and WHERE the technical risk is, with visuals instead of words."

### What they'd tell leadership

"We're now making architectural decisions based on data, not gut feel."

---

## Role 6: The Freelancer / Consultant

### Their reality

They join a new client project every 2-4 months. Each time, they inherit a codebase they've never seen. The client says "just fix the checkout bug" but doesn't have architecture documentation. The last developer left 6 months ago. There are no tests. They bill by the hour but spend the first 20+ hours just understanding the codebase — time the client resents paying for.

### What they do today

- Read `package.json` to understand dependencies
- Browse the directory tree and make guesses about what each folder does
- Run the app and click around to understand features
- Ask the client "who built this and where's the documentation?" — answer: "the developer left and there's no docs"
- Bill 15-25 hours for "codebase onboarding" before writing a single fix — client is frustrated

### How memor helps them — specifically

**Overview — the instant audit:**

- They run `npx memor .` on the client's repo. In 5 seconds: "product-web-app — Next.js, Prisma, Tailwind — 8 systems, 4 zones"
- They now know the tech stack, the architecture shape, and the scale — in 5 seconds instead of 5 hours
- Entry point: `src/app/layout.tsx` — "start reading here"
- Quality: "Low confidence — 5/8 connected" — they immediately know this codebase has structural issues (3 orphaned modules)

**Structure — the missing documentation:**

- The radial map IS the architecture document that doesn't exist
- They screenshot the Structure view and send it to the client: "Here's your system architecture. These 3 systems are disconnected — are they dead code?"
- This immediately establishes credibility: "I understand your codebase better than your last developer did"

**Impact — scoping the fix:**

- The client says "fix checkout." They check Impact on the checkout system: 3 dependents, blast radius 42/100, contained
- They can tell the client: "Your checkout fix is medium-risk. It touches 3 other systems. I estimate 8 hours, not 40."
- Accurate scoping = happy client, no scope creep

**Flow — finding the bug fast:**

- They open Flow, find the "Checkout" flow, and see every step from "User clicks buy" to "Order confirmed"
- Step 3 shows the exact file where payment processing happens
- They found the bug location in 2 minutes — they just saved 10 billable hours of exploration

### Their aha moment

"I billed 2 hours instead of 20 for codebase onboarding. The client thinks I'm a genius."

### What they'd tell other freelancers

"Run memor on every new client project before your first call. You'll sound like you've been on the project for months."

---

## Summary Matrix

| Pain Point | New Hire | Tech Lead | Senior Dev | OSS Contributor | Eng Manager | Freelancer |
|---|---|---|---|---|---|---|
| "Where do I start?" | **Overview** entry point + flow preview | - | - | **Overview** entry + **Structure** drill | - | **Overview** entry + **Flow** step files |
| "What is this codebase?" | **Overview** identity + tech + zones | **Overview** health signals | - | **Overview** instant orientation | **Overview** executive briefing | **Overview** instant audit |
| "What depends on what?" | **Structure** connections | **Structure** boundary verification | **Impact** dependency graph | **Structure** finding the right module | **Structure** team allocation | **Structure** missing docs |
| "What breaks if I change X?" | - | **Impact** PR review | **Impact** refactoring safety net | - | **Impact** justify tech debt | **Impact** scoping fixes |
| "How does the runtime work?" | **Flow** runtime story | **Flow** sprint planning | **Flow** test plan from runtime paths | **Flow** tracing bug to file | **Flow** incident root cause | **Flow** finding bugs fast |

---

## Key Talking Points for Developer Conversations

1. **"Run it. 5 seconds. No setup."** — Zero config is the killer feature. No YAML, no plugins, no accounts. If it compiles, memor reads it.
2. **"It reads your code, not your docs."** — Architecture diagrams lie. Code doesn't. Memor reads the code.
3. **"Show me the blast radius."** — The single most powerful sentence. Every developer has been burned by a "small change" that broke something unexpected.
4. **"Where would YOU start reading this codebase?"** — This is the question that hooks new hires, contributors, and freelancers. Memor answers it with a specific file path.
5. **"What would you give to have had this on your first week?"** — This question makes every developer recall the pain of onboarding. Memor eliminates that pain.
