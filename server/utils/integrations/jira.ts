/**
 * Jira integration utilities
 * Creates issues in Jira from action items
 */

import type { IJiraConfig } from '~/types';

export interface IJiraCreateResult {
    id: string;
    key: string;
    url: string;
}

interface IJiraTransition {
    id: string;
    to: {
        name: string;
    };
}

/**
 * Create a Jira issue from an action item
 * @param {IJiraConfig} config - Jira configuration object
 * @param {object} item - The action item to create in Jira
 * @param {string} item.title - The title of the action item
 * @param {string} [item.description] - The description of the action item
 * @param {string} [item.assignee] - The assignee for the action item
 * @param {string} [item.dueDate] - The due date for the action item
 * @param {string} [item.priority] - The priority level of the action item
 * @returns {Promise<IJiraCreateResult>} The created Jira issue details
 */
export async function createJiraIssue(
    config: IJiraConfig,
    item: {
        title: string;
        description?: string;
        assignee?: string;
        dueDate?: string;
        priority?: string;
    }
): Promise<IJiraCreateResult> {
    if (!config.enabled || !config.baseUrl || !config.apiToken || !config.projectKey) {
        throw new Error('Jira is not properly configured');
    }

    const auth = Buffer.from(`${config.email}:${config.apiToken}`).toString('base64');

    const priorityMap: Record<string, string> = {
        HIGH: 'Highest',
        MEDIUM: 'Medium',
        LOW: 'Lowest',
    };

    const response = await fetch(`${config.baseUrl}/rest/api/3/issues`, {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            fields: {
                project: { key: config.projectKey },
                summary: item.title,
                description: item.description
                    ? {
                          version: 1,
                          type: 'doc',
                          content: [
                              {
                                  type: 'paragraph',
                                  content: [{ type: 'text', text: item.description }],
                              },
                          ],
                      }
                    : undefined,
                issuetype: { name: config.issueType || 'Task' },
                priority: { name: priorityMap[item.priority || 'MEDIUM'] || 'Medium' },
                ...(item.dueDate && { duedate: item.dueDate }),
            },
        }),
    });

    if (!response.ok) {
        const error = await response.json();

        throw new Error(`Jira API error: ${error.errorMessages?.[0] || response.statusText}`);
    }

    const data = await response.json();

    return {
        id: data.id,
        key: data.key,
        url: `${config.baseUrl}/browse/${data.key}`,
    };
}

/**
 * Transition a Jira issue to a new status
 * @param {IJiraConfig} config - Jira configuration object
 * @param {string} issueKey - The key of the Jira issue to transition
 * @param {string} status - The new status for the Jira issue
 * @returns {Promise<void>} Resolves when the transition is complete
 */
export async function transitionJiraIssue(
    config: IJiraConfig,
    issueKey: string,
    status: string
): Promise<void> {
    if (!config.enabled || !config.baseUrl || !config.apiToken) {
        throw new Error('Jira is not properly configured');
    }

    const auth = Buffer.from(`${config.email}:${config.apiToken}`).toString('base64');

    // Map application status to Jira transition names
    const statusMap: Record<string, string> = {
        TODO: 'To Do',
        IN_PROGRESS: 'In Progress',
        DONE: 'Done',
    };

    // First, get available transitions
    const transitionsResponse = await fetch(
        `${config.baseUrl}/rest/api/3/issues/${issueKey}/transitions`,
        {
            method: 'GET',
            headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/json',
            },
        }
    );

    if (!transitionsResponse.ok) {
        throw new Error(`Failed to get Jira transitions: ${transitionsResponse.statusText}`);
    }

    const transitionsData = await transitionsResponse.json();
    const targetStatus = statusMap[status];

    if (!targetStatus) {
        console.warn(`Unknown status: ${status}, skipping Jira transition`);

        return;
    }

    const transition = transitionsData.transitions.find(
        (t: IJiraTransition) => t.to.name === targetStatus
    );

    if (!transition) {
        console.warn(`No transition to ${targetStatus} available`);

        return;
    }

    // Execute the transition
    const response = await fetch(
        `${config.baseUrl}/rest/api/3/issues/${issueKey}/transitions`,
        {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                transition: { id: transition.id },
            }),
        }
    );

    if (!response.ok) {
        throw new Error(`Failed to transition Jira issue: ${response.statusText}`);
    }
}
