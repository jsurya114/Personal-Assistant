// ============================================
// Ultron AI — REST API Routes
// ============================================

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { getAssistant } from '../agents/assistant';
import { hunterAgent } from '../agents/hunter';
import { cipherAgent } from '../agents/cipher';
import { researchAgent } from '../agents/research';
import { getWeather } from '../services/weather';
import { getTopNews } from '../services/news';
import { getTimeInfo } from '../services/time';
import { generateMorningBriefing } from '../services/briefing';
import { getSchedulerStatus } from '../agents/scheduler';
import { memoryManager } from '../agents/memory';
import { logger } from '../utils/logger';

const router = Router();

// ---- Health ----

router.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', assistant: 'Buddy', timestamp: new Date().toISOString() });
});

// ---- Chat ----

const chatSchema = z.object({
  message: z.string().min(1).max(10000),
  conversationId: z.string().nullish(),
  stream: z.boolean().optional().default(false),
});

router.post('/chat', async (req: Request, res: Response) => {
  try {
    const body = chatSchema.parse(req.body);
    const assistant = getAssistant();
    const response = await assistant.chat(body);
    res.json(response);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid request', details: error.errors });
    } else {
      logger.error('Chat error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

// ---- Memory ----

router.get('/memory', (_req: Request, res: Response) => {
  const longTerm = memoryManager.readMemoryFile();
  const todayLog = memoryManager.readTodayLog();
  const dailyLogs = memoryManager.listDailyLogs();
  res.json({ longTerm, todayLog, dailyLogs });
});

const rememberSchema = z.object({
  fact: z.string().min(1).max(500),
  section: z.string().optional().default('Notes'),
});

router.post('/remember', (req: Request, res: Response) => {
  try {
    const body = rememberSchema.parse(req.body);
    memoryManager.remember(body.fact, body.section);
    res.json({ success: true, message: `Saved to MEMORY.md under "${body.section}"` });
  } catch (error) {
    res.status(400).json({ error: 'Invalid request' });
  }
});

router.get('/conversations', (_req: Request, res: Response) => {
  const dailyLogs = memoryManager.listDailyLogs();
  res.json({ dailyLogs });
});

// ---- Jobs ----

router.get('/jobs', (_req: Request, res: Response) => {
  const jobs = hunterAgent.getTopJobMatches(20);
  res.json({ jobs });
});

router.all('/jobs/search', async (_req: Request, res: Response) => {
  try {
    const result = await hunterAgent.runJobSearch();
    res.json({
      message: `Job search complete`,
      found: result.found,
      saved: result.saved,
    });
  } catch (error) {
    logger.error('Failed to run job search:', error instanceof Error ? error.message : error);
    res.status(500).json({ error: 'Job search failed' });
  }
});

router.get('/applications', (_req: Request, res: Response) => {
  const applications = hunterAgent.getApplications();
  res.json({ applications });
});

const updateStatusSchema = z.object({
  status: z.enum(['saved', 'ready', 'applied', 'interview', 'offer', 'rejected']),
  notes: z.string().optional(),
});

router.patch('/applications/:id', (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const body = updateStatusSchema.parse(req.body);
    hunterAgent.updateApplicationStatus(id, body.status, body.notes);
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ error: 'Invalid request' });
  }
});

// ---- Info Services ----

router.get('/weather', async (_req: Request, res: Response) => {
  const weather = await getWeather();
  if (!weather) {
    res.status(503).json({ error: 'Weather service unavailable' });
    return;
  }
  res.json(weather);
});

router.get('/news', async (req: Request, res: Response) => {
  const category = (req.query.category as 'ai' | 'tech' | 'world') || 'tech';
  const news = await getTopNews(category);
  res.json({ news });
});

router.get('/time', (_req: Request, res: Response) => {
  res.json(getTimeInfo());
});

// ---- Briefing ----

router.get('/briefing', async (_req: Request, res: Response) => {
  try {
    const briefing = await generateMorningBriefing();
    res.json(briefing);
  } catch (error) {
    logger.error('Briefing error:', error);
    res.status(500).json({ error: 'Failed to generate briefing' });
  }
});

// ---- Agents ----

const codeSchema = z.object({
  request: z.string().min(1),
  context: z.string().optional(),
});

router.post('/code', async (req: Request, res: Response) => {
  try {
    const body = codeSchema.parse(req.body);
    const result = await cipherAgent.code(body.request, body.context);
    res.json({ result });
  } catch (error) {
    res.status(500).json({ error: 'Cipher agent error' });
  }
});

const researchSchema = z.object({
  topic: z.string().min(1),
  depth: z.enum(['quick', 'deep']).optional().default('quick'),
});

router.post('/research', async (req: Request, res: Response) => {
  try {
    const body = researchSchema.parse(req.body);
    const result = await researchAgent.research(body.topic, body.depth);
    res.json({ result });
  } catch (error) {
    res.status(500).json({ error: 'Research agent error' });
  }
});

// ---- Git Automation ----

import { gitService } from '../services/git';

router.get('/git/status', async (_req: Request, res: Response) => {
  try {
    const status = await gitService.getStatus();
    res.json(status);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/git/push', async (req: Request, res: Response) => {
  try {
    const message = req.body.message || `Update from Boss via Ultron AI (${new Date().toLocaleDateString()})`;
    const branch = req.body.branch;
    const result = await gitService.commitAndPush(message, branch);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/git/pull', async (req: Request, res: Response) => {
  try {
    const branch = req.body.branch;
    const result = await gitService.pull(branch);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/git/remote', async (req: Request, res: Response) => {
  try {
    const { url } = req.body;
    if (!url) {
      res.status(400).json({ error: 'URL is required' });
      return;
    }
    const result = await gitService.setRemote(url);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ---- System ----

router.get('/status', (_req: Request, res: Response) => {
  const schedulerJobs = getSchedulerStatus();
  res.json({
    status: 'running',
    assistant: 'Buddy',
    schedulerJobs,
    uptime: process.uptime(),
    memory: process.memoryUsage(),
  });
});

export default router;
