// ============================================
// Ultron AI — Gmail IMAP Scanner Service
// Native TLS IMAP Client (Zero Cost / Free Tier)
// ============================================

import tls from 'tls';
import { config } from '../config';
import { logger } from '../utils/logger';

export interface EmailMessage {
  id: string;
  from: string;
  subject: string;
  date: string;
  snippet: string;
}

function decodeMimeHeader(raw: string): string {
  try {
    const cleaned = raw.replace(/=\?([^?]+)\?([BQbq])\?([^?]+)\?=/g, (_, _charset, encoding, text) => {
      if (encoding.toUpperCase() === 'B') {
        return Buffer.from(text, 'base64').toString('utf8');
      }
      if (encoding.toUpperCase() === 'Q') {
        return text.replace(/=([0-9A-Fa-f]{2})/g, (_m: string, hex: string) =>
          String.fromCharCode(parseInt(hex, 16))
        ).replace(/_/g, ' ');
      }
      return text;
    });

    // Clean common mojibake characters
    return cleaned
      .replace(/â€™/g, "'")
      .replace(/â€œ|â€/g, '"')
      .replace(/âœ‰ï¸/g, '✉️')
      .replace(/âï¸/g, '✉️')
      .replace(/â/g, '')
      .trim();
  } catch {
    return raw.trim();
  }
}

function formatEmailDate(rawDate: string): string {
  try {
    const d = new Date(rawDate);
    if (isNaN(d.getTime())) return rawDate;

    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  } catch {
    return rawDate;
  }
}

/**
 * Lightweight IMAP reader using Node's standard TLS client.
 * Connects securely to imap.gmail.com:993
 */
export async function fetchRecentJobEmails(limit: number = 5): Promise<EmailMessage[]> {
  const { user, password, host, port } = config.email;

  if (!password) {
    logger.debug('[GMAIL] Skipped: GMAIL_APP_PASSWORD not set in .env');
    return [];
  }

  return new Promise((resolve) => {
    const emails: EmailMessage[] = [];
    let buffer = '';

    const socket = tls.connect(
      {
        host,
        port,
        rejectUnauthorized: false,
      },
      () => {
        logger.debug(`[GMAIL] Connected to ${host}:${port}`);
      }
    );

    socket.setEncoding('utf8');

    let step = 0;

    const timeout = setTimeout(() => {
      socket.destroy();
      resolve(emails.reverse());
    }, 12000);

    socket.on('data', (chunk: string) => {
      buffer += chunk;

      if (step === 0 && buffer.includes('* OK')) {
        step = 1;
        buffer = '';
        socket.write(`A1 LOGIN "${user}" "${password}"\r\n`);
      } else if (step === 1 && buffer.includes('A1 ')) {
        if (buffer.includes('A1 OK')) {
          step = 2;
          buffer = '';
          socket.write(`A2 SELECT INBOX\r\n`);
        } else {
          logger.warn('[GMAIL] Login failed. Check your GMAIL_APP_PASSWORD.');
          socket.write('A99 LOGOUT\r\n');
          socket.destroy();
          clearTimeout(timeout);
          resolve([]);
        }
      } else if (step === 2 && buffer.includes('A2 OK')) {
        step = 3;
        buffer = '';
        socket.write(`A3 SEARCH ALL\r\n`);
      } else if (step === 3 && buffer.includes('A3 OK')) {
        const match = buffer.match(/\* SEARCH (.*)/);
        const ids = match && match[1] ? match[1].trim().split(/\s+/).filter(Boolean) : [];
        const recentIds = ids.slice(-limit);

        if (recentIds.length === 0) {
          socket.write('A99 LOGOUT\r\n');
          socket.destroy();
          clearTimeout(timeout);
          resolve([]);
          return;
        }

        step = 4;
        buffer = '';
        const idRange = recentIds.join(',');
        socket.write(`A4 FETCH ${idRange} (BODY.PEEK[HEADER.FIELDS (FROM SUBJECT DATE)])\r\n`);
      } else if (step === 4 && buffer.includes('A4 OK')) {
        const blocks = buffer.split(/\* \d+ FETCH/);
        for (const block of blocks) {
          const fromMatch = block.match(/From:\s*([^\r\n]+)/i);
          const subjectMatch = block.match(/Subject:\s*([^\r\n]+)/i);
          const dateMatch = block.match(/Date:\s*([^\r\n]+)/i);

          if (fromMatch || subjectMatch) {
            const rawFrom = fromMatch ? fromMatch[1].trim() : 'Unknown Sender';
            const rawSubject = subjectMatch ? subjectMatch[1].trim() : 'No Subject';
            const rawDate = dateMatch ? dateMatch[1].trim() : new Date().toISOString();

            const from = decodeMimeHeader(rawFrom);
            const subject = decodeMimeHeader(rawSubject);
            const date = formatEmailDate(rawDate);

            emails.push({
              id: `${from}-${subject}-${rawDate}`.replace(/[^a-zA-Z0-9]/g, '_'),
              from,
              subject,
              date,
              snippet: `Email regarding "${subject}" from ${from}`,
            });
          }
        }

        socket.write('A99 LOGOUT\r\n');
        socket.destroy();
        clearTimeout(timeout);
        // Return most recent first
        resolve(emails.reverse());
      }
    });

    socket.on('error', (err) => {
      logger.error(`[GMAIL] Socket error: ${err.message}`);
      clearTimeout(timeout);
      resolve(emails.reverse());
    });
  });
}
