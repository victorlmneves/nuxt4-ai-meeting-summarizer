// POST /api/history
// Creates a new meeting history entry and returns it.

import { defineEventHandler, readBody, createError, type H3Event } from 'h3';
import { useDb } from '#server/utils/db';
import { meetings } from '#server/db/schema';
import type { IHistoryEntry } from '~/types/index';

export default defineEventHandler(async (event: H3Event) => {
    const db = useDb();
    const body = await readBody(event);
    const { summary, transcript, provider, mode, date } = body;

    if (!summary || !provider) {
        throw createError({ statusCode: 400, message: 'summary and provider are required.' });
    }

    // Get userId from session (null if not authenticated)
    const user = await getUserSession(event);
    const userId = user?.user?.id || null;

    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    const entry = {
        id,
        userId,
        date: date ?? now,
        meetingType: summary.meetingType ?? 'Meeting',
        provider: provider as string,
        mode: (mode ?? 'single') as string,
        charCount: typeof transcript === 'string' ? transcript.length : 0,
        transcript: transcript ?? '',
        summary: JSON.stringify(summary),
        createdAt: now,
    };

    await db.insert(meetings).values(entry);

    const result: IHistoryEntry = {
        id,
        date: entry.date,
        meetingType: entry.meetingType,
        provider: entry.provider as IHistoryEntry['provider'],
        charCount: entry.charCount,
        transcript: entry.transcript,
        summary,
        mode: entry.mode as IHistoryEntry['mode'],
    };

    return result;
});
