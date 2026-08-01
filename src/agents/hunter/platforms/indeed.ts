// ============================================
// Ultron AI — Indeed & Remote Tech Sub-Agent
// Searches real-time software developer opportunities
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

export const indeedSubAgent: JobPlatformSubAgent = {
  name: 'Indeed',

  async search(query: string = 'Backend Developer'): Promise<JobMatch[]> {
    try {
      logAgent('HUNTER-INDEED', `🔍 Searching tech job feeds for: ${query}`);
      const response = await axios.get('https://remotive.com/api/remote-jobs?category=software-dev&limit=15', {
        timeout: 10000,
      });

      const jobs = (response.data?.jobs || []) as Array<{
        title: string;
        company_name: string;
        url: string;
        candidate_required_location?: string;
        description?: string;
        salary?: string;
        tags?: string[];
      }>;

      const resumeSkills = loadResumeSkills();
      const matches: JobMatch[] = [];

      for (const job of jobs) {
        const desc = `${job.title} ${job.description || ''} ${(job.tags || []).join(' ')}`;
        const keywords = desc.toLowerCase().split(/\W+/).filter((w) => w.length > 2);
        const matchScore = calculateMatchScore(resumeSkills, keywords);

        if (matchScore >= 35 || /backend|node|full.?stack|typescript|react|developer|engineer/i.test(job.title)) {
          matches.push({
            company: job.company_name,
            role: job.title,
            platform: 'Indeed/Remotive',
            matchScore: Math.max(matchScore, 55),
            url: job.url,
            description: (job.description || '').replace(/<[^>]+>/g, '').slice(0, 300),
            location: job.candidate_required_location || 'Remote / Worldwide',
            salary: job.salary || undefined,
            discoveredAt: new Date().toISOString(),
          });
        }
      }

      logAgent('HUNTER-INDEED', `✅ Found ${matches.length} matching jobs on Indeed/Remotive`);
      return matches;
    } catch (error: unknown) {
      const err = error as { message?: string };
      logger.error(`[HUNTER-INDEED] Error: ${err.message}`);
      return [];
    }
  },
};
