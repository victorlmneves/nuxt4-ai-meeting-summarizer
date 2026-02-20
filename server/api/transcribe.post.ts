import OpenAI from 'openai';
import { readMultipartFormData, defineEventHandler, createError, type H3Event } from 'h3';

interface IWhisperResponse {
    text: string;
    language?: string;
    duration?: number;
    segments?: Array<{
        start: number;
        end: number;
        text: string;
    }>;
}

// Whisper supports these formats (max 25MB per request)
const SUPPORTED_FORMATS = new Set(['mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'wav', 'webm', 'ogg']);
const MAX_SIZE_BYTES = 25 * 1024 * 1024; // 25MB

export default defineEventHandler(async (event: H3Event) => {
    const config = useRuntimeConfig();

    if (!config.openaiApiKey) {
        throw createError({ statusCode: 400, message: 'OpenAI API key is required for Whisper transcription.' });
    }

    // Parse multipart form data
    const formData = await readMultipartFormData(event);

    if (!formData || formData.length === 0) {
        throw createError({ statusCode: 400, message: 'No file received.' });
    }

    const filePart = formData.find((p) => p.name === 'file');

    if (!filePart || !filePart.data) {
        throw createError({ statusCode: 400, message: 'File field missing from form data.' });
    }

    // Validate file size
    if (filePart.data.length > MAX_SIZE_BYTES) {
        throw createError({
            statusCode: 400,
            message: `File too large. Maximum size is 25MB (received ${(filePart.data.length / 1024 / 1024).toFixed(1)}MB).`,
        });
    }

    // Validate file format
    const filename = filePart.filename ?? 'audio.mp3';
    const ext = filename.split('.').pop()?.toLowerCase() ?? '';

    if (!SUPPORTED_FORMATS.has(ext)) {
        throw createError({
            statusCode: 400,
            message: `Unsupported format ".${ext}". Supported: ${Array.from(SUPPORTED_FORMATS).join(', ')}.`,
        });
    }

    const client = new OpenAI({ apiKey: config.openaiApiKey });

    // Build a File object from the buffer — required by the OpenAI SDK
    const file = new File([new Uint8Array(filePart.data)], filename, {
        type: filePart.type ?? 'audio/mpeg',
    });

    const transcription = await client.audio.transcriptions.create({
        model: 'whisper-1',
        file,
        response_format: 'verbose_json', // includes segments with timestamps
        timestamp_granularities: ['segment'],
    });

    // Return both the full text and segments for richer display
    const response = transcription as IWhisperResponse;

    return {
        text: response.text,
        language: response.language ?? 'unknown',
        duration: response.duration ?? null,
        segments: (response.segments ?? []).map((s) => ({
            start: Math.round(s.start),
            end: Math.round(s.end),
            text: s.text.trim(),
        })),
    };
});
