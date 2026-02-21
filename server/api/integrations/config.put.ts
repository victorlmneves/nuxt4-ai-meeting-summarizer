// PUT /api/integrations/config
// Saves the full integrations configuration. Each service is stored as a
// separate row (upsert) so future per-service updates are possible.

import { defineEventHandler, readBody, createError, type H3Event } from 'h3';
import { eq, and, isNull } from 'drizzle-orm';
import { useDb } from '#server/utils/db';
import { integrationsConfig } from '#server/db/schema';
import type { IIntegrationsConfig } from '~/types';

const VALID_SERVICES: (keyof IIntegrationsConfig)[] = ['jira', 'linear', 'notion', 'azure'];

export default defineEventHandler(async (event: H3Event) => {
    const db = useDb();
    const body = await readBody(event);

    if (!body || typeof body !== 'object') {
        throw createError({ statusCode: 400, message: 'Request body must be a config object.' });
    }

    // Get userId from session (null if not authenticated)
    const user = await getUserSession(event);
    const userId = user?.id || null;

    const now = new Date().toISOString();

    for (const service of VALID_SERVICES) {
        if (!(service in body)) {
            continue;
        }

        const configJson = JSON.stringify(body[service]);

        // Check if a row already exists for this (userId, service) pair
        const existing = await db
            .select({ id: integrationsConfig.id })
            .from(integrationsConfig)
            .where(
                and(
                    userId ? eq(integrationsConfig.userId, userId) : isNull(integrationsConfig.userId),
                    eq(integrationsConfig.service, service)
                )
            )
            .limit(1);

        if (existing.length) {
            await db
                .update(integrationsConfig)
                .set({ config: configJson, updatedAt: now })
                .where(eq(integrationsConfig.id, existing[0]!.id));
        } else {
            await db.insert(integrationsConfig).values({
                id: crypto.randomUUID(),
                userId,
                service,
                config: configJson,
                updatedAt: now,
            });
        }
    }

    return { ok: true };
});
