// ============================================
// Ultron AI — Background Scheduler (node-cron)
// ============================================

import cron from 'node-cron';
import { memoryManager } from '../memory';
import { hunterAgent } from '../hunter';
import { sentinelAgent } from '../sentinel';
import { courierAgent } from '../courier';
import { generateMorningBriefing, generateNightSummary } from '../../services/briefing';
import { getTopNews } from '../../services/news';
import { logger, logScheduler } from '../../utils/logger';
import { sendDiscordAlert } from '../../services/discord/bot';

interface ScheduledJob {
  name: string;
  schedule: string;
  task: cron.ScheduledTask;
}

const jobs: ScheduledJob[] = [];

export function startScheduler(): void {
  logger.info('⏰ Starting background scheduler...');

  // Every 5 minutes — Memory sync
  register('memory-sync', '*/5 * * * *', async () => {
    logScheduler('MEMORY', 'Syncing memory...');
    memoryManager.sync();
  });

  // Every 15 minutes — Sentinel Email Inbox Check for Job Alerts
  register('sentinel-inbox', '*/15 * * * *', async () => {
    logScheduler('SENTINEL', 'Checking inbox for new job alerts...');
    await sentinelAgent.checkJobEmails().catch((e) => {
      logger.debug(`Sentinel email check skipped: ${e}`);
    });
  });

  // Every 30 minutes — Refresh news cache
  register('news-refresh', '*/30 * * * *', async () => {
    logScheduler('NEWS', 'Refreshing news cache...');
    await getTopNews('tech').catch((e) => logger.warn('News refresh failed:', e));
  });

  // Every 2 hours — Autonomous Multi-Agent Job Search
  register('job-search', '0 */2 * * *', async () => {
    logScheduler('HUNTER', 'Running autonomous multi-platform job hunt...');
    const result = await hunterAgent.runJobSearch().catch((e) => {
      logger.error('Job search failed:', e);
      return { found: 0, saved: 0, newJobs: [] };
    });
    logScheduler('HUNTER', `Job search complete: ${result.found} found, ${result.saved} new`);
    
    if (result.saved > 0 && result.newJobs.length > 0) {
      await courierAgent.dispatchJobAlert(result.newJobs);
    }
  });

  // Every morning at 8:00 AM — Morning briefing
  register('morning-briefing', '0 8 * * *', async () => {
    logScheduler('BRIEFING', 'Generating morning briefing...');
    try {
      const { summary } = await generateMorningBriefing();
      logger.info('🌅 Morning Briefing ready.');
      sendDiscordAlert(`🌅 **Good Morning Boss!**\n\n${summary}`);
    } catch (e) {
      logger.error('Morning briefing failed:', e);
    }
  });

  // Every night at 10:00 PM — Daily summary
  register('night-summary', '0 22 * * *', async () => {
    logScheduler('BRIEFING', 'Generating night summary...');
    const summary = await generateNightSummary().catch((e) => {
      logger.error('Night summary failed:', e);
      return 'Summary generation failed.';
    });
    logger.info('📊 Night Summary:\n' + summary);
    sendDiscordAlert(`🌙 **Night Summary:**\n\n${summary}`);
  });

  // Every Sunday at 8:00 AM — Weekly report
  register('weekly-report', '0 8 * * 0', async () => {
    logScheduler('REPORT', 'Generating weekly report...');
    // TODO: implement weekly report in Phase 2
    logger.info('📅 Weekly report: coming in Phase 2');
  });

  logger.info(`✅ Scheduler started with ${jobs.length} jobs`);
}

function register(name: string, schedule: string, fn: () => Promise<void>): void {
  const task = cron.schedule(schedule, async () => {
    try {
      await fn();
    } catch (error) {
      logger.error(`Scheduler job "${name}" failed:`, error);
    }
  });

  jobs.push({ name, schedule, task });
  logger.debug(`  Registered cron: ${name} (${schedule})`);
}

export function stopScheduler(): void {
  jobs.forEach((j) => j.task.stop());
  logger.info('Scheduler stopped.');
}

export function getSchedulerStatus(): Array<{ name: string; schedule: string }> {
  return jobs.map((j) => ({ name: j.name, schedule: j.schedule }));
}
