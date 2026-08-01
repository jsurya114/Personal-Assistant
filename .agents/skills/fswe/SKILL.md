---
name: fswe
description: >
  Full-stack engineering skill for TypeScript/Node.js projects. Activate when Boss asks
  to write code, review code, debug, refactor, design APIs, set up CI/CD, write tests,
  or discuss system architecture. Covers 24 engineering modules including architecture,
  REST/GraphQL API design, performance, testing (Jest), DevOps (Docker, CI/CD),
  security, and modern TypeScript patterns. Trigger on: code, implement, build,
  fix, debug, refactor, test, API, database, deploy, Docker, TypeScript, Node.js,
  Express, architecture, review, design, optimize.
---

# FSWE — Full-Stack Engineering Skill

## Stack Focus (Ultron Project)

- **Runtime:** Node.js 20+ (LTS)
- **Language:** TypeScript 5.x — strict mode, no `any`
- **Framework:** Express.js
- **Database:** SQLite (via Drizzle ORM) — production: PostgreSQL
- **AI Layer:** Vercel AI SDK (`ai`, `@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/google`)
- **Validation:** Zod
- **Logging:** Winston
- **Scheduling:** node-cron
- **Testing:** Jest + ts-jest

---

## Module 1 — Architecture Principles

- **Clean Architecture:** Routes → Controllers → Services → Repositories
- **Single Responsibility:** Each file/module does ONE thing
- **Dependency Injection:** Pass dependencies, don't import singletons inside functions
- **Error Boundaries:** Every async function wrapped in try/catch, errors propagated properly
- **No Magic:** Explicit over implicit. Config from env, not hardcoded.

```
src/
├── agents/        ← AI agents (assistant, hunter, cipher, research, memory, scheduler)
├── api/           ← Express routes
├── config/        ← Zod-validated env loader
├── database/      ← Drizzle ORM + SQLite
├── providers/     ← AI provider abstractions (OpenAI, Claude, Gemini)
├── services/      ← External service integrations (weather, news, briefing)
├── types/         ← Shared TypeScript types
└── utils/         ← Logger, helpers
```

---

## Module 2 — TypeScript Standards

```typescript
// ✅ Always use explicit return types on exported functions
export async function createJob(data: JobInput): Promise<Job> { ... }

// ✅ Use Zod for runtime validation
const schema = z.object({ title: z.string().min(1) });
const parsed = schema.parse(req.body);

// ✅ Use discriminated unions for result types
type Result<T> = { success: true; data: T } | { success: false; error: string };

// ❌ Never use `any`
// ❌ Never use `as` casting unless absolutely necessary
// ❌ Never use non-null assertion `!` on external data
```

---

## Module 3 — API Design (Express)

```typescript
// Route structure
router.get('/resource', asyncHandler(listResources));
router.post('/resource', validateBody(schema), asyncHandler(createResource));
router.patch('/resource/:id', validateBody(partialSchema), asyncHandler(updateResource));
router.delete('/resource/:id', asyncHandler(deleteResource));

// Always return consistent shapes
res.json({ success: true, data: result });
res.status(400).json({ success: false, error: 'Message', details: [...] });

// Async error handling wrapper
function asyncHandler(fn: RequestHandler): RequestHandler {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}
```

---

## Module 4 — Database Patterns (Drizzle + SQLite)

```typescript
// ✅ Use prepared statements for repeated queries
const getUser = sqlite.prepare('SELECT * FROM users WHERE id = ?');

// ✅ Use transactions for multi-step writes
const insertMany = sqlite.transaction((items) => {
  for (const item of items) stmt.run(item);
});

// ✅ Always handle "not found" explicitly
const row = sqlite.prepare('SELECT * FROM jobs WHERE id = ?').get(id);
if (!row) throw new NotFoundError(`Job ${id} not found`);
```

---

## Module 5 — Error Handling

```typescript
// Custom error classes
class AppError extends Error {
  constructor(
    public message: string,
    public statusCode: number = 500,
    public code: string = 'INTERNAL_ERROR'
  ) { super(message); }
}

class NotFoundError extends AppError {
  constructor(msg: string) { super(msg, 404, 'NOT_FOUND'); }
}

class ValidationError extends AppError {
  constructor(msg: string) { super(msg, 400, 'VALIDATION_ERROR'); }
}

// Global error middleware in Express
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ error: err.message, code: err.code });
  }
  logger.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});
```

---

## Module 6 — Testing (Jest)

```typescript
// Unit test structure
describe('MemoryManager', () => {
  beforeEach(() => { /* reset state */ });
  
  it('should add message to short-term memory', () => {
    memoryManager.addMessage('conv-1', { role: 'user', content: 'hello' });
    const ctx = memoryManager.getContext('conv-1');
    expect(ctx).toHaveLength(1);
    expect(ctx[0].content).toBe('hello');
  });
});

// Commands
// npm test               → run all tests
// npm test -- --watch    → watch mode
// npm test -- --coverage → with coverage report
```

---

## Module 7 — Performance

- **Caching:** Cache weather/news API responses for 30 min (in-memory Map with TTL)
- **Connection pooling:** SQLite is single-connection; use WAL mode for concurrent reads
- **Lazy loading:** Don't load all modules at startup — import when needed
- **Streaming:** Use `streamText()` from Vercel AI SDK for long AI responses

---

## Module 8 — DevOps & Docker

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist/ ./dist/
COPY memory/ ./memory/
EXPOSE 3000
CMD ["node", "dist/server.js"]
```

```bash
# Build
npm run build

# Docker build
docker build -t ultron .
docker run -d -p 3000:3000 --env-file .env ultron
```

---

## Module 9 — Security

- Never log API keys or secrets
- Validate all input with Zod before processing
- Rate limit the Express API (use `express-rate-limit`)
- Use `helmet` middleware for HTTP security headers
- Store secrets in `.env` only — never commit to git

---

## Module 10 — Code Review Checklist

Before completing any code task:
- [ ] TypeScript compiles with `npx tsc --noEmit` — zero errors
- [ ] All external inputs validated with Zod
- [ ] All async functions have try/catch
- [ ] No `console.log` — use `logger.info/debug/error`
- [ ] No hardcoded values — use config
- [ ] Functions are small (< 50 lines ideally)
- [ ] Exported functions have explicit return types
