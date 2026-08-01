// ============================================
// Ultron AI — LinkedIn Job Search Sub-Agent
// Searches live LinkedIn postings in real-time
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
      'REST API', 'GraphQL', 'Git', 'Linux',
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

export const linkedInSubAgent: JobPlatformSubAgent = {
  name: 'LinkedIn',

  async search(query: string = 'Node.js Backend Developer India'): Promise<JobMatch[]> {
    try {
      logAgent('HUNTER-LINKEDIN', `🔍 Searching LinkedIn for: ${query}`);
      const encodedQuery = encodeURIComponent(query.replace(/\bIndia\b/i, '').trim() || 'Backend Developer Node.js');
      const url = `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=${encodedQuery}&location=India&f_TPR=r2592000`;

      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        timeout: 10000,
      });

      const cards = String(response.data || '').split(/<li\b/gi).slice(1);
      const resumeSkills = loadResumeSkills();
      const matches: JobMatch[] = [];

      for (const card of cards) {
        const titleMatch = card.match(/base-search-card__title[^>]*>([\s\S]*?)<\/h3>/i);
        const companyMatch = card.match(/base-search-card__subtitle[^>]*>([\s\S]*?)<\/h4>/i);
        const locMatch = card.match(/job-search-card__location[^>]*>([\s\S]*?)<\/span>/i);
        const linkMatch = card.match(/href="([^"]*linkedin\.com\/jobs\/view\/[^"]*)"/i);

        const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : '';
        const company = companyMatch ? companyMatch[1].replace(/<[^>]+>/g, '').trim() : '';
        const location = locMatch ? locMatch[1].replace(/<[^>]+>/g, '').trim() : 'India';
        const link = linkMatch ? linkMatch[1].split('?')[0] : '';

        if (title && company && link) {
          const description = `${title} ${company} ${location} Node.js TypeScript Backend JavaScript`;
          const keywords = description.toLowerCase().split(/\W+/).filter((w: string) => w.length > 2);
          const matchScore = Math.max(50, calculateMatchScore(resumeSkills, keywords));

          matches.push({
            company,
            role: title,
            platform: 'LinkedIn',
            matchScore,
            url: link,
            description: `Live LinkedIn opportunity for ${title} at ${company}. Location: ${location}`,
            location,
            discoveredAt: new Date().toISOString(),
          });
        }
      }

      logAgent('HUNTER-LINKEDIN', `✅ Found ${matches.length} matching jobs on LinkedIn`);
      return matches;
    } catch (error: unknown) {
      const err = error as { message?: string };
      logger.error(`[HUNTER-LINKEDIN] Error: ${err.message}`);
      return [];
    }
  },
};
