// ============================================
// Ultron AI — Groq Provider (100% Free & Blazing Fast)
// Uses Groq's ultra-low latency OpenAI-compatible API
// Model: llama-3.3-70b-versatile
// ============================================

import { generateText, streamText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { ChatMessage, AIResponse, AIEmbeddingResponse } from '../../types';
import { BaseAIProvider } from './interface';
import { logger } from '../../utils/logger';
import { config } from '../../config';

const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';

import axios from 'axios';

export class GroqProvider extends BaseAIProvider {
  readonly name = 'Groq';
  readonly model = 'llama-3.1-8b-instant';

  private getClient() {
    const key = config.ai.groqKey ?? '';
    return createOpenAI({
      apiKey: key,
      baseURL: GROQ_BASE_URL,
    });
  }

  isAvailable(): boolean {
    return !!config.ai.groqKey;
  }

  async chat(messages: ChatMessage[], systemPrompt?: string): Promise<AIResponse> {
    const systemMsg = this.buildSystemPrompt(systemPrompt);
    const key = config.ai.groqKey ?? '';

    // Primary: Vercel AI SDK with explicit chat() method for /chat/completions endpoint
    try {
      const groq = this.getClient();
      const { text, usage } = await generateText({
        model: groq.chat(this.model),
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
    } catch (sdkError: any) {
      logger.warn(`[GROQ] Primary model attempt error: ${sdkError?.message || sdkError}`);
      
      // Fallback: Direct Groq REST API across multiple models
      const modelsToTry = [
        'llama-3.1-8b-instant',
        'mixtral-8x7b-32768',
        'gemma2-9b-it',
        this.model,
      ];
      let lastError: any;

      for (const model of modelsToTry) {
        try {
          const payloadMessages = [
            { role: 'system', content: systemMsg },
            ...messages.map((m) => ({ role: m.role, content: m.content })),
          ];

          const response = await axios.post(
            `${GROQ_BASE_URL}/chat/completions`,
            {
              model,
              messages: payloadMessages,
              temperature: 0.7,
              max_tokens: 1024,
            },
            {
              headers: {
                Authorization: `Bearer ${key}`,
                'Content-Type': 'application/json',
              },
              timeout: 20000,
            }
          );

          const content = response.data.choices[0]?.message?.content ?? '';
          if (content && content.trim().length > 0) {
            const usage = response.data.usage;
            return {
              content,
              model,
              usage: {
                promptTokens: usage?.prompt_tokens ?? 0,
                completionTokens: usage?.completion_tokens ?? 0,
                totalTokens: usage?.total_tokens ?? 0,
              },
            };
          }
        } catch (err: any) {
          lastError = err;
          logger.debug(`[GROQ] Model ${model} attempt failed: ${err?.message || err}`);
        }
      }

      throw lastError;
    }
  }

  async stream(
    messages: ChatMessage[],
    systemPrompt?: string,
    onChunk?: (chunk: string) => void
  ): Promise<AIResponse> {
    try {
      const groq = this.getClient();
      const systemMsg = this.buildSystemPrompt(systemPrompt);

      const result = streamText({
        model: groq.chat(this.model),
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
    } catch (error: any) {
      // Fallback to chat if stream fails
      logger.warn(`[GROQ] Stream error: ${error?.message || error}, falling back to chat`);
      const res = await this.chat(messages, systemPrompt);
      onChunk?.(res.content);
      return res;
    }
  }

  async embeddings(_text: string): Promise<AIEmbeddingResponse> {
    // Return empty embedding vector for Groq
    return {
      embedding: new Array(1536).fill(0),
      model: 'none',
    };
  }
}
