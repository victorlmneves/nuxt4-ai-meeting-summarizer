import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { defineEventHandler, readBody, createError, type H3Event } from 'h3';
import type { TProvider } from '~/types';

const SYSTEM_PROMPT = `You are an expert meeting analyst. Analyze the provided meeting transcript and extract structured information.

You MUST respond with valid JSON only. No markdown, no code blocks, just raw JSON.

Return this exact structure:
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

// Call a single provider and return the full JSON string
async function callProvider(provider: TProvider, text: string, config: { anthropicApiKey?: string; openaiApiKey?: string; geminiApiKey?: string }): Promise<string> {
    const userMessage = `Please analyze this meeting transcript:\n\n${text}`;

    if (provider === 'anthropic') {
        if (!config.anthropicApiKey) {
            throw new Error('Anthropic API key not configured.');
        }

        const client = new Anthropic({ apiKey: config.anthropicApiKey });
        const response = await client.messages.create({
            model: 'claude-3-5-haiku-20241022',
            max_tokens: 2048,
            system: SYSTEM_PROMPT,
            messages: [{ role: 'user', content: userMessage }],
        });

        const textContent = response.content.find((block) => block.type === 'text');

        if (!textContent || textContent.type !== 'text') {
            throw new Error('No text content in Anthropic response.');
        }

        return textContent.text;
    } else if (provider === 'openai') {
        if (!config.openaiApiKey) {
            throw new Error('OpenAI API key not configured.');
        }

        const client = new OpenAI({ apiKey: config.openaiApiKey });
        const response = await client.chat.completions.create({
            model: 'gpt-4o-mini',
            max_tokens: 2048,
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: userMessage },
            ],
        });

        if (!response.choices[0]) {
            throw new Error('No choices in OpenAI response.');
        }

        return response.choices[0].message.content ?? '';
    } else if (provider === 'gemini') {
        if (!config.geminiApiKey) {
            throw new Error('Gemini API key not configured.');
        }

        const genAI = new GoogleGenerativeAI(config.geminiApiKey);
        const model = genAI.getGenerativeModel({
            model: 'gemini-2.5-flash',
            systemInstruction: SYSTEM_PROMPT,
        });
        const result = await model.generateContent(userMessage);

        return result.response.text();
    } else {
        throw new Error(`Unknown provider: ${provider}`);
    }
}

function parseResult(raw: string) {
    const cleaned = raw
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();

    return JSON.parse(cleaned);
}

export default defineEventHandler(async (event: H3Event) => {
    const config = useRuntimeConfig();
    const body = await readBody(event);
    const { text, providers } = body;

    if (!text || text.trim().length < 10) {
        throw createError({ statusCode: 400, message: 'Transcript is too short.' });
    }

    if (!Array.isArray(providers) || providers.length !== 2) {
        throw createError({ statusCode: 400, message: 'Exactly 2 providers required.' });
    }

    // Call both providers in parallel
    const [resultA, resultB] = await Promise.allSettled([
        callProvider(providers[0], text, config),
        callProvider(providers[1], text, config),
    ]);

    const parseSettled = (settled: PromiseSettledResult<string>) => {
        if (settled.status === 'rejected') {
            return { error: settled.reason?.message ?? 'Failed' };
        }

        try {
            return parseResult(settled.value);
        } catch {
            return { error: 'Failed to parse response as JSON.' };
        }
    };

    return {
        a: { provider: providers[0], result: parseSettled(resultA) },
        b: { provider: providers[1], result: parseSettled(resultB) },
    };
});
