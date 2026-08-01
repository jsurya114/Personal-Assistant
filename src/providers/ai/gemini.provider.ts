// ============================================
// Ultron AI — Gemini Provider (Fallback)
// Powered by Vercel AI SDK v7
// ============================================

import { generateText, streamText, embed } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { ChatMessage, AIResponse, AIEmbeddingResponse } from '../../types';
import { BaseAIProvider } from './interface';
import { logger } from '../../utils/logger';
import { config } from '../../config';

export class GeminiProvider extends BaseAIProvider {
  readonly name = 'Gemini';
  readonly model = 'gemini-2.0-flash';

  private getClient() {
    return createGoogleGenerativeAI({
      apiKey: config.ai.geminiKey ?? '',
    });
  }

  isAvailable(): boolean {
    return !!config.ai.geminiKey;
  }

  async chat(messages: ChatMessage[], systemPrompt?: string): Promise<AIResponse> {
    try {
      const google = this.getClient();
      const systemMsg = this.buildSystemPrompt(systemPrompt);

      const { text, usage } = await generateText({
        model: google(this.model),
        system: systemMsg,
        messages: messages.map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
        maxOutputTokens: 2048,
      });

      return {
        content: text,
        model: this.model,
        usage: {
          promptTokens: usage?.inputTokens ?? 0,
          completionTokens: usage?.outputTokens ?? 0,
          totalTokens: (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0),
        },
      };
    } catch (error) {
      logger.error('Gemini chat error:', error);
      throw error;
    }
  }

  async stream(
    messages: ChatMessage[],
    systemPrompt?: string,
    onChunk?: (chunk: string) => void
  ): Promise<AIResponse> {
    try {
      const google = this.getClient();
      const systemMsg = this.buildSystemPrompt(systemPrompt);

      const result = streamText({
        model: google(this.model),
        system: systemMsg,
        messages: messages.map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
        maxOutputTokens: 2048,
      });

      let fullContent = '';
      for await (const delta of result.textStream) {
        fullContent += delta;
        onChunk?.(delta);
      }

      return { content: fullContent, model: this.model };
    } catch (error) {
      logger.error('Gemini stream error:', error);
      throw error;
    }
  }

  async embeddings(text: string): Promise<AIEmbeddingResponse> {
    try {
      const google = this.getClient();
      const { embedding } = await embed({
        model: google.textEmbeddingModel('text-embedding-004'),
        value: text,
      });

      return {
        embedding,
        model: 'text-embedding-004',
      };
    } catch (error) {
      logger.error('Gemini embedding error:', error);
      throw error;
    }
  }
}
