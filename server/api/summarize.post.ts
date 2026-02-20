import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { defineEventHandler, readBody, setResponseHeaders, createError, type H3Event } from 'h3';

const JSON_SCHEMA = `
Return this exact JSON structure — no markdown, no code blocks, just raw JSON:
{
  "summary": "2-4 paragraph executive summary of the meeting",
  "actionItems": [
    {
      "task": "Clear description of what needs to be done",
      "owner": "Name or 'Unassigned' if not specified",
      "deadline": "Date/timeframe or 'No deadline set'",
      "priority": "high|medium|low"
    }
  ],
  "decisions": [
    {
      "decision": "What was decided",
      "rationale": "Why this decision was made (brief)",
      "madeBy": "Who decided or 'Group decision'"
    }
  ],
  "participants": ["Name1", "Name2"],
  "meetingType": "e.g. Sprint Planning, Client Review, Team Standup, etc.",
  "keyTopics": ["topic1", "topic2", "topic3"]
}`;

// For structured transcripts (uploaded files, paste, audio)
const TRANSCRIPT_PROMPT = `You are an expert meeting analyst. Analyze the provided meeting transcript and extract structured information.

You MUST respond with valid JSON only.${JSON_SCHEMA}`;

// For raw, chaotic free-form notes written during a meeting
const FREE_NOTES_PROMPT = `You are an expert meeting assistant. The user has provided raw, unstructured notes taken during a meeting. These may be bullet points, fragments, abbreviations, shorthand, or stream-of-consciousness text — not a clean transcript.

Your job is to interpret these notes intelligently and reconstruct the meeting structure:
- Infer who was likely present from any names, roles, or initials mentioned
- Identify tasks and who they likely belong to, even if not explicitly assigned
- Detect decisions even if written as "→ do X" or "agreed: Y"
- Infer priorities from urgency language ("ASAP", "urgent", "when we have time", "low prio", etc.)
- Write the summary in polished, professional prose — not a reflection of the note style
- If something is ambiguous, make a reasonable inference rather than leaving it empty

You MUST respond with valid JSON only.${JSON_SCHEMA}`;

export default defineEventHandler(async (event: H3Event) => {
    const config = useRuntimeConfig();
    const body = await readBody(event);
    const { text, provider, inputType } = body;
    const SYSTEM_PROMPT = inputType === 'free-notes' ? FREE_NOTES_PROMPT : TRANSCRIPT_PROMPT;

    if (!text || text.trim().length < 10) {
        throw createError({ statusCode: 400, message: 'Text is too short.' });
    }

    if (!['anthropic', 'openai', 'gemini'].includes(provider)) {
        throw createError({ statusCode: 400, message: 'Invalid provider.' });
    }

    // Set SSE headers for streaming
    setResponseHeaders(event, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
    });

    const stream = event.node.res;
    const userMessage =
        inputType === 'free-notes'
            ? `Please structure these raw meeting notes:\n\n${text}`
            : `Please analyze this meeting transcript:\n\n${text}`;

    try {
        // ─── Anthropic Claude ────────────────────────────────────────────────────
        if (provider === 'anthropic') {
            if (!config.anthropicApiKey) {
                throw new Error('Anthropic API key is not configured.');
            }

            const client = new Anthropic({ apiKey: config.anthropicApiKey as string });
            let fullText = '';

            const response = await client.messages.create({
                model: 'claude-3-5-haiku-20241022',
                max_tokens: 2048,
                system: SYSTEM_PROMPT,
                messages: [{ role: 'user', content: userMessage }],
                stream: true,
            });

            for await (const chunk of response) {
                if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
                    fullText += chunk.delta.text;
                    stream.write(`data: ${JSON.stringify({ chunk: chunk.delta.text })}\n\n`);
                }

                if (chunk.type === 'message_stop') {
                    stream.write(`data: ${JSON.stringify({ done: true, full: fullText })}\n\n`);
                }
            }

            // ─── OpenAI GPT ──────────────────────────────────────────────────────────
        } else if (provider === 'openai') {
            if (!config.openaiApiKey) {
                throw new Error('OpenAI API key is not configured.');
            }

            const client = new OpenAI({ apiKey: config.openaiApiKey as string });
            let fullText = '';

            const response = await client.chat.completions.create({
                model: 'gpt-4o-mini',
                max_tokens: 2048,
                messages: [
                    { role: 'system', content: SYSTEM_PROMPT },
                    { role: 'user', content: userMessage },
                ],
                stream: true,
            });

            for await (const chunk of response) {
                const delta = chunk.choices[0]?.delta?.content || '';

                if (delta) {
                    fullText += delta;
                    stream.write(`data: ${JSON.stringify({ chunk: delta })}\n\n`);
                }

                if (chunk.choices[0]?.finish_reason === 'stop') {
                    stream.write(`data: ${JSON.stringify({ done: true, full: fullText })}\n\n`);
                }
            }

            // ─── Google Gemini ────────────────────────────────────────────────────────
        } else if (provider === 'gemini') {
            if (!config.geminiApiKey) {
                throw new Error('Gemini API key is not configured.');
            }

            const genAI = new GoogleGenerativeAI(config.geminiApiKey as string);
            const model = genAI.getGenerativeModel({
                model: 'gemini-2.5-flash',
                systemInstruction: SYSTEM_PROMPT,
            });

            let fullText = '';

            const result = await model.generateContentStream(userMessage);

            for await (const chunk of result.stream) {
                const text = chunk.text();

                if (text) {
                    fullText += text;
                    stream.write(`data: ${JSON.stringify({ chunk: text })}\n\n`);
                }
            }

            stream.write(`data: ${JSON.stringify({ done: true, full: fullText })}\n\n`);
        }
    } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';

        stream.write(`data: ${JSON.stringify({ error: errorMessage })}\n\n`);
    } finally {
        stream.end();
    }
});
