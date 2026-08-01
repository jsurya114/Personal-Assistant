---
name: security-shield
description: >
  Security best practices for the Ultron AI assistant. Triggers on any task involving
  API keys, credentials, secrets, .env files, authentication, authorization, data
  exposure, or security audits. Use proactively when writing code that handles
  sensitive data. Trigger on: API key, secret, credential, token, auth, password,
  security, protect, .env, exposure, audit, secure, permission, access control.
---

# Security Shield — Credential & Code Security

## Rule 1 — Secrets Never Leave .env

```bash
# ✅ Correct: secrets in .env, never in code
OPENAI_API_KEY=sk-...

# ❌ Never do this
const API_KEY = "sk-abc123";  // hardcoded in source code
```

**Always verify:**
- `.env` is in `.gitignore`
- `.env.example` has placeholder values only, not real keys
- No `console.log(config.ai.openaiKey)` anywhere

---

## Rule 2 — Validate Before Processing

Every route that accepts external input MUST validate with Zod:

```typescript
// ✅ Validate before processing
const schema = z.object({
  message: z.string().min(1).max(4000),
  conversationId: z.string().optional(),
});

router.post('/chat', (req, res) => {
  const body = schema.safeParse(req.body);
  if (!body.success) {
    return res.status(400).json({ error: 'Invalid input' });
  }
  // Now safe to use body.data
});
```

---

## Rule 3 — Log Safely

```typescript
// ✅ Safe logging
logger.info(`AI request from conversation ${conversationId}`);

// ❌ Never log secrets, full API keys, or personal data
logger.info(`Using key: ${config.ai.openaiKey}`);  // NEVER
logger.info(`User message: ${fullMessage}`);         // only if needed, truncate
```

---

## Rule 4 — Rate Limiting

The Ultron Express API should have rate limiting:

```typescript
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 60 * 1000,      // 1 minute
  max: 30,                   // 30 requests per minute
  message: { error: 'Too many requests' }
});

app.use('/api/', limiter);
```

---

## Rule 5 — HTTP Security Headers

Add `helmet` middleware:

```typescript
import helmet from 'helmet';
app.use(helmet());
```

---

## Rule 6 — Error Messages Don't Leak Internals

```typescript
// ✅ Safe error message
res.status(500).json({ error: 'Something went wrong. Try again.' });

// ❌ Leaks internals
res.status(500).json({ error: err.stack });
res.status(500).json({ error: `SQLite error: ${err.message}` });
```

---

## Rule 7 — API Key Checklist

Before any session:
- [ ] `OPENAI_API_KEY` (or `VERCEL_AI_API_KEY`) set in `.env`
- [ ] `.env` NOT committed to git (`git status` should not show `.env`)
- [ ] `.gitignore` includes: `.env`, `memory/*.db`, `logs/`, `node_modules/`
- [ ] No real keys in `.env.example`
- [ ] API keys rotated if accidentally committed

---

## Rule 8 — CORS for Production

```typescript
import cors from 'cors';

// Development: allow all
app.use(cors());

// Production: restrict to known origins
app.use(cors({
  origin: ['http://localhost:3000', 'https://yourdomain.com'],
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
}));
```

---

## Rule 9 — Memory File Security

`memory/MEMORY.md` and daily logs may contain sensitive info (job details, personal notes).
- Never expose memory files via API without auth
- Never log memory contents to console
- `memory/` should be in `.gitignore` (personal data)

---

## Security Audit — Quick Check

Run this mentally before completing any code change:

1. Does any new code log secrets? → Remove
2. Does any route accept user input without validation? → Add Zod
3. Does any error response expose internal details? → Sanitize
4. Does any new file contain hardcoded credentials? → Move to .env
5. Is the new feature properly rate-limited? → Add if public-facing
