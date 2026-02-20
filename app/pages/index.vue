<script setup lang="ts">
import type { TProvider, IMeetingSummary, TInputType } from '~/composables/useSummarizer';
import type { IHistoryEntry } from '~/types/index';

const { summarize, result, loading, error, progress, reset } = useSummarizer();
const { compare, results: compareResults, loading: compareLoading, error: compareError, reset: compareReset, isError } = useCompare();
const {
    transcribe,
    result: transcribeResult,
    loading: transcribeLoading,
    error: transcribeError,
    uploadProgress,
    reset: transcribeReset,
    formatTime,
} = useTranscribe();
const {
    enabledIntegrations,
    hasIntegrations,
    status: intStatus,
    sendTo,
    integrationMeta,
    loadConfig: loadIntegrations,
} = useIntegrations();
const { getLinks, openAllInCalendar, itemsWithDeadlines } = useCalendar();
const {
    history,
    total: historyTotal,
    loading: historyLoading,
    hasMore: historyHasMore,
    load: historyLoad,
    loadMore: historyLoadMore,
    add: historyAdd,
    update: historyUpdate,
    remove: historyRemove,
    clear: historyClear,
    migrateFromLocalStorage,
    formatDate,
} = useHistory();

// ── Mode ──────────────────────────────────────────────────────────────────────
const mode = ref<'single' | 'compare'>('single');

function switchMode(m: 'single' | 'compare') {
    mode.value = m;
    handleReset();
}

// ── State ─────────────────────────────────────────────────────────────────────
const transcriptText = ref('');
const submittedText = ref('');
const provider = ref<TProvider>('gemini');
const compareProviders = ref<[TProvider, TProvider]>(['anthropic', 'gemini']);
const inputMode = ref<'paste' | 'upload' | 'audio' | 'free-notes'>('paste');
const inputType = ref<TInputType>('transcript');

// Keep inputType in sync with inputMode
watch(inputMode, (mode: string) => {
    inputType.value = mode === 'free-notes' ? 'free-notes' : 'transcript';
});

const audioFile = ref<File | null>(null);
const transcribing = ref(false);
const transcribeStep = ref<'idle' | 'uploading' | 'done'>('idle');
const fileName = ref('');
const dragOver = ref(false);
const transcriptExpanded = ref(false);
const historyOpen = ref(false);

// ── Edit mode ─────────────────────────────────────────────────────────────────
const editing = ref(false);

// Deep-clone result into a mutable draft when edit mode starts
const draft = ref<IMeetingSummary | null>(null);

function startEditing() {
    draft.value = JSON.parse(JSON.stringify(result.value));
    editing.value = true;
}

function cancelEditing() {
    draft.value = null;
    editing.value = false;
}

function saveEdits() {
    if (!draft.value) {
        return;
    }

    result.value = { ...draft.value };

    // Update history entry if this came from history
    if (activeHistoryId.value) {
        const idx = history.value.findIndex((e: { id: string; }) => e.id === activeHistoryId.value);

        if (idx !== -1) {
            history.value[idx].summary = { ...draft.value };
            history.value[idx].meetingType = draft.value.meetingType;
        }

        // Persist the edit to the server
        if (activeHistoryId.value) {
            historyUpdate(activeHistoryId.value, draft.value).catch((err: any) => {
                console.warn('[saveEdits] Failed to persist edit:', err);
            });
        }
    }

    editing.value = false;
    draft.value = null;
}

function addActionItem() {
    draft.value.actionItems.push({ task: '', owner: '', deadline: '', priority: 'medium' });
}

function removeActionItem(i: number) {
    draft.value.actionItems.splice(i, 1);
}

function addDecision() {
    draft.value.decisions.push({ decision: '', rationale: '', madeBy: '' });
}

function removeDecision(i: number) {
    draft.value.decisions.splice(i, 1);
}

function addParticipant() {
    draft.value.participants.push('');
}

function removeParticipant(i: number) {
    draft.value.participants.splice(i, 1);
}

function addTopic() {
    draft.value.keyTopics.push('');
}

function removeTopic(i: number) {
    draft.value.keyTopics.splice(i, 1);
}

// Convenience computed for "is anything loading"
const isLoading = computed(() => loading.value || compareLoading.value || transcribeLoading.value);
const activeError = computed(() => error.value || compareError.value || transcribeError.value);
const hasResult = computed(() => !!result.value || !!compareResults.value);

// ── History ───────────────────────────────────────────────────────────────────
const activeHistoryId = ref<string | null>(null);

async function onDeleteHistoryEntry(id: string) {
    await historyRemove(id);

    if (activeHistoryId.value === id) {
        activeHistoryId.value = null;
        reset();
        submittedText.value = '';
    }
}

function openHistoryEntry(entry: IHistoryEntry) {
    activeHistoryId.value = entry.id;
    submittedText.value = entry.transcript;
    transcriptExpanded.value = false;
    historyOpen.value = false;
    provider.value = entry.provider;
    mode.value = 'single';
    reset();
    nextTick(() => {
        result.value = entry.summary;
    });
}

onMounted(async () => {
    loadIntegrations();
    await migrateFromLocalStorage();
    await historyLoad();
});

// ── File parsers ──────────────────────────────────────────────────────────────
function parseVtt(raw: string): string {
    const lines = raw.split('\n');
    const out: string[] = [];
    let currentSpeaker = '';
    let currentText = '';

    for (const line of lines) {
        const t = line.trim();

        if (!t || t === 'WEBVTT' || t.startsWith('NOTE') || t.startsWith('STYLE')) {
            continue;
        }

        if (/^\d{2}:[\d:.]+\s*-->\s*[\d:.]+/.test(t)) {
            continue;
        }

        if (/^\d+$/.test(t)) {
            continue;
        }

        const m = t.match(/^<v ([^>]+)>(.*)$/);

        if (m) {
            const speaker = m[1].trim();
            const text = m[2].replace(/<[^>]+>/g, '').trim();

            if (speaker !== currentSpeaker) {
                if (currentText) {
                    out.push(`${currentSpeaker}: ${currentText}`);
                }

                currentSpeaker = speaker;
                currentText = text;
            } else {
                currentText += ' ' + text;
            }
        } else {
            const text = t.replace(/<[^>]+>/g, '').trim();

            if (text) {
                currentText += ' ' + text;
            }
        }
    }

    if (currentText) {
        out.push(currentSpeaker ? `${currentSpeaker}: ${currentText}` : currentText);
    }

    return out.join('\n');
}

function parseSrt(raw: string): string {
    const lines = raw.split('\n');
    const out: string[] = [];

    for (const line of lines) {
        const t = line.trim();

        if (!t || /^\d+$/.test(t) || /^\d{2}:\d{2}:\d{2}[,.]?\d*\s*-->\s*\d{2}:\d{2}:\d{2}/.test(t)) {
            continue;
        }

        out.push(t);
    }

    const merged: string[] = [];

    for (const line of out) {
        if (merged[merged.length - 1] !== line) {
            merged.push(line);
        }
    }

    return merged.join('\n');
}

async function handleFile(file: File) {
    if (!file) {
        return;
    }

    fileName.value = file.name;
    const name = file.name.toLowerCase();

    if (name.endsWith('.txt')) {
        transcriptText.value = await file.text();
    } else if (name.endsWith('.vtt')) {
        transcriptText.value = parseVtt(await file.text());
    } else if (name.endsWith('.srt')) {
        transcriptText.value = parseSrt(await file.text());
    } else if (name.endsWith('.docx')) {
        const mammoth = await import('mammoth');
        const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });

        transcriptText.value = value;
    }
    inputMode.value = 'paste';
}

function handleDrop(e: DragEvent) {
    dragOver.value = false;
    const file = e.dataTransfer?.files[0];

    if (file) {
        handleFile(file);
    }
}

function handleFileInput(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];

    if (file) {
        handleFile(file);
    }
}

// Handle audio/video file selection for Whisper
function handleAudioFile(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];

    if (!file) {
        return;
    }

    audioFile.value = file;
    transcribeStep.value = 'idle';
    transcribeReset();
    transcriptText.value = '';
}

function handleAudioDrop(e: DragEvent) {
    const file = e.dataTransfer?.files[0];

    if (!file) {
        return;
    }

    audioFile.value = file;
    transcribeStep.value = 'idle';
    transcribeReset();
    transcriptText.value = '';
}

async function handleTranscribe() {
    if (!audioFile.value) {
        return;
    }

    transcribing.value = true;
    transcribeStep.value = 'uploading';
    const text = await transcribe(audioFile.value);

    if (text) {
        transcriptText.value = text;
        transcribeStep.value = 'done';
        inputMode.value = 'paste';
    } else {
        transcribeStep.value = 'idle';
    }

    transcribing.value = false;
}

// ── Submit & reset ────────────────────────────────────────────────────────────
async function handleSubmit() {
    if (!transcriptText.value.trim()) {
        return;
    }

    submittedText.value = transcriptText.value;
    transcriptExpanded.value = false;
    activeHistoryId.value = null;

    if (mode.value === 'single') {
        await summarize(transcriptText.value, provider.value, inputType.value);

        if (result.value) {
            activeHistoryId.value = await historyAdd(result.value, submittedText.value, provider.value);
        }
    } else {
        await compare(transcriptText.value, compareProviders.value);
    }
}

function handleReset() {
    reset();
    compareReset();
    transcribeReset();
    editing.value = false;
    draft.value = null;
    transcriptText.value = '';
    submittedText.value = '';
    fileName.value = '';
    audioFile.value = null;
    transcribeStep.value = 'idle';
    transcriptExpanded.value = false;
    activeHistoryId.value = null;
}

// ── Export ────────────────────────────────────────────────────────────────────
const copiedKey = ref<string | null>(null);

function flashCopied(key: string) {
    copiedKey.value = key;

    setTimeout(() => {
        copiedKey.value = null;
    }, 2000);
}

function buildMarkdown(s: IMeetingSummary, prov?: string): string {
    const date = new Date().toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
    });
    const via = prov ?? providerLabel.value;
    const lines: string[] = [];

    lines.push(`# Meeting Summary — ${s.meetingType}`);
    lines.push(`*${date} · Analysed via ${via}*`);
    lines.push('');
    lines.push('## Participants');
    lines.push(s.participants.map((p: any) => `- ${p}`).join('\n'));
    lines.push('');
    lines.push('## Key Topics');
    lines.push(s.keyTopics.map((t: any) => `- ${t}`).join('\n'));
    lines.push('');
    lines.push('## Executive Summary');
    lines.push(s.summary);
    lines.push('');
    lines.push('## Action Items');

    s.actionItems.forEach((item: { priority: string; task: any; owner: any; deadline: any; }) => {
        lines.push(`- **[${item.priority.toUpperCase()}]** ${item.task}`);
        lines.push(`  - Owner: ${item.owner}`);
        lines.push(`  - Deadline: ${item.deadline}`);
    });

    lines.push('');
    lines.push('## Decisions Made');

    s.decisions.forEach((d: { decision: any; rationale: any; madeBy: any; }, i: number) => {
        lines.push(`${i + 1}. **${d.decision}**`);
        if (d.rationale) lines.push(`   *${d.rationale}*`);
        lines.push(`   — ${d.madeBy}`);
    });

    return lines.join('\n');
}

function buildEmail(s: IMeetingSummary): string {
    const lines: string[] = [];

    lines.push('Hi everyone,', '');
    lines.push(`Here's a quick summary of our ${s.meetingType} and the agreed next steps.`, '');
    lines.push('Summary', '-------', s.summary, '');

    if (s.actionItems.length) {
        lines.push('Action Items', '------------');

        s.actionItems.forEach((item: { task: any; owner: any; deadline: any; }) => {
            lines.push(`• ${item.task}`);
            lines.push(`  Owner: ${item.owner} | Deadline: ${item.deadline}`);
        });

        lines.push('');
    }

    if (s.decisions.length) {
        lines.push('Decisions', '---------');

        s.decisions.forEach((d: { decision: any; }) => lines.push(`• ${d.decision}`));

        lines.push('');
    }

    lines.push('Please let me know if anything is missing or needs updating.', '', 'Thanks');

    return lines.join('\n');
}

async function copyToClipboard(text: string, key: string) {
    try {
        await navigator.clipboard.writeText(text);
    } catch {
        const el = document.createElement('textarea');

        el.value = text;
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
    }

    flashCopied(key);
}

function downloadMarkdown(s: IMeetingSummary, prov?: string) {
    const content = buildMarkdown(s, prov);
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');

    a.href = url;
    a.download = `meeting-summary-${s.meetingType.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
    flashCopied('download');
}

// ── Display helpers ───────────────────────────────────────────────────────────
const priorityConfig = {
    high: { label: 'High', color: '#ff6b6b', bg: 'rgba(255,107,107,0.1)' },
    medium: { label: 'Medium', color: '#ffb347', bg: 'rgba(255,179,71,0.1)' },
    low: { label: 'Low', color: '#3dffa0', bg: 'rgba(61,255,160,0.1)' },
};

const providers: { id: TProvider; label: string }[] = [
    { id: 'gemini', label: 'Gemini' },
    { id: 'anthropic', label: 'Claude' },
    { id: 'openai', label: 'GPT-4o' },
];

const providerLabel = computed(() => providers.find((p) => p.id === provider.value)?.label ?? provider.value);

function providerName(id: TProvider) {
    return providers.find((p) => p.id === id)?.label ?? id;
}

// Toggle a provider in the compare pair
function toggleCompareProvider(id: TProvider) {
    const [a, b] = compareProviders.value;

    if (a === id) {
        // swap a with the third option
        const third = providers.find((p) => p.id !== a && p.id !== b)!;

        compareProviders.value = [third.id, b];
    } else if (b === id) {
        const third = providers.find((p) => p.id !== a && p.id !== b)!;

        compareProviders.value = [a, third.id];
    }
}

// Highlight differences: returns true if the two values differ meaningfully
function valuesDiffer(a: any, b: any): boolean {
    return JSON.stringify(a) !== JSON.stringify(b);
}
</script>

<template>
    <div class="app">
        <!-- ── History sidebar ────────────────────────────────────── -->
        <Transition name="sidebar">
            <aside v-if="historyOpen" class="sidebar">
                <div class="sidebar-header">
                    <h2 class="sidebar-title">History</h2>
                    <div class="sidebar-actions">
                        <button v-if="history.length" class="sidebar-clear" @click="historyClear">Clear all</button>
                        <button class="sidebar-close" @click="historyOpen = false">✕</button>
                    </div>
                </div>
                <div v-if="!history.length" class="sidebar-empty">No summaries yet. Analyze a meeting to get started.</div>
                <ul v-else class="history-list">
                    <li
                        v-for="entry in history"
                        :key="entry.id"
                        :class="['history-item', activeHistoryId === entry.id ? 'active' : '']"
                        @click="openHistoryEntry(entry)"
                    >
                        <div class="history-item-main">
                            <span class="history-meeting-type">{{ entry.meetingType }}</span>
                            <button class="history-delete" @click.stop="onDeleteHistoryEntry(entry.id)">✕</button>
                        </div>
                        <div class="history-item-meta">
                            <span class="history-date">{{ formatDate(entry.date) }}</span>
                            <span class="history-provider">{{ providerName(entry.provider) }}</span>
                        </div>
                        <div class="history-item-stats">
                            <span>{{ entry.summary.participants.length }} participants</span>
                            <span>{{ entry.summary.actionItems.length }} actions</span>
                            <span>{{ entry.charCount.toLocaleString() }} chars</span>
                        </div>
                    </li>
                </ul>
                <div v-if="historyHasMore" class="sidebar-load-more">
                    <button class="load-more-btn" :disabled="historyLoading" @click="historyLoadMore">
                        {{ historyLoading ? 'Loading…' : 'Load more' }}
                    </button>
                </div>
            </aside>
        </Transition>
        <Transition name="fade">
            <div v-if="historyOpen" class="sidebar-backdrop" @click="historyOpen = false" />
        </Transition>

        <!-- ── Header ─────────────────────────────────────────────── -->
        <header class="header">
            <div class="header-inner">
                <div class="logo">
                    <span class="logo-icon">◈</span>
                    <span class="logo-text">MinutAI</span>
                    <span class="logo-tag">meeting intelligence</span>
                </div>
                <div class="header-right">
                    <NuxtLink to="/dashboard" class="history-btn">
                        <span class="history-btn-icon">▤</span>
                        Dashboard
                    </NuxtLink>

                    <NuxtLink to="/integrations" class="history-btn">
                        <span class="history-btn-icon">⇄</span>
                        Integrations
                    </NuxtLink>

                    <button class="history-btn" @click="historyOpen = true">
                        <span class="history-btn-icon">◷</span>
                        History
                        <span v-if="historyTotal" class="history-count">{{ historyTotal }}</span>
                    </button>

                    <!-- Mode toggle -->
                    <div class="mode-toggle">
                        <button :class="['mode-btn', mode === 'single' ? 'active' : '']" @click="switchMode('single')">Single</button>
                        <button :class="['mode-btn', mode === 'compare' ? 'active' : '']" @click="switchMode('compare')">⇄ Compare</button>
                    </div>

                    <!-- Provider selector (single mode only) -->
                    <div v-if="mode === 'single'" class="provider-toggle">
                        <button
                            v-for="p in providers"
                            :key="p.id"
                            :class="['toggle-btn', provider === p.id ? 'active' : '']"
                            @click="provider = p.id"
                        >
                            <span class="toggle-dot" />
                            {{ p.label }}
                        </button>
                    </div>

                    <!-- Provider selector (compare mode) -->
                    <div v-if="mode === 'compare'" class="provider-toggle compare-providers">
                        <button
                            v-for="p in providers"
                            :key="p.id"
                            :class="['toggle-btn', compareProviders.includes(p.id) ? 'active' : 'inactive']"
                            :disabled="
                                compareProviders.includes(p.id) &&
                                compareProviders.filter((x: any) => x === p.id).length === 1 &&
                                compareProviders.length === 2
                            "
                            @click="
                                compareProviders.includes(p.id)
                                    ? toggleCompareProvider(p.id)
                                    : (compareProviders = [compareProviders[0], p.id])
                            "
                        >
                            <span class="toggle-dot" />
                            {{ p.label }}
                            <span v-if="compareProviders[0] === p.id" class="compare-label">A</span>
                            <span v-else-if="compareProviders[1] === p.id" class="compare-label">B</span>
                        </button>
                    </div>
                </div>
            </div>
        </header>

        <!-- ── Main ───────────────────────────────────────────────── -->
        <main class="main">
            <!-- ── Input section ──────────────────────────────────────── -->
            <Transition name="slide-up">
                <section v-if="!hasResult" class="input-section">
                    <div class="hero">
                        <h1 class="hero-title">
                            <template v-if="mode === 'single'">
                                Turn meetings
                                <br />
                                <em>into action</em>
                            </template>
                            <template v-else>
                                Compare AI
                                <br />
                                <em>side by side</em>
                            </template>
                        </h1>
                        <p class="hero-sub">
                            <template v-if="mode === 'single'">
                                Paste a transcript or upload a file — AI extracts everything that matters.
                            </template>
                            <template v-else>
                                See how
                                <strong>{{ providerName(compareProviders[0]) }}</strong>
                                and
                                <strong>{{ providerName(compareProviders[1]) }}</strong>
                                analyse the same meeting.
                            </template>
                        </p>
                    </div>

                    <div class="input-tabs">
                        <button :class="['tab', inputMode === 'paste' ? 'active' : '']" @click="inputMode = 'paste'">Paste text</button>
                        <button :class="['tab', inputMode === 'upload' ? 'active' : '']" @click="inputMode = 'upload'">Upload file</button>
                        <button :class="['tab', inputMode === 'audio' ? 'active' : '']" @click="inputMode = 'audio'">
                            🎙 Audio / Video
                        </button>
                        <button :class="['tab', inputMode === 'free-notes' ? 'active' : '']" @click="inputMode = 'free-notes'">
                            ✏ Free notes
                        </button>
                    </div>

                    <div v-if="inputMode === 'paste'" class="input-area">
                        <textarea v-model="transcriptText" class="textarea" placeholder="Paste your meeting transcript here..." rows="12" />
                        <div class="textarea-footer">
                            <span class="char-count">{{ transcriptText.length.toLocaleString() }} characters</span>
                        </div>
                    </div>

                    <div
                        v-if="inputMode === 'upload'"
                        class="dropzone"
                        :class="{ 'drag-active': dragOver }"
                        @dragover.prevent="dragOver = true"
                        @dragleave="dragOver = false"
                        @drop.prevent="handleDrop"
                    >
                        <input type="file" accept=".txt,.docx,.vtt,.srt" class="file-input" @change="handleFileInput" />
                        <div class="dropzone-content">
                            <span class="dropzone-icon">⬆</span>
                            <p class="dropzone-label">{{ fileName || 'Drag & drop or click to select' }}</p>
                            <p class="dropzone-hint">.txt · .docx · .vtt · .srt</p>
                        </div>
                    </div>

                    <!-- Audio / Video upload for Whisper -->
                    <div v-if="inputMode === 'audio'" class="audio-section">
                        <!-- Drop zone for audio -->
                        <div
                            v-if="transcribeStep !== 'done'"
                            class="dropzone audio-dropzone"
                            @dragover.prevent
                            @drop.prevent="handleAudioDrop"
                        >
                            <input type="file" accept=".mp3,.mp4,.m4a,.wav,.webm,.ogg,.mpeg" class="file-input" @change="handleAudioFile" />
                            <div class="dropzone-content">
                                <span class="dropzone-icon">🎙</span>
                                <p class="dropzone-label">{{ audioFile ? audioFile.name : 'Drop audio or video file here' }}</p>
                                <p class="dropzone-hint">.mp3 · .mp4 · .m4a · .wav · .webm · .ogg · max 25MB</p>
                                <p v-if="audioFile" class="audio-filesize">{{ (audioFile.size / 1024 / 1024).toFixed(1) }} MB</p>
                            </div>
                        </div>

                        <!-- Requires OpenAI key notice -->
                        <div class="whisper-notice">
                            <span class="whisper-notice-icon">ℹ</span>
                            Transcription uses
                            <strong>OpenAI Whisper</strong>
                            — requires an OpenAI API key regardless of the selected provider.
                        </div>

                        <!-- Transcribe button -->
                        <button
                            v-if="audioFile && transcribeStep !== 'done' && !transcribing"
                            class="transcribe-btn"
                            @click="handleTranscribe"
                        >
                            Transcribe with Whisper →
                        </button>

                        <!-- Progress during transcription -->
                        <div v-if="transcribing" class="transcribe-progress">
                            <div class="transcribe-progress-header">
                                <span class="spinner-text">
                                    <span class="spinner" />
                                    {{ uploadProgress < 60 ? 'Uploading...' : 'Transcribing with Whisper...' }}
                                </span>
                                <span class="transcribe-pct">{{ uploadProgress }}%</span>
                            </div>
                            <div class="progress-bar">
                                <div class="progress-fill" :style="{ width: uploadProgress + '%' }" />
                            </div>
                        </div>

                        <!-- Transcription done — preview -->
                        <div v-if="transcribeResult && transcribeStep === 'done' && inputMode === 'audio'" class="transcribe-success">
                            ✓ Transcribed successfully — ready to analyse
                            <span v-if="transcribeResult.duration" class="transcribe-meta">
                                · {{ Math.round(transcribeResult.duration / 60) }}min · {{ transcribeResult.language }}
                            </span>
                        </div>
                    </div>

                    <!-- Free notes mode -->
                    <div v-if="inputMode === 'free-notes'" class="input-area free-notes-area">
                        <div class="free-notes-header">
                            <span class="free-notes-badge">✏ Free notes mode</span>
                            <span class="free-notes-hint">Write anything — the AI will structure it</span>
                        </div>
                        <textarea
                            v-model="transcriptText"
                            class="textarea free-notes-textarea"
                            placeholder="e.g.
- sarah, tom, ana, james
- sprint review, showed demo to client acme
- bug on login page BLOCKING - tom to fix asap
- decided to move launch to march 15
- ana to prep deck for board meeting next fri
- discussed perf issues, james says needs refactor, low prio
- client happy overall, wants dark mode eventually"
                            rows="14"
                        />
                        <div class="textarea-footer">
                            <span class="char-count">{{ transcriptText.length.toLocaleString() }} characters</span>
                            <span class="free-notes-tip">Abbreviations, bullet points, fragments — all fine</span>
                        </div>
                    </div>

                    <div v-if="activeError" class="error-msg">⚠ {{ activeError }}</div>

                    <button class="submit-btn" :disabled="isLoading || !transcriptText.trim()" @click="handleSubmit">
                        <span v-if="!isLoading">
                            {{
                                mode === 'compare'
                                    ? `Compare ${providerName(compareProviders[0])} vs ${providerName(compareProviders[1])} →`
                                    : inputMode === 'free-notes'
                                      ? 'Structure my notes →'
                                      : 'Analyze meeting →'
                            }}
                        </span>
                        <span v-else class="loading-state">
                            <span class="spinner" />
                            {{ mode === 'single' ? `Processing... ${progress}%` : 'Comparing providers...' }}
                        </span>
                    </button>

                    <div v-if="loading" class="progress-bar">
                        <div class="progress-fill" :style="{ width: progress + '%' }" />
                    </div>
                </section>
            </Transition>

            <!-- ── Single result ───────────────────────────────────────── -->
            <Transition name="fade-up">
                <section v-if="result && mode === 'single'" class="results-section">
                    <!-- Results header -->
                    <div class="results-header">
                        <div class="results-meta">
                            <template v-if="!editing">
                                <span class="meeting-type-badge">{{ result.meetingType }}</span>
                                <span class="provider-badge">via {{ providerLabel }}</span>
                            </template>
                            <template v-else>
                                <input v-model="draft.meetingType" class="edit-meeting-type" placeholder="Meeting type" />
                                <span class="editing-indicator">✎ Editing</span>
                            </template>
                        </div>
                        <div class="results-actions">
                            <template v-if="!editing">
                                <button class="edit-btn" title="Edit results" @click="startEditing">✎ Edit</button>
                                <button class="reset-btn" @click="handleReset">← New meeting</button>
                            </template>
                            <template v-else>
                                <button class="cancel-btn" @click="cancelEditing">Cancel</button>
                                <button class="save-btn" @click="saveEdits">✓ Save changes</button>
                            </template>
                        </div>
                    </div>

                    <!-- Participants & Topics -->
                    <div class="chips-row">
                        <!-- View mode -->
                        <template v-if="!editing">
                            <div class="chips-group">
                                <span class="chips-label">Participants</span>
                                <span v-for="p in result.participants" :key="p" class="chip chip-blue">{{ p }}</span>
                            </div>
                            <div class="chips-group">
                                <span class="chips-label">Topics</span>
                                <span v-for="t in result.keyTopics" :key="t" class="chip chip-purple">{{ t }}</span>
                            </div>
                        </template>
                        <!-- Edit mode -->
                        <template v-else>
                            <div class="edit-chip-group">
                                <span class="chips-label">Participants</span>
                                <div class="edit-chips">
                                    <div v-for="(p, i) in draft.participants" :key="i" class="edit-chip-row">
                                        <input v-model="draft.participants[i]" class="edit-chip-input chip-blue-input" placeholder="Name" />
                                        <button class="remove-chip-btn" @click="removeParticipant(i)">✕</button>
                                    </div>
                                    <button class="add-chip-btn" @click="addParticipant">+ Add person</button>
                                </div>
                            </div>
                            <div class="edit-chip-group">
                                <span class="chips-label">Topics</span>
                                <div class="edit-chips">
                                    <div v-for="(t, i) in draft.keyTopics" :key="i" class="edit-chip-row">
                                        <input v-model="draft.keyTopics[i]" class="edit-chip-input chip-purple-input" placeholder="Topic" />
                                        <button class="remove-chip-btn" @click="removeTopic(i)">✕</button>
                                    </div>
                                    <button class="add-chip-btn" @click="addTopic">+ Add topic</button>
                                </div>
                            </div>
                        </template>
                    </div>

                    <!-- Executive Summary -->
                    <div class="card">
                        <div class="card-header">
                            <span class="card-icon">◎</span>
                            <h2 class="card-title">Executive Summary</h2>
                        </div>
                        <p v-if="!editing" class="summary-text">{{ result.summary }}</p>
                        <textarea v-else v-model="draft.summary" class="edit-summary" rows="6" placeholder="Executive summary..." />
                    </div>

                    <!-- Action Items -->
                    <div class="card">
                        <div class="card-header">
                            <span class="card-icon">◉</span>
                            <h2 class="card-title">Action Items</h2>
                            <span class="card-count">{{ editing ? draft.actionItems.length : result.actionItems.length }}</span>
                        </div>
                        <!-- View mode -->
                        <div v-if="!editing" class="action-items">
                            <div v-for="(item, i) in result.actionItems" :key="i" class="action-item">
                                <div class="action-left">
                                    <span
                                        class="priority-badge"
                                        :style="{
                                            color: priorityConfig[item.priority]?.color ?? '#fff',
                                            background: priorityConfig[item.priority]?.bg ?? 'rgba(255,255,255,0.05)',
                                        }"
                                    >
                                        {{ priorityConfig[item.priority]?.label ?? item.priority }}
                                    </span>
                                    <span class="action-task">{{ item.task }}</span>
                                </div>
                                <div class="action-right">
                                    <span class="action-meta">👤 {{ item.owner }}</span>
                                    <span class="action-meta">📅 {{ item.deadline }}</span>
                                    <!-- Calendar links -->
                                    <div class="cal-links">
                                        <a
                                            :href="getLinks(item, result.meetingType).google"
                                            target="_blank"
                                            class="cal-btn gcal"
                                            title="Add to Google Calendar"
                                        >
                                            G
                                        </a>
                                        <a
                                            :href="getLinks(item, result.meetingType).outlook"
                                            target="_blank"
                                            class="cal-btn outlook"
                                            title="Add to Outlook"
                                        >
                                            O
                                        </a>
                                    </div>
                                </div>
                            </div>
                            <!-- Export all to calendar -->
                            <div v-if="itemsWithDeadlines(result.actionItems) > 1" class="cal-export-row">
                                <span class="cal-export-label">Add all {{ itemsWithDeadlines(result.actionItems) }} deadlines to:</span>
                                <button
                                    class="cal-export-btn gcal-btn"
                                    @click="openAllInCalendar(result.actionItems, result.meetingType, 'google')"
                                >
                                    Google Calendar
                                </button>
                                <button
                                    class="cal-export-btn outlook-btn"
                                    @click="openAllInCalendar(result.actionItems, result.meetingType, 'outlook')"
                                >
                                    Outlook
                                </button>
                            </div>
                        </div>
                        <!-- Edit mode -->
                        <div v-else class="edit-action-items">
                            <div v-for="(item, i) in draft.actionItems" :key="i" class="edit-action-item">
                                <div class="edit-action-main">
                                    <select
                                        v-model="item.priority"
                                        class="edit-priority-select"
                                        :style="{ color: priorityConfig[item.priority]?.color ?? '#fff' }"
                                    >
                                        <option value="high">High</option>
                                        <option value="medium">Medium</option>
                                        <option value="low">Low</option>
                                    </select>
                                    <input v-model="item.task" class="edit-input edit-task" placeholder="Task description" />
                                    <button class="remove-item-btn" title="Remove" @click="removeActionItem(i)">✕</button>
                                </div>
                                <div class="edit-action-meta">
                                    <span class="edit-meta-label">👤</span>
                                    <input v-model="item.owner" class="edit-input edit-meta-input" placeholder="Owner" />
                                    <span class="edit-meta-label">📅</span>
                                    <input v-model="item.deadline" class="edit-input edit-meta-input" placeholder="Deadline" />
                                </div>
                            </div>
                            <button class="add-item-btn" @click="addActionItem">+ Add action item</button>
                        </div>
                    </div>

                    <!-- Decisions -->
                    <div class="card">
                        <div class="card-header">
                            <span class="card-icon">◈</span>
                            <h2 class="card-title">Decisions Made</h2>
                            <span class="card-count">{{ editing ? draft.decisions.length : result.decisions.length }}</span>
                        </div>
                        <!-- View mode -->
                        <div v-if="!editing" class="decisions">
                            <div v-for="(d, i) in result.decisions" :key="i" class="decision-item">
                                <div class="decision-number">{{ String(i + 1).padStart(2, '0') }}</div>
                                <div class="decision-content">
                                    <p class="decision-text">{{ d.decision }}</p>
                                    <p v-if="d.rationale" class="decision-rationale">{{ d.rationale }}</p>
                                    <span class="decision-by">— {{ d.madeBy }}</span>
                                </div>
                            </div>
                        </div>
                        <!-- Edit mode -->
                        <div v-else class="edit-decisions">
                            <div v-for="(d, i) in draft.decisions" :key="i" class="edit-decision-item">
                                <div class="edit-decision-header">
                                    <span class="decision-number">{{ String(i + 1).padStart(2, '0') }}</span>
                                    <button class="remove-item-btn" title="Remove" @click="removeDecision(i)">✕</button>
                                </div>
                                <input v-model="d.decision" class="edit-input" placeholder="Decision" />
                                <input v-model="d.rationale" class="edit-input" placeholder="Rationale (optional)" />
                                <input v-model="d.madeBy" class="edit-input edit-small" placeholder="Made by" />
                            </div>
                            <button class="add-item-btn" @click="addDecision">+ Add decision</button>
                        </div>
                    </div>

                    <!-- Export -->
                    <div v-if="!editing" class="card">
                        <div class="card-header">
                            <span class="card-icon">↗</span>
                            <h2 class="card-title">Export</h2>
                        </div>
                        <div class="export-actions">
                            <button class="export-btn" @click="copyToClipboard(buildMarkdown(result), 'markdown')">
                                <span class="export-btn-icon">◻</span>
                                <span class="export-btn-label">Copy as Markdown</span>
                                <span class="export-btn-confirm" :class="{ visible: copiedKey === 'markdown' }">✓ Copied!</span>
                            </button>
                            <button class="export-btn" @click="downloadMarkdown(result)">
                                <span class="export-btn-icon">↓</span>
                                <span class="export-btn-label">Download .md file</span>
                                <span class="export-btn-confirm" :class="{ visible: copiedKey === 'download' }">✓ Done!</span>
                            </button>
                            <button class="export-btn" @click="copyToClipboard(buildEmail(result), 'email')">
                                <span class="export-btn-icon">✉</span>
                                <span class="export-btn-label">Copy follow-up email</span>
                                <span class="export-btn-confirm" :class="{ visible: copiedKey === 'email' }">✓ Copied!</span>
                            </button>
                        </div>
                    </div>

                    <!-- Send to integrations -->
                    <div v-if="!editing && hasIntegrations" class="card">
                        <div class="card-header">
                            <span class="card-icon">⇄</span>
                            <h2 class="card-title">Send to…</h2>
                        </div>
                        <div class="integrations-grid">
                            <div v-for="id in enabledIntegrations" :key="id" class="integration-panel">
                                <div class="integration-panel-header">
                                    <span class="int-logo-sm" :class="integrationMeta[id].logoClass">
                                        {{ integrationMeta[id].logo }}
                                    </span>
                                    <span class="int-panel-name">{{ integrationMeta[id].label }}</span>
                                    <button class="send-btn" :disabled="intStatus[id].loading" @click="sendTo(id, result)">
                                        <span v-if="intStatus[id].loading" class="spinner" />
                                        <span v-else-if="intStatus[id].results.length">✓ Sent</span>
                                        <span v-else>Send {{ result.actionItems.length }} items</span>
                                    </button>
                                </div>

                                <!-- Error -->
                                <div v-if="intStatus[id].error" class="int-error">⚠ {{ intStatus[id].error }}</div>

                                <!-- Results -->
                                <div v-if="intStatus[id].results.length" class="int-results">
                                    <div v-for="r in intStatus[id].results" :key="r.task" class="int-result-row">
                                        <span v-if="r.error" class="int-result-error">✕ {{ r.task }} — {{ r.error }}</span>
                                        <a v-else :href="r.url" target="_blank" class="int-result-ok">✓ {{ r.task }} ↗</a>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div v-if="!hasIntegrations" class="int-empty">
                            No integrations configured.
                            <NuxtLink to="/integrations" class="int-setup-link">Set up integrations →</NuxtLink>
                        </div>
                    </div>

                    <!-- Original transcript -->
                    <div class="card">
                        <button class="transcript-toggle" @click="transcriptExpanded = !transcriptExpanded">
                            <div class="card-header" style="margin-bottom: 0">
                                <span class="card-icon">≡</span>
                                <h2 class="card-title">Original Transcript</h2>
                                <span class="card-count">{{ submittedText.length.toLocaleString() }} chars</span>
                                <span class="expand-arrow" :class="{ rotated: transcriptExpanded }">▾</span>
                            </div>
                        </button>
                        <Transition name="expand">
                            <div v-if="transcriptExpanded" class="transcript-body">
                                <pre class="transcript-text">{{ submittedText }}</pre>
                            </div>
                        </Transition>
                    </div>
                </section>
            </Transition>

            <!-- ── Compare results ─────────────────────────────────────── -->
            <Transition name="fade-up">
                <section v-if="compareResults && mode === 'compare'" class="compare-section">
                    <div class="results-header">
                        <div class="results-meta">
                            <span class="meeting-type-badge">Compare mode</span>
                        </div>
                        <button class="reset-btn" @click="handleReset">← New meeting</button>
                    </div>

                    <!-- Side by side columns -->
                    <div class="compare-grid">
                        <div v-for="side in ['a', 'b'] as const" :key="side" class="compare-col">
                            <!-- Column header -->
                            <div class="compare-col-header">
                                <span class="compare-side-badge" :class="side">{{ side.toUpperCase() }}</span>
                                <span class="compare-provider-name">{{ providerName(compareResults[side].provider) }}</span>
                            </div>

                            <!-- Error state -->
                            <div v-if="isError(compareResults[side].result)" class="compare-error">
                                ⚠ {{ (compareResults[side].result as any).error }}
                            </div>

                            <!-- Result -->
                            <template v-else>
                                <div :key="side" class="compare-result">
                                    <!-- Meeting type -->
                                    <div
                                        class="compare-field"
                                        :class="{
                                            differs: valuesDiffer(
                                                compareResults.a.result?.meetingType,
                                                compareResults.b.result?.meetingType
                                            ),
                                        }"
                                    >
                                        <span class="compare-field-label">Meeting type</span>
                                        <span class="compare-field-value">{{ (compareResults[side].result as any).meetingType }}</span>
                                    </div>

                                    <!-- Key topics -->
                                    <div
                                        class="compare-field"
                                        :class="{
                                            differs: valuesDiffer(compareResults.a.result?.keyTopics, compareResults.b.result?.keyTopics),
                                        }"
                                    >
                                        <span class="compare-field-label">Key topics</span>
                                        <div class="compare-chips">
                                            <span
                                                v-for="t in (compareResults[side].result as any).keyTopics"
                                                :key="t"
                                                class="chip chip-purple"
                                            >
                                                {{ t }}
                                            </span>
                                        </div>
                                    </div>

                                    <!-- Summary -->
                                    <div
                                        class="compare-field"
                                        :class="{
                                            differs: valuesDiffer(compareResults.a.result?.summary, compareResults.b.result?.summary),
                                        }"
                                    >
                                        <span class="compare-field-label">Summary</span>
                                        <p class="compare-summary">{{ (compareResults[side].result as any).summary }}</p>
                                    </div>

                                    <!-- Action items -->
                                    <div
                                        class="compare-field"
                                        :class="{
                                            differs: valuesDiffer(
                                                compareResults.a.result?.actionItems?.length,
                                                compareResults.b.result?.actionItems?.length
                                            ),
                                        }"
                                    >
                                        <span class="compare-field-label">
                                            Action Items
                                            <span class="compare-count-badge">
                                                {{ (compareResults[side].result as any).actionItems.length }}
                                            </span>
                                        </span>
                                        <div class="compare-action-list">
                                            <div
                                                v-for="(item, i) in (compareResults[side].result as any).actionItems"
                                                :key="i"
                                                class="compare-action-item"
                                            >
                                                <span
                                                    class="priority-badge"
                                                    :style="{
                                                        color: priorityConfig[item.priority]?.color ?? '#fff',
                                                        background: priorityConfig[item.priority]?.bg ?? 'rgba(255,255,255,0.05)',
                                                    }"
                                                >
                                                    {{ priorityConfig[item.priority]?.label ?? item.priority }}
                                                </span>
                                                <div class="compare-action-body">
                                                    <span class="compare-action-task">{{ item.task }}</span>
                                                    <span class="compare-action-meta">👤 {{ item.owner }} · 📅 {{ item.deadline }}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <!-- Decisions -->
                                    <div
                                        class="compare-field"
                                        :class="{
                                            differs: valuesDiffer(
                                                compareResults.a.result?.decisions?.length,
                                                compareResults.b.result?.decisions?.length
                                            ),
                                        }"
                                    >
                                        <span class="compare-field-label">
                                            Decisions
                                            <span class="compare-count-badge">
                                                {{ (compareResults[side].result as any).decisions.length }}
                                            </span>
                                        </span>
                                        <div class="compare-decision-list">
                                            <div
                                                v-for="(d, i) in (compareResults[side].result as any).decisions"
                                                :key="i"
                                                class="compare-decision-item"
                                            >
                                                <span class="decision-number">{{ String(i + 1).padStart(2, '0') }}</span>
                                                <div>
                                                    <p class="decision-text">{{ d.decision }}</p>
                                                    <p v-if="d.rationale" class="decision-rationale">{{ d.rationale }}</p>
                                                    <span class="decision-by">— {{ d.madeBy }}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <!-- Export (per column) -->
                                    <div class="compare-field">
                                        <span class="compare-field-label">Export</span>
                                        <div class="export-actions">
                                            <button
                                                class="export-btn"
                                                @click="
                                                    copyToClipboard(
                                                        buildMarkdown(
                                                            compareResults[side].result as any,
                                                            providerName(compareResults[side].provider)
                                                        ),
                                                        `md-${side}`
                                                    )
                                                "
                                            >
                                                <span class="export-btn-icon">◻</span>
                                                <span class="export-btn-label">Copy Markdown</span>
                                                <span class="export-btn-confirm" :class="{ visible: copiedKey === `md-${side}` }">
                                                    ✓ Copied!
                                                </span>
                                            </button>
                                            <button
                                                class="export-btn"
                                                @click="
                                                    downloadMarkdown(
                                                        compareResults[side].result as any,
                                                        providerName(compareResults[side].provider)
                                                    )
                                                "
                                            >
                                                <span class="export-btn-icon">↓</span>
                                                <span class="export-btn-label">Download .md</span>
                                                <span class="export-btn-confirm" :class="{ visible: copiedKey === 'download' }">
                                                    ✓ Done!
                                                </span>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </template>
                        </div>
                    </div>

                    <!-- Shared transcript -->
                    <div class="card" style="margin-top: 20px">
                        <button class="transcript-toggle" @click="transcriptExpanded = !transcriptExpanded">
                            <div class="card-header" style="margin-bottom: 0">
                                <span class="card-icon">≡</span>
                                <h2 class="card-title">Original Transcript</h2>
                                <span class="card-count">{{ submittedText.length.toLocaleString() }} chars</span>
                                <span class="expand-arrow" :class="{ rotated: transcriptExpanded }">▾</span>
                            </div>
                        </button>
                        <Transition name="expand">
                            <div v-if="transcriptExpanded" class="transcript-body">
                                <pre class="transcript-text">{{ submittedText }}</pre>
                            </div>
                        </Transition>
                    </div>
                </section>
            </Transition>
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

/* ── Sidebar ─────────────────────────────────────────────────── */
.sidebar {
    position: fixed;
    top: 0;
    right: 0;
    width: 340px;
    height: 100vh;
    background: #0d0d14;
    border-left: 1px solid var(--border);
    z-index: 200;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

.sidebar-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 20px 20px 16px;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
}

.sidebar-title {
    font-size: 15px;
    font-weight: 700;
    letter-spacing: -0.3px;
}

.sidebar-actions {
    display: flex;
    gap: 8px;
    align-items: center;
}

.sidebar-clear {
    font-family: 'DM Mono', monospace;
    font-size: 11px;
    color: var(--text-muted);
    background: none;
    border: none;
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 4px;
    transition: color 0.2s;
}

.sidebar-clear:hover {
    color: var(--red);
}

.sidebar-close {
    background: var(--bg-hover);
    border: 1px solid var(--border-bright);
    color: var(--text-muted);
    width: 28px;
    height: 28px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
}

.sidebar-empty {
    padding: 40px 20px;
    text-align: center;
    font-size: 13px;
    color: var(--text-muted);
    line-height: 1.6;
}

.history-list {
    list-style: none;
    overflow-y: auto;
    flex: 1;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.history-item {
    padding: 12px 14px;
    border-radius: 10px;
    border: 1px solid var(--border);
    background: var(--bg-card);
    cursor: pointer;
    transition: all 0.15s;
}

.history-item:hover {
    border-color: var(--border-bright);
    background: var(--bg-hover);
}

.history-item.active {
    border-color: var(--accent-soft);
    background: var(--accent-glow);
}

.history-item-main {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 6px;
}

.history-meeting-type {
    font-size: 13px;
    font-weight: 600;
    line-height: 1.3;
    flex: 1;
    margin-right: 8px;
}

.history-delete {
    background: none;
    border: none;
    color: var(--text-dim);
    cursor: pointer;
    font-size: 11px;
    padding: 2px 4px;
    border-radius: 3px;
    flex-shrink: 0;
    transition: color 0.2s;
}

.history-delete:hover {
    color: var(--red);
}

.history-item-meta {
    display: flex;
    gap: 8px;
    align-items: center;
    margin-bottom: 6px;
}

.history-date {
    font-family: 'DM Mono', monospace;
    font-size: 10px;
    color: var(--text-muted);
}

.history-provider {
    font-family: 'DM Mono', monospace;
    font-size: 10px;
    color: var(--accent);
    background: var(--accent-glow);
    padding: 1px 6px;
    border-radius: 10px;
}

.history-item-stats {
    display: flex;
    gap: 8px;
    font-family: 'DM Mono', monospace;
    font-size: 10px;
    color: var(--text-dim);
}

.sidebar-backdrop {
    position: fixed;
    inset: 0;
    background: rgb(0 0 0 / 50%);
    z-index: 199;
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
    max-width: 1100px;
    margin: 0 auto;
    padding: 12px 24px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
}

.logo {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-shrink: 0;
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
    letter-spacing: 0.05em;
}

.header-right {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
}

.history-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 7px 14px;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 8px;
    color: var(--text-muted);
    font-family: Syne, sans-serif;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    white-space: nowrap;
    text-decoration: none;
}

.history-btn:hover {
    border-color: var(--accent);
    color: var(--text);
}

.history-btn-icon {
    font-size: 15px;
}

.history-count {
    background: var(--accent-soft);
    color: white;
    font-size: 10px;
    font-family: 'DM Mono', monospace;
    padding: 1px 6px;
    border-radius: 10px;
    min-width: 18px;
    text-align: center;
}

/* Mode toggle */
.mode-toggle {
    display: flex;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 3px;
    gap: 2px;
}

.mode-btn {
    padding: 6px 14px;
    border-radius: 6px;
    border: none;
    cursor: pointer;
    font-family: Syne, sans-serif;
    font-size: 13px;
    font-weight: 600;
    color: var(--text-muted);
    background: transparent;
    transition: all 0.2s;
    white-space: nowrap;
}

.mode-btn.active {
    background: var(--accent-soft);
    color: var(--text);
}

/* Provider toggle */
.provider-toggle {
    display: flex;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 3px;
    gap: 2px;
}

.toggle-btn {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 6px 12px;
    border-radius: 6px;
    border: none;
    cursor: pointer;
    font-family: Syne, sans-serif;
    font-size: 13px;
    font-weight: 600;
    color: var(--text-muted);
    background: transparent;
    transition: all 0.2s;
}

.toggle-btn.active {
    background: var(--accent-soft);
    color: var(--text);
}

.toggle-btn.inactive {
    opacity: 0.4;
}

.toggle-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentcolor;
    opacity: 0.7;
    flex-shrink: 0;
}

.compare-label {
    font-family: 'DM Mono', monospace;
    font-size: 9px;
    background: rgb(255 255 255 / 15%);
    padding: 1px 4px;
    border-radius: 3px;
    margin-left: 2px;
}

/* ── Main ────────────────────────────────────────────────────── */
.main {
    flex: 1;
    max-width: 1100px;
    margin: 0 auto;
    padding: 48px 24px;
    width: 100%;
}

.hero {
    text-align: center;
    margin-bottom: 48px;
}

.hero-title {
    font-size: clamp(32px, 5vw, 60px);
    font-weight: 800;
    line-height: 1.05;
    letter-spacing: -2px;
    margin-bottom: 16px;
}

.hero-title em {
    font-style: normal;
    background: linear-gradient(135deg, var(--accent) 0%, var(--blue) 100%);
    background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
}

.hero-sub {
    font-size: 16px;
    color: var(--text-muted);
    max-width: 480px;
    margin: 0 auto;
    line-height: 1.6;
}

.hero-sub strong {
    color: var(--text);
}

.input-tabs {
    display: flex;
    gap: 4px;
    margin-bottom: 16px;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 4px;
    width: fit-content;
}

.tab {
    padding: 8px 20px;
    border-radius: 7px;
    border: none;
    cursor: pointer;
    font-family: Syne, sans-serif;
    font-size: 13px;
    font-weight: 600;
    color: var(--text-muted);
    background: transparent;
    transition: all 0.2s;
}

.tab.active {
    background: var(--bg-hover);
    color: var(--text);
    border: 1px solid var(--border-bright);
}

.input-area {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 12px;
    overflow: hidden;
    margin-bottom: 20px;
}

.textarea {
    width: 100%;
    background: transparent;
    border: none;
    outline: none;
    padding: 20px;
    font-family: 'DM Mono', monospace;
    font-size: 13px;
    color: var(--text);
    resize: vertical;
    min-height: 240px;
    line-height: 1.7;
}

.textarea::placeholder {
    color: var(--text-dim);
}

.textarea-footer {
    padding: 8px 20px;
    border-top: 1px solid var(--border);
    display: flex;
    justify-content: flex-end;
}

.char-count {
    font-family: 'DM Mono', monospace;
    font-size: 11px;
    color: var(--text-muted);
}

.dropzone {
    position: relative;
    background: var(--bg-card);
    border: 2px dashed var(--border-bright);
    border-radius: 12px;
    padding: 60px 24px;
    text-align: center;
    cursor: pointer;
    transition: all 0.2s;
    margin-bottom: 20px;
}

.dropzone:hover,
.dropzone.drag-active {
    border-color: var(--accent);
    background: var(--accent-glow);
}

.file-input {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
    width: 100%;
    height: 100%;
}

.dropzone-icon {
    font-size: 32px;
    display: block;
    margin-bottom: 12px;
    color: var(--accent);
}

.dropzone-label {
    font-size: 15px;
    font-weight: 600;
    margin-bottom: 6px;
}

.dropzone-hint {
    font-size: 12px;
    color: var(--text-muted);
    font-family: 'DM Mono', monospace;
}

.error-msg {
    background: rgb(255 107 107 / 8%);
    border: 1px solid rgb(255 107 107 / 25%);
    color: var(--red);
    padding: 12px 16px;
    border-radius: 8px;
    font-size: 13px;
    margin-bottom: 16px;
}

.submit-btn {
    width: 100%;
    padding: 16px;
    background: var(--accent);
    color: white;
    border: none;
    border-radius: 10px;
    font-family: Syne, sans-serif;
    font-size: 15px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.2s;
    margin-bottom: 12px;
}

.submit-btn:hover:not(:disabled) {
    background: #9180ff;
    transform: translateY(-1px);
    box-shadow: 0 8px 24px rgb(124 109 255 / 35%);
}

.submit-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
    transform: none;
}

.loading-state {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
}

.spinner {
    width: 14px;
    height: 14px;
    border: 2px solid rgb(255 255 255 / 30%);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
}

@keyframes spin {
    to {
        transform: rotate(360deg);
    }
}

.progress-bar {
    height: 2px;
    background: var(--border);
    border-radius: 2px;
    overflow: hidden;
}

.progress-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--accent), var(--blue));
    transition: width 0.4s ease;
}

/* ── Free notes mode ────────────────────────────────────────── */
.free-notes-area {
    margin-bottom: 20px;
}

.free-notes-header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 16px;
    background: rgb(124 109 255 / 6%);
    border-bottom: 1px solid var(--border);
}

.free-notes-badge {
    font-family: 'DM Mono', monospace;
    font-size: 11px;
    font-weight: 600;
    color: var(--accent);
    background: var(--accent-glow);
    border: 1px solid var(--accent-soft);
    padding: 2px 10px;
    border-radius: 20px;
}

.free-notes-hint {
    font-size: 12px;
    color: var(--text-muted);
}

.free-notes-textarea {
    min-height: 280px;
}

.free-notes-tip {
    font-family: 'DM Mono', monospace;
    font-size: 10px;
    color: var(--text-dim);
    font-style: italic;
}

/* ── Audio / Whisper section ─────────────────────────────────── */
.audio-section {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-bottom: 8px;
}

.audio-dropzone {
    margin-bottom: 0;
}

.audio-filesize {
    font-family: 'DM Mono', monospace;
    font-size: 11px;
    color: var(--accent);
    margin-top: 4px;
}

.whisper-notice {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    background: rgb(91 196 255 / 6%);
    border: 1px solid rgb(91 196 255 / 15%);
    border-radius: 8px;
    padding: 10px 14px;
    font-size: 12px;
    color: var(--text-muted);
    line-height: 1.5;
}

.whisper-notice-icon {
    color: var(--blue);
    flex-shrink: 0;
    margin-top: 1px;
}

.whisper-notice strong {
    color: var(--text);
}

.transcribe-btn {
    width: 100%;
    padding: 14px;
    background: var(--bg-card);
    border: 1px solid var(--accent-soft);
    border-radius: 10px;
    font-family: Syne, sans-serif;
    font-size: 14px;
    font-weight: 700;
    color: var(--accent);
    cursor: pointer;
    transition: all 0.2s;
}

.transcribe-btn:hover {
    background: var(--accent-glow);
    border-color: var(--accent);
}

.transcribe-progress {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.transcribe-progress-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
}

.spinner-text {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: var(--text-muted);
}

.transcribe-pct {
    font-family: 'DM Mono', monospace;
    font-size: 12px;
    color: var(--accent);
}

.transcribe-success {
    padding: 12px 16px;
    background: rgb(61 255 160 / 6%);
    border: 1px solid rgb(61 255 160 / 20%);
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    color: var(--green);
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
}

.transcribe-meta {
    font-family: 'DM Mono', monospace;
    font-size: 11px;
    color: var(--text-muted);
    font-weight: 400;
}

/* ── Calendar links ──────────────────────────────────────────── */
.cal-links {
    display: flex;
    gap: 4px;
    margin-top: 4px;
}

.cal-btn {
    width: 22px;
    height: 22px;
    border-radius: 5px;
    font-size: 10px;
    font-weight: 800;
    display: flex;
    align-items: center;
    justify-content: center;
    text-decoration: none;
    transition: all 0.15s;
    flex-shrink: 0;
}

.cal-btn.gcal {
    background: rgb(66 133 244 / 12%);
    color: #4285f4;
    border: 1px solid rgb(66 133 244 / 25%);
}

.cal-btn.gcal:hover {
    background: #4285f4;
    color: white;
}

.cal-btn.outlook {
    background: rgb(0 120 212 / 12%);
    color: #0078d4;
    border: 1px solid rgb(0 120 212 / 25%);
}

.cal-btn.outlook:hover {
    background: #0078d4;
    color: white;
}

.cal-export-row {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    padding: 12px 16px;
    background: var(--bg);
    border: 1px dashed var(--border-bright);
    border-radius: 10px;
    margin-top: 4px;
}

.cal-export-label {
    font-family: 'DM Mono', monospace;
    font-size: 11px;
    color: var(--text-muted);
    flex: 1;
}

.cal-export-btn {
    font-family: Syne, sans-serif;
    font-size: 12px;
    font-weight: 700;
    padding: 6px 14px;
    border-radius: 7px;
    cursor: pointer;
    border: none;
    transition: all 0.2s;
}

.gcal-btn {
    background: rgb(66 133 244 / 12%);
    color: #4285f4;
    border: 1px solid rgb(66 133 244 / 25%);
}

.gcal-btn:hover {
    background: #4285f4;
    color: white;
}

.outlook-btn {
    background: rgb(0 120 212 / 12%);
    color: #0078d4;
    border: 1px solid rgb(0 120 212 / 25%);
}

.outlook-btn:hover {
    background: #0078d4;
    color: white;
}

/* ── Integrations card ───────────────────────────────────────── */
.integrations-grid {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.integration-panel {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 10px;
    overflow: hidden;
}

.integration-panel-header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 14px;
}

.int-logo-sm {
    width: 28px;
    height: 28px;
    border-radius: 7px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 800;
    font-size: 11px;
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
    font-size: 9px;
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

.int-panel-name {
    font-size: 13px;
    font-weight: 600;
    flex: 1;
}

.send-btn {
    background: var(--accent-glow);
    border: 1px solid var(--accent-soft);
    color: var(--accent);
    padding: 6px 14px;
    border-radius: 7px;
    font-family: Syne, sans-serif;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
}

.send-btn:hover:not(:disabled) {
    background: var(--accent);
    color: white;
    border-color: var(--accent);
}

.send-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}

.int-error {
    padding: 8px 14px;
    font-size: 12px;
    color: var(--red);
    background: rgb(255 107 107 / 6%);
    border-top: 1px solid rgb(255 107 107 / 15%);
}

.int-results {
    padding: 8px 14px 12px;
    border-top: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.int-result-row {
    font-size: 12px;
}

.int-result-ok {
    color: var(--green);
    text-decoration: none;
    font-family: 'DM Mono', monospace;
    font-size: 11px;
}

.int-result-ok:hover {
    text-decoration: underline;
}

.int-result-error {
    color: var(--red);
    font-family: 'DM Mono', monospace;
    font-size: 11px;
}

.int-empty {
    font-size: 13px;
    color: var(--text-muted);
    text-align: center;
    padding: 20px;
}

.int-setup-link {
    color: var(--accent);
    text-decoration: none;
    margin-left: 6px;
}

.int-setup-link:hover {
    text-decoration: underline;
}

/* ── Edit mode ───────────────────────────────────────────────── */
.results-actions {
    display: flex;
    gap: 8px;
    align-items: center;
}

.edit-btn {
    background: transparent;
    border: 1px solid var(--border-bright);
    color: var(--text-muted);
    padding: 8px 14px;
    border-radius: 8px;
    cursor: pointer;
    font-family: Syne, sans-serif;
    font-size: 12px;
    font-weight: 600;
    transition: all 0.2s;
}

.edit-btn:hover {
    color: var(--accent);
    border-color: var(--accent);
}

.save-btn {
    background: var(--accent);
    border: none;
    color: white;
    padding: 8px 16px;
    border-radius: 8px;
    cursor: pointer;
    font-family: Syne, sans-serif;
    font-size: 12px;
    font-weight: 700;
    transition: all 0.2s;
}

.save-btn:hover {
    background: #9180ff;
}

.cancel-btn {
    background: transparent;
    border: 1px solid var(--border-bright);
    color: var(--text-muted);
    padding: 8px 14px;
    border-radius: 8px;
    cursor: pointer;
    font-family: Syne, sans-serif;
    font-size: 12px;
    font-weight: 600;
    transition: all 0.2s;
}

.cancel-btn:hover {
    color: var(--text);
}

.editing-indicator {
    font-family: 'DM Mono', monospace;
    font-size: 11px;
    color: var(--accent);
    background: var(--accent-glow);
    border: 1px solid var(--accent-soft);
    padding: 3px 10px;
    border-radius: 20px;
}

.edit-meeting-type {
    background: var(--bg);
    border: 1px solid var(--accent-soft);
    border-radius: 8px;
    color: var(--accent);
    font-family: 'DM Mono', monospace;
    font-size: 11px;
    padding: 4px 12px;
    outline: none;
    min-width: 180px;
}

.edit-meeting-type:focus {
    border-color: var(--accent);
}

.edit-input {
    width: 100%;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 8px;
    color: var(--text);
    font-family: 'DM Mono', monospace;
    font-size: 12px;
    padding: 8px 12px;
    outline: none;
    transition: border-color 0.2s;
}

.edit-input:focus {
    border-color: var(--accent);
}

.edit-input::placeholder {
    color: var(--text-dim);
}

.edit-small {
    max-width: 240px;
}

.edit-summary {
    width: 100%;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 8px;
    color: var(--text);
    font-family: 'DM Mono', monospace;
    font-size: 12px;
    line-height: 1.7;
    padding: 12px;
    outline: none;
    resize: vertical;
    transition: border-color 0.2s;
}

.edit-summary:focus {
    border-color: var(--accent);
}

.edit-chip-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.edit-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
}

.edit-chip-row {
    display: flex;
    align-items: center;
    gap: 4px;
}

.edit-chip-input {
    background: var(--bg-card);
    border-radius: 20px;
    border: 1px solid var(--border);
    font-size: 12px;
    font-weight: 600;
    padding: 4px 10px;
    outline: none;
    color: var(--text);
    width: 120px;
    transition: border-color 0.2s;
}

.chip-blue-input {
    color: var(--blue);
    border-color: rgb(91 196 255 / 25%);
}

.chip-blue-input:focus {
    border-color: var(--blue);
}

.chip-purple-input {
    color: var(--accent);
    border-color: rgb(124 109 255 / 25%);
}

.chip-purple-input:focus {
    border-color: var(--accent);
}

.remove-chip-btn {
    background: none;
    border: none;
    color: var(--text-dim);
    cursor: pointer;
    font-size: 10px;
    padding: 2px 4px;
    border-radius: 3px;
    transition: color 0.2s;
}

.remove-chip-btn:hover {
    color: var(--red);
}

.add-chip-btn {
    font-family: 'DM Mono', monospace;
    font-size: 11px;
    color: var(--text-muted);
    background: none;
    border: 1px dashed var(--border-bright);
    border-radius: 20px;
    padding: 3px 10px;
    cursor: pointer;
    transition: all 0.2s;
}

.add-chip-btn:hover {
    color: var(--accent);
    border-color: var(--accent);
}

.edit-action-items {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.edit-action-item {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 14px 16px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 10px;
}

.edit-action-main {
    display: flex;
    align-items: center;
    gap: 8px;
}

.edit-priority-select {
    background: var(--bg-card);
    border: 1px solid var(--border-bright);
    border-radius: 20px;
    font-family: 'DM Mono', monospace;
    font-size: 10px;
    font-weight: 600;
    padding: 3px 8px;
    cursor: pointer;
    outline: none;
    flex-shrink: 0;
}

.edit-task {
    flex: 1;
}

.edit-action-meta {
    display: flex;
    align-items: center;
    gap: 8px;
}

.edit-meta-label {
    font-size: 14px;
    flex-shrink: 0;
}

.edit-meta-input {
    flex: 1;
}

.remove-item-btn {
    background: none;
    border: none;
    color: var(--text-dim);
    cursor: pointer;
    font-size: 12px;
    padding: 4px 6px;
    border-radius: 4px;
    transition: color 0.2s;
    flex-shrink: 0;
}

.remove-item-btn:hover {
    color: var(--red);
}

.add-item-btn {
    font-family: 'DM Mono', monospace;
    font-size: 12px;
    color: var(--text-muted);
    background: none;
    border: 1px dashed var(--border-bright);
    border-radius: 8px;
    padding: 10px;
    cursor: pointer;
    transition: all 0.2s;
    text-align: center;
    width: 100%;
}

.add-item-btn:hover {
    color: var(--accent);
    border-color: var(--accent);
    background: var(--accent-glow);
}

.edit-decisions {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.edit-decision-item {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 14px 16px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 10px;
}

.edit-decision-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
}

/* ── Single results ──────────────────────────────────────────── */
.results-section {
    display: flex;
    flex-direction: column;
    gap: 20px;
    max-width: 860px;
}

.results-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
}

.results-meta {
    display: flex;
    gap: 10px;
    align-items: center;
}

.meeting-type-badge {
    font-family: 'DM Mono', monospace;
    font-size: 11px;
    background: var(--accent-glow);
    border: 1px solid var(--accent-soft);
    color: var(--accent);
    padding: 4px 12px;
    border-radius: 20px;
    letter-spacing: 0.05em;
}

.provider-badge {
    font-family: 'DM Mono', monospace;
    font-size: 11px;
    color: var(--text-muted);
}

.reset-btn {
    background: transparent;
    border: 1px solid var(--border-bright);
    color: var(--text-muted);
    padding: 8px 16px;
    border-radius: 8px;
    cursor: pointer;
    font-family: Syne, sans-serif;
    font-size: 12px;
    font-weight: 600;
    transition: all 0.2s;
}

.reset-btn:hover {
    color: var(--text);
    border-color: var(--accent);
}

.chips-row {
    display: flex;
    flex-wrap: wrap;
    gap: 20px;
}

.chips-group {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
}

.chips-label {
    font-family: 'DM Mono', monospace;
    font-size: 10px;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.1em;
    margin-right: 4px;
}

.chip {
    font-size: 12px;
    font-weight: 600;
    padding: 4px 12px;
    border-radius: 20px;
}

.chip-blue {
    background: rgb(91 196 255 / 10%);
    color: var(--blue);
    border: 1px solid rgb(91 196 255 / 20%);
}

.chip-purple {
    background: var(--accent-glow);
    color: var(--accent);
    border: 1px solid rgb(124 109 255 / 20%);
}

.card {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 24px;
}

.card-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 20px;
}

.card-icon {
    font-size: 16px;
    color: var(--accent);
}

.card-title {
    font-size: 16px;
    font-weight: 700;
    flex: 1;
    letter-spacing: -0.3px;
}

.card-count {
    font-family: 'DM Mono', monospace;
    font-size: 12px;
    color: var(--text-muted);
    background: var(--bg-hover);
    border: 1px solid var(--border-bright);
    padding: 2px 9px;
    border-radius: 20px;
}

.summary-text {
    font-size: 14px;
    line-height: 1.8;
    color: #c8c8d8;
    white-space: pre-wrap;
}

.action-items {
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.action-item {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    padding: 14px 16px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 10px;
    transition: border-color 0.2s;
}

.action-item:hover {
    border-color: var(--border-bright);
}

.action-left {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    flex: 1;
}

.priority-badge {
    font-family: 'DM Mono', monospace;
    font-size: 10px;
    font-weight: 500;
    padding: 3px 9px;
    border-radius: 20px;
    white-space: nowrap;
    letter-spacing: 0.05em;
    flex-shrink: 0;
}

.action-task {
    font-size: 13px;
    line-height: 1.5;
}

.action-right {
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex-shrink: 0;
    text-align: right;
}

.action-meta {
    font-family: 'DM Mono', monospace;
    font-size: 11px;
    color: var(--text-muted);
    white-space: nowrap;
}

.decisions {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.decision-item {
    display: flex;
    gap: 20px;
    padding: 16px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 10px;
}

.decision-number {
    font-family: 'DM Mono', monospace;
    font-size: 18px;
    font-weight: 300;
    color: var(--text-dim);
    flex-shrink: 0;
    line-height: 1;
    padding-top: 2px;
}

.decision-text {
    font-size: 14px;
    font-weight: 600;
    margin-bottom: 6px;
    line-height: 1.4;
}

.decision-rationale {
    font-size: 12px;
    color: var(--text-muted);
    line-height: 1.6;
    margin-bottom: 6px;
}

.decision-by {
    font-family: 'DM Mono', monospace;
    font-size: 11px;
    color: var(--accent);
}

/* Export */
.export-actions {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.export-btn {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 13px 16px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 10px;
    cursor: pointer;
    transition: all 0.2s;
    text-align: left;
    width: 100%;
    color: var(--text);
}

.export-btn:hover {
    border-color: var(--accent);
    background: var(--accent-glow);
}

.export-btn-icon {
    font-size: 16px;
    color: var(--accent);
    flex-shrink: 0;
    width: 20px;
    text-align: center;
}

.export-btn-label {
    font-family: Syne, sans-serif;
    font-size: 13px;
    font-weight: 600;
    flex: 1;
}

.export-btn-confirm {
    font-family: 'DM Mono', monospace;
    font-size: 11px;
    color: var(--green);
    opacity: 0;
    transition: opacity 0.2s;
    flex-shrink: 0;
}

.export-btn-confirm.visible {
    opacity: 1;
}

/* Transcript */
.transcript-toggle {
    width: 100%;
    background: none;
    border: none;
    cursor: pointer;
    text-align: left;
    padding: 0;
    color: var(--text);
}

.transcript-toggle:hover .card-title {
    color: var(--accent);
}

.expand-arrow {
    font-size: 16px;
    color: var(--text-muted);
    transition: transform 0.25s ease;
    display: inline-block;
}

.expand-arrow.rotated {
    transform: rotate(180deg);
}

.transcript-body {
    padding-top: 20px;
    border-top: 1px solid var(--border);
    margin-top: 4px;
}

.transcript-text {
    font-family: 'DM Mono', monospace;
    font-size: 12px;
    line-height: 1.7;
    color: var(--text-muted);
    white-space: pre-wrap;
    word-break: break-word;
    max-height: 400px;
    overflow-y: auto;
}

/* ── Compare results ──────────────────────────────────────────── */
.compare-section {
    display: flex;
    flex-direction: column;
    gap: 0;
}

.compare-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    margin-top: 24px;
}

@media (width <= 700px) {
    .compare-grid {
        grid-template-columns: 1fr;
    }
}

.compare-col {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 14px;
    overflow: hidden;
}

.compare-col-header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 16px 20px;
    border-bottom: 1px solid var(--border);
}

.compare-side-badge {
    font-family: 'DM Mono', monospace;
    font-size: 11px;
    font-weight: 700;
    width: 24px;
    height: 24px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
}

.compare-side-badge.a {
    background: rgb(91 196 255 / 15%);
    color: var(--blue);
    border: 1px solid rgb(91 196 255 / 30%);
}

.compare-side-badge.b {
    background: rgb(124 109 255 / 15%);
    color: var(--accent);
    border: 1px solid rgb(124 109 255 / 30%);
}

.compare-provider-name {
    font-size: 15px;
    font-weight: 700;
}

.compare-error {
    padding: 24px 20px;
    color: var(--red);
    font-size: 13px;
}

.compare-result {
    display: flex;
    flex-direction: column;
}

.compare-field {
    padding: 16px 20px;
    border-bottom: 1px solid var(--border);
    transition: background 0.2s;
}

.compare-field:last-child {
    border-bottom: none;
}

.compare-field.differs {
    background: rgb(255 179 71 / 4%);
    border-left: 3px solid var(--amber);
    padding-left: 17px;
}

.compare-field-label {
    font-family: 'DM Mono', monospace;
    font-size: 10px;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.1em;
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 10px;
}

.compare-count-badge {
    background: var(--bg-hover);
    border: 1px solid var(--border-bright);
    color: var(--text-muted);
    padding: 1px 7px;
    border-radius: 10px;
    font-size: 10px;
}

.compare-field-value {
    font-size: 13px;
    font-weight: 600;
}

.compare-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
}

.compare-summary {
    font-size: 13px;
    line-height: 1.7;
    color: #c8c8d8;
}

.compare-action-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.compare-action-item {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    padding: 10px 12px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 8px;
}

.compare-action-body {
    display: flex;
    flex-direction: column;
    gap: 3px;
}

.compare-action-task {
    font-size: 12px;
    line-height: 1.4;
}

.compare-action-meta {
    font-family: 'DM Mono', monospace;
    font-size: 10px;
    color: var(--text-muted);
}

.compare-decision-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.compare-decision-item {
    display: flex;
    gap: 12px;
    padding: 10px 12px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 8px;
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
.slide-up-enter-active,
.slide-up-leave-active {
    transition: all 0.4s ease;
}

.slide-up-enter-from {
    opacity: 0;
    transform: translateY(20px);
}

.slide-up-leave-to {
    opacity: 0;
    transform: translateY(-20px);
}

.fade-up-enter-active {
    transition: all 0.5s ease 0.1s;
}

.fade-up-enter-from {
    opacity: 0;
    transform: translateY(16px);
}

.sidebar-enter-active,
.sidebar-leave-active {
    transition: transform 0.3s ease;
}

.sidebar-enter-from,
.sidebar-leave-to {
    transform: translateX(100%);
}

.fade-enter-active,
.fade-leave-active {
    transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
    opacity: 0;
}

.expand-enter-active,
.expand-leave-active {
    transition: opacity 0.25s ease;
}

.expand-enter-from,
.expand-leave-to {
    opacity: 0;
}
</style>
