/**
 * POST /api/integrations/jira/test
 * Test Jira configuration
 */
import { defineEventHandler, readBody, createError, type H3Event } from 'h3';

export default defineEventHandler(async (event: H3Event) => {
    const body = await readBody(event);
    const { baseUrl, email, apiToken, projectKey } = body;

    if (!baseUrl || !email || !apiToken || !projectKey) {
        throw createError({
            statusCode: 400,
            message: 'baseUrl, email, apiToken, and projectKey are required',
        });
    }

    try {
        const auth = Buffer.from(`${email}:${apiToken}`).toString('base64');

        // Test connectivity by fetching project
        const response = await fetch(`${baseUrl}/rest/api/3/projects/${projectKey}`, {
            method: 'GET',
            headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) {
            if (response.status === 401) {
                throw new Error('Authentication failed - invalid email/token');
            } else if (response.status === 404) {
                throw new Error(`Project ${projectKey} not found`);
            }

            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return {
            success: true,
            message: 'Jira connection successful',
        };
    } catch (err: unknown) {
        throw createError({
            statusCode: 400,
            message: `Jira test failed: ${(err as Error).message}`,
        });
    }
});
