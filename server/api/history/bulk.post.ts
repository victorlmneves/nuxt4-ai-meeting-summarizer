// POST /api/history/bulk
// One-time migration endpoint: accepts an array of localStorage history entries
// and inserts them into the database, skipping any that already exist (by id).

import { defineEventHandler, readBody, createError, type H3Event } from 'h3';
import { sql } from 'drizzle-orm';
import { useDb } from '#server/utils/db';
import { meetings } from '#server/db/schema';
import type { IHistoryEntry } from '~/types/index';

export default defineEventHandler(async (event: H3Event) => {
    const db = useDb();
    const body = await readBody(event);
    const entries: IHistoryEntry[] = body?.entries;

    if (!Array.isArray(entries) || entries.length === 0) {
        throw createError({ statusCode: 400, message: 'entries must be a non-empty array.' });
    }

    // TODO (Phase 4): attach getUserSession(event).user.id
    const userId: string | null = null;

    const now = new Date().toISOString();
    let inserted = 0;

    for (const entry of entries) {
        if (!entry.id || !entry.summary || !entry.provider) {
            continue;
        }

        // Skip existing entries to make the operation idempotent
        await db
            .insert(meetings)
            .values({
                id: entry.id,
                userId,
                date: entry.date ?? now,
                meetingType: entry.meetingType ?? 'Meeting',
                provider: entry.provider,
                mode: entry.mode ?? 'single',
                charCount: entry.charCount ?? 0,
                transcript: entry.transcript ?? '',
                summary: JSON.stringify(entry.summary),
                createdAt: entry.date ?? now,
            })
            .onConflictDoNothing();

        inserted++;
    }

    return { inserted };
});
