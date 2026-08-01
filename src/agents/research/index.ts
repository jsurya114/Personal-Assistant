// ============================================
// Ultron AI — Research Agent
// Web research, news, documentation, analysis
// ============================================

import axios from 'axios';
import { OpenAIProvider } from '../../providers/ai/openai.provider';
import { ChatMessage } from '../../types';
import { logAgent, logger } from '../../utils/logger';
import { config } from '../../config';

const RESEARCH_SYSTEM = `You are Buddy in Research Mode.
You help Boss research topics deeply and accurately.
Provide structured, well-organized, concise responses.
Always cite sources when available.
Focus on: AI, technology, software engineering, career, and productivity.
If you don't know something, say so clearly. Never fabricate facts.
Always address the user as "Boss".`;

export const researchAgent = {
  async research(topic: string, depth: 'quick' | 'deep' = 'quick'): Promise<string> {
    logAgent('RESEARCH', `Researching: ${topic}`);
    const provider = new OpenAIProvider();

    const prompt = depth === 'deep'
      ? `Provide a comprehensive deep-dive research on: "${topic}". Include: overview, key concepts, use cases, best practices, and current trends.`
      : `Provide a concise research summary on: "${topic}". Cover the essentials in 200-300 words.`;

    const result = await provider.chat([{ role: 'user', content: prompt }], RESEARCH_SYSTEM);
    return result.content;
  },

  async searchNews(query: string): Promise<Array<{ title: string; description: string; url: string; source: string }>> {
    if (!config.services.newsApiKey) {
      logAgent('RESEARCH', 'NewsAPI skipped: NEWS_API_KEY not set');
      return [];
    }

    try {
      const response = await axios.get('https://newsapi.org/v2/everything', {
        params: {
          q: query,
          sortBy: 'publishedAt',
          pageSize: 5,
          language: 'en',
          apiKey: config.services.newsApiKey,
        },
        timeout: 10000,
      });

      return (response.data.articles || []).map((a: Record<string, unknown>) => ({
        title: String(a.title || ''),
        description: String(a.description || ''),
        url: String(a.url || ''),
        source: String((a.source as { name?: string })?.name || ''),
      }));
    } catch (error) {
      logger.error('NewsAPI error:', error);
      return [];
    }
  },

  async summarize(url: string): Promise<string> {
    logAgent('RESEARCH', `Summarizing: ${url}`);
    const provider = new OpenAIProvider();

    const result = await provider.chat(
      [{ role: 'user', content: `Please summarize the content from this URL for me: ${url}. If you cannot access it, explain what you know about it.` }],
      RESEARCH_SYSTEM
    );

    return result.content;
  },

  async compareOptions(options: string[], criteria: string): Promise<string> {
    const provider = new OpenAIProvider();

    const result = await provider.chat(
      [{
        role: 'user',
        content: `Compare these options: ${options.join(', ')}. Criteria: ${criteria}. Provide a structured comparison table and recommendation.`
      }],
      RESEARCH_SYSTEM
    );

    return result.content;
  },
};
