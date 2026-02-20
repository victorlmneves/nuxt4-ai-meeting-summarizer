// GET /api/integrations/config
// Returns the stored integrations configuration for the current session.
// Returns an empty object if no config is found (not an error).

import { defineEventHandler } from 'h3';
import { eq, and, isNull } from 'drizzle-orm';
import { useDb } from '#server/utils/db';
import { integrationsConfig } from '#server/db/schema';
import type { IIntegrationsConfig } from '~/types/index';

export default defineEventHandler(async () => {
    const db = useDb();

    // TODO (Phase 4): get userId from getUserSession(event).user.id
    const userId: string | null = null;

    const rows = await db
        .select()
        .from(integrationsConfig)
        .where(userId ? eq(integrationsConfig.userId, userId) : isNull(integrationsConfig.userId));

    // Merge all service rows into a single config object
    const result: Partial<IIntegrationsConfig> = {};

    for (const row of rows) {
        const service = row.service as keyof IIntegrationsConfig;

        result[service] = JSON.parse(row.config) as IIntegrationsConfig[keyof IIntegrationsConfig];
    }

    return result;
});
