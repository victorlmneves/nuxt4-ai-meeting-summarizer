// POST /api/integrations/azure
// Creates work items in Azure Boards from meeting action items

import { defineEventHandler, readBody, createError, type H3Event } from 'h3';
import type { IActionItem } from '~/types/index';

// Map MinutAI priorities to Azure Boards priority values (1=Critical, 2=High, 3=Medium, 4=Low)
const PRIORITY_MAP: Record<string, number> = {
    high: 2,
    medium: 3,
    low: 4,
};

export default defineEventHandler(async (event: H3Event) => {
    const body = await readBody(event);
    const { organization, project, pat, workItemType = 'Task', actionItems, meetingType } = body;

    if (!organization || !project || !pat) {
        throw createError({ statusCode: 400, message: 'Missing Azure Boards configuration (organization, project, pat).' });
    }

    if (!actionItems?.length) {
        throw createError({ statusCode: 400, message: 'No action items to send.' });
    }

    const auth = Buffer.from(`:${pat}`).toString('base64');
    const headers = {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json-patch+json',
        Accept: 'application/json',
    };

    const encodedProject = encodeURIComponent(project);
    const encodedType = encodeURIComponent(workItemType);
    const apiBase = `https://dev.azure.com/${organization}/${encodedProject}/_apis/wit/workitems/$${encodedType}?api-version=7.1`;

    const results: { task: string; url: string | null; error: string | null }[] = [];

    for (const item of actionItems as IActionItem[]) {
        try {
            // Azure Boards uses JSON Patch for work item creation
            const patchDoc = [
                { op: 'add', path: '/fields/System.Title', value: item.task },
                { op: 'add', path: '/fields/Microsoft.VSTS.Common.Priority', value: PRIORITY_MAP[item.priority] ?? 3 },
                {
                    op: 'add',
                    path: '/fields/System.Description',
                    value: [
                        `<p><strong>Owner:</strong> ${item.owner}</p>`,
                        `<p><strong>Deadline:</strong> ${item.deadline}</p>`,
                        `<p><em>Created from MinutAI — ${meetingType ?? 'Meeting'}</em></p>`,
                    ].join(''),
                },
                { op: 'add', path: '/fields/System.Tags', value: `MinutAI; ${meetingType ?? 'Meeting'}` },
            ];

            // Assign to a user if owner looks like an email or display name
            if (item.owner && item.owner !== 'Unassigned') {
                patchDoc.push({ op: 'add', path: '/fields/System.AssignedTo', value: item.owner });
            }

            const res = await fetch(apiBase, {
                method: 'POST',
                headers,
                body: JSON.stringify(patchDoc),
            });

            const data = await res.json();

            if (!res.ok) {
                const msg = data.message ?? data.value?.Message ?? `HTTP ${res.status}`;

                results.push({ task: item.task, url: null, error: msg });
            } else {
                // Build the human-readable URL to the work item
                const id = data.id;
                const url = `https://dev.azure.com/${organization}/${encodedProject}/_workitems/edit/${id}`;

                results.push({ task: item.task, url, error: null });
            }
        } catch (err: unknown) {
            results.push({ task: item.task, url: null, error: err instanceof Error ? err.message : 'Unknown error' });
        }
    }

    return { results };
});
