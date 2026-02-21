// GET /api/history
// Returns a paginated list of meeting history entries.
// Filtered by userId from session when auth is active (nullable in anonymous mode).

import { defineEventHandler, getQuery, type H3Event } from 'h3';
import { desc, eq, sql, isNull } from 'drizzle-orm';
import { useDb } from '#server/utils/db';
import { meetings } from '#server/db/schema';
import type { IHistoryEntry } from '~/types';

export default defineEventHandler(async (event: H3Event) => {
    const db = useDb();
    const query = getQuery(event);
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const offset = (page - 1) * limit;

    // Get userId from session (null if not authenticated)
    const user = await getUserSession(event);
    const userId = user?.id || null;

    // Build where clause: filter by userId if authenticated, otherwise return only anonymous meetings
    const where = userId ? eq(meetings.userId, userId) : isNull(meetings.userId);

    const [rows, countRows] = await Promise.all([
        db
            .select()
            .from(meetings)
            .where(where)
            .orderBy(desc(meetings.createdAt))
            .limit(limit)
            .offset(offset),
        db
            .select({ count: sql<number>`COUNT(*)` })
            .from(meetings)
            .where(where),
    ]);

    const total = countRows[0]?.count ?? 0;

    const data: IHistoryEntry[] = rows.map((row: typeof rows[number]) => ({
        id: row.id,
        date: row.date,
        meetingType: row.meetingType,
        provider: row.provider as IHistoryEntry['provider'],
        charCount: row.charCount,
        transcript: row.transcript,
        summary: JSON.parse(row.summary),
        mode: row.mode as IHistoryEntry['mode'],
    }));

    return { data, total, page, limit };
});
