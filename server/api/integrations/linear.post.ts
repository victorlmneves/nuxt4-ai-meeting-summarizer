// POST /api/integrations/linear
// Creates issues in a Linear team from meeting action items

import { defineEventHandler, readBody, createError, type H3Event } from 'h3';
import type { IActionItem } from '~/types/index';

// Linear priority: 0=No priority, 1=Urgent, 2=High, 3=Medium, 4=Low
const PRIORITY_MAP: Record<string, number> = {
    high: 2,
    medium: 3,
    low: 4,
};

export default defineEventHandler(async (event: H3Event) => {
    const body = await readBody(event);
    const { apiKey, teamId, actionItems, meetingType } = body;

    if (!apiKey || !teamId) {
        throw createError({ statusCode: 400, message: 'Missing Linear configuration (apiKey, teamId).' });
    }

    if (!actionItems?.length) {
        throw createError({ statusCode: 400, message: 'No action items to send.' });
    }

    const results: { task: string; url: string | null; error: string | null }[] = [];

    for (const item of actionItems as IActionItem[]) {
        try {
            const mutation = `
        mutation CreateIssue($input: IssueCreateInput!) {
          issueCreate(input: $input) {
            success
            issue {
              id
              url
              title
            }
          }
        }
      `;

            const variables = {
                input: {
                    teamId,
                    title: item.task,
                    priority: PRIORITY_MAP[item.priority] ?? 3,
                    description: [
                        `**Owner:** ${item.owner}`,
                        `**Deadline:** ${item.deadline}`,
                        `*Created from MinutAI — ${meetingType ?? 'Meeting'}*`,
                    ].join('\n'),
                },
            };

            const res = await fetch('https://api.linear.app/graphql', {
                method: 'POST',
                headers: {
                    Authorization: apiKey,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ query: mutation, variables }),
            });

            const data = await res.json();

            if (data.errors?.length) {
                results.push({ task: item.task, url: null, error: data.errors[0].message });
            } else if (!data.data?.issueCreate?.success) {
                results.push({ task: item.task, url: null, error: 'Linear returned failure.' });
            } else {
                results.push({ task: item.task, url: data.data.issueCreate.issue.url, error: null });
            }
        } catch (err: unknown) {
            results.push({ task: item.task, url: null, error: err instanceof Error ? err.message : 'Unknown error' });
        }
    }

    return { results };
});
