import type { TProvider, IMeetingSummary } from '~/types';

export interface ICompareResult {
    provider: TProvider;
    result: IMeetingSummary | { error: string };
}

export interface ICompareResponse {
    a: ICompareResult;
    b: ICompareResult;
}

export function useCompare() {
    const results = ref<ICompareResponse | null>(null);
    const loading = ref(false);
    const error = ref<string | null>(null);

    async function compare(text: string, providers: [TProvider, TProvider]) {
        loading.value = true;
        error.value = null;
        results.value = null;

        try {
            const response = await fetch('/api/compare', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text, providers }),
            });

            if (!response.ok) {
                const err = await response.json();

                throw new Error(err.message || 'Request failed.');
            }

            results.value = await response.json();
        } catch (err: unknown) {
            error.value = (err as Error).message || 'Something went wrong.';
        } finally {
            loading.value = false;
        }
    }

    function reset() {
        results.value = null;
        error.value = null;
    }

    // Helper: check if a result is an error
    function isError(r: IMeetingSummary | { error: string }): r is { error: string } {
        return 'error' in r;
    }

    return { compare, results, loading, error, reset, isError };
}
