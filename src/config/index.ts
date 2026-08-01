// ============================================
// Ultron AI — Configuration Loader
// Validates all environment variables at startup
// ============================================

import dotenv from 'dotenv';
import { z } from 'zod';
import path from 'path';

dotenv.config();

const configSchema = z.object({
  // Server
  PORT: z.string().default('3000'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),

  // Vercel AI API key (used as the primary OpenAI-compatible key)
  VERCEL_AI_API_KEY: z.string().optional(),

  // AI Providers — at least ONE of these must be set
  GROQ_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),

  // Which provider to prefer: groq | openai | claude | gemini (default: openai)
  AI_PROVIDER: z.enum(['groq', 'openai', 'claude', 'gemini']).default('openai'),

  // Job Search
  RAPIDAPI_KEY: z.string().optional(),
  ADZUNA_APP_ID: z.string().optional(),
  ADZUNA_APP_KEY: z.string().optional(),

  // Info Services
  NEWS_API_KEY: z.string().optional(),
  OPENWEATHER_API_KEY: z.string().optional(),

  // Database
  DATABASE_PATH: z.string().default('./memory/ultron.db'),

  // User Preferences
  USER_NAME: z.string().default('Boss'),
  ASSISTANT_NAME: z.string().default('Buddy'),
  WEATHER_CITY: z.string().default('Chennai'),
  WEATHER_COUNTRY: z.string().default('IN'),

  // Discord Config
  DISCORD_BOT_TOKEN: z.string().optional(),
  DISCORD_CHANNEL_ID: z.string().optional(),
  DISCORD_USER_ID: z.string().optional(),

  // WhatsApp Config (Twilio or CallMeBot)
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_WHATSAPP_FROM: z.string().default('whatsapp:+14155238886'),
  WHATSAPP_TO_NUMBER: z.string().default('whatsapp:+918281017439'),
  CALLMEBOT_API_KEY: z.string().optional(),
  CALLMEBOT_PHONE: z.string().default('+918281017439'),

  // Gmail / Email Monitoring
  GMAIL_USER: z.string().default('jayasuryabrocamp@gmail.com'),
  GMAIL_APP_PASSWORD: z.string().optional(),
  GMAIL_IMAP_HOST: z.string().default('imap.gmail.com'),
  GMAIL_IMAP_PORT: z.string().default('993'),
});

type Config = z.infer<typeof configSchema>;

let _config: Config;

function loadConfig(): Config {
  const result = configSchema.safeParse(process.env);

  if (!result.success) {
    console.error('❌ Configuration Error:');
    result.error.issues.forEach((issue) => {
      console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
    });
    console.error('\n👉 Copy .env.example to .env and fill in the values.\n');
    process.exit(1);
  }

  const data = result.data;

  // If VERCEL_AI_API_KEY is set, use it as the OpenAI key (Vercel AI gateway is OpenAI-compatible)
  if (data.VERCEL_AI_API_KEY && !data.OPENAI_API_KEY) {
    data.OPENAI_API_KEY = data.VERCEL_AI_API_KEY;
  }

  // Validate that at least one AI provider is available
  if (!data.GROQ_API_KEY && !data.OPENAI_API_KEY && !data.ANTHROPIC_API_KEY && !data.GEMINI_API_KEY) {
    console.error('❌ No AI provider configured.');
    console.error('   Set at least one of: GROQ_API_KEY, VERCEL_AI_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY');
    process.exit(1);
  }

  return data;
}

export function getConfig(): Config {
  if (!_config) {
    _config = loadConfig();
  }
  return _config;
}

export const config = {
  get server() {
    const c = getConfig();
    return {
      port: parseInt(c.PORT, 10),
      nodeEnv: c.NODE_ENV,
      logLevel: c.LOG_LEVEL,
    };
  },
  get ai() {
    const c = getConfig();
    // VERCEL_AI_API_KEY takes priority as the OpenAI-compatible key
    const effectiveOpenAIKey = c.VERCEL_AI_API_KEY || c.OPENAI_API_KEY;
    return {
      groqKey: c.GROQ_API_KEY,
      vercelKey: c.VERCEL_AI_API_KEY,
      openaiKey: effectiveOpenAIKey,
      anthropicKey: c.ANTHROPIC_API_KEY,
      geminiKey: c.GEMINI_API_KEY,
      preferredProvider: c.AI_PROVIDER,
    };
  },
  get jobs() {
    const c = getConfig();
    return {
      rapidApiKey: c.RAPIDAPI_KEY,
      adzunaAppId: c.ADZUNA_APP_ID,
      adzunaAppKey: c.ADZUNA_APP_KEY,
    };
  },
  get services() {
    const c = getConfig();
    return {
      newsApiKey: c.NEWS_API_KEY,
      weatherApiKey: c.OPENWEATHER_API_KEY,
      weatherCity: c.WEATHER_CITY,
      weatherCountry: c.WEATHER_COUNTRY,
    };
  },
  get database() {
    const c = getConfig();
    return {
      path: path.resolve(c.DATABASE_PATH),
    };
  },
  get user() {
    const c = getConfig();
    return {
      name: c.USER_NAME,
      assistantName: c.ASSISTANT_NAME,
    };
  },
  get discord() {
    const c = getConfig();
    return {
      token: c.DISCORD_BOT_TOKEN,
      channelId: c.DISCORD_CHANNEL_ID,
      userId: c.DISCORD_USER_ID,
    };
  },
  get whatsapp() {
    const c = getConfig();
    return {
      accountSid: c.TWILIO_ACCOUNT_SID,
      authToken: c.TWILIO_AUTH_TOKEN,
      from: c.TWILIO_WHATSAPP_FROM,
      to: c.WHATSAPP_TO_NUMBER,
      callmebotApiKey: c.CALLMEBOT_API_KEY,
      callmebotPhone: c.CALLMEBOT_PHONE,
    };
  },
  get email() {
    const c = getConfig();
    return {
      user: c.GMAIL_USER,
      password: c.GMAIL_APP_PASSWORD,
      host: c.GMAIL_IMAP_HOST,
      port: parseInt(c.GMAIL_IMAP_PORT, 10),
    };
  }
};
