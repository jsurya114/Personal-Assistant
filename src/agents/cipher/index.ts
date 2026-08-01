// ============================================
// Ultron AI — Cipher Agent (Coding Assistant)
// ============================================

import { OpenAIProvider } from '../../providers/ai/openai.provider';
import { ChatMessage } from '../../types';
import { logAgent } from '../../utils/logger';

const CIPHER_SYSTEM = `You are Buddy in Coding Mode — a senior software engineer assistant.

Tech Stack:
- TypeScript, JavaScript, Node.js, Express, NestJS
- React, Next.js
- PostgreSQL, MongoDB, Redis
- Docker, AWS, Linux
- REST APIs, GraphQL, WebSockets

Guidelines:
- Write production-quality, type-safe TypeScript code
- Always include proper error handling
- Add meaningful comments for complex logic
- Follow SOLID principles
- Prefer async/await over callbacks
- Validate inputs with Zod
- Never use 'any' type

When reviewing code: identify bugs, suggest improvements, explain your reasoning.
When writing code: provide complete, runnable examples.
Always address the user as "Boss".`;

export const cipherAgent = {
  async code(request: string, context?: string): Promise<string> {
    logAgent('CIPHER', `Code request: ${request.slice(0, 60)}...`);
    const provider = new OpenAIProvider();

    const messages: ChatMessage[] = [];
    if (context) {
      messages.push({ role: 'user', content: `Context:\n${context}` });
      messages.push({ role: 'assistant', content: 'Got it, I have the context.' });
    }
    messages.push({ role: 'user', content: request });

    const result = await provider.chat(messages, CIPHER_SYSTEM);
    return result.content;
  },

  async review(code: string, language: string = 'TypeScript'): Promise<string> {
    logAgent('CIPHER', `Code review: ${language}`);
    const provider = new OpenAIProvider();

    const result = await provider.chat(
      [
        {
          role: 'user',
          content: `Review this ${language} code. Find bugs, security issues, and improvements:\n\n\`\`\`${language.toLowerCase()}\n${code}\n\`\`\``,
        },
      ],
      CIPHER_SYSTEM
    );

    return result.content;
  },

  async debug(error: string, code?: string): Promise<string> {
    logAgent('CIPHER', `Debug: ${error.slice(0, 60)}`);
    const provider = new OpenAIProvider();

    const content = code
      ? `I'm getting this error:\n${error}\n\nCode:\n\`\`\`\n${code}\n\`\`\``
      : `I'm getting this error:\n${error}\n\nWhat's causing it and how do I fix it?`;

    const result = await provider.chat([{ role: 'user', content }], CIPHER_SYSTEM);
    return result.content;
  },

  async explain(concept: string): Promise<string> {
    logAgent('CIPHER', `Explain: ${concept}`);
    const provider = new OpenAIProvider();

    const result = await provider.chat(
      [{ role: 'user', content: `Explain ${concept} clearly with examples. Focus on practical usage.` }],
      CIPHER_SYSTEM
    );

    return result.content;
  },
};
