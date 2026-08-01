// ============================================
// Ultron AI — Sentinel Agent (Inbox & Job Monitor)
// Watches inbox for application updates & interviews
// ============================================

import { fetchRecentJobEmails, EmailMessage } from '../../services/gmail';
import { courierAgent } from '../courier';
import { getSqlite } from '../../database';
import { logger, logAgent } from '../../utils/logger';
import { config } from '../../config';

const JOB_KEYWORDS = [
  'application',
  'interview',
  'offer',
  'assessment',
  'shortlisted',
  'rejected',
  'rejection',
  'status update',
  'recruiter',
  'careers',
  'hiring team',
  'linkedin',
  'indeed',
  'greenhouse',
  'lever.co',
  'workday',
  'naukri',
];

export const sentinelAgent = {
  /**
   * Scans inbox and triggers alerts for new job-related emails
   */
  async checkJobEmails(): Promise<{ checked: number; alerted: number }> {
    logAgent('SENTINEL', '🔍 Scanning inbox for job updates and interview invites...');

    const emails = await fetchRecentJobEmails(10);
    if (emails.length === 0) {
      logAgent('SENTINEL', 'No new emails found or IMAP credentials not set.');
      return { checked: 0, alerted: 0 };
    }

    let alertedCount = 0;
    const sqlite = getSqlite();

    for (const email of emails) {
      const isJobRelated = this.isJobRelated(email);
      if (!isJobRelated) continue;

      // Check if already processed
      const alreadyAlerted = this.isAlreadyAlerted(sqlite, email.id);
      if (alreadyAlerted) continue;

      // Mark as alerted
      this.markAsAlerted(sqlite, email.id, email.subject);

      // Generate natural speech/text summary
      const summary = this.generateSummary(email);

      // Dispatch alert across WhatsApp, Discord, and Voice
      await courierAgent.dispatchEmailAlert({
        from: email.from,
        subject: email.subject,
        summary,
        receivedAt: email.date,
      });

      alertedCount++;
    }

    logAgent('SENTINEL', `✅ Scan complete. Checked ${emails.length} emails, sent ${alertedCount} new alerts.`);
    return { checked: emails.length, alerted: alertedCount };
  },

  /**
   * Retrieves recent inbox emails for the assistant to summarize
   */
  async getRecentEmails(limit: number = 5): Promise<{ emails: EmailMessage[]; error?: string }> {
    const { password, user } = config.email;
    if (!password) {
      return {
        emails: [],
        error: `Gmail App Password is not configured in .env for ${user}. Boss needs to generate a 16-character Google App Password at https://myaccount.google.com/apppasswords so Ultron can securely read incoming emails.`
      };
    }

    try {
      const emails = await fetchRecentJobEmails(limit);
      return { emails };
    } catch (e: any) {
      return { emails: [], error: e.message || 'Failed to connect to Gmail IMAP server.' };
    }
  },

  isJobRelated(email: EmailMessage): boolean {
    const text = `${email.from} ${email.subject}`.toLowerCase();
    return JOB_KEYWORDS.some((kw) => text.includes(kw));
  },

  isAlreadyAlerted(sqlite: ReturnType<typeof getSqlite>, emailId: string): boolean {
    try {
      const row = sqlite
        .prepare('SELECT value FROM settings WHERE key = ?')
        .get(`sentinel_email_${emailId}`);
      return !!row;
    } catch {
      return false;
    }
  },

  markAsAlerted(sqlite: ReturnType<typeof getSqlite>, emailId: string, subject: string): void {
    try {
      sqlite
        .prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
        .run(`sentinel_email_${emailId}`, JSON.stringify({ subject, alertedAt: new Date().toISOString() }));
    } catch (e) {
      logger.error('Failed to mark email as alerted:', e);
    }
  },

  generateSummary(email: EmailMessage): string {
    const sub = email.subject.toLowerCase();
    if (sub.includes('interview')) {
      return `Interview invitation received regarding "${email.subject}" from ${email.from}. Check your email to schedule!`;
    }
    if (sub.includes('offer')) {
      return `Job offer update received regarding "${email.subject}" from ${email.from}!`;
    }
    if (sub.includes('assessment') || sub.includes('test')) {
      return `Technical assessment received regarding "${email.subject}" from ${email.from}.`;
    }
    if (sub.includes('application')) {
      return `Application status update received: "${email.subject}" from ${email.from}.`;
    }
    return `New job-related email received: "${email.subject}" from ${email.from}.`;
  },
};
