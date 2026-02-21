/**
 * Integration setup guide and documentation endpoint
 * GET /api/integrations/setup-guide
 */
import { defineEventHandler } from 'h3';

export default defineEventHandler(() => {
    return {
        status: 'success',
        integrations: {
            jira: {
                name: 'Jira',
                description: 'Create Jira issues from action items',
                setup: {
                    step_1: 'Go to https://id.atlassian.com/manage-profile/security/api-tokens',
                    step_2: 'Click "Create API token"',
                    step_3: 'Copy the generated token',
                    step_4: 'Get your email from Jira account settings',
                    step_5: 'Find your base URL (e.g., https://your-domain.atlassian.net)',
                    step_6: 'Get your project key from project settings',
                },
                required_fields: {
                    baseUrl: 'Jira instance base URL (e.g., https://your-domain.atlassian.net)',
                    email: 'Email associated with your Jira account',
                    apiToken: 'API token generated from account security settings',
                    projectKey: 'Jira project key (e.g., PROJ)',
                },
                optional_fields: {
                    issueType: 'Type of issue to create (default: Task)',
                },
                test_endpoint: 'POST /api/integrations/jira/test',
            },
            linear: {
                name: 'Linear',
                description: 'Create Linear issues from action items',
                setup: {
                    step_1: 'Go to https://linear.app/settings/api',
                    step_2: 'Create a new personal API key',
                    step_3: 'Copy the API key',
                    step_4: 'In Linear, go to Settings > Teams and find your team ID',
                    step_5: 'Or go to any issue - the team ID is in the URL',
                },
                required_fields: {
                    apiKey: 'Personal API key from Linear settings',
                    teamId: 'Linear team ID',
                },
                test_endpoint: 'POST /api/integrations/linear/test',
            },
            notion: {
                name: 'Notion',
                description: 'Create Notion database entries from action items',
                setup: {
                    step_1: 'Go to https://www.notion.so/my-integrations',
                    step_2: 'Click "New integration"',
                    step_3: 'Fill in integration name and click "Create"',
                    step_4: 'Copy the Internal Integration Token',
                    step_5: 'Open your Notion database',
                    step_6: 'Click "..." > "Connections" and select your integration',
                    step_7: 'Copy the database ID from the URL (32-character string or with dashes)',
                    step_8: 'Make sure your database has properties: title, description, priority, status, due-date, assignee',
                },
                required_fields: {
                    integrationToken: 'Internal Integration Token from my-integrations',
                    databaseId: 'Notion database ID (with or without dashes)',
                },
                test_endpoint: 'POST /api/integrations/notion/test',
                note: 'Ensure your Notion integration has access to the database',
            },
            azure: {
                name: 'Azure DevOps',
                description: 'Create Azure DevOps work items from action items',
                setup: {
                    step_1: 'Go to https://dev.azure.com/{organization}/_usersSettings/tokens (replace {organization})',
                    step_2: 'Click "New Token"',
                    step_3: 'Select scope "Work Item: Read & Write"',
                    step_4: 'Click "Create"',
                    step_5: 'Copy the generated token',
                    step_6: 'Get your organization name from the URL',
                    step_7: 'Get your project name from project settings',
                },
                required_fields: {
                    organization: 'Azure DevOps organization name',
                    project: 'Azure DevOps project name',
                    pat: 'Personal Access Token with Work Item read/write permissions',
                },
                optional_fields: {
                    workItemType: 'Type of work item to create (default: Task)',
                },
                test_endpoint: 'POST /api/integrations/azure/test',
            },
        },
        testing: {
            description: 'Test your integration configuration before use',
            example: 'POST /api/integrations/jira/test with { baseUrl, email, apiToken, projectKey }',
        },
        general_workflow: {
            step_1: 'Save integration config via PUT /api/integrations/config',
            step_2: 'Test connection via POST /api/integrations/[service]/test',
            step_3: 'Create meeting summary',
            step_4: 'Create action items via POST /api/action-items with pushToService parameter',
            step_5: 'Update status via PATCH /api/action-items/[id] - status changes sync automatically',
        },
    };
});
