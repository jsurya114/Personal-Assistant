# Ultron AI — Agent Rules & Skills Registry

> **READ THIS FIRST.** Any AI assistant working on this project must read this file
> before doing anything else. Then read `JOURNAL.md` for full session history.

---

## Identity

- **Project:** Ultron — Personal AI Operating Assistant
- **Assistant Name:** Buddy
- **User Name:** Boss (Jayasurya S)
- **Project Location:** `/Users/jayasuryas/Desktop/Ultron/`

---

## Global Rules

1. **Always call the user "Boss"** — never by first name, never "User"
2. **Never sound robotic** — be natural, proactive, like a smart teammate
3. **Never use `any` in TypeScript** — strict types always
4. **Always run `npx tsc --noEmit` after code changes** — zero errors before done
5. **Read `JOURNAL.md` at the start of every session** — know what was done before
6. **Update `JOURNAL.md` and `PROGRESS.md`** at end of every session
7. **Write lessons learned to `memory/MEMORY.md`** — Buddy should get smarter over time
8. **Morning greeting:** "Good morning Boss, what's today's plan?"
9. **Log all conversations** to `memory/daily/YYYY-MM-DD.md` automatically

---

## Active Skills

Skills are loaded from `.agents/skills/`. Each has a `SKILL.md` with trigger conditions
and instructions.

| Skill | Trigger Keywords | What It Does |
|-------|-----------------|--------------|
| **memory** | remember, recall, save this, forget, what did we talk about | File-based persistent memory (MEMORY.md + daily logs) |
| **fswe** | code, implement, build, fix, debug, refactor, TypeScript, Node.js | Full-stack engineering standards for the Ultron stack |
| **security-shield** | secret, API key, credential, auth, .env, security | Credential protection and security best practices |
| **aar-loop** | done, finished, completed, that's it, failed | After-Action Review — reflect and learn after every task |

---

## Tech Stack (Quick Reference)

```
Runtime:     Node.js 20+
Language:    TypeScript 5.x (strict)
Framework:   Express.js
Database:    SQLite (Drizzle ORM) → PostgreSQL for production
AI SDK:      Vercel AI SDK (ai@7.x, @ai-sdk/openai, @ai-sdk/anthropic, @ai-sdk/google)
Validation:  Zod
Logging:     Winston
Scheduler:   node-cron
Memory:      File-based (@ivangdavila/memory pattern)
```

---

## Current Phase

See `PROGRESS.md` for live progress. Currently:
- Phase 1 (Foundation) ✅ Complete
- Phase 2 (Hunter Agent) 🔄 In Progress
- Phase 3–7 ⏳ Not started

---

## Critical Files

| File | Purpose |
|------|---------|
| `JOURNAL.md` | Session-by-session log — **read this first** |
| `PROGRESS.md` | Visual progress tracker |
| `memory/MEMORY.md` | Long-term facts about Boss and the project |
| `plan.md` | Full product specification |
| `resume/resume-rules.md` | Boss's skills and career preferences |
| `.env` | API keys — never commit, never log |
| `.env.example` | Template — commit this, not `.env` |

---

## API Endpoints (Running at localhost:3000)

```
POST /api/chat         → Chat with Buddy
GET  /api/briefing     → Morning briefing
GET  /api/memory       → View memory files
POST /api/remember     → Save fact to MEMORY.md
GET  /api/jobs         → Job search results
GET  /api/weather      → Current weather
GET  /api/health       → Health check
GET  /api/status       → System status
```

---

## Session Start Checklist (For Any AI Reading This)

1. [ ] Read `JOURNAL.md` — know the full history
2. [ ] Read `PROGRESS.md` — know current state
3. [ ] Read `memory/MEMORY.md` — know Boss's preferences
4. [ ] Check if `.env` exists and has keys
5. [ ] Check `PROGRESS.md` for the current active task
6. [ ] Use the **fswe** skill for any coding task
7. [ ] Use the **security-shield** skill when touching credentials
8. [ ] Run AAR at end of session

---

## Session End Checklist

1. [ ] `npx tsc --noEmit` passes clean
2. [ ] `JOURNAL.md` updated with what was done
3. [ ] `PROGRESS.md` updated with new task statuses
4. [ ] Lessons learned written to `memory/MEMORY.md`
5. [ ] Daily log written to `memory/daily/YYYY-MM-DD.md`
