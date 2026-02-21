/**
 * POST /api/action-items
 * Create action item(s) from meeting summary
 */
import { defineEventHandler, readBody, createError, type H3Event } from 'h3';
import { useDb } from '#server/utils/db';
import { actionItems, meetings, integrationsConfig } from '#server/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { createJiraIssue } from '#server/utils/integrations/jira';
import { createLinearIssue } from '#server/utils/integrations/linear';
import { createNotionItem } from '#server/utils/integrations/notion';
import { createAzureWorkItem } from '#server/utils/integrations/azure';

interface CreateActionItemRequest {
    meetingId: string;
    items: Array<{
        title: string;
        description?: string;
        assignee?: string;
        dueDate?: string;
        priority?: 'LOW' | 'MEDIUM' | 'HIGH';
    }>;
    pushToService?: 'jira' | 'linear' | 'notion' | 'azure';
}

export default defineEventHandler(async (event: H3Event) => {
    const db = useDb();
    const user = await getUserSession(event);
    const userId = user?.id || null;

    const body = await readBody<CreateActionItemRequest>(event);

    if (!body.meetingId || !body.items?.length) {
        throw createError({
            statusCode: 400,
            message: 'meetingId and items array required',
        });
    }

    // Validate meeting exists and belongs to user (if authenticated)
    const meeting = await db
        .select()
        .from(meetings)
        .where(and(eq(meetings.id, body.meetingId), userId ? eq(meetings.userId, userId) : isNull(meetings.userId)))
        .limit(1);

    if (!meeting || meeting.length === 0) {
        throw createError({
            statusCode: 404,
            message: 'Meeting not found or access denied',
        });
    }

    const now = new Date().toISOString();
    const createdItems = [];

    for (const item of body.items) {
        const id = crypto.randomUUID();

        let externalServiceId = null;
        let externalUrl = null;

        // Push to external service if requested
        if (body.pushToService) {
            try {
                const result = await pushActionItemToService(body.pushToService, item, user);

                externalServiceId = result.id;
                externalUrl = result.url;
            } catch (err) {
                // Continue anyway — create local record
                console.error(`Failed to push to ${body.pushToService}:`, err);
            }
        }

        await db.insert(actionItems).values({
            id,
            meetingId: body.meetingId,
            userId,
            title: item.title,
            description: item.description || null,
            assignee: item.assignee || null,
            dueDate: item.dueDate || null,
            priority: item.priority || 'MEDIUM',
            status: 'TODO',
            externalService: body.pushToService || null,
            externalServiceId,
            externalUrl,
            createdAt: now,
            updatedAt: now,
        });

        createdItems.push({
            id,
            ...item,
            externalServiceId,
            externalUrl,
        });
    }

    return {
        count: createdItems.length,
        items: createdItems,
    };
});

/**
 * Push action item to external service (Jira, Linear, Notion, Azure DevOps)
 * @param {string} service - The external service name (jira, linear, notion, or azure)
 * @param {CreateActionItemRequest['items'][0]} item - The action item data to push
 * @param {object} user - The user session object with id
 * @returns {Promise<{ id: string; url: string }>} Promise with the external service ID and URL
 */
async function pushActionItemToService(
    service: string,
    item: CreateActionItemRequest['items'][0],
    user: { id: string | null }
): Promise<{ id: string; url: string }> {
    if (service === 'jira') {
        return createJiraActionItem(item, user);
    } else if (service === 'linear') {
        return createLinearActionItem(item, user);
    } else if (service === 'notion') {
        return createNotionActionItem(item, user);
    } else if (service === 'azure') {
        return createAzureActionItem(item, user);
    }

    throw new Error(`Unsupported service: ${service}`);
}

/**
 * Helper: Get integration config from DB
 * @param {string | null} userId - The user ID or null for unauthenticated users
 * @param {string} service - The integration service name (jira, linear, notion, or azure)
 * @returns {Promise<any>} Promise with the parsed integration configuration
 */
async function getIntegrationConfig(userId: string | null, service: string) {
    const db = useDb();

    const configs = await db
        .select()
        .from(integrationsConfig)
        .where(
            and(userId ? eq(integrationsConfig.userId, userId) : isNull(integrationsConfig.userId), eq(integrationsConfig.service, service))
        )
        .limit(1);

    if (!configs || configs.length === 0) {
        throw new Error(`${service} not configured`);
    }

    return JSON.parse(configs[0]!.config);
}

/**
 * Create Jira action item
 * @param {CreateActionItemRequest['items'][0]} item - The action item data to push
 * @param {object} user - The user session object with id
 * @returns {Promise<{ id: string; url: string }>} Promise with the external service ID and URL
 */
async function createJiraActionItem(item: CreateActionItemRequest['items'][0], user: { id: string | null }) {
    const config = await getIntegrationConfig(user.id, 'jira');

    return createJiraIssue(config, item);
}

/**
 * Create Linear action item
 * @param {CreateActionItemRequest['items'][0]} item - The action item data to push
 * @param {object} user - The user session object with id
 * @returns {Promise<{ id: string; url: string }>} Promise with the external service ID and URL
 */
async function createLinearActionItem(item: CreateActionItemRequest['items'][0], user: { id: string | null }) {
    const config = await getIntegrationConfig(user.id, 'linear');

    return createLinearIssue(config, item);
}

/**
 * Create Notion action item
 * @param {CreateActionItemRequest['items'][0]} item - The action item data to push
 * @param {object} user - The user session object with id
 * @returns {Promise<{ id: string; url: string }>} Promise with the external service ID and URL
 */
async function createNotionActionItem(item: CreateActionItemRequest['items'][0], user: { id: string | null }) {
    const config = await getIntegrationConfig(user.id, 'notion');

    return createNotionItem(config, item);
}

/**
 * Create Azure action item
 * @param {CreateActionItemRequest['items'][0]} item - The action item data to push
 * @param {object} user - The user session object with id
 * @returns {Promise<{ id: string; url: string }>} Promise with the external service ID and URL
 */
async function createAzureActionItem(item: CreateActionItemRequest['items'][0], user: { id: string | null }) {
    const config = await getIntegrationConfig(user.id, 'azure');

    return createAzureWorkItem(config, item);
}
