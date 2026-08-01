# Ultron AI

> Personal AI Operating Assistant — "Buddy"

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Fill in your API keys
```

Required:
- `OPENAI_API_KEY` — [platform.openai.com](https://platform.openai.com)

Optional but recommended:
- `OPENWEATHER_API_KEY` — [openweathermap.org/api](https://openweathermap.org/api)
- `NEWS_API_KEY` — [newsapi.org](https://newsapi.org)
- `RAPIDAPI_KEY` — [rapidapi.com](https://rapidapi.com) (JSearch for jobs)

### 3. Run in development

```bash
npm run dev
```

### 4. Add your resume

Place `resume.pdf` in the `resume/` folder.
Update `resume/resume-rules.md` with your skills and preferences.

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | System info |
| GET | `/api/health` | Health check |
| POST | `/api/chat` | Chat with Buddy |
| GET | `/api/briefing` | Morning briefing |
| GET | `/api/weather` | Current weather |
| GET | `/api/news` | Latest news |
| GET | `/api/time` | Current time |
| GET | `/api/jobs` | Job matches |
| POST | `/api/jobs/search` | Trigger job search |
| GET | `/api/applications` | Application tracker |
| POST | `/api/code` | Cipher coding agent |
| POST | `/api/research` | Research agent |
| GET | `/api/status` | System status |

---

## Chat Example

```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello Buddy, what time is it?"}'
```

---

## Auto-start on macOS Boot

After building the project:

```bash
npm run build
cp launchd/com.ultron.agent.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.ultron.agent.plist
```

To stop auto-start:
```bash
launchctl unload ~/Library/LaunchAgents/com.ultron.agent.plist
```

---

## Project Files

| File | Purpose |
|------|---------|
| `JOURNAL.md` | Session-by-session log — read this first on any new AI session |
| `PROGRESS.md` | Visual progress tracker |
| `plan.md` | Full product specification |
| `resume/resume-rules.md` | Skills and job preferences |

---

## Architecture

```
User → POST /api/chat
  → UltronAssistant (intent detection)
    → Hunter (jobs) / Cipher (code) / Research / Assistant
      → AI Provider (OpenAI → Claude → Gemini)
        → Memory Manager (SQLite)
          → Response
```

---

*Ultron v1.0 — Built with TypeScript + Node.js + OpenAI*
