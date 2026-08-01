// ============================================
// Ultron AI — AI Provider Interface
// All AI providers must implement this interface.
// The assistant only communicates through this contract.
// ============================================

import { ChatMessage, AIResponse, AIEmbeddingResponse } from '../../types';

export interface AIProvider {
  readonly name: string;
  readonly model: string;

  /**
   * Send a chat message and receive a full response
   */
  chat(messages: ChatMessage[], systemPrompt?: string): Promise<AIResponse>;

  /**
   * Stream a chat response chunk by chunk
   */
  stream(
    messages: ChatMessage[],
    systemPrompt?: string,
    onChunk?: (chunk: string) => void
  ): Promise<AIResponse>;

  /**
   * Generate embeddings for text (used for semantic memory)
   */
  embeddings(text: string): Promise<AIEmbeddingResponse>;

  /**
   * Check if the provider is available (API key set)
   */
  isAvailable(): boolean;
}

export abstract class BaseAIProvider implements AIProvider {
  abstract readonly name: string;
  abstract readonly model: string;

  abstract chat(messages: ChatMessage[], systemPrompt?: string): Promise<AIResponse>;
  abstract stream(
    messages: ChatMessage[],
    systemPrompt?: string,
    onChunk?: (chunk: string) => void
  ): Promise<AIResponse>;
  abstract embeddings(text: string): Promise<AIEmbeddingResponse>;
  abstract isAvailable(): boolean;

  protected buildSystemPrompt(base?: string): string {
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-IN', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const timeStr = now.toLocaleTimeString('en-IN', { hour12: true });

    return `${base || ''}

Current Date: ${dateStr}
Current Time: ${timeStr}
Your name is Buddy. You are Ultron, a personal AI operating assistant.
Always address the user as "Boss".
Be natural, helpful, proactive, and never robotic.
Keep responses concise unless detail is explicitly requested.`;
  }
}
