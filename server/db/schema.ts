import { sqliteTable, text, integer, primaryKey, unique, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// ── users ─────────────────────────────────────────────────────────────────────
// OAuth user profile. Created on first login, updated periodically.

export const users = sqliteTable(
    'users',
    {
        id: text('id').primaryKey(), // crypto.randomUUID()
        provider: text('provider').notNull(), // 'github' | 'google'
        providerAccountId: text('provider_account_id').notNull(),
        name: text('name'),
        email: text('email').notNull().unique(),
        avatarUrl: text('avatar_url'),
        createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`), // ISO string
        updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`), // ISO string
    },
    (table) => ({
        emailIdx: index('users_email_idx').on(table.email),
        providerIdx: index('users_provider_idx').on(table.provider),
    })
);

// ── meetings ──────────────────────────────────────────────────────────────────
// User meeting transcripts and summaries. userId is nullable for anonymous users.

export const meetings = sqliteTable(
    'meetings',
    {
        id: text('id').primaryKey(), // crypto.randomUUID()
        userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
        date: text('date').notNull(), // ISO string (meeting date as entered/inferred)
        meetingType: text('meeting_type').notNull().default('Meeting'),
        provider: text('provider').notNull(), // 'anthropic' | 'openai' | 'gemini'
        mode: text('mode').notNull().default('single'), // 'single' | 'compare'
        charCount: integer('char_count').notNull().default(0),
        transcript: text('transcript').notNull().default(''),
        summary: text('summary').notNull(), // JSON-serialised IMeetingSummary
        createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`), // ISO string
    },
    (table) => ({
        userIdIdx: index('meetings_user_id_idx').on(table.userId),
        dateIdx: index('meetings_date_idx').on(table.date),
    })
);

// ── integrations_config ───────────────────────────────────────────────────────
// Per-user integration credentials. One row per (userId, service) pair.
// userId is nullable for anonymous localStorage-backed configs.

export const integrationsConfig = sqliteTable(
    'integrations_config',
    {
        id: text('id').primaryKey(), // crypto.randomUUID()
        userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
        service: text('service').notNull(), // 'jira' | 'linear' | 'notion' | 'azure'
        config: text('config').notNull(), // JSON-serialised service-specific config
        updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`), // ISO string
    },
    (table) => ({
        userServiceUq: unique('integrations_config_user_service_uq').on(table.userId, table.service),
        userIdIdx: index('integrations_config_user_id_idx').on(table.userId),
        serviceIdx: index('integrations_config_service_idx').on(table.service),
    })
);

// ── action_items ──────────────────────────────────────────────────────────────
// Action items extracted from meetings and synced to external services.

export const actionItems = sqliteTable(
    'action_items',
    {
        id: text('id').primaryKey(), // crypto.randomUUID()
        meetingId: text('meeting_id')
            .notNull()
            .references(() => meetings.id, { onDelete: 'cascade' }),
        userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
        title: text('title').notNull(),
        description: text('description'),
        assignee: text('assignee'),
        dueDate: text('due_date'),
        priority: text('priority').notNull().default('MEDIUM'), // 'LOW' | 'MEDIUM' | 'HIGH'
        status: text('status').notNull().default('TODO'), // 'TODO' | 'IN_PROGRESS' | 'DONE'
        // External service reference
        externalService: text('external_service'), // 'jira' | 'linear' | 'notion' | 'azure'
        externalServiceId: text('external_service_id'), // Issue ID in external system
        externalUrl: text('external_url'), // Link to ticket
        createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
        updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
    },
    (table) => ({
        meetingIdIdx: index('action_items_meeting_id_idx').on(table.meetingId),
        userIdIdx: index('action_items_user_id_idx').on(table.userId),
        externalServiceIdx: index('action_items_external_service_idx').on(table.externalService),
    })
);

// ── Export types for use in server and client code ──────────────────────────────
export type IUser = typeof users.$inferSelect;
export type IMeeting = typeof meetings.$inferSelect;
export type IIntegrationConfig = typeof integrationsConfig.$inferSelect;
export type IActionItem = typeof actionItems.$inferSelect;
