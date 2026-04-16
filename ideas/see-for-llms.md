# "See" For LLMs — The Token Efficiency Thesis

**Date:** 2026-04-16  
**Why this matters:** "See" has two customers. Humans (the canvas). LLMs (the context).  
If "See" only serves humans, we built half the product.

---

## The Problem With LLMs Reading Codebases Today

When a developer asks Cursor: "add a new endpoint to the auth system"

Cursor reads:
- The file they have open (maybe)
- A few files from its own context window
- Whatever it can embed-search from the codebase

What Cursor does NOT know:
- That Auth is coupled to Payment (blast radius)
- That this endpoint already exists in a different file (dead code risk)
- That the auth system has a `routes/` directory convention (pattern consistency)
- That changing auth affects 8 downstream systems (architectural constraint)

Result: Cursor generates code that works in isolation but may violate system boundaries, duplicate something that exists, or create a coupling that shouldn't exist.

---

## What Memor's Graph Gives an LLM

Instead of 40 files, the LLM receives one compressed context:

```json
{
  "system": "hoppscotch-backend",
  "type": "api-service",
  "tech": ["NestJS", "Prisma", "PostgreSQL"],
  "entryPoint": "src/app.module.ts",
  "conventions": {
    "routePattern": "src/{feature}/{feature}.controller.ts",
    "servicePattern": "src/{feature}/{feature}.service.ts",
    "knownRoutes": [
      { "method": "GET", "path": "/access-tokens", "file": "src/access-token/access-token.controller.ts", "line": 38 },
      { "method": "POST", "path": "/auth/sign-in", "file": "src/auth/auth.controller.ts", "line": 42 }
    ]
  },
  "connections": {
    "outgoing": ["hoppscotch-data-connect", "hoppscotch-kernel"],
    "incoming": []
  },
  "health": {
    "blastRadius": 72,
    "blastRadiusLevel": "high",
    "affectedSystems": ["hoppscotch-web", "hoppscotch-agent", "hoppscotch-desktop"],
    "deadFiles": 3,
    "coupling": "high"
  },
  "rules": [
    "This system has blast radius 72/100. Changes affect 3 downstream systems.",
    "Follow the NestJS module pattern. New features go in src/{feature}/.",
    "Do not couple to hoppscotch-web. That is a downstream consumer only."
  ]
}
```

This is ~400 tokens. The 40 files it replaces are ~40,000 tokens.

**100x token reduction. Better architectural awareness. Concrete rules.**

---

## The Three MCP Tools "See" Must Expose

### 1. `get_architecture_context(systemName?)`
Returns the compressed graph for a system (or the whole repo if no system specified).
Used by Cursor before generating any code in that system.

### 2. `get_blast_radius(filePath)`
Returns which systems are affected if this file changes.
Used by Cursor before refactoring or deleting.

### 3. `get_system_health(systemName)`
Returns dead files, unused exports, coupling strength, blast radius.
Used by Cursor to identify cleanup opportunities or risky areas.

---

## The "Rules" Field — The Key Insight

The compressed graph is not just data. It includes **rules** the LLM must follow.

```
"rules": [
  "Blast radius 72/100. Any change here propagates to 3 downstream systems. Warn the developer before generating code that adds new coupling.",
  "Auth system has no direct imports from Payment. Do not generate code that imports from payment/ inside auth/.",
  "Follow existing NestJS controller pattern. New routes go in src/{feature}/{feature}.controller.ts"
]
```

This is what file-aware LLMs cannot do. They don't know these rules exist.
Memor surfaces them deterministically. The LLM follows them.

**This is the core of "Do" — but it starts with "See."**  
"See" generates the rules. "Do" enforces them during code generation.

---

## Token Math (Why VCs Care)

Average Cursor session on a medium repo:
- Without Memor: 15,000 tokens per complex query (reads many files)
- With Memor MCP: 2,000 tokens per complex query (reads compressed graph + target file)

For a team of 10 developers, 50 Cursor queries/day:
- Without Memor: 7.5M tokens/day → ~$15/day at current pricing
- With Memor: 1M tokens/day → ~$2/day

**Memor pays for itself in token savings before anyone opens the canvas.**

That is a B2B sales argument. "Memor reduces your Cursor/Copilot costs by 70%." Engineering leads will listen.

---

## What to Build (Priority Order)

1. **Compressed graph format** — the JSON structure above. Deterministic, traceable.
2. **MCP tool: get_architecture_context** — the most used. Every AI session starts here.
3. **MCP tool: get_blast_radius** — the most impactful. Prevents architectural mistakes.
4. **Rules generation** — derive coupling rules, blast radius warnings, convention patterns automatically from the deterministic graph.
5. **MCP tool: get_system_health** — cleanup and audit use case.

---

## The Memor MCP Cursor Integration Flow

```
Developer in Cursor: "add a new webhook endpoint to the backend"
    ↓
Cursor rule: "Before generating code, call memor.get_architecture_context('backend')"
    ↓
Memor returns: compressed graph with conventions, health, connections, rules
    ↓
Cursor now knows: where to put the file, what not to couple to, what the blast radius is
    ↓
Cursor generates: code that follows the architectural conventions of that system
    ↓
Developer does not need to review every line — they check the canvas to confirm no red edges appeared
```

That loop — "Cursor generates, Memor confirms" — is the daily habit.
