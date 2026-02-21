// GET /api/history/:id
// Returns a single history entry by its id.

import { defineEventHandler, getRouterParam, createError, type H3Event } from 'h3';
import { eq } from 'drizzle-orm';
import { useDb } from '#server/utils/db';
import { meetings } from '#server/db/schema';
import type { IHistoryEntry } from '~/types';

export default defineEventHandler(async (event: H3Event) => {
    const db = useDb();
    const id = getRouterParam(event, 'id');

    if (!id) {
        throw createError({ statusCode: 400, message: 'id is required.' });
    }

    const rows = await db.select().from(meetings).where(eq(meetings.id, id)).limit(1);

    if (!rows.length) {
        throw createError({ statusCode: 404, message: 'Entry not found.' });
    }

    const row = rows[0]!;

    const result: IHistoryEntry = {
        id: row.id,
        date: row.date,
        meetingType: row.meetingType,
        provider: row.provider as IHistoryEntry['provider'],
        charCount: row.charCount,
        transcript: row.transcript,
        summary: JSON.parse(row.summary),
        mode: row.mode as IHistoryEntry['mode'],
    };

    return result;
});
