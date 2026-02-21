/**
 * POST /api/integrations/notion/test
 * Test Notion configuration
 */
import { defineEventHandler, readBody, createError, type H3Event } from 'h3';

export default defineEventHandler(async (event: H3Event) => {
    const body = await readBody(event);
    const { integrationToken, databaseId } = body;

    if (!integrationToken || !databaseId) {
        throw createError({
            statusCode: 400,
            message: 'integrationToken and databaseId are required',
        });
    }

    try {
        const cleanDatabaseId = databaseId.replace(/-/g, '');

        // Test connectivity by fetching database
        const response = await fetch(`https://api.notion.com/v1/databases/${cleanDatabaseId}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${integrationToken}`,
                'Notion-Version': '2022-06-28',
            },
        });

        if (!response.ok) {
            if (response.status === 401) {
                throw new Error('Authentication failed - invalid token');
            } else if (response.status === 404) {
                throw new Error('Database not found');
            }

            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        return {
            success: true,
            message: `Notion connection successful - Database: ${data.title || 'Unnamed'}`,
        };
    } catch (err: unknown) {
        throw createError({
            statusCode: 400,
            message: `Notion test failed: ${(err as Error).message}`,
        });
    }
});
