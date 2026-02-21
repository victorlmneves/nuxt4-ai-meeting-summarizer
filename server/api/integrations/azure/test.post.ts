/**
 * POST /api/integrations/azure/test
 * Test Azure DevOps configuration
 */
import { defineEventHandler, readBody, createError, type H3Event } from 'h3';

export default defineEventHandler(async (event: H3Event) => {
    const body = await readBody(event);
    const { organization, project, pat } = body;

    if (!organization || !project || !pat) {
        throw createError({
            statusCode: 400,
            message: 'organization, project, and pat are required',
        });
    }

    try {
        const auth = Buffer.from(`:${pat}`).toString('base64');

        // Test connectivity by fetching project
        const response = await fetch(
            `https://dev.azure.com/${organization}/_apis/projects/${project}?api-version=7.1`,
            {
                method: 'GET',
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'Content-Type': 'application/json',
                },
            }
        );

        if (!response.ok) {
            if (response.status === 401) {
                throw new Error('Authentication failed - invalid token');
            } else if (response.status === 404) {
                throw new Error(`Project ${project} not found in organization ${organization}`);
            }

            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        return {
            success: true,
            message: `Azure DevOps connection successful - Project: ${data.name}`,
        };
    } catch (err: unknown) {
        throw createError({
            statusCode: 400,
            message: `Azure test failed: ${(err as Error).message}`,
        });
    }
});
