// ============================================
// Ultron AI — Shared TypeScript Types
// ============================================

export type MessageRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  role: MessageRole;
  content: string;
}

export interface ConversationContext {
  conversationId: string;
  messages: ChatMessage[];
  userId?: string;
}

// ---- AI Provider Types ----

export interface AIStreamChunk {
  content: string;
  done: boolean;
}

export interface AIResponse {
  content: string;
  model: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface AIEmbeddingResponse {
  embedding: number[];
  model: string;
}

// ---- Job Types ----

export type ApplicationStatus =
  | 'saved'
  | 'ready'
  | 'applied'
  | 'interview'
  | 'offer'
  | 'rejected';

export interface JobMatch {
  id?: number;
  company: string;
  role: string;
  platform: string;
  matchScore: number;
  url: string;
  description?: string;
  location?: string;
  salary?: string;
  discoveredAt: string;
}

export interface JobApplication {
  id?: number;
  company: string;
  role: string;
  platform?: string;
  status: ApplicationStatus;
  matchScore?: number;
  url?: string;
  notes?: string;
  appliedAt?: string;
}

// ---- Memory Types ----

export interface Memory {
  id?: number;
  summary: string;
  importance: number; // 1-10
  tags?: string[];
  createdAt: string;
}

export interface StoredConversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: string;
}

// ---- Service Types ----

export interface WeatherData {
  city: string;
  temperature: number;
  feelsLike: number;
  humidity: number;
  windSpeed: number;
  description: string;
  rainChance?: number;
  sunrise: string;
  sunset: string;
  icon: string;
}

export interface NewsArticle {
  title: string;
  description: string;
  url: string;
  source: string;
  publishedAt: string;
  category: 'ai' | 'tech' | 'world' | 'local';
}

export interface DailyBriefing {
  greeting: string;
  date: string;
  weather?: WeatherData;
  news: NewsArticle[];
  tasks: Task[];
  jobMatches: JobMatch[];
  pendingApplications: number;
  summary: string;
}

// ---- Task Types ----

export interface Task {
  id?: number;
  title: string;
  completed: boolean;
  dueDate?: string;
  priority?: 'low' | 'medium' | 'high';
}

// ---- Agent Types ----

export type AgentType = 'assistant' | 'hunter' | 'cipher' | 'research';

export interface AgentResponse {
  agent: AgentType;
  content: string;
  data?: unknown;
}

// ---- API Types ----

export interface ChatRequest {
  message: string;
  conversationId?: string | null;
  stream?: boolean;
}

export interface ChatResponse {
  response: string;
  conversationId: string;
  agent: AgentType;
  timestamp: string;
}

export interface ApiError {
  error: string;
  code?: string;
  details?: unknown;
}
