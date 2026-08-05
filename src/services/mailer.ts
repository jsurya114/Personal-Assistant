// ============================================
// Ultron AI — Outbound Job Application Mailer
// ============================================

import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';
import { config } from '../config';
import { getDatabase } from '../database';
import { applications } from '../database/schema';
import { logger } from '../utils/logger';
import { emitToDashboard } from './socket';
import { getAssistant } from '../agents/assistant';

export interface SendApplicationOptions {
  to: string;
  company: string;
  role: string;
  jobDescription?: string;
  customSubject?: string;
  customBody?: string;
  attachResume?: boolean;
}

export interface ApplicationEmailResult {
  success: boolean;
  messageId?: string;
  to: string;
  company: string;
  role: string;
  subject: string;
  body: string;
  resumeAttached: boolean;
  error?: string;
}

/**
 * Builds the standard application email body for Boss
 */
export function buildStandardApplicationBody(company: string, role: string): string {
  return `Hi,

I am Jayasoorya S, a Full Stack Developer, and I'd like to apply for the ${role} position at ${company}.

I have hands-on experience building production-ready web applications using React.js, Node.js, Express.js, MongoDB, PostgreSQL, TypeScript, and AWS. Some of my recent projects:

• Version Vault — A GitHub-like CI/CD platform with Docker-based pipeline execution, real-time log streaming via WebSockets, async job queuing with Redis and BullMQ, and full AWS deployment, built with React 18, TypeScript, and Node.js.
https://github.com/jsurya114/Version-Vault

• Dental Buddy — A freelance EMR system for a real dental clinic client with 5-level RBAC, multi-clinic support, and enterprise-grade security, built with React 18, Node.js, and MongoDB.
https://github.com/jsurya114/Dental-Buddy

• NasaLogistic — A logistics platform with role-based dashboards, REST APIs, and full AWS deployment, built with React, Node.js, and PostgreSQL.
https://github.com/jsurya114/NasaLogistic

I also have 5 months of professional collaboration experience working alongside an experienced full-stack developer in a production environment.

GitHub: https://github.com/jsurya114
Portfolio: https://portfolio-six-wheat-43.vercel.app
LinkedIn: https://www.linkedin.com/in/jayasoorya-suryadas

I have attached my resume for your reference and would be glad to discuss further.

Best regards,
Jayasoorya S
8281017439`;
}

/**
 * Tailors the application email using AI if a detailed Job Description is provided
 */
export async function generateTailoredApplicationEmail(company: string, role: string, jobDescription?: string): Promise<{ subject: string; body: string }> {
  const defaultSubject = `Application for ${role} – Jayasoorya S`;
  const defaultBody = buildStandardApplicationBody(company, role);

  if (!jobDescription || jobDescription.trim().length < 20) {
    return { subject: defaultSubject, body: defaultBody };
  }

  try {
    const prompt = `You are Boss (Jayasoorya S). You are applying for the role of "${role}" at "${company}".
Here is your standard application email format that you ALWAYS use:

${defaultBody}

Here is the target job description:
"""
${jobDescription.slice(0, 2000)}
"""

INSTRUCTIONS:
1. Maintain Boss's EXACT tone, structure, bullet points for the 3 projects (Version Vault, Dental Buddy, NasaLogistic with GitHub links), GitHub link, Portfolio link, LinkedIn link, and contact info (Jayasoorya S, 8281017439).
2. Slightly emphasize the most relevant tech stack mentioned in the job description in the skills sentence.
3. Return ONLY the plain text email body ready to be sent (do NOT wrap in markdown quotes or add placeholder comments).`;

    const assistant = getAssistant();
    const res = await assistant.chat({ message: prompt, conversationId: 'email-gen' });
    const generatedBody = res.response.trim();

    return {
      subject: defaultSubject,
      body: generatedBody.length > 50 ? generatedBody : defaultBody,
    };
  } catch (error) {
    logger.warn('AI tailoring failed, falling back to standard template:', error);
    return { subject: defaultSubject, body: defaultBody };
  }
}

/**
 * Sends a job application email with optional resume attachment and tracks it in DB
 */
export async function sendApplicationEmail(options: SendApplicationOptions): Promise<ApplicationEmailResult> {
  const { to, company, role, jobDescription, customSubject, customBody, attachResume = true } = options;

  const subject = customSubject || `Application for ${role} – Jayasoorya S`;
  const body = customBody || buildStandardApplicationBody(company, role);

  if (!config.email.password) {
    const errMsg = `Gmail App Password not configured in .env. Please set GMAIL_APP_PASSWORD so Ultron can send outbound emails from ${config.email.user}.`;
    logger.error(`[MAILER] ${errMsg}`);
    return {
      success: false,
      to,
      company,
      role,
      subject,
      body,
      resumeAttached: false,
      error: errMsg,
    };
  }

  try {
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: {
        user: config.email.user,
        pass: config.email.password,
      },
    });

    const attachments: Array<{ filename: string; path: string }> = [];
    let resumeFound = false;

    if (attachResume) {
      const resumePath = path.resolve('./resume/resume.pdf');
      if (fs.existsSync(resumePath)) {
        attachments.push({
          filename: 'Jayasoorya_S_Resume.pdf',
          path: resumePath,
        });
        resumeFound = true;
      } else {
        logger.warn('[MAILER] resume/resume.pdf not found; sending email without attachment.');
      }
    }

    const mailOptions = {
      from: `"Jayasoorya S" <${config.email.user}>`,
      to,
      subject,
      text: body,
      attachments,
    };

    logger.info(`[MAILER] Dispatching application email to ${to} (${company} - ${role})...`);
    const info = await transporter.sendMail(mailOptions);
    logger.info(`[MAILER] Email successfully sent! Message ID: ${info.messageId}`);

    // Track application in database
    try {
      await getDatabase().insert(applications).values({
        company,
        role,
        platform: 'Email Dispatch',
        status: 'applied',
        matchScore: 100,
        url: `mailto:${to}`,
        notes: `Application sent via Ultron to ${to}. Resume attached: ${resumeFound ? 'Yes' : 'No'}. Message ID: ${info.messageId}`,
        appliedAt: new Date().toISOString(),
      });
      logger.info(`[MAILER] Logged application in SQLite for ${company}`);
    } catch (dbErr) {
      logger.warn('[MAILER] Failed to log application to DB:', dbErr);
    }

    emitToDashboard('APPLICATION_SENT', {
      to,
      company,
      role,
      subject,
      resumeAttached: resumeFound,
      timestamp: new Date().toISOString(),
    });

    return {
      success: true,
      messageId: info.messageId,
      to,
      company,
      role,
      subject,
      body,
      resumeAttached: resumeFound,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error(`[MAILER] Failed to send application email: ${errorMsg}`);
    return {
      success: false,
      to,
      company,
      role,
      subject,
      body,
      resumeAttached: false,
      error: errorMsg,
    };
  }
}
