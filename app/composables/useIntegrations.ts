import type { IMeetingSummary, IIntegrationsConfig } from '~/types';

export type TIntegrationId = 'jira' | 'linear' | 'notion' | 'azure';

export interface ISendResult {
    task: string;
    url: string | null;
    error: string | null;
}

export interface ISendStatus {
    loading: boolean;
    results: ISendResult[];
    error: string | null;
}

// Kept for fallback/legacy purposes during the transition period
const LEGACY_KEY = 'minutai:integrations';

export function useIntegrations() {
    // ── Read config from server (with localStorage fallback) ──────────────────
    const config = ref<Partial<IIntegrationsConfig> | null>(null);

    async function loadConfig() {
        try {
            const serverConfig = await $fetch<Partial<IIntegrationsConfig>>('/api/integrations/config');

            // If the server has no config yet, fall back to localStorage (migration path)
            if (!serverConfig || Object.keys(serverConfig).length === 0) {
                const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(LEGACY_KEY) : null;

                if (raw) {
                    const legacyConfig: Partial<IIntegrationsConfig> = JSON.parse(raw);

                    // Persist legacy config to server and clear localStorage
                    await $fetch('/api/integrations/config', {
                        method: 'PUT',
                        body: legacyConfig,
                    });

                    localStorage.removeItem(LEGACY_KEY);
                    config.value = legacyConfig;

                    return;
                }
            }

            config.value = serverConfig;
        } catch {
            // Graceful fallback to localStorage if server is unreachable
            try {
                const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(LEGACY_KEY) : null;

                config.value = raw ? JSON.parse(raw) : null;
            } catch {
                config.value = null;
            }
        }
    }

    async function saveConfig(newConfig: Partial<IIntegrationsConfig>) {
        config.value = newConfig;

        await $fetch('/api/integrations/config', {
            method: 'PUT',
            body: newConfig,
        });
    }

    // Which integrations are configured and enabled
    const enabledIntegrations = computed<TIntegrationId[]>(() => {
        if (!config.value) {
            return [];
        }

        const enabled: TIntegrationId[] = [];

        if (config.value.jira?.enabled && config.value.jira.baseUrl && config.value.jira.apiToken) {
            enabled.push('jira');
        }

        if (config.value.azure?.enabled && config.value.azure.organization && config.value.azure.pat) {
            enabled.push('azure');
        }

        if (config.value.linear?.enabled && config.value.linear.apiKey && config.value.linear.teamId) {
            enabled.push('linear');
        }

        if (config.value.notion?.enabled && config.value.notion.integrationToken && config.value.notion.databaseId) {
            enabled.push('notion');
        }

        return enabled;
    });

    const hasIntegrations = computed(() => enabledIntegrations.value.length > 0);

    // ── Send status per integration ────────────────────────────────────────────
    const status = ref<Record<TIntegrationId, ISendStatus>>({
        jira: { loading: false, results: [], error: null },
        linear: { loading: false, results: [], error: null },
        notion: { loading: false, results: [], error: null },
        azure: { loading: false, results: [], error: null },
    });

    function resetStatus(id: TIntegrationId) {
        status.value[id] = { loading: false, results: [], error: null };
    }

    // ── Send action items to a specific integration ─────────────────────────────
    async function sendTo(id: TIntegrationId, summary: IMeetingSummary) {
        if (!config.value) {
            return;
        }

        status.value[id] = { loading: true, results: [], error: null };

        try {
            let payload: Record<string, unknown> = {
                actionItems: summary.actionItems,
                meetingType: summary.meetingType,
            };

            if (id === 'jira') {
                payload = { ...payload, ...config.value.jira };
            } else if (id === 'azure') {
                payload = { ...payload, ...config.value.azure };
            } else if (id === 'linear') {
                payload = { ...payload, ...config.value.linear };
            } else if (id === 'notion') {
                payload = { ...payload, ...config.value.notion };
            }

            const res = await fetch(`/api/integrations/${id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            const data = await res.json();

            if (!res.ok) {
                status.value[id] = { loading: false, results: [], error: data.message ?? `HTTP ${res.status}` };
            } else {
                status.value[id] = { loading: false, results: data.results, error: null };
            }
        } catch (err: unknown) {
            status.value[id] = { loading: false, results: [], error: (err as Error).message };
        }
    }

    // ── Display metadata ───────────────────────────────────────────────────────
    const integrationMeta: Record<TIntegrationId, { label: string; logo: string; logoClass: string }> = {
        jira: { label: 'Jira', logo: 'J', logoClass: 'jira-logo' },
        azure: { label: 'Azure Boards', logo: 'Az', logoClass: 'azure-logo' },
        linear: { label: 'Linear', logo: 'L', logoClass: 'linear-logo' },
        notion: { label: 'Notion', logo: 'N', logoClass: 'notion-logo' },
    };

    onMounted(() => loadConfig());

    return {
        config,
        enabledIntegrations,
        hasIntegrations,
        status,
        sendTo,
        resetStatus,
        integrationMeta,
        loadConfig,
        saveConfig,
    };
}
