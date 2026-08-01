// ============================================
// Ultron AI — Daily Briefing Composer
// ============================================

import { getWeather, formatWeatherSummary } from './weather';
import { getTopNews, formatNewsSummary } from './news';
import { getTimeInfo } from './time';
import { hunterAgent } from '../agents/hunter';
import { getSqlite } from '../database';
import { logger } from '../utils/logger';
import { getGreeting } from '../utils/helpers';
import { DailyBriefing, Task } from '../types';

export async function generateMorningBriefing(): Promise<DailyBriefing> {
  logger.info('📋 Generating morning briefing...');

  const [weather, news, jobMatches] = await Promise.all([
    getWeather().catch(() => null),
    getTopNews('tech').catch(() => []),
    Promise.resolve(hunterAgent.getTopJobMatches(5)),
  ]);

  const tasks = getTodaysTasks();
  const pendingApplications = getPendingApplicationsCount();
  const timeInfo = getTimeInfo();

  const weatherStr = weather ? formatWeatherSummary(weather) : 'Weather unavailable';
  const newsStr = formatNewsSummary(news);
  const jobStr =
    jobMatches.length > 0
      ? jobMatches.map((j) => `• ${j.company} — ${j.role} (${j.matchScore}% match)`).join('\n')
      : 'No new matches yet.';

  const summary = `
${getGreeting()} Boss! Here's your morning briefing:

📅 ${timeInfo.date}

🌤️ Weather: ${weatherStr}

📰 Top News:
${newsStr}

✅ Today's Tasks: ${tasks.length > 0 ? tasks.map((t) => `• ${t.title}`).join('\n') : 'No tasks set.'}

💼 Job Matches: 
${jobStr}

📝 Pending Applications: ${pendingApplications}

What's today's plan?
`.trim();

  return {
    greeting: getGreeting(),
    date: timeInfo.date,
    weather: weather || undefined,
    news,
    tasks,
    jobMatches,
    pendingApplications,
    summary,
  };
}

export async function generateNightSummary(): Promise<string> {
  const tasks = getTodaysTasks();
  const completed = tasks.filter((t) => t.completed);
  const apps = hunterAgent.getApplications();
  const timeInfo = getTimeInfo();

  const summary = `
📊 Daily Summary — ${timeInfo.date}

✅ Tasks Completed: ${completed.length}/${tasks.length}
${completed.map((t) => `  • ${t.title}`).join('\n') || '  None'}

💼 Applications Reviewed Today: ${apps.filter((a) => a.appliedAt?.startsWith(new Date().toISOString().split('T')[0])).length}

Good night Boss. Rest well — we continue tomorrow! 🌙
`.trim();

  // Save to daily_reports
  try {
    const sqlite = getSqlite();
    sqlite
      .prepare('INSERT INTO daily_reports (report, created_at) VALUES (?, ?)')
      .run(summary, new Date().toISOString());
  } catch (error) {
    logger.error('Failed to save night summary:', error);
  }

  return summary;
}

function getTodaysTasks(): Task[] {
  try {
    const sqlite = getSqlite();
    const today = new Date().toISOString().split('T')[0];
    const rows = sqlite
      .prepare(
        'SELECT * FROM tasks WHERE completed = 0 AND (due_date IS NULL OR due_date <= ?)'
      )
      .all(today) as Array<{
        id: number;
        title: string;
        completed: number;
        priority: 'low' | 'medium' | 'high' | null;
        due_date: string | null;
      }>;

    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      completed: Boolean(r.completed),
      priority: r.priority || 'medium',
      dueDate: r.due_date || undefined,
    }));
  } catch {
    return [];
  }
}

function getPendingApplicationsCount(): number {
  try {
    const sqlite = getSqlite();
    const row = sqlite
      .prepare("SELECT COUNT(*) as count FROM applications WHERE status IN ('saved','ready')")
      .get() as { count: number };
    return row.count;
  } catch {
    return 0;
  }
}
