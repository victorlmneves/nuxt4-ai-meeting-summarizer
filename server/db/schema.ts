import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

// ── users ─────────────────────────────────────────────────────────────────────
// Created and populated when OAuth auth is added (Phase 4).
// Referenced as an optional FK (nullable) from all user-scoped tables.

export const users = sqliteTable('users', {
    id: text('id').primaryKey(), // crypto.randomUUID()
    provider: text('provider').notNull(), // 'github' | 'google'
    providerAccountId: text('provider_account_id').notNull(),
    name: text('name'),
    email: text('email'),
    avatarUrl: text('avatar_url'),
    createdAt: text('created_at').notNull(), // ISO string
});

// ── meetings ──────────────────────────────────────────────────────────────────

export const meetings = sqliteTable('meetings', {
    id: text('id').primaryKey(), // crypto.randomUUID()
    // userId is nullable — anonymous usage is allowed before auth is introduced
    userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
    date: text('date').notNull(), // ISO string (meeting date as entered/inferred)
    meetingType: text('meeting_type').notNull(),
    provider: text('provider').notNull(), // 'anthropic' | 'openai' | 'gemini'
    mode: text('mode').notNull().default('single'), // 'single' | 'compare'
    charCount: integer('char_count').notNull().default(0),
    transcript: text('transcript').notNull().default(''),
    summary: text('summary').notNull(), // JSON-serialised IMeetingSummary
    createdAt: text('created_at').notNull(), // ISO string — server-set
});

// ── integrations_config ───────────────────────────────────────────────────────
// One row per (userId, service) combination.
// userId is nullable — anonymous config is stored per-device without auth.

export const integrationsConfig = sqliteTable('integrations_config', {
    id: text('id').primaryKey(), // crypto.randomUUID()
    userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
    service: text('service').notNull(), // 'jira' | 'linear' | 'notion' | 'azure'
    config: text('config').notNull(), // JSON-serialised service-specific config
    updatedAt: text('updated_at').notNull(), // ISO string
});
