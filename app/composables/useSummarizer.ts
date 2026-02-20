// Types for the structured meeting analysis response
export type TProvider = 'anthropic' | 'openai' | 'gemini';
export type TInputType = 'transcript' | 'free-notes';
export type TPriority = 'high' | 'medium' | 'low';

export interface IActionItem {
    task: string;
    owner: string;
    deadline: string;
    priority: TPriority;
}

export interface IDecision {
    decision: string;
    rationale: string;
    madeBy: string;
}

export interface IMeetingSummary {
    summary: string;
    actionItems: IActionItem[];
    decisions: IDecision[];
    participants: string[];
    meetingType: string;
    keyTopics: string[];
}

export function useSummarizer() {
    const result = ref<IMeetingSummary | null>(null);
    const loading = ref(false);
    const error = ref<string | null>(null);
    const rawStream = ref('');
    const progress = ref(0);

    async function summarize(text: string, provider: TProvider, inputType: TInputType = 'transcript') {
        loading.value = true;
        error.value = null;
        result.value = null;
        rawStream.value = '';
        progress.value = 0;

        try {
            const response = await fetch('/api/summarize', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text, provider, inputType }),
            });

            if (!response.ok) {
                const err = await response.json();

                throw new Error(err.message || 'Request failed.');
            }

            const reader = response.body!.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();

                if (done) {
                    break;
                }

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n\n');

                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (!line.startsWith('data: ')) {
                        continue;
                    }

                    try {
                        const data = JSON.parse(line.slice(6));

                        if (data.error) {
                            throw new Error(data.error);
                        }

                        if (data.chunk) {
                            rawStream.value += data.chunk;
                            // Rough progress estimate based on accumulated characters
                            progress.value = Math.min(90, Math.floor(rawStream.value.length / 20));
                        }

                        if (data.done && data.full) {
                            progress.value = 100;
                            // Strip potential markdown code fences before parsing
                            const cleaned = data.full
                                .replace(/```json\n?/g, '')
                                .replace(/```\n?/g, '')
                                .trim();

                            result.value = JSON.parse(cleaned) as IMeetingSummary;
                        }
                    } catch (parseErr: unknown) {
                        // Ignore partial JSON chunks mid-stream
                        if (parseErr instanceof Error && !parseErr.message.includes('JSON')) {
                            throw parseErr;
                        }
                    }
                }
            }
        } catch (err: unknown) {
            error.value = (err as Error)?.message || 'Something went wrong.';
        } finally {
            loading.value = false;
        }
    }

    function reset() {
        result.value = null;
        error.value = null;
        rawStream.value = '';
        progress.value = 0;
    }

    return { summarize, result, loading, error, rawStream, progress, reset };
}
