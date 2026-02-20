import type { IHistoryEntry, IHistoryPage, IMeetingSummary } from '~/types/index';

// Re-export so existing imports from this composable keep working
export type { IHistoryEntry } from '~/types/index';

const LEGACY_KEY = 'minutai:history';

export function useHistory() {
    const history = ref<IHistoryEntry[]>([]);
    const total = ref(0);
    const page = ref(1);
    const limit = ref(20);
    const loading = ref(false);
    const error = ref<string | null>(null);

    // ── Fetch ─────────────────────────────────────────────────────────────────
    async function load(p = 1) {
        loading.value = true;
        error.value = null;

        try {
            const data = await $fetch<IHistoryPage>('/api/history', { query: { page: p, limit: limit.value } });

            history.value = data.data;
            total.value = data.total;
            page.value = data.page;
        } catch (err: unknown) {
            error.value = (err as Error)?.message ?? 'Failed to load history.';
        } finally {
            loading.value = false;
        }
    }

    async function loadMore() {
        if (history.value.length >= total.value) {
            return;
        }

        loading.value = true;

        try {
            const nextPage = page.value + 1;
            const data = await $fetch<IHistoryPage>('/api/history', {
                query: {
                    page: nextPage,
                    limit: limit.value
                }
            });

            history.value = [...history.value, ...data.data];
            total.value = data.total;
            page.value = data.page;
        } catch (err: unknown) {
            error.value = (err as Error)?.message ?? 'Failed to load more history.';
        } finally {
            loading.value = false;
        }
    }

    // ── Mutations ─────────────────────────────────────────────────────────────
    async function add(
        summary: IMeetingSummary,
        transcript: string,
        provider: IHistoryEntry['provider'],
        mode: 'single' | 'compare' = 'single'
    ): Promise<string> {
        const entry: IHistoryEntry = await $fetch('/api/history', {
            method: 'POST',
            body: { summary, transcript, provider, mode },
        });

        history.value.unshift(entry);
        total.value++;

        return entry.id;
    }

    async function update(id: string, summary: IMeetingSummary) {
        await $fetch(`/api/history/${id}`, {
            method: 'PATCH',
            body: { summary },
        });

        const idx = history.value.findIndex((e) => e.id === id);

        if (idx !== -1) {
            history.value[idx] = {
                ...history.value[idx],
                summary,
                meetingType: summary.meetingType,
            } as IHistoryEntry;
        }
    }

    async function remove(id: string) {
        await $fetch(`/api/history/${id}`, { method: 'DELETE' });
        history.value = history.value.filter((e) => e.id !== id);
        total.value = Math.max(0, total.value - 1);
    }

    async function clear() {
        const ids = history.value.map((e) => e.id);

        await Promise.all(ids.map((id) => $fetch(`/api/history/${id}`, { method: 'DELETE' })));
        history.value = [];
        total.value = 0;
    }

    // ── One-time localStorage migration ───────────────────────────────────────
    // Runs on first load if legacy data exists in localStorage.
    // Removes the localStorage key after a successful migration.
    async function migrateFromLocalStorage() {
        if (typeof localStorage === 'undefined') {
            return;
        }

        const raw = localStorage.getItem(LEGACY_KEY);

        if (!raw) {
            return;
        }

        try {
            const entries: IHistoryEntry[] = JSON.parse(raw);

            if (!entries.length) {
                localStorage.removeItem(LEGACY_KEY);

                return;
            }

            await $fetch('/api/history/bulk', {
                method: 'POST',
                body: { entries },
            });

            localStorage.removeItem(LEGACY_KEY);
            await load(1);

            // eslint-disable-next-line no-console
            console.info('[useHistory] Migrated', entries.length, 'entries from localStorage.');
        } catch (err) {
            console.warn('[useHistory] localStorage migration failed:', err);
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────
    function formatDate(iso: string) {
        return new Date(iso).toLocaleDateString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    }

    const hasMore = computed(() => history.value.length < total.value);

    return {
        history,
        total,
        page,
        limit,
        loading,
        error,
        hasMore,
        load,
        loadMore,
        add,
        update,
        remove,
        clear,
        migrateFromLocalStorage,
        formatDate,
    };
}
