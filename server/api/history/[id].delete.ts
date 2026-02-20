// DELETE /api/history/:id
// Permanently deletes a history entry by its id.

import { defineEventHandler, getRouterParam, createError, type H3Event } from 'h3';
import { eq } from 'drizzle-orm';
import { useDb } from '#server/utils/db';
import { meetings } from '#server/db/schema';

export default defineEventHandler(async (event: H3Event) => {
    const db = useDb();
    const id = getRouterParam(event, 'id');

    if (!id) {
        throw createError({ statusCode: 400, message: 'id is required.' });
    }

    const rows = await db.select({ id: meetings.id }).from(meetings).where(eq(meetings.id, id)).limit(1);

    if (!rows.length) {
        throw createError({ statusCode: 404, message: 'Entry not found.' });
    }

    await db.delete(meetings).where(eq(meetings.id, id));

    return { ok: true };
});
