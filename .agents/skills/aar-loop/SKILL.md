---
name: aar-loop
description: >
  After-Action Review loop for the Ultron AI assistant. Auto-triggers after completing
  any significant task. Uses the US Army 4-question AAR method to reflect on what
  happened, what should have happened, why there was a difference, and what to do
  better next time. Saves lessons learned to memory. Trigger on: task complete,
  finished, done, all done, that's it, good job, completed, worked, failed, didn't work,
  after any build/deploy/debug session, after major decisions.
---

# AAR Loop — After-Action Review

Based on the **US Army 4-Question AAR Method** adapted for AI agents.

## When to Trigger

Automatically run an AAR after:
- Completing a major coding task or feature
- A debugging session (whether successful or not)
- A failed attempt that required rethinking
- Boss says "done", "finished", "ok that works", "that failed"
- End of a long conversation session

---

## The 4 AAR Questions

### Question 1 — What did we intend to do?
> What was the goal? What was the plan at the start?

### Question 2 — What actually happened?
> What was the actual outcome? What worked, what didn't?

### Question 3 — Why was there a difference?
> What caused the gap between intent and result?
> Was it a wrong assumption? Missing info? Bad approach?

### Question 4 — What do we sustain and improve?
> **Sustain:** What worked well that we should keep doing?
> **Improve:** What should we do differently next time?

---

## AAR Output Format

After completing a significant task, internally run:

```
📋 AAR — [Task Name] — [Date]

1. INTENT: [What we set out to do]
2. ACTUAL: [What happened]
3. WHY DIFFERENT: [Root cause of any gap]
4. LESSONS:
   ✅ SUSTAIN: [What worked]
   🔧 IMPROVE: [What to change]
```

---

## When to Save to Memory

If the AAR reveals something important, save it:

```
memoryManager.remember(lesson, 'Lessons Learned')
```

Examples of lessons worth saving:
- "TypeScript `tsc --noEmit` must be run before declaring task complete"
- "Vercel AI SDK v7 uses `maxOutputTokens` not `maxTokens`"
- "Always check if .env has been created before running npm run dev"
- "SQLite WAL mode improves concurrent read performance"

---

## Lightweight AAR (For Small Tasks)

For quick tasks, a 1-line AAR is enough:
> "Worked as expected — no changes needed" or "Needed to add type annotation — remember explicit return types"

---

## Example AAR — Vercel AI SDK Migration

```
📋 AAR — Vercel AI SDK Migration — 2026-08-01

1. INTENT: Replace raw OpenAI/Claude/Gemini SDKs with Vercel AI SDK

2. ACTUAL: Migration succeeded. TS compiled clean.
   - Had to fix: maxTokens → maxOutputTokens (v7 breaking change)
   - Had to fix: usage.promptTokens → usage.inputTokens
   - Had to fix: usage.completionTokens → usage.outputTokens

3. WHY DIFFERENT: AI SDK v7 changed usage field names (breaking change)
   Did not check changelog before starting.

4. LESSONS:
   ✅ SUSTAIN: Running tsc --noEmit caught all errors immediately
   🔧 IMPROVE: Check library changelog/release notes before migration
```

**Saved to memory:** "Always check AI SDK changelog before upgrading versions"

---

## Buddy's AAR Habit

After completing any task for Boss, briefly note:
1. Did it work first try? If not — why?
2. What's the one thing to remember from this task?
3. Did we update `PROGRESS.md` and `JOURNAL.md`?

The goal: Buddy gets smarter with every task.
