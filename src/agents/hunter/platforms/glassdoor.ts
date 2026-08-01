// ============================================
// Ultron AI — Glassdoor & ArbeitNow Sub-Agent
// Searches verified tech job listings
// ============================================

import axios from 'axios';
import { JobMatch } from '../../../types';
import { logger, logAgent } from '../../../utils/logger';
import { calculateMatchScore } from '../../../utils/helpers';
import { JobPlatformSubAgent } from './types';
import fs from 'fs';
import path from 'path';

function loadResumeSkills(): string[] {
  const rulesPath = path.resolve('./resume/resume-rules.md');
  if (!fs.existsSync(rulesPath)) {
    return [
      'Node.js', 'TypeScript', 'JavaScript', 'React', 'Next.js',
      'Express', 'PostgreSQL', 'MongoDB', 'Docker', 'AWS',
    ];
  }

  const content = fs.readFileSync(rulesPath, 'utf-8');
  const skillsMatch = content.match(/## Skills([\s\S]*?)##/);
  if (!skillsMatch) return [];

  const skillsSection = skillsMatch[1];
  return skillsSection
    .split('\n')
    .map((line) => line.replace(/^[-*]\s*/, '').trim())
    .filter((line) => line.length > 0);
}

export const glassdoorSubAgent: JobPlatformSubAgent = {
  name: 'Glassdoor',

  async search(query: string = 'Node.js Developer'): Promise<JobMatch[]> {
    try {
      logAgent('HUNTER-GLASSDOOR', `🔍 Searching tech job boards for: ${query}`);
      const response = await axios.get('https://www.arbeitnow.com/api/job-board-api', {
        timeout: 10000,
      });

      const jobs = (response.data?.data || []) as Array<{
        title: string;
        company_name: string;
        url: string;
        location?: string;
        description?: string;
        tags?: string[];
      }>;

      const resumeSkills = loadResumeSkills();
      const matches: JobMatch[] = [];

      for (const job of jobs) {
        const tagsStr = Array.isArray(job.tags) ? job.tags.join(' ') : String(job.tags || '');
        const desc = `${job.title} ${job.description || ''} ${tagsStr}`;
        const keywords = desc.toLowerCase().split(/\W+/).filter((w) => w.length > 2);
        const matchScore = calculateMatchScore(resumeSkills, keywords);

        if (matchScore >= 35 || /backend|node|full.?stack|typescript|react|developer|engineer|software/i.test(job.title)) {
          matches.push({
            company: job.company_name,
            role: job.title,
            platform: 'Glassdoor/ArbeitNow',
            matchScore: Math.max(matchScore, 50),
            url: job.url,
            description: (job.description || '').replace(/<[^>]+>/g, '').slice(0, 300),
            location: job.location || 'Remote / India',
            discoveredAt: new Date().toISOString(),
          });
        }
      }

      logAgent('HUNTER-GLASSDOOR', `✅ Found ${matches.length} matching jobs on Glassdoor/ArbeitNow`);
      return matches;
    } catch (error: unknown) {
      const err = error as { message?: string };
      logger.error(`[HUNTER-GLASSDOOR] Error: ${err.message}`);
      return [];
    }
  },
};
