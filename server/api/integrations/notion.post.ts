// POST /api/integrations/notion
// Creates pages in a Notion database from meeting action items

import { defineEventHandler, readBody, createError, type H3Event } from 'h3';
import type { IActionItem } from '~/types/index';

const PRIORITY_COLORS: Record<string, string> = {
    high: 'red',
    medium: 'yellow',
    low: 'green',
};

export default defineEventHandler(async (event: H3Event) => {
    const body = await readBody(event);
    const { integrationToken, databaseId, actionItems, meetingType } = body;

    if (!integrationToken || !databaseId) {
        throw createError({ statusCode: 400, message: 'Missing Notion configuration (integrationToken, databaseId).' });
    }

    if (!actionItems?.length) {
        throw createError({ statusCode: 400, message: 'No action items to send.' });
    }

    const headers = {
        Authorization: `Bearer ${integrationToken}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28',
    };

    // First, introspect the database to find available properties
    const dbRes = await fetch(`https://api.notion.com/v1/databases/${databaseId}`, { headers });

    if (!dbRes.ok) {
        const err = await dbRes.json();

        throw createError({
            statusCode: 400,
            message: err.message ?? 'Could not access Notion database. Check your token and database ID.',
        });
    }

    const db = await dbRes.json();
    const props = db.properties as Record<string, { id: string; type: string }>;

    // Detect common property names across different database schemas
    const findProp = (...names: string[]) => names.find((n) => props[n]) ?? null;

    const titleProp =
        findProp('Name', 'Task', 'Title', 'Issue', 'Todo') ?? Object.keys(props).find((k) => props[k].type === 'title') ?? 'Name';
    const statusProp = findProp('Status', 'State');
    const assigneeProp = findProp('Assignee', 'Owner', 'Assigned to', 'Person');
    const priorityProp = findProp('Priority');
    const tagsProp = findProp('Tags', 'Label', 'Labels');

    const results: { task: string; url: string | null; error: string | null }[] = [];

    for (const item of actionItems as IActionItem[]) {
        try {
            // Build properties dynamically based on what the database has
            const properties: Record<string, any> = {
                [titleProp]: { title: [{ text: { content: item.task } }] },
            };

            if (priorityProp && props[priorityProp]?.type === 'select') {
                properties[priorityProp] = {
                    select: { name: item.priority.charAt(0).toUpperCase() + item.priority.slice(1), color: PRIORITY_COLORS[item.priority] },
                };
            }

            if (tagsProp && props[tagsProp]?.type === 'multi_select') {
                properties[tagsProp] = {
                    multi_select: [{ name: `MinutAI — ${meetingType ?? 'Meeting'}` }],
                };
            }

            const payload: any = {
                parent: { database_id: databaseId },
                properties,
                children: [
                    {
                        object: 'block',
                        type: 'paragraph',
                        paragraph: {
                            rich_text: [
                                {
                                    type: 'text',
                                    text: {
                                        content: `Owner: ${item.owner}\nDeadline: ${item.deadline}\nCreated by MinutAI from ${meetingType ?? 'meeting'}.`,
                                    },
                                },
                            ],
                        },
                    },
                ],
            };

            const res = await fetch('https://api.notion.com/v1/pages', {
                method: 'POST',
                headers,
                body: JSON.stringify(payload),
            });

            const data = await res.json();

            if (!res.ok) {
                results.push({ task: item.task, url: null, error: data.message ?? `HTTP ${res.status}` });
            } else {
                results.push({ task: item.task, url: data.url, error: null });
            }
        } catch (err: any) {
            results.push({ task: item.task, url: null, error: err.message });
        }
    }

    return { results };
});
