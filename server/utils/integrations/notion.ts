/**
 * Notion integration utilities
 * Creates database entries in Notion from action items
 */

export interface INotionConfig {
    enabled: boolean;
    integrationToken: string;
    databaseId: string;
}

export interface INotionCreateResult {
    id: string;
    url: string;
}

interface INotionProperties {
    title: {
        title: Array<{ text: { content: string } }>;
    };
    description?: {
        rich_text: Array<{ text: { content: string } }>;
    };
    priority?: {
        select: { name: string };
    };
    'due-date'?: {
        date: { start: string };
    };
    assignee?: {
        rich_text: Array<{ text: { content: string } }>;
    };
    status: {
        select: { name: string };
    };
}

/**
 * Create a Notion database entry from an action item
 * @param {INotionConfig} config - Notion configuration object with integration token and database ID
 * @param {object} item - Action item to create in Notion
 * @param {string} item.title - Title of the action item
 * @param {string} [item.description] - Optional description of the action item
 * @param {string} [item.assignee] - Optional assignee name
 * @param {string} [item.dueDate] - Optional due date in ISO format
 * @param {string} [item.priority] - Optional priority level (HIGH, MEDIUM, LOW)
 * @returns {Promise<INotionCreateResult>} Promise resolving to the created Notion page details
 */
export async function createNotionItem(
    config: INotionConfig,
    item: {
        title: string;
        description?: string;
        assignee?: string;
        dueDate?: string;
        priority?: string;
    }
): Promise<INotionCreateResult> {
    if (!config.enabled || !config.integrationToken || !config.databaseId) {
        throw new Error('Notion is not properly configured');
    }

    // Map application priority to Notion select option
    const priorityMap: Record<string, string> = {
        HIGH: 'High',
        MEDIUM: 'Medium',
        LOW: 'Low',
    };

    // Map application status to Notion select option
    const statusMap: Record<string, string> = {
        TODO: 'To Do',
        IN_PROGRESS: 'In Progress',
        DONE: 'Done',
    };

    const properties: INotionProperties = {
        title: {
            title: [{ text: { content: item.title } }],
        },
        status: {
            select: { name: statusMap.TODO || 'To Do' },
        },
    };

    // Add optional fields if they exist and the database has them
    if (item.description) {
        properties.description = {
            rich_text: [{ text: { content: item.description } }],
        };
    }

    if (item.priority) {
        properties.priority = {
            select: { name: priorityMap[item.priority] || item.priority },
        };
    }

    if (item.dueDate) {
        properties['due-date'] = {
            date: { start: item.dueDate },
        };
    }

    if (item.assignee) {
        properties.assignee = {
            rich_text: [{ text: { content: item.assignee } }],
        };
    }

    const response = await fetch('https://api.notion.com/v1/pages', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${config.integrationToken}`,
            'Content-Type': 'application/json',
            'Notion-Version': '2022-06-28',
        },
        body: JSON.stringify({
            parent: { database_id: config.databaseId.replace(/-/g, '') },
            properties,
        }),
    });

    if (!response.ok) {
        const error = await response.json();

        throw new Error(
            `Notion API error: ${error.message || response.statusText}`
        );
    }

    const data = await response.json();

    return {
        id: data.id,
        url: data.url,
    };
}

/**
 * Update Notion item status
 * @param {INotionConfig} config - Notion configuration object with integration token
 * @param {string} pageId - The Notion page ID to update
 * @param {string} status - The new status to set (TODO, IN_PROGRESS, DONE)
 * @returns {Promise<void>} Promise that resolves when the update is complete
 */
export async function updateNotionItemStatus(
    config: INotionConfig,
    pageId: string,
    status: string
): Promise<void> {
    if (!config.enabled || !config.integrationToken) {
        throw new Error('Notion is not properly configured');
    }

    const statusMap: Record<string, string> = {
        TODO: 'To Do',
        IN_PROGRESS: 'In Progress',
        DONE: 'Done',
    };

    const targetStatus = statusMap[status];

    if (!targetStatus) {
        console.warn(`Unknown status: ${status}, skipping Notion update`);

        return;
    }

    const response = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
        method: 'PATCH',
        headers: {
            'Authorization': `Bearer ${config.integrationToken}`,
            'Content-Type': 'application/json',
            'Notion-Version': '2022-06-28',
        },
        body: JSON.stringify({
            properties: {
                status: {
                    select: { name: targetStatus },
                },
            },
        }),
    });

    if (!response.ok) {
        const error = await response.json();

        console.warn(
            `Failed to update Notion item status: ${error.message || response.statusText}`
        );
    }
}
