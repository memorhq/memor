# Raw Brainstorm — Memor 2 Ideas (Ongoing)

**Format:** Unfiltered. Ideas go here first. Good ones get their own file.
**Rule:** No idea is too big. No idea is too small. Bae rates each one honestly.

---

## 2026-04-16 Session

### Idea: "Commit Diff Canvas"
After every git commit, the canvas highlights what changed — not the code diff, the ARCHITECTURAL diff.
- New connection added between systems → highlighted edge
- Blast radius increased → node pulses red
- Dead file created → grey node appears
- Coupling tightened → edge weight increases

**Bae's rating:** 10/10. This is THE habit trigger. This makes Memor open every time AI commits. Without this, Memor is a one-time exploration tool. With this, it's daily.

**What makes it hard:** Requires incremental analysis, not full-repo scan. Need to diff the RepoAnalysis object before and after commit. Git hook integration.

---

### Idea: "Blast Radius as a Rule, not a Warning"
When the code builder agent (Do layer) is about to generate code, it checks blast radius first.
If blast radius > threshold, agent pauses and asks: "This change affects 8 systems. Do you want to proceed?"

**Bae's rating:** 9/10. This is the core "Do" thesis. Agent as architect, not just programmer.

**What makes it hard:** Requires "Do" layer (May 2026). Not for April 30.

---

### Idea: "Simulation Engine — Bae's Internal QA"
Run Memor on 10 known repos, score efficiency/usefulness/habit/AHA automatically.
Use this as internal CI before every release.

**Bae's rating:** 9/10. Already captured in simulation-engine.md. Build after April 30.

---

### Idea: "The 5-Second Rule"
Every developer who opens Memor should have an AHA moment within 5 seconds.
If they don't — within 5 seconds, something surprising and true about their codebase — they close it and never come back.

Design constraint: The canvas MUST surface the most surprising true thing first.
Not the most complete thing. Not the most accurate thing. The most SURPRISING true thing.

**Bae's rating:** 10/10. This is a design principle, not a feature. Should drive every canvas layout decision.

---

### Idea: "Dead Code Layer"
Every file that is imported by nothing — highlighted on the canvas in grey.
Not a report. A visual. You see a grey cloud in your architecture.
You ask: why is this here?

**Bae's rating:** 8/10. Simple to detect. High AHA potential. AI writes dead code constantly (generates utilities it never wires up).

---

### Idea: "Coupling Danger Lines"
On the canvas, edges between systems are colored by coupling strength.
- Thin grey line: loose coupling (good)
- Orange line: medium coupling (watch this)
- Red thick line: tight coupling (danger)

**Bae's rating:** 9/10. Instant visual. No reading required. A developer sees red lines and knows where the fragile points are. This IS the MRI.

---

### Idea: "Open Source Hall of Fame"
Memor runs on famous open-source repos (Next.js, Supabase, Linear's open parts) and publishes the canvas publicly.
Developers explore the architecture of repos they already use.
This is the best marketing: "See how Next.js is actually built — without reading the source."

**Bae's rating:** 8/10 for marketing. 6/10 for accuracy risk. If the canvas is wrong on a famous repo, it's public. Only do this after simulation engine validates accuracy.

---

### Idea: "Memor as Onboarding Tool for New Hires"
CTO sends Memor canvas link to new developer on day 1.
"Here is our codebase. Before you open VS Code, look at this."

**Bae's rating:** 7/10. Real use case. But this is the "occasional" trigger (3x/month per developer), not the daily trigger. Good for B2B sales, not for habit formation.

---

### Idea: "The Architect Mode"
A separate view for senior engineers / CTOs.
Shows: coupling density, blast radius distribution, dead code percentage, AI-generated code concentration.
Not for understanding the codebase — for auditing its health.

**Bae's rating:** 8/10. This is the B2B enterprise sale. CTO pays for this view. Different from the developer daily use case but complementary.

---

### Idea: "AI Code Concentration Heatmap"
Detect which files / systems have high AI code concentration (pattern: large functions, low variability, standard boilerplate).
Show on canvas as a heatmap: orange = likely AI-written, blue = human-written.

**Bae's rating:** 6/10 on accuracy (hard to detect reliably). 10/10 on AHA potential. "You can see that your entire payment system was written by AI and has never been touched by a human." That is a terrifying and useful signal.

**What makes it hard:** Detection is heuristic, not deterministic. Breaks the Memor Law if wrong. Only ship if accuracy > 80%.

---

### Idea: "Memor Score"
A single number: 0-100, representing the architectural health of the codebase.
Updated after every commit.

Components:
- Dead code ratio (lower = better)
- Coupling density (lower = better)  
- Blast radius concentration (lower = better)
- Evidence flow coverage (higher = better)

**Bae's rating:** 7/10. Simple. Gameable (developers optimize for the score). But as a starting conversation — "your codebase scores 43" — it is a hook. Engineers will ask why.

---

## Ideas Needing More Thought

- Memor for code review (compare canvas before and after PR — architectural diff)
- Memor for LLM prompt generation (auto-generate system context for Cursor)
- Memor CLI as a git hook (auto-runs after every commit, outputs diff)
- Memor web app as public canvas gallery (not for analysis — for exploration)
