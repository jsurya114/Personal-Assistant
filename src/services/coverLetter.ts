// ============================================
// Ultron AI — Cover Letter Generator
// ============================================

import { getAssistant } from '../agents/assistant';
import fs from 'fs';
import path from 'path';

export async function generateCoverLetter(jobTitle: string, company: string, description: string): Promise<string> {
  const rulesPath = path.resolve('./resume/resume-rules.md');
  let resumeContent = '';
  
  if (fs.existsSync(rulesPath)) {
    resumeContent = fs.readFileSync(rulesPath, 'utf-8');
  }

  const prompt = `
You are Boss (Jayasurya S). Write a professional, concise, and enthusiastic cover letter for the following job.
Do not include placeholders like "[Your Address]" — just start with the greeting and end with your name.

Job Title: ${jobTitle}
Company: ${company}
Job Description:
${description.slice(0, 2000)} // truncate to save tokens

Boss's Background (use this to match skills):
${resumeContent}
  `;

  const assistant = getAssistant();
  const result = await assistant.chat({ message: prompt, conversationId: 'cover-letter-gen' });
  return result.response;
}
