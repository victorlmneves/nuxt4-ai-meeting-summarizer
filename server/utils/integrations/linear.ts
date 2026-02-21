/**
 * Linear integration utilities
 * Creates issues in Linear from action items
 */

import type { ILinearConfig } from '~/types';

export interface ILinearCreateResult {
    id: string;
    identifier: string;
    url: string;
}

export interface ILinearState {
    id: string;
    name: string;
}

/**
 * Create a Linear issue from an action item
 * @param {ILinearConfig} config - Linear API configuration with enabled status, API key, and team ID
 * @param {object} item - The action item to create as a Linear issue
 * @param {string} item.title - The title of the issue
 * @param {string} [item.description] - Optional description of the issue
 * @param {string} [item.assignee] - Optional assignee for the issue
 * @param {string} [item.dueDate] - Optional due date for the issue
 * @param {string} [item.priority] - Optional priority level (HIGH, MEDIUM, LOW)
 * @returns {Promise<ILinearCreateResult>} The created issue with id, identifier, and url
 */
export async function createLinearIssue(
    config: ILinearConfig,
    item: {
        title: string;
        description?: string;
        assignee?: string;
        dueDate?: string;
        priority?: string;
    }
): Promise<ILinearCreateResult> {
    if (!config.enabled || !config.apiKey || !config.teamId) {
        throw new Error('Linear is not properly configured');
    }

    const priorityMap: Record<string, number> = {
        HIGH: 3, // Urgent
        MEDIUM: 2, // Medium
        LOW: 1, // No Priority
    };

    const query = `
        mutation CreateIssue($input: IssueCreateInput!) {
            issueCreate(input: $input) {
                issue {
                    id
                    identifier
                    url
                    title
                }
                success
            }
        }
    `;

    const response = await fetch('https://api.linear.app/graphql', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            query,
            variables: {
                input: {
                    teamId: config.teamId,
                    title: item.title,
                    description: item.description || undefined,
                    priority: priorityMap[item.priority || 'MEDIUM'] || 2,
                    dueDate: item.dueDate || undefined,
                },
            },
        }),
    });

    if (!response.ok) {
        throw new Error(`Linear API error: ${response.statusText}`);
    }

    const data = await response.json();

    if (data.errors) {
        throw new Error(`Linear GraphQL error: ${data.errors[0].message}`);
    }

    if (!data.data?.issueCreate?.success) {
        throw new Error('Failed to create Linear issue');
    }

    const issue = data.data.issueCreate.issue;

    return {
        id: issue.id,
        identifier: issue.identifier,
        url: issue.url,
    };
}

/**
 * Update Linear issue state (status)
 * @param {ILinearConfig} config - Linear API configuration with enabled status and API key
 * @param {string} issueId - The ID of the Linear issue to update
 * @param {string} status - The target status (TODO, IN_PROGRESS, DONE)
 * @returns {Promise<void>}
 */
export async function updateLinearIssueState(
    config: ILinearConfig,
    issueId: string,
    status: string
): Promise<void> {
    if (!config.enabled || !config.apiKey) {
        throw new Error('Linear is not properly configured');
    }

    // Maps application status to Linear state names
    const statusMap: Record<string, string> = {
        TODO: 'Backlog',
        IN_PROGRESS: 'In Progress',
        DONE: 'Done',
    };

    const targetState = statusMap[status];

    if (!targetState) {
        console.warn(`Unknown status: ${status}, skipping Linear update`);

        return;
    }

    // First, fetch available states for the team
    const statesQuery = `
        query GetTeamStates($teamId: String!) {
            team(id: $teamId) {
                states {
                    nodes {
                        id
                        name
                    }
                }
            }
        }
    `;

    const statesResponse = await fetch('https://api.linear.app/graphql', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            query: statesQuery,
            variables: {
                teamId: config.teamId,
            },
        }),
    });

    const statesData = await statesResponse.json();

    if (statesData.errors) {
        console.warn(`Failed to fetch Linear states: ${statesData.errors[0].message}`);

        return;
    }

    const states = (statesData.data?.team?.states?.nodes || []) as ILinearState[];
    const targetStateObj = states.find((s: ILinearState) => s.name === targetState);

    if (!targetStateObj) {
        console.warn(`State ${targetState} not found in Linear`);

        return;
    }

    // Update the issue state
    const updateQuery = `
        mutation UpdateIssue($input: IssueUpdateInput!) {
            issueUpdate(input: $input) {
                issue {
                    id
                    state {
                        name
                    }
                }
            }
        }
    `;

    const updateResponse = await fetch('https://api.linear.app/graphql', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            query: updateQuery,
            variables: {
                input: {
                    id: issueId,
                    stateId: targetStateObj.id,
                },
            },
        }),
    });

    const updateData = await updateResponse.json();

    if (updateData.errors) {
        console.warn(`Failed to update Linear issue state: ${updateData.errors[0].message}`);
    }
}
