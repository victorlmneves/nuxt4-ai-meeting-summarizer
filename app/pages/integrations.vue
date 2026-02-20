<script setup lang="ts">
interface IJiraConfig {
    enabled: boolean;
    baseUrl: string; // e.g. https://mycompany.atlassian.net
    email: string;
    apiToken: string;
    projectKey: string; // e.g. ENG
}

interface ILinearConfig {
    enabled: boolean;
    apiKey: string;
    teamId: string;
}

interface INotionConfig {
    enabled: boolean;
    integrationToken: string;
    databaseId: string;
}

interface IAzureConfig {
    enabled: boolean;
    organization: string; // e.g. mycompany
    project: string; // e.g. MyProject
    pat: string; // Personal Access Token
    workItemType: string; // Task | Bug | User Story
}

interface IIntegrationsConfig {
    jira: IJiraConfig;
    linear: ILinearConfig;
    notion: INotionConfig;
    azure: IAzureConfig;
}

const STORAGE_KEY = 'minutai:integrations';

const defaults: IIntegrationsConfig = {
    jira: { enabled: false, baseUrl: '', email: '', apiToken: '', projectKey: '' },
    linear: { enabled: false, apiKey: '', teamId: '' },
    notion: { enabled: false, integrationToken: '', databaseId: '' },
    azure: { enabled: false, organization: '', project: '', pat: '', workItemType: 'Task' },
};

const config = ref<IIntegrationsConfig>(JSON.parse(JSON.stringify(defaults)));
const saved = ref(false);

onMounted(() => {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);

        if (raw) config.value = { ...defaults, ...JSON.parse(raw) };
    } catch {
        /* ignore */
    }
});

function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config.value));
    saved.value = true;
    setTimeout(() => {
        saved.value = false;
    }, 2500);
}

function reset() {
    config.value = JSON.parse(JSON.stringify(defaults));
    localStorage.removeItem(STORAGE_KEY);
}

// Show/hide secret fields
const visible = ref({ jira: false, linear: false, notion: false, azure: false });

// Count enabled integrations
const enabledCount = computed(
    () => [config.value.jira, config.value.linear, config.value.notion, config.value.azure].filter((c) => c.enabled).length
);
</script>

<template>
    <div class="app">
        <!-- ── Header ─────────────────────────────────────────────── -->
        <header class="header">
            <div class="header-inner">
                <NuxtLink to="/" class="logo">
                    <span class="logo-icon">◈</span>
                    <span class="logo-text">MinutAI</span>
                    <span class="logo-tag">meeting intelligence</span>
                </NuxtLink>
                <nav class="nav">
                    <NuxtLink to="/" class="nav-link">← Analyze</NuxtLink>
                    <NuxtLink to="/dashboard" class="nav-link">Dashboard</NuxtLink>
                    <span class="nav-active">Integrations</span>
                </nav>
            </div>
        </header>

        <!-- ── Main ───────────────────────────────────────────────── -->
        <main class="main">
            <div class="page-header">
                <div>
                    <h1 class="title">Integrations</h1>
                    <p class="subtitle">Send action items directly to your project management tools</p>
                </div>
                <div class="page-actions">
                    <span v-if="enabledCount" class="enabled-badge">{{ enabledCount }} active</span>
                    <button class="save-btn" @click="save">
                        {{ saved ? '✓ Saved!' : 'Save settings' }}
                    </button>
                </div>
            </div>

            <div class="security-notice">
                <span class="security-icon">🔒</span>
                <div>
                    <strong>Your credentials stay in your browser.</strong>
                    API tokens and keys are stored only in your browser's localStorage — they are never sent to any MinutAI server. Requests
                    to external APIs are proxied through your local Nuxt server only when you click "Send to…".
                </div>
            </div>

            <!-- ── Jira ─────────────────────────────────────────────── -->
            <div class="integration-card" :class="{ active: config.jira.enabled }">
                <div class="int-header">
                    <div class="int-identity">
                        <span class="int-logo jira-logo">J</span>
                        <div>
                            <h2 class="int-name">Jira</h2>
                            <p class="int-desc">Atlassian Jira Software — create Tasks in any project</p>
                        </div>
                    </div>
                    <label class="toggle">
                        <input v-model="config.jira.enabled" type="checkbox" />
                        <span class="toggle-track"><span class="toggle-thumb" /></span>
                    </label>
                </div>

                <Transition name="expand">
                    <div v-if="config.jira.enabled" class="int-fields">
                        <div class="field-row">
                            <div class="field">
                                <label class="field-label">
                                    Base URL
                                    <span class="field-hint">your Atlassian domain</span>
                                </label>
                                <input v-model="config.jira.baseUrl" class="field-input" placeholder="https://yourcompany.atlassian.net" />
                            </div>
                            <div class="field">
                                <label class="field-label">Project Key</label>
                                <input v-model="config.jira.projectKey" class="field-input field-short" placeholder="ENG" />
                            </div>
                        </div>
                        <div class="field-row">
                            <div class="field">
                                <label class="field-label">Account email</label>
                                <input v-model="config.jira.email" class="field-input" type="email" placeholder="you@company.com" />
                            </div>
                            <div class="field">
                                <label class="field-label">
                                    API token
                                    <a
                                        href="https://id.atlassian.com/manage-profile/security/api-tokens"
                                        target="_blank"
                                        class="field-link"
                                    >
                                        Create token ↗
                                    </a>
                                </label>
                                <div class="secret-wrap">
                                    <input
                                        v-model="config.jira.apiToken"
                                        class="field-input"
                                        :type="visible.jira ? 'text' : 'password'"
                                        placeholder="ATATT3x…"
                                    />
                                    <button class="show-btn" @click="visible.jira = !visible.jira">
                                        {{ visible.jira ? 'Hide' : 'Show' }}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </Transition>
            </div>

            <!-- ── Azure Boards ─────────────────────────────────────── -->
            <div class="integration-card" :class="{ active: config.azure.enabled }">
                <div class="int-header">
                    <div class="int-identity">
                        <span class="int-logo azure-logo">Az</span>
                        <div>
                            <h2 class="int-name">Azure Boards</h2>
                            <p class="int-desc">Microsoft Azure DevOps — create Work Items in any project</p>
                        </div>
                    </div>
                    <label class="toggle">
                        <input v-model="config.azure.enabled" type="checkbox" />
                        <span class="toggle-track"><span class="toggle-thumb" /></span>
                    </label>
                </div>

                <Transition name="expand">
                    <div v-if="config.azure.enabled" class="int-fields">
                        <div class="field-row">
                            <div class="field">
                                <label class="field-label">
                                    Organization
                                    <span class="field-hint">from dev.azure.com/your-org</span>
                                </label>
                                <input v-model="config.azure.organization" class="field-input" placeholder="mycompany" />
                            </div>
                            <div class="field">
                                <label class="field-label">Project</label>
                                <input v-model="config.azure.project" class="field-input" placeholder="MyProject" />
                            </div>
                        </div>
                        <div class="field-row">
                            <div class="field">
                                <label class="field-label">Work item type</label>
                                <select v-model="config.azure.workItemType" class="field-input field-select">
                                    <option>Task</option>
                                    <option>Bug</option>
                                    <option>User Story</option>
                                    <option>Issue</option>
                                </select>
                            </div>
                            <div class="field">
                                <label class="field-label">
                                    Personal Access Token (PAT)
                                    <a href="https://dev.azure.com" target="_blank" class="field-link">Create PAT ↗</a>
                                </label>
                                <div class="secret-wrap">
                                    <input
                                        v-model="config.azure.pat"
                                        class="field-input"
                                        :type="visible.azure ? 'text' : 'password'"
                                        placeholder="PAT token…"
                                    />
                                    <button class="show-btn" @click="visible.azure = !visible.azure">
                                        {{ visible.azure ? 'Hide' : 'Show' }}
                                    </button>
                                </div>
                            </div>
                        </div>
                        <div class="field-help">
                            In Azure DevOps, go to
                            <strong>User Settings → Personal Access Tokens</strong>
                            and create a token with
                            <strong>Work Items (Read & Write)</strong>
                            scope.
                        </div>
                    </div>
                </Transition>
            </div>

            <!-- ── Linear ───────────────────────────────────────────── -->
            <div class="integration-card" :class="{ active: config.linear.enabled }">
                <div class="int-header">
                    <div class="int-identity">
                        <span class="int-logo linear-logo">L</span>
                        <div>
                            <h2 class="int-name">Linear</h2>
                            <p class="int-desc">Create issues in any Linear team</p>
                        </div>
                    </div>
                    <label class="toggle">
                        <input v-model="config.linear.enabled" type="checkbox" />
                        <span class="toggle-track"><span class="toggle-thumb" /></span>
                    </label>
                </div>

                <Transition name="expand">
                    <div v-if="config.linear.enabled" class="int-fields">
                        <div class="field-row">
                            <div class="field">
                                <label class="field-label">
                                    API Key
                                    <a href="https://linear.app/settings/api" target="_blank" class="field-link">Create key ↗</a>
                                </label>
                                <div class="secret-wrap">
                                    <input
                                        v-model="config.linear.apiKey"
                                        class="field-input"
                                        :type="visible.linear ? 'text' : 'password'"
                                        placeholder="lin_api_…"
                                    />
                                    <button class="show-btn" @click="visible.linear = !visible.linear">
                                        {{ visible.linear ? 'Hide' : 'Show' }}
                                    </button>
                                </div>
                            </div>
                            <div class="field">
                                <label class="field-label">
                                    Team ID
                                    <span class="field-hint">Settings → Team → Copy ID</span>
                                </label>
                                <input v-model="config.linear.teamId" class="field-input" placeholder="xxxxxxxx-xxxx-…" />
                            </div>
                        </div>
                    </div>
                </Transition>
            </div>

            <!-- ── Notion ───────────────────────────────────────────── -->
            <div class="integration-card" :class="{ active: config.notion.enabled }">
                <div class="int-header">
                    <div class="int-identity">
                        <span class="int-logo notion-logo">N</span>
                        <div>
                            <h2 class="int-name">Notion</h2>
                            <p class="int-desc">Create pages in a Notion database</p>
                        </div>
                    </div>
                    <label class="toggle">
                        <input v-model="config.notion.enabled" type="checkbox" />
                        <span class="toggle-track"><span class="toggle-thumb" /></span>
                    </label>
                </div>

                <Transition name="expand">
                    <div v-if="config.notion.enabled" class="int-fields">
                        <div class="field-row">
                            <div class="field">
                                <label class="field-label">
                                    Integration token
                                    <a href="https://www.notion.so/my-integrations" target="_blank" class="field-link">
                                        Create integration ↗
                                    </a>
                                </label>
                                <div class="secret-wrap">
                                    <input
                                        v-model="config.notion.integrationToken"
                                        class="field-input"
                                        :type="visible.notion ? 'text' : 'password'"
                                        placeholder="secret_…"
                                    />
                                    <button class="show-btn" @click="visible.notion = !visible.notion">
                                        {{ visible.notion ? 'Hide' : 'Show' }}
                                    </button>
                                </div>
                            </div>
                            <div class="field">
                                <label class="field-label">
                                    Database ID
                                    <span class="field-hint">from the database URL</span>
                                </label>
                                <input
                                    v-model="config.notion.databaseId"
                                    class="field-input"
                                    placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                                />
                            </div>
                        </div>
                        <div class="field-help">
                            Open your database in Notion → click
                            <strong>Share</strong>
                            → add your integration. The database ID is the 32-character string in the URL before the
                            <code>?</code>
                            .
                        </div>
                    </div>
                </Transition>
            </div>

            <!-- Bottom save -->
            <div class="bottom-actions">
                <button class="text-btn" @click="reset">Reset all</button>
                <button class="save-btn large" @click="save">
                    {{ saved ? '✓ Saved!' : 'Save settings' }}
                </button>
            </div>
        </main>

        <!-- ── Footer ─────────────────────────────────────────────── -->
        <footer class="footer">
            <span>MinutAI · Portfolio demo · Nuxt 4 + AI APIs</span>
        </footer>
    </div>
</template>

<style scoped>
.app {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
}

/* ── Header ──────────────────────────────────────────────────── */
.header {
    border-bottom: 1px solid var(--border);
    backdrop-filter: blur(12px);
    position: sticky;
    top: 0;
    z-index: 100;
    background: rgb(10 10 15 / 85%);
}

.header-inner {
    max-width: 860px;
    margin: 0 auto;
    padding: 16px 24px;
    display: flex;
    align-items: center;
    justify-content: space-between;
}

.logo {
    display: flex;
    align-items: center;
    gap: 10px;
    text-decoration: none;
    color: var(--text);
}

.logo-icon {
    color: var(--accent);
    font-size: 20px;
}

.logo-text {
    font-size: 18px;
    font-weight: 800;
    letter-spacing: -0.5px;
}

.logo-tag {
    font-family: 'DM Mono', monospace;
    font-size: 10px;
    color: var(--text-muted);
    border: 1px solid var(--border-bright);
    padding: 2px 7px;
    border-radius: 20px;
}

.nav {
    display: flex;
    align-items: center;
    gap: 16px;
}

.nav-link {
    font-family: Syne, sans-serif;
    font-size: 13px;
    font-weight: 600;
    color: var(--text-muted);
    text-decoration: none;
    transition: color 0.2s;
}

.nav-link:hover {
    color: var(--text);
}

.nav-active {
    font-family: Syne, sans-serif;
    font-size: 13px;
    font-weight: 700;
    color: var(--accent);
}

/* ── Main ────────────────────────────────────────────────────── */
.main {
    flex: 1;
    max-width: 860px;
    margin: 0 auto;
    padding: 48px 24px;
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 20px;
}

.page-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
}

.title {
    font-size: 32px;
    font-weight: 800;
    letter-spacing: -1px;
    margin-bottom: 4px;
}

.subtitle {
    font-size: 14px;
    color: var(--text-muted);
    font-family: 'DM Mono', monospace;
}

.page-actions {
    display: flex;
    align-items: center;
    gap: 10px;
}

.enabled-badge {
    font-family: 'DM Mono', monospace;
    font-size: 11px;
    color: var(--green);
    background: rgb(61 255 160 / 8%);
    border: 1px solid rgb(61 255 160 / 20%);
    padding: 3px 10px;
    border-radius: 20px;
}

/* Security notice */
.security-notice {
    display: flex;
    gap: 12px;
    align-items: flex-start;
    background: rgb(91 196 255 / 5%);
    border: 1px solid rgb(91 196 255 / 15%);
    border-radius: 10px;
    padding: 14px 16px;
    font-size: 13px;
    color: var(--text-muted);
    line-height: 1.6;
}

.security-icon {
    font-size: 18px;
    flex-shrink: 0;
    margin-top: 1px;
}

.security-notice strong {
    color: var(--text);
}

/* Integration card */
.integration-card {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 14px;
    overflow: hidden;
    transition: border-color 0.2s;
}

.integration-card.active {
    border-color: var(--accent-soft);
}

.int-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 20px 24px;
}

.int-identity {
    display: flex;
    align-items: center;
    gap: 14px;
}

/* Logo badges */
.int-logo {
    width: 40px;
    height: 40px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 800;
    font-size: 14px;
    flex-shrink: 0;
}

.jira-logo {
    background: rgb(38 132 255 / 15%);
    color: #2684ff;
    border: 1px solid rgb(38 132 255 / 25%);
}

.azure-logo {
    background: rgb(0 120 212 / 15%);
    color: #0078d4;
    border: 1px solid rgb(0 120 212 / 25%);
    font-size: 12px;
}

.linear-logo {
    background: rgb(91 100 240 / 15%);
    color: #5b64f0;
    border: 1px solid rgb(91 100 240 / 25%);
}

.notion-logo {
    background: rgb(255 255 255 / 8%);
    color: var(--text);
    border: 1px solid var(--border-bright);
}

.int-name {
    font-size: 15px;
    font-weight: 700;
    margin-bottom: 2px;
}

.int-desc {
    font-size: 12px;
    color: var(--text-muted);
}

/* Toggle switch */
.toggle {
    position: relative;
    display: inline-flex;
    cursor: pointer;
}

.toggle input {
    opacity: 0;
    width: 0;
    height: 0;
    position: absolute;
}

.toggle-track {
    width: 44px;
    height: 24px;
    background: var(--bg-hover);
    border: 1px solid var(--border-bright);
    border-radius: 12px;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    padding: 2px;
}

.toggle input:checked ~ .toggle-track {
    background: var(--accent-soft);
    border-color: var(--accent);
}

.toggle-thumb {
    width: 18px;
    height: 18px;
    background: var(--text-muted);
    border-radius: 50%;
    transition: all 0.2s;
}

.toggle input:checked ~ .toggle-track .toggle-thumb {
    background: white;
    transform: translateX(20px);
}

/* Integration fields */
.int-fields {
    padding: 0 24px 24px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    border-top: 1px solid var(--border);
    padding-top: 20px;
}

.field-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
}

@media (width <= 600px) {
    .field-row {
        grid-template-columns: 1fr;
    }
}

.field {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.field-label {
    font-family: 'DM Mono', monospace;
    font-size: 11px;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
}

.field-hint {
    font-size: 10px;
    color: var(--text-dim);
    text-transform: none;
    letter-spacing: 0;
}

.field-link {
    color: var(--accent);
    text-decoration: none;
    font-size: 10px;
    text-transform: none;
    letter-spacing: 0;
}

.field-link:hover {
    text-decoration: underline;
}

.field-input {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 8px;
    color: var(--text);
    font-family: 'DM Mono', monospace;
    font-size: 12px;
    padding: 9px 12px;
    outline: none;
    transition: border-color 0.2s;
    width: 100%;
}

.field-input:focus {
    border-color: var(--accent);
}

.field-input::placeholder {
    color: var(--text-dim);
}

.field-select {
    cursor: pointer;
}

.field-short {
    max-width: 120px;
}

.secret-wrap {
    display: flex;
    gap: 6px;
}

.secret-wrap .field-input {
    flex: 1;
}

.show-btn {
    background: var(--bg-hover);
    border: 1px solid var(--border-bright);
    color: var(--text-muted);
    padding: 0 12px;
    border-radius: 8px;
    font-family: 'DM Mono', monospace;
    font-size: 11px;
    cursor: pointer;
    transition: all 0.2s;
    white-space: nowrap;
    flex-shrink: 0;
}

.show-btn:hover {
    color: var(--text);
}

.field-help {
    font-size: 12px;
    color: var(--text-muted);
    line-height: 1.6;
    background: var(--bg-hover);
    border-radius: 8px;
    padding: 10px 14px;
}

.field-help strong {
    color: var(--text);
}

.field-help code {
    font-family: 'DM Mono', monospace;
    background: var(--bg);
    padding: 1px 5px;
    border-radius: 4px;
}

/* Buttons */
.save-btn {
    background: var(--accent);
    border: none;
    color: white;
    padding: 10px 20px;
    border-radius: 8px;
    cursor: pointer;
    font-family: Syne, sans-serif;
    font-size: 13px;
    font-weight: 700;
    transition: all 0.2s;
}

.save-btn:hover {
    background: #9180ff;
}

.save-btn.large {
    padding: 12px 28px;
    font-size: 14px;
}

.text-btn {
    background: none;
    border: 1px solid var(--border-bright);
    color: var(--text-muted);
    padding: 10px 16px;
    border-radius: 8px;
    cursor: pointer;
    font-family: Syne, sans-serif;
    font-size: 13px;
    font-weight: 600;
    transition: all 0.2s;
}

.text-btn:hover {
    color: var(--red);
    border-color: var(--red);
}

.bottom-actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    align-items: center;
    padding-top: 8px;
}

/* ── Footer ──────────────────────────────────────────────────── */
.footer {
    border-top: 1px solid var(--border);
    text-align: center;
    padding: 20px;
    font-family: 'DM Mono', monospace;
    font-size: 11px;
    color: var(--text-dim);
    letter-spacing: 0.05em;
}

/* ── Transitions ─────────────────────────────────────────────── */
.expand-enter-active,
.expand-leave-active {
    transition: opacity 0.2s ease;
}

.expand-enter-from,
.expand-leave-to {
    opacity: 0;
}
</style>
