// ============================================
// Ultron AI — Hunter Agent (Career Assistant)
// Searches jobs, scores matches, tracks applications
// ============================================

import axios from 'axios';
import { getSqlite } from '../../database';
import { JobMatch, JobApplication, ApplicationStatus } from '../../types';
import { logger, logAgent } from '../../utils/logger';
import { config } from '../../config';
import { calculateMatchScore } from '../../utils/helpers';
import fs from 'fs';
import path from 'path';

// Skills loaded from resume-rules.md
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
}import { linkedInSubAgent } from './platforms/linkedin';
import { indeedSubAgent } from './platforms/indeed';
import { glassdoorSubAgent } from './platforms/glassdoor';

const PREFERRED_ROLES = [
  'Backend Developer',
  'Full Stack Developer',
  'MERN Stack Developer',
  'Node.js Developer',
  'Software Engineer',
  'TypeScript Developer',
];

export const hunterAgent = {
  // Platform Sub-Agents
  linkedIn: linkedInSubAgent,
  indeed: indeedSubAgent,
  glassdoor: glassdoorSubAgent,

  // ---- Job Search via JSearch (RapidAPI) ----
  async searchJobsJSearch(query: string = 'Backend Developer Node.js TypeScript'): Promise<JobMatch[]> {
    if (!config.jobs.rapidApiKey) {
      logAgent('HUNTER', 'JSearch skipped: RAPIDAPI_KEY not set');
      return [];
    }

    try {
      logAgent('HUNTER', `Searching JSearch for: ${query}`);
      const response = await axios.get('https://jsearch.p.rapidapi.com/search-v2', {
        params: {
          query,
          page: '1',
          num_pages: '1',
          date_posted: 'month',
          remote_jobs_only: 'false',
          employment_types: 'FULLTIME',
        },
        headers: {
          'X-RapidAPI-Key': config.jobs.rapidApiKey,
          'X-RapidAPI-Host': 'jsearch.p.rapidapi.com',
        },
        timeout: 15000,
      });

      const jobs = response.data?.data?.jobs || [];
      const resumeSkills = loadResumeSkills();

      return jobs
        .map((job: Record<string, unknown>) => {
          const description = `${job.job_title} ${job.job_description} ${(job.job_required_skills as string[] | null)?.join(' ') || ''}`;
          const keywords = description.toLowerCase().split(/\W+/).filter((w: string) => w.length > 3);
          const matchScore = calculateMatchScore(resumeSkills, keywords);

          return {
            company: String(job.employer_name || 'Unknown'),
            role: String(job.job_title || 'Unknown'),
            platform: String(job.job_via || 'JSearch'),
            matchScore,
            url: String(job.job_apply_link || job.job_google_link || ''),
            description: String((job.job_description as string || '').slice(0, 500)),
            location: `${job.job_city || ''} ${job.job_country || ''}`.trim(),
            salary: job.job_salary_period ? `${job.job_min_salary || '?'} - ${job.job_max_salary || '?'} ${job.job_salary_period}` : undefined,
            discoveredAt: new Date().toISOString(),
          } as JobMatch;
        })
        .filter((j: JobMatch) => j.matchScore >= 40);
    } catch (error: unknown) {
      const err = error as { response?: { data?: unknown }; message?: string };
      logger.error('JSearch API error:', err.response?.data || err.message);
      return [];
    }
  },

  // ---- Job Search via Adzuna ----
  async searchJobsAdzuna(): Promise<JobMatch[]> {
    if (!config.jobs.adzunaAppId || !config.jobs.adzunaAppKey) {
      return [];
    }

    try {
      logAgent('HUNTER', 'Searching Adzuna...');
      const response = await axios.get(
        `https://api.adzuna.com/v1/api/jobs/in/search/1`,
        {
          params: {
            app_id: config.jobs.adzunaAppId,
            app_key: config.jobs.adzunaAppKey,
            results_per_page: 20,
            what: 'Node.js TypeScript Backend Developer',
            content_type: 'application/json',
          },
          timeout: 15000,
        }
      );

      const jobs = response.data?.results || [];
      const resumeSkills = loadResumeSkills();

      return jobs
        .map((job: Record<string, unknown>) => {
          const desc = `${job.title} ${job.description}`;
          const keywords = desc.toLowerCase().split(/\W+/).filter((w: string) => w.length > 3);
          const matchScore = calculateMatchScore(resumeSkills, keywords);

          return {
            company: String((job.company as { display_name?: string })?.display_name || 'Unknown'),
            role: String(job.title || 'Unknown'),
            platform: 'Adzuna',
            matchScore,
            url: String(job.redirect_url || ''),
            description: String((job.description as string || '').slice(0, 500)),
            location: String((job.location as { display_name?: string })?.display_name || ''),
            salary: job.salary_min ? `${job.salary_min} - ${job.salary_max || '?'}` : undefined,
            discoveredAt: new Date().toISOString(),
          } as JobMatch;
        })
        .filter((j: JobMatch) => j.matchScore >= 40);
    } catch (error: unknown) {
      const err = error as { response?: { data?: unknown }; message?: string };
      logger.error('Adzuna API error:', err.response?.data || err.message);
      return [];
    }
  },

  // ---- Run Multi-Platform Job Search ----
  async runJobSearch(): Promise<{ found: number; saved: number; newJobs: JobMatch[] }> {
    logAgent('HUNTER', '🔍 Starting autonomous multi-platform job hunt across sub-agents...');

    const subAgentPromises = [
      this.linkedIn.search('Backend Developer Node.js India'),
      this.indeed.search('Backend Developer TypeScript Node.js India'),
      this.glassdoor.search('Node.js Backend Engineer India'),
      this.searchJobsJSearch('Backend Developer Node.js TypeScript India'),
      this.searchJobsAdzuna(),
    ];

    const results = await Promise.allSettled(subAgentPromises);
    const allJobs: JobMatch[] = [];

    for (const result of results) {
      if (result.status === 'fulfilled' && Array.isArray(result.value)) {
        allJobs.push(...result.value);
      }
    }

    const uniqueJobs = deduplicateJobs(allJobs);
    const { savedCount, newlySaved } = this.saveJobMatchesWithDetails(uniqueJobs);

    logAgent(
      'HUNTER',
      `✅ Multi-agent search finished: ${uniqueJobs.length} total matches, ${savedCount} new jobs saved`
    );

    return { found: uniqueJobs.length, saved: savedCount, newJobs: newlySaved };
  },

  saveJobMatchesWithDetails(jobs: JobMatch[]): { savedCount: number; newlySaved: JobMatch[] } {
    const sqlite = getSqlite();
    let savedCount = 0;
    const newlySaved: JobMatch[] = [];

    for (const job of jobs) {
      try {
        const exists = sqlite
          .prepare('SELECT id FROM job_matches WHERE company = ? AND role = ?')
          .get(job.company, job.role);

        if (!exists) {
          sqlite
            .prepare(
              `INSERT INTO job_matches (company, role, platform, match_score, url, description, location, salary, discovered_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
            )
            .run(
              job.company,
              job.role,
              job.platform,
              job.matchScore,
              job.url,
              job.description || '',
              job.location || '',
              job.salary || '',
              job.discoveredAt
            );
          savedCount++;
          newlySaved.push(job);
        }
      } catch (error) {
        logger.error('Failed to save job match:', error);
      }
    }

    return { savedCount, newlySaved };
  },

  saveJobMatches(jobs: JobMatch[]): number {
    return this.saveJobMatchesWithDetails(jobs).savedCount;
  },

  getTopJobMatches(limit: number = 10): JobMatch[] {
    try {
      const sqlite = getSqlite();
      const rows = sqlite
        .prepare(
          `SELECT * FROM job_matches ORDER BY match_score DESC, discovered_at DESC LIMIT ?`
        )
        .all(limit) as Array<{
          id: number;
          company: string;
          role: string;
          platform: string;
          match_score: number;
          url: string;
          description: string;
          location: string;
          salary: string;
          discovered_at: string;
        }>;

      return rows.map((r) => ({
        id: r.id,
        company: r.company,
        role: r.role,
        platform: r.platform,
        matchScore: r.match_score,
        url: r.url,
        description: r.description,
        location: r.location,
        salary: r.salary,
        discoveredAt: r.discovered_at,
      }));
    } catch (error) {
      logger.error('Failed to get job matches:', error);
      return [];
    }
  },

  getApplications(): JobApplication[] {
    try {
      const sqlite = getSqlite();
      const rows = sqlite
        .prepare('SELECT * FROM applications ORDER BY applied_at DESC')
        .all() as Array<{
          id: number;
          company: string;
          role: string;
          platform: string | null;
          status: ApplicationStatus;
          match_score: number | null;
          url: string | null;
          notes: string | null;
          applied_at: string | null;
        }>;

      return rows.map((r) => ({
        id: r.id,
        company: r.company,
        role: r.role,
        platform: r.platform || undefined,
        status: r.status,
        matchScore: r.match_score || undefined,
        url: r.url || undefined,
        notes: r.notes || undefined,
        appliedAt: r.applied_at || undefined,
      }));
    } catch (error) {
      logger.error('Failed to get applications:', error);
      return [];
    }
  },

  updateApplicationStatus(id: number, status: ApplicationStatus, notes?: string): void {
    try {
      const sqlite = getSqlite();
      sqlite
        .prepare('UPDATE applications SET status = ?, notes = ? WHERE id = ?')
        .run(status, notes || null, id);
    } catch (error) {
      logger.error('Failed to update application:', error);
    }
  },
};

function deduplicateJobs(jobs: JobMatch[]): JobMatch[] {
  const seen = new Set<string>();
  return jobs.filter((job) => {
    const key = `${job.company.toLowerCase()}-${job.role.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
