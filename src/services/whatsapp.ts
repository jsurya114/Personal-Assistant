// ============================================
// Ultron AI — WhatsApp Service
// Supports: CallMeBot (100% Free Forever) & Twilio
// ============================================

import axios from 'axios';
import { config } from '../config';
import { logger } from '../utils/logger';

export interface WhatsAppSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Sends a WhatsApp message using CallMeBot (Free) or Twilio.
 */
export async function sendWhatsAppMessage(
  body: string,
  to?: string
): Promise<WhatsAppSendResult> {
  const { callmebotApiKey, callmebotPhone, accountSid, authToken, from, to: defaultTo } = config.whatsapp;

  // 1. Option A: CallMeBot (100% Free Forever, No Trial, Zero Setup)
  if (callmebotApiKey) {
    try {
      const phoneClean = (to || callmebotPhone).replace(/[^0-9]/g, '');
      const encodedText = encodeURIComponent(body);
      const url = `https://api.callmebot.com/whatsapp.php?phone=${phoneClean}&text=${encodedText}&apikey=${callmebotApiKey}`;

      logger.info(`[WHATSAPP-CALLMEBOT] Sending free message to ${phoneClean}...`);
      const response = await axios.get(url, { timeout: 10000 });

      if (response.status === 200) {
        logger.info(`[WHATSAPP-CALLMEBOT] ✅ Message delivered to ${phoneClean}`);
        return { success: true, messageId: 'callmebot-ok' };
      }
    } catch (error: unknown) {
      const err = error as { message?: string };
      logger.error(`[WHATSAPP-CALLMEBOT] ❌ Error: ${err.message}`);
    }
  }

  // 2. Option B: Twilio Sandbox (if configured)
  const targetRecipient = to || defaultTo;
  if (accountSid && authToken) {
    try {
      const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
      const authHeader = Buffer.from(`${accountSid}:${authToken}`).toString('base64');

      const params = new URLSearchParams();
      params.append('From', from.startsWith('whatsapp:') ? from : `whatsapp:${from}`);
      params.append('To', targetRecipient.startsWith('whatsapp:') ? targetRecipient : `whatsapp:${targetRecipient}`);
      params.append('Body', body);

      const response = await axios.post(url, params.toString(), {
        headers: {
          'Authorization': `Basic ${authHeader}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        timeout: 10000,
      });

      logger.info(`[WHATSAPP-TWILIO] ✅ Message sent to ${targetRecipient} (SID: ${response.data.sid})`);
      return { success: true, messageId: response.data.sid };
    } catch (error: unknown) {
      const err = error as { response?: { data?: unknown }; message?: string };
      const errMsg = err.response?.data ? JSON.stringify(err.response.data) : err.message || 'Unknown error';
      logger.error(`[WHATSAPP-TWILIO] ❌ Failed: ${errMsg}`);
      return { success: false, error: errMsg };
    }
  }

  logger.warn('[WHATSAPP] Skipped: Set CALLMEBOT_API_KEY or TWILIO_ACCOUNT_SID in .env for WhatsApp alerts');
  return {
    success: false,
    error: 'No WhatsApp provider configured in .env',
  };
}
