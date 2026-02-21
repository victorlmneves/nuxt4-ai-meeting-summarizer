/**
 * POST /api/integrations/linear/test
 * Test Linear configuration
 */
import { defineEventHandler, readBody, createError, type H3Event } from 'h3';

export default defineEventHandler(async (event: H3Event) => {
    const body = await readBody(event);
    const { apiKey, teamId } = body;

    if (!apiKey || !teamId) {
        throw createError({
            statusCode: 400,
            message: 'apiKey and teamId are required',
        });
    }

    try {
        // Test connectivity by fetching team
        const query = `
            query GetTeam($teamId: String!) {
                team(id: $teamId) {
                    id
                    name
                }
            }
        `;

        const response = await fetch('https://api.linear.app/graphql', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                query,
                variables: { teamId },
            }),
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        if (data.errors) {
            throw new Error(data.errors[0].message || 'GraphQL error');
        }

        if (!data.data?.team) {
            throw new Error('Team not found');
        }

        return {
            success: true,
            message: `Linear connection successful - Team: ${data.data.team.name}`,
        };
    } catch (err: unknown) {
        throw createError({
            statusCode: 400,
            message: `Linear test failed: ${(err as Error).message}`,
        });
    }
});
