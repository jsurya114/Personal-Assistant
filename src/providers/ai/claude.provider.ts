// ============================================
// Ultron AI — Claude Provider (Fallback)
// Powered by Vercel AI SDK v7
// ============================================

import { generateText, streamText } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { ChatMessage, AIResponse, AIEmbeddingResponse } from '../../types';
import { BaseAIProvider } from './interface';
import { logger } from '../../utils/logger';
import { config } from '../../config';

export class ClaudeProvider extends BaseAIProvider {
  readonly name = 'Claude';
  readonly model = 'claude-3-5-sonnet-20241022';

  private getClient() {
    return createAnthropic({
      apiKey: config.ai.anthropicKey ?? '',
    });
  }

  isAvailable(): boolean {
    return !!config.ai.anthropicKey;
  }

  async chat(messages: ChatMessage[], systemPrompt?: string): Promise<AIResponse> {
    try {
      const anthropic = this.getClient();
      const systemMsg = this.buildSystemPrompt(systemPrompt);

      const { text, usage } = await generateText({
        model: anthropic(this.model),
        system: systemMsg,
        messages: messages
          .filter((m) => m.role !== 'system')
          .map((m) => ({
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
      logger.error('Claude chat error:', error);
      throw error;
    }
  }

  async stream(
    messages: ChatMessage[],
    systemPrompt?: string,
    onChunk?: (chunk: string) => void
  ): Promise<AIResponse> {
    try {
      const anthropic = this.getClient();
      const systemMsg = this.buildSystemPrompt(systemPrompt);

      const result = streamText({
        model: anthropic(this.model),
        system: systemMsg,
        messages: messages
          .filter((m) => m.role !== 'system')
          .map((m) => ({
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
      logger.error('Claude stream error:', error);
      throw error;
    }
  }

  async embeddings(_text: string): Promise<AIEmbeddingResponse> {
    throw new Error('Claude does not support embeddings. Use OpenAI provider instead.');
  }
}
