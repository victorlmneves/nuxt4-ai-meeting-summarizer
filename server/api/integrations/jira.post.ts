// POST /api/integrations/jira
// Creates issues in a Jira project from meeting action items

import { defineEventHandler, readBody, createError, type H3Event } from 'h3';

interface IActionItem {
    task: string;
    owner: string;
    deadline: string;
    priority: 'high' | 'medium' | 'low';
}

// Map MinutAI priorities to Jira priority names
const PRIORITY_MAP: Record<string, string> = {
    high: 'High',
    medium: 'Medium',
    low: 'Low'
};

export default defineEventHandler(async (event: H3Event) => {
    const body = await readBody(event);
    const { baseUrl, email, apiToken, projectKey, actionItems, meetingType } = body;

    if (!baseUrl || !email || !apiToken || !projectKey) {
        throw createError({ statusCode: 400, message: 'Missing Jira configuration (baseUrl, email, apiToken, projectKey).' });
    }

    if (!actionItems?.length) {
        throw createError({ statusCode: 400, message: 'No action items to send.' });
    }

    const auth = Buffer.from(`${email}:${apiToken}`).toString('base64');
    const headers = {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
    };

    const cleanBase = baseUrl.replace(/\/$/, '');
    const results: { task: string; url: string | null; error: string | null }[] = [];

    for (const item of actionItems as IActionItem[]) {
        try {
            const payload = {
                fields: {
                    project: { key: projectKey },
                    summary: item.task,
                    issuetype: { name: 'Task' },
                    priority: { name: PRIORITY_MAP[item.priority] ?? 'Medium' },
                    description: {
                        type: 'doc',
                        version: 1,
                        content: [
                            {
                                type: 'paragraph',
                                content: [
                                    { type: 'text', text: `Owner: ${item.owner}` },
                                    { type: 'hardBreak' },
                                    { type: 'text', text: `Deadline: ${item.deadline}` },
                                    { type: 'hardBreak' },
                                    { type: 'text', text: `Created from MinutAI — ${meetingType ?? 'Meeting'}` }
                                ]
                            }
                        ]
                    }
                }
            };

            const res = await fetch(`${cleanBase}/rest/api/3/issue`, {
                method: 'POST',
                headers,
                body: JSON.stringify(payload)
            });

            const data = await res.json();

            if (!res.ok) {
                results.push({
                    task: item.task,
                    url: null,
                    error: data.errorMessages?.[0] ?? data.errors?.summary ?? `HTTP ${res.status}`
                });
            } else {
                results.push({ task: item.task, url: `${cleanBase}/browse/${data.key}`, error: null });
            }
        } catch (err: any) {
            results.push({ task: item.task, url: null, error: err.message });
        }
    }

    return { results };
});
