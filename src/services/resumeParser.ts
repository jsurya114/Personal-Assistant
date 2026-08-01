// ============================================
// Ultron AI — Dynamic Resume Parser & Analyzer
// Automatically parses PDF/Text/MD resumes in resume/
// ============================================

import fs from 'fs';
import path from 'path';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParse = require('pdf-parse');
import { logger, logAgent } from '../utils/logger';

export interface ParsedResumeProfile {
  name: string;
  email: string;
  phone: string;
  location: string;
  summary: string;
  targetRoles: string[];
  skills: string[];
  experienceYears: number;
  education: string[];
  rawText: string;
  lastParsedAt: string;
}

const DEFAULT_PROFILE: ParsedResumeProfile = {
  name: 'Jayasurya S',
  email: 'jayasuryabrocamp@gmail.com',
  phone: '+918281017439',
  location: 'Chennai, India',
  summary: 'Backend / Full Stack Developer specializing in Node.js, TypeScript, Express, PostgreSQL, and Cloud.',
  targetRoles: ['Backend Developer', 'Node.js Developer', 'Full Stack Developer', 'Software Engineer'],
  skills: [
    'Node.js', 'TypeScript', 'JavaScript', 'Express', 'React', 'Next.js',
    'PostgreSQL', 'MongoDB', 'Redis', 'Docker', 'AWS', 'REST API',
    'GraphQL', 'Git', 'Linux', 'Microservices', 'TailwindCSS', 'Jest'
  ],
  experienceYears: 2,
  education: ['Brototype (Brocamp)'],
  rawText: '',
  lastParsedAt: new Date().toISOString(),
};

let cachedProfile: ParsedResumeProfile | null = null;

export async function parseResumeFolder(): Promise<ParsedResumeProfile> {
  const resumeDir = path.resolve('./resume');

  if (!fs.existsSync(resumeDir)) {
    fs.mkdirSync(resumeDir, { recursive: true });
    return DEFAULT_PROFILE;
  }

  const files = fs.readdirSync(resumeDir);
  const pdfFile = files.find((f) => f.toLowerCase().endsWith('.pdf'));
  const txtFile = files.find((f) => f.toLowerCase().endsWith('.txt') || f.toLowerCase().endsWith('.md'));

  let extractedText = '';

  try {
    if (pdfFile) {
      const pdfPath = path.join(resumeDir, pdfFile);
      const dataBuffer = fs.readFileSync(pdfPath);
      logAgent('RESUME', `📄 Parsing resume PDF: ${pdfFile}...`);
      const parseFunc = typeof pdfParse === 'function' ? pdfParse : (pdfParse as any).default;
      const pdfData = await parseFunc(dataBuffer);
      extractedText = pdfData?.text || '';
    } else if (txtFile) {
      const txtPath = path.join(resumeDir, txtFile);
      extractedText = fs.readFileSync(txtPath, 'utf-8');
    }
  } catch (error) {
    logger.error('Failed to read resume file:', error);
  }

  if (!extractedText || extractedText.trim().length < 50) {
    // Read fallback rules if available
    return cachedProfile || DEFAULT_PROFILE;
  }

  // Extract fields via heuristics and NLP patterns
  const profile = analyzeResumeText(extractedText);
  cachedProfile = profile;
  
  // Sync extracted skills to resume-rules.md
  syncResumeRules(profile);

  return profile;
}

function analyzeResumeText(text: string): ParsedResumeProfile {
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  
  // 1. Email
  const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  const email = emailMatch ? emailMatch[0] : DEFAULT_PROFILE.email;

  // 2. Phone
  const phoneMatch = text.match(/(?:\+91|91)?[\s-]?[6-9]\d{9}/) || text.match(/\+?\d[\d\s-]{8,14}\d/);
  const phone = phoneMatch ? phoneMatch[0].replace(/\s+/g, '') : DEFAULT_PROFILE.phone;

  // 3. Name (usually first 1-3 lines)
  const nameCandidate = lines.find((l) => l.length > 2 && l.length < 35 && !l.includes('@') && !l.includes('http') && !/resume|curriculum/i.test(l));
  const name = nameCandidate || DEFAULT_PROFILE.name;

  // 4. Tech Skills extraction
  const KNOWN_TECH = [
    'Node.js', 'NodeJS', 'TypeScript', 'JavaScript', 'Express', 'React', 'React.js',
    'Next.js', 'NextJS', 'NestJS', 'PostgreSQL', 'Postgres', 'MongoDB', 'Redis',
    'Docker', 'Kubernetes', 'AWS', 'GCP', 'REST API', 'GraphQL', 'Prisma', 'Drizzle',
    'TypeORM', 'Mongoose', 'TailwindCSS', 'HTML5', 'CSS3', 'Git', 'GitHub', 'Linux',
    'Jest', 'Mocha', 'Chai', 'Socket.io', 'Microservices', 'Kafka', 'RabbitMQ',
    'CI/CD', 'GitHub Actions', 'Python', 'C++', 'Java', 'SQL', 'NoSQL'
  ];

  const foundSkills = new Set<string>();
  const lowerText = text.toLowerCase();

  for (const tech of KNOWN_TECH) {
    const techLower = tech.toLowerCase();
    const escaped = techLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(^|\\W)${escaped}(\\W|$)`, 'i');
    if (regex.test(lowerText)) {
      foundSkills.add(tech);
    }
  }

  const skillsList = foundSkills.size > 0 ? Array.from(foundSkills) : DEFAULT_PROFILE.skills;

  return {
    name,
    email,
    phone,
    location: DEFAULT_PROFILE.location,
    summary: lines.slice(0, 5).join(' ').slice(0, 300),
    targetRoles: ['Backend Developer', 'Node.js Developer', 'Full Stack Developer'],
    skills: skillsList,
    experienceYears: DEFAULT_PROFILE.experienceYears,
    education: DEFAULT_PROFILE.education,
    rawText: text,
    lastParsedAt: new Date().toISOString(),
  };
}

function syncResumeRules(profile: ParsedResumeProfile): void {
  try {
    const rulesPath = path.resolve('./resume/resume-rules.md');
    const content = `# Resume Rules & Boss Profile (Auto-Synced from Resume)

> Auto-generated and updated by Ultron Dynamic Resume Parser
> Last updated: ${profile.lastParsedAt}

---

## Boss Details
- **Name:** ${profile.name}
- **Email:** ${profile.email}
- **Phone:** ${profile.phone}
- **Location:** ${profile.location}

---

## Skills
${profile.skills.map((s) => `- ${s}`).join('\n')}

---

## Target Roles
${profile.targetRoles.map((r) => `- ${r}`).join('\n')}
`;
    fs.writeFileSync(rulesPath, content, 'utf-8');
    logAgent('RESUME', `✅ Synced ${profile.skills.length} skills from resume into resume-rules.md`);
  } catch (error) {
    logger.error('Failed to sync resume-rules.md:', error);
  }
}

export function getCachedProfile(): ParsedResumeProfile {
  return cachedProfile || DEFAULT_PROFILE;
}
