/**
 * Azure DevOps integration utilities
 * Creates work items in Azure DevOps from action items
 */

export interface AzureConfig {
    enabled: boolean;
    organization: string;
    project: string;
    pat: string; // Personal Access Token
    workItemType?: string;
}

export interface AzureCreateResult {
    id: string;
    url: string;
}

/**
 * Create an Azure DevOps work item from an action item
 * @param {AzureConfig} config - The Azure DevOps configuration
 * @param {object} item - The action item to create
 * @param {string} item.title - The title of the work item
 * @param {string} [item.description] - The description of the work item
 * @param {string} [item.assignee] - The assignee for the work item
 * @param {string} [item.dueDate] - The due date for the work item
 * @param {string} [item.priority] - The priority level of the work item
 * @returns {Promise<AzureCreateResult>} The created work item with id and url
 */
export async function createAzureWorkItem(
    config: AzureConfig,
    item: {
        title: string;
        description?: string;
        assignee?: string;
        dueDate?: string;
        priority?: string;
    }
): Promise<AzureCreateResult> {
    if (!config.enabled || !config.organization || !config.project || !config.pat) {
        throw new Error('Azure DevOps is not properly configured');
    }

    const auth = Buffer.from(`:${config.pat}`).toString('base64');

    const priorityMap: Record<string, number> = {
        HIGH: 1,
        MEDIUM: 2,
        LOW: 3,
    };

    const fields: Record<string, string | number | undefined> = {
        'System.Title': item.title,
        'System.WorkItemType': config.workItemType || 'Task',
        'System.AssignedTo': item.assignee || undefined,
        'Microsoft.VSTS.Common.Priority': priorityMap[item.priority || 'MEDIUM'] || 2,
    };

    if (item.description) {
        fields['System.Description'] = item.description;
    }

    if (item.dueDate) {
        fields['Microsoft.VSTS.Scheduling.DueDate'] = item.dueDate;
    }

    // Filter out undefined values
    Object.keys(fields).forEach((key) => fields[key] === undefined && delete fields[key]);

    const response = await fetch(
        `https://dev.azure.com/${config.organization}/${config.project}/_apis/wit/workitems?api-version=7.1`,
        {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/json-patch+json',
            },
            body: JSON.stringify(
                Object.entries(fields).map(([key, value]) => ({
                    op: 'add',
                    path: `/fields/${key}`,
                    value,
                }))
            ),
        }
    );

    if (!response.ok) {
        const error = await response.json();

        throw new Error(
            `Azure DevOps API error: ${error.message || response.statusText}`
        );
    }

    const data = await response.json();

    return {
        id: String(data.id),
        url: data.url,
    };
}

/**
 * Update Azure DevOps work item state
 * @param {AzureConfig} config - The Azure DevOps configuration
 * @param {string} workItemId - The ID of the work item to update
 * @param {string} status - The new status for the work item
 */
export async function updateAzureWorkItemState(
    config: AzureConfig,
    workItemId: string,
    status: string
): Promise<void> {
    if (!config.enabled || !config.organization || !config.project || !config.pat) {
        throw new Error('Azure DevOps is not properly configured');
    }

    const auth = Buffer.from(`:${config.pat}`).toString('base64');

    // Map application status to Azure work item states
    const statusMap: Record<string, string> = {
        TODO: 'New',
        IN_PROGRESS: 'Active',
        DONE: 'Closed',
    };

    const targetState = statusMap[status];

    if (!targetState) {
        console.warn(`Unknown status: ${status}, skipping Azure update`);

        return;
    }

    const response = await fetch(
        `https://dev.azure.com/${config.organization}/${config.project}/_apis/wit/workitems/${workItemId}?api-version=7.1`,
        {
            method: 'PATCH',
            headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/json-patch+json',
            },
            body: JSON.stringify([
                {
                    op: 'add',
                    path: '/fields/System.State',
                    value: targetState,
                },
            ]),
        }
    );

    if (!response.ok) {
        const error = await response.json();

        console.warn(
            `Failed to update Azure work item state: ${error.message || response.statusText}`
        );
    }
}
