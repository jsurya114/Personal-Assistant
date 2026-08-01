// ============================================
// Ultron AI — Courier Agent (Notification Dispatcher)
// Dispatches alerts to WhatsApp, Discord, Voice & Web
// ============================================

import { sendWhatsAppMessage } from '../../services/whatsapp';
import { sendDiscordAlert } from '../../services/discord/bot';
import { JobMatch } from '../../types';
import { logger, logAgent } from '../../utils/logger';
import { exec } from 'child_process';

export interface EmailAlert {
  from: string;
  subject: string;
  summary: string;
  receivedAt: string;
}

export const courierAgent = {
  /**
   * Speak a short alert message using macOS say (voice)
   */
  speak(text: string): void {
    const cleanText = text.replace(/["$`\\]/g, '');
    exec(`say "${cleanText}"`, (err) => {
      if (err) {
        logger.debug(`[COURIER-VOICE] Voice notification error: ${err.message}`);
      }
    });
  },

  /**
   * Dispatches new job alerts to WhatsApp, Discord, and Voice
   */
  async dispatchJobAlert(jobs: JobMatch[]): Promise<void> {
    if (!jobs || jobs.length === 0) return;

    logAgent('COURIER', `🚀 Dispatching alert for ${jobs.length} new jobs...`);

    // 1. Spoken voice announcement
    const topJob = jobs[0];
    this.speak(`Boss, we found ${jobs.length} new matching job opportunities. Top match is ${topJob.role} at ${topJob.company}.`);

    // 2. Format Discord Message
    const discordMessage = `🎯 **Ultron Hunter Alert: ${jobs.length} New Job Matches Found!**\n\n` +
      jobs.slice(0, 5).map((j, i) => `**${i + 1}. ${j.role}** — ${j.company} (${j.matchScore}% Match)\n🔗 <${j.url}>`).join('\n\n');

    await sendDiscordAlert(discordMessage);
  },

  /**
   * Dispatches a job email / interview alert to WhatsApp, Discord, and Voice
   */
  async dispatchEmailAlert(alert: EmailAlert): Promise<void> {
    logAgent('COURIER', `📬 Dispatching email alert: "${alert.subject}" from ${alert.from}`);

    // 1. Voice Announcement
    this.speak(`Boss, we have a new job alert! ${alert.summary}`);

    // 2. WhatsApp Message
    const whatsappMessage = `📬 *Ultron Job Application Alert!*\n\n*From:* ${alert.from}\n*Subject:* ${alert.subject}\n\n*Summary:* ${alert.summary}\n\n_Check your email at jayasuryabrocamp@gmail.com_`;
    await sendWhatsAppMessage(whatsappMessage);

    // 3. Discord Message
    const discordMessage = `📬 **New Job Email Alert!**\n**From:** ${alert.from}\n**Subject:** ${alert.subject}\n\n> ${alert.summary}`;
    await sendDiscordAlert(discordMessage);
  },
};
