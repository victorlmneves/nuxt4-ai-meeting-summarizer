// PATCH /api/history/:id
// Updates the summary (and derived meetingType) of an existing history entry.

import { defineEventHandler, readBody, getRouterParam, createError, type H3Event } from 'h3';
import { eq } from 'drizzle-orm';
import { useDb } from '#server/utils/db';
import { meetings } from '#server/db/schema';
import type { IMeetingSummary } from '~/types/index';

export default defineEventHandler(async (event: H3Event) => {
    const db = useDb();
    const id = getRouterParam(event, 'id');

    if (!id) {
        throw createError({ statusCode: 400, message: 'id is required.' });
    }

    const body = await readBody(event);
    const summary: IMeetingSummary = body?.summary;

    if (!summary) {
        throw createError({ statusCode: 400, message: 'summary is required.' });
    }

    const rows = await db.select({ id: meetings.id }).from(meetings).where(eq(meetings.id, id)).limit(1);

    if (!rows.length) {
        throw createError({ statusCode: 404, message: 'Entry not found.' });
    }

    await db
        .update(meetings)
        .set({
            summary: JSON.stringify(summary),
            meetingType: summary.meetingType,
        })
        .where(eq(meetings.id, id));

    return { ok: true };
});
