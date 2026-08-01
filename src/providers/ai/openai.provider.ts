// ============================================
// Ultron AI — OpenAI Provider (Primary)
// Powered by Vercel AI SDK v7
// Supports: OpenAI direct + Vercel AI Gateway (vck_ keys)
// ============================================

import { generateText, streamText, embed } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { ChatMessage, AIResponse, AIEmbeddingResponse } from '../../types';
import { BaseAIProvider } from './interface';
import { logger } from '../../utils/logger';
import { config } from '../../config';

// Vercel AI Gateway routes via a different base URL and uses model prefix format
const VERCEL_GATEWAY_BASE = 'https://ai-gateway.vercel.sh/v1';

function isVercelGatewayKey(key: string): boolean {
  return key.startsWith('vck_');
}

export class OpenAIProvider extends BaseAIProvider {
  readonly name = 'OpenAI';
  readonly model = 'gpt-4o';

  private getClient() {
    const key = config.ai.openaiKey ?? '';
    // If using Vercel AI Gateway (vck_ prefix), route through gateway
    if (isVercelGatewayKey(key)) {
      return createOpenAI({
        apiKey: key,
        baseURL: VERCEL_GATEWAY_BASE,
      });
    }
    return createOpenAI({ apiKey: key });
  }

  private getModelName(): string {
    const key = config.ai.openaiKey ?? '';
    // Vercel AI Gateway requires provider-prefixed model names
    return isVercelGatewayKey(key) ? `openai/${this.model}` : this.model;
  }

  isAvailable(): boolean {
    return !!config.ai.openaiKey;
  }

  async chat(messages: ChatMessage[], systemPrompt?: string): Promise<AIResponse> {
    try {
      const openai = this.getClient();
      const systemMsg = this.buildSystemPrompt(systemPrompt);

      const { text, usage } = await generateText({
        model: openai(this.getModelName()),
        system: systemMsg,
        messages: messages.map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
        temperature: 0.7,
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
      logger.error('OpenAI chat error:', error);
      throw error;
    }
  }

  async stream(
    messages: ChatMessage[],
    systemPrompt?: string,
    onChunk?: (chunk: string) => void
  ): Promise<AIResponse> {
    try {
      const openai = this.getClient();
      const systemMsg = this.buildSystemPrompt(systemPrompt);

      const result = streamText({
        model: openai(this.getModelName()),
        system: systemMsg,
        messages: messages.map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
        temperature: 0.7,
        maxOutputTokens: 2048,
      });

      let fullContent = '';
      for await (const delta of result.textStream) {
        fullContent += delta;
        onChunk?.(delta);
      }

      return { content: fullContent, model: this.model };
    } catch (error) {
      logger.error('OpenAI stream error:', error);
      throw error;
    }
  }

  async embeddings(text: string): Promise<AIEmbeddingResponse> {
    try {
      const openai = this.getClient();
      const { embedding } = await embed({
        model: openai.embedding('text-embedding-3-small'),
        value: text,
      });

      return {
        embedding,
        model: 'text-embedding-3-small',
      };
    } catch (error) {
      logger.error('OpenAI embedding error:', error);
      throw error;
    }
  }
}
