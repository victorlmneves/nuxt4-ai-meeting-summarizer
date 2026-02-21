/**
 * PATCH /api/action-items/[id]
 * Update action item status/details
 */
import { defineEventHandler, readBody, getRouterParam, createError, type H3Event } from 'h3';
import { useDb } from '#server/utils/db';
import { actionItems } from '#server/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { transitionJiraIssue } from '#server/utils/integrations/jira';
import { updateLinearIssueState } from '#server/utils/integrations/linear';
import { updateNotionItemStatus } from '#server/utils/integrations/notion';
import { updateAzureWorkItemState } from '#server/utils/integrations/azure';

export default defineEventHandler(async (event: H3Event) => {
    const db = useDb();
    const user = await getUserSession(event);
    const userId = user?.user?.id || null;
    const id = getRouterParam(event, 'id');
    const body = await readBody(event);

    if (!id) {
        throw createError({ statusCode: 400, message: 'ID required' });
    }

    // Verify ownership
    const item = await db.query.actionItems.findFirst({
        where: and(
            eq(actionItems.id, id),
            userId ? eq(actionItems.userId, userId) : isNull(actionItems.userId)
        ),
    });

    if (!item) {
        throw createError({ statusCode: 404, message: 'Action item not found' });
    }

    // Update fields
    const updateData = {
        ...(body.title !== undefined && { title: body.title }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.assignee !== undefined && { assignee: body.assignee }),
        ...(body.dueDate !== undefined && { dueDate: body.dueDate }),
        ...(body.priority !== undefined && { priority: body.priority }),
        ...(body.status !== undefined && { status: body.status }),
        updatedAt: new Date().toISOString(),
    };

    await db.update(actionItems).set(updateData).where(eq(actionItems.id, id));

    // If status changed, sync to external service
    if (body.status && body.status !== item.status && item.externalServiceId) {
        try {
            await syncStatusToService(
                item.externalService,
                item.externalServiceId,
                body.status,
                userId
            );
        } catch (err) {
            console.error('Failed to sync status to external service:', err);
            // Don't fail the request — local update succeeded
        }
    }

    const updated = { ...item, ...updateData };

    return updated;
});

/**
 * Sync status to external service
 * @param {string | null} service - The external service name
 * @param {string} externalId - The external service ID
 * @param {string} status - The new status
 * @param {string | null} userId - The user ID
 */
async function syncStatusToService(
    service: string | null,
    externalId: string,
    status: string,
    userId: string | null
) {
    if (!service) return;

    try {
        if (service === 'jira') {
            const config = await getIntegrationConfig(userId, 'jira');

            await transitionJiraIssue(config, externalId, status);
        } else if (service === 'linear') {
            const config = await getIntegrationConfig(userId, 'linear');

            await updateLinearIssueState(config, externalId, status);
        } else if (service === 'notion') {
            const config = await getIntegrationConfig(userId, 'notion');

            await updateNotionItemStatus(config, externalId, status);
        } else if (service === 'azure') {
            const config = await getIntegrationConfig(userId, 'azure');

            await updateAzureWorkItemState(config, externalId, status);
        }
    } catch (err) {
        console.warn(`Failed to sync to ${service}:`, err);
        // Don't throw — allow local update to succeed
    }
}

/**
 * Helper: Get integration config from DB
 * @param {string | null} userId - The user ID
 * @param {string} service - The service name
 * @returns {Promise<any>} The parsed integration configuration
 */
async function getIntegrationConfig(userId: string | null, service: string) {
    const db = useDb();
    const { integrationsConfig } = await import('#server/db/schema');
    const { eq, and, isNull } = await import('drizzle-orm');

    const config = await db.query.integrationsConfig.findFirst({
        where: and(
            userId ? eq(integrationsConfig.userId, userId) : isNull(integrationsConfig.userId),
            eq(integrationsConfig.service, service)
        ),
    });

    if (!config) {
        throw new Error(`${service} not configured`);
    }

    return JSON.parse(config.config);
}
