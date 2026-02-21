// GET /api/integrations/config
// Returns the stored integrations configuration for the current session.
// Returns an empty object if no config is found (not an error).

import { defineEventHandler, type H3Event } from 'h3';
import { eq, isNull } from 'drizzle-orm';
import { useDb } from '#server/utils/db';
import { integrationsConfig } from '#server/db/schema';
import type { IIntegrationsConfig } from '~/types';

export default defineEventHandler(async (event: H3Event) => {
    const db = useDb();

    // Get userId from session (null if not authenticated)
    const user = await getUserSession(event);
    const userId = user?.id || null;

    const rows = await db
        .select()
        .from(integrationsConfig)
        .where(userId ? eq(integrationsConfig.userId, userId) : isNull(integrationsConfig.userId));

    // Merge all service rows into a single config object
    const result: Record<string, IIntegrationsConfig[keyof IIntegrationsConfig]> = {};

    for (const row of rows) {
        const service = row.service as keyof IIntegrationsConfig;

        result[service] = JSON.parse(row.config) as IIntegrationsConfig[keyof IIntegrationsConfig];
    }

    return result;
});
