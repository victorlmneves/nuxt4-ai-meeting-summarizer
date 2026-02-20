import type { TProvider, IMeetingSummary } from './useSummarizer';

export interface IHistoryEntry {
    id: string;
    date: string; // ISO string
    meetingType: string;
    provider: TProvider;
    charCount: number;
    summary: IMeetingSummary;
    transcript: string;
    mode: 'single' | 'compare';
}

const HISTORY_KEY = 'minutai:history';

export const MAX_HISTORY = 20;

export function useHistory() {
    const history = ref<IHistoryEntry[]>([]);

    function load() {
        try {
            const raw = localStorage.getItem(HISTORY_KEY);

            history.value = raw ? JSON.parse(raw) : [];
        } catch {
            history.value = [];
        }
    }

    function persist() {
        try {
            localStorage.setItem(HISTORY_KEY, JSON.stringify(history.value));
        } catch(err) {
            /* quota exceeded */
            console.warn('Local storage quota exceeded. History not saved.', err);
        }
    }

    function add(summary: IMeetingSummary, transcript: string, provider: TProvider, mode: 'single' | 'compare' = 'single'): string {
        const entry: IHistoryEntry = {
            id: Date.now().toString(),
            date: new Date().toISOString(),
            meetingType: summary.meetingType,
            provider,
            charCount: transcript.length,
            summary,
            transcript,
            mode,
        };

        history.value.unshift(entry);

        if (history.value.length > MAX_HISTORY) {
            history.value = history.value.slice(0, MAX_HISTORY);
        }

        persist();

        return entry.id;
    }

    function remove(id: string) {
        history.value = history.value.filter((e: IHistoryEntry) => e.id !== id);
        persist();
    }

    function clear() {
        history.value = [];
        localStorage.removeItem(HISTORY_KEY);
    }

    function formatDate(iso: string) {
        return new Date(iso).toLocaleDateString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    }

    return { history, load, add, remove, clear, formatDate };
}
