// ── AI / Summary types ────────────────────────────────────────────────────────

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

// ── History ───────────────────────────────────────────────────────────────────

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

export interface IHistoryPage {
    data: IHistoryEntry[];
    total: number;
    page: number;
    limit: number;
}

// ── Integration configs ───────────────────────────────────────────────────────

export interface IJiraConfig {
    enabled: boolean;
    baseUrl: string; // e.g. https://mycompany.atlassian.net
    email: string;
    apiToken: string;
    projectKey: string; // e.g. ENG
    issueType?: string; // e.g. Task, Bug, Story
}

export interface ILinearConfig {
    enabled: boolean;
    apiKey: string;
    teamId: string;
}

export interface INotionConfig {
    enabled: boolean;
    integrationToken: string;
    databaseId: string;
}

export interface IAzureConfig {
    enabled: boolean;
    organization: string; // e.g. mycompany
    project: string; // e.g. MyProject
    pat: string; // Personal Access Token
    workItemType: string; // Task | Bug | User Story
}

export interface IIntegrationsConfig {
    jira: IJiraConfig;
    linear: ILinearConfig;
    notion: INotionConfig;
    azure: IAzureConfig;
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export interface IUser {
    id: string;
    provider: string;
    providerAccountId: string;
    name: string | null;
    email: string | null;
    avatarUrl: string | null;
    createdAt: string;
}
