// ============================================
// Ultron AI — Main Entry Point
// ============================================

import express from 'express';
import path from 'path';
import { config } from './src/config';
import { initDatabase } from './src/database';
import { startScheduler } from './src/agents/scheduler';
import { generateMorningBriefing } from './src/services/briefing';
import { getAssistant } from './src/agents/assistant';
import { initDiscordBot } from './src/services/discord/bot';
import routes from './src/api/routes';
import { logger, logStartup } from './src/utils/logger';
import { isMorning } from './src/utils/helpers';
import { initSocket } from './src/services/socket';

async function main() {
  logStartup('=== Ultron AI Starting ===');

  // 1. Initialize database
  logStartup('Initializing database...');
  await initDatabase();

  // 2. Initialize AI assistant (validates API key)
  logStartup('Initializing AI assistant...');
  const assistant = getAssistant();
  logStartup(`AI Provider: ${assistant.getProvider().name}`);

  // 3. Start background scheduler
  logStartup('Starting background scheduler...');
  startScheduler();

  // 4. Initialize Discord Bot
  logStartup('Initializing Discord bot...');
  await initDiscordBot();

  // 5. Create Express app
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // CORS for local development / desktop app
  app.use((_req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE');
    next();
  });

  // Serve dashboard frontend
  app.use(express.static(path.join(process.cwd(), 'public')));

  // Mount API routes
  app.use('/api', routes);

  // Root → serve the dashboard UI
  app.get('/', (_req, res) => {
    res.sendFile(path.join(process.cwd(), 'public', 'index.html'));
  });

  // Start server
  const port = config.server.port;
  const server = app.listen(port, async () => {
    logStartup(`✅ Ultron is running on http://localhost:${port}`);

    // 5. Generate morning briefing (if morning time)
    if (isMorning()) {
      try {
        logStartup('Generating morning briefing...');
        const briefing = await generateMorningBriefing();
        const greeting = await assistant.generateMorningGreeting(briefing.summary);
        console.log('\n' + '='.repeat(60));
        console.log(greeting);
        console.log('='.repeat(60) + '\n');
      } catch (error) {
        logger.warn('Morning briefing failed (check API keys):', (error as Error).message);
        console.log('\n' + '='.repeat(60));
        console.log('Good Morning Boss! Ultron is ready. (Briefing unavailable — check your .env keys)');
        console.log('='.repeat(60) + '\n');
      }
    } else {
      console.log('\n' + '='.repeat(60));
      console.log('Welcome back Boss. Ultron is ready. Type your request.');
      console.log('='.repeat(60) + '\n');
    }
  });

  // Attach socket.io
  initSocket(server);

  // Graceful shutdown
  process.on('SIGINT', async () => {
    logger.info('Shutting down Ultron...');
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    logger.info('Ultron terminated.');
    process.exit(0);
  });

  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception:', error);
  });

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection:', reason);
  });
}

main().catch((error) => {
  console.error('❌ Failed to start Ultron:', error.message);
  console.error('👉 Make sure you have created a .env file from .env.example');
  process.exit(1);
});
