// ============================================
// Ultron AI — Database Schema (Drizzle ORM)
// All tables defined here
// ============================================

import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

// ---- Conversations ----
export const conversations = sqliteTable('conversations', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  createdAt: text('created_at').notNull(),
});

// ---- Messages ----
export const messages = sqliteTable('messages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  conversationId: text('conversation_id')
    .notNull()
    .references(() => conversations.id),
  role: text('role', { enum: ['user', 'assistant', 'system'] }).notNull(),
  content: text('content').notNull(),
  timestamp: text('timestamp').notNull(),
});

// ---- Memories ----
export const memories = sqliteTable('memories', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  summary: text('summary').notNull(),
  tags: text('tags'), // JSON string array
  importance: integer('importance').notNull().default(5), // 1-10
  createdAt: text('created_at').notNull(),
});

// ---- Job Matches ----
export const jobMatches = sqliteTable('job_matches', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  company: text('company').notNull(),
  role: text('role').notNull(),
  platform: text('platform').notNull(),
  matchScore: real('match_score').notNull(),
  url: text('url').notNull(),
  description: text('description'),
  location: text('location'),
  salary: text('salary'),
  discoveredAt: text('discovered_at').notNull(),
});

// ---- Applications ----
export const applications = sqliteTable('applications', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  company: text('company').notNull(),
  role: text('role').notNull(),
  platform: text('platform'),
  status: text('status', {
    enum: ['saved', 'ready', 'applied', 'interview', 'offer', 'rejected'],
  })
    .notNull()
    .default('saved'),
  matchScore: real('match_score'),
  url: text('url'),
  notes: text('notes'),
  appliedAt: text('applied_at'),
});

// ---- Tasks ----
export const tasks = sqliteTable('tasks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  completed: integer('completed', { mode: 'boolean' }).notNull().default(false),
  priority: text('priority', { enum: ['low', 'medium', 'high'] }).default('medium'),
  dueDate: text('due_date'),
});

// ---- Daily Reports ----
export const dailyReports = sqliteTable('daily_reports', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  report: text('report').notNull(),
  createdAt: text('created_at').notNull(),
});

// ---- Settings ----
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

// ---- Users ----
export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().default('Boss'),
  createdAt: text('created_at').notNull(),
});
