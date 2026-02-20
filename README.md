# MinutAI — Meeting Intelligence

Transforms meeting transcripts and raw notes into structured summaries using AI, with integrations for the most common project management tools.

Portfolio demo built with **Nuxt 4** + **Anthropic Claude** + **OpenAI GPT-4o** + **Google Gemini**.

---

## Features

### Input

- **Paste text** — raw transcript or free-form notes
- **Upload file** — `.txt`, `.docx`, `.vtt` (Google Meet / Teams), `.srt` (Zoom)
- **Audio / Video transcription** — upload `.mp3`, `.mp4`, `.m4a`, `.wav`, `.webm`, `.ogg` and transcribe via OpenAI Whisper before analysis
- **Free notes mode** — write chaotic bullet points, abbreviations, fragments; a dedicated AI prompt structures them into a clean summary

### Analysis

- 3 AI providers — switch between **Claude**, **GPT-4o**, **Gemini** from the header
- Real-time streaming with progress bar
- **Compare mode** — analyse the same transcript with 2 providers simultaneously and view results side by side, with differences highlighted
- Structured output:
    - Executive summary
    - Action items with priority (high / medium / low), owner and deadline
    - Decisions made with rationale
    - Participants and key topics

### Results

- **Inline editing** — edit any field after analysis (meeting type, summary, action items, decisions, participants, topics); changes persist to history
- **Export** — copy as Markdown, download `.md` file, copy follow-up email
- **Calendar** — add individual deadlines or all at once to Google Calendar or Outlook (deep-links, no OAuth required)
- **Send to integrations** — push action items directly to Jira, Azure Boards, Linear or Notion

### History & Dashboard

- **History sidebar** — last 20 analyses persisted in `localStorage`; restore any past result with one click
- **Dashboard** (`/dashboard`) — aggregate metrics across all meetings: activity chart, action items per person, provider usage, top topics, priority breakdown, meeting types

### Integrations (`/integrations`)

Configure API credentials once; they are stored only in your browser's `localStorage` and never sent to any MinutAI server.

| Tool             | Auth method                     | What gets created                           |
| ---------------- | ------------------------------- | ------------------------------------------- |
| **Jira**         | Email + API token               | Task in any project                         |
| **Azure Boards** | Personal Access Token (PAT)     | Work item (Task / Bug / User Story / Issue) |
| **Linear**       | API key                         | Issue in any team                           |
| **Notion**       | Integration token + Database ID | Page in any database                        |

---

## File Map

### Files that existed in the original version

```
meeting-summarizer/
├── app/
│   ├── app.vue
│   ├── assets/css/main.css
│   ├── composables/
│   │   └── useSummarizer.ts        # SSE streaming + response parsing
│   └── pages/
│       └── index.vue               # Main UI
├── server/api/
│   └── summarize.post.ts           # Calls AI provider, streams SSE
├── nuxt.config.ts
├── package.json
├── tailwind.config.js
├── .env.example
└── .gitignore
```

### Files added during development

```
app/composables/
├── useCompare.ts                   # NEW — parallel provider comparison state
├── useTranscribe.ts                # NEW — Whisper upload with XHR progress tracking
├── useCalendar.ts                  # NEW — Google Calendar + Outlook deep-link generation
├── useIntegrations.ts              # NEW — reads localStorage config, calls integration endpoints
└── useHistory.ts                   # NEW — localStorage history helpers (used by dashboard)

app/pages/
├── dashboard.vue                   # NEW — metrics dashboard at /dashboard
└── integrations.vue                # NEW — credentials configuration at /integrations

server/api/
├── compare.post.ts                 # NEW — calls 2 providers in parallel (Promise.allSettled)
├── transcribe.post.ts              # NEW — multipart upload → OpenAI Whisper
└── integrations/
    ├── jira.post.ts                # NEW — Jira REST API v3
    ├── azure.post.ts               # NEW — Azure DevOps REST API v7.1 (JSON Patch)
    ├── linear.post.ts              # NEW — Linear GraphQL API
    └── notion.post.ts              # NEW — Notion REST API v2022-06-28
```

### Files modified during development

```
app/composables/
└── useSummarizer.ts                # MODIFIED — added InputType ('transcript' | 'free-notes')

app/pages/
└── index.vue                       # MODIFIED — major additions (see below)

server/api/
└── summarize.post.ts               # MODIFIED — two system prompts (transcript vs free-notes)
```

### Changes made to `index.vue`

The main page was extended incrementally. Additions in chronological order:

1. `.vtt` / `.srt` parser functions (`parseVtt`, `parseSrt`) — cleans subtitle files before analysis
2. History sidebar — `localStorage` persistence, up to 20 entries, restore on click
3. Compare mode — provider pair selector, parallel submission, side-by-side results with diff highlighting
4. Free notes tab — dedicated textarea with illustrative placeholder
5. Audio upload tab — dropzone, Whisper progress bar (upload + processing phases), post-transcription preview
6. Inline edit mode — all result fields become inputs; saves back to `localStorage` history
7. Export card — Markdown copy, `.md` download, follow-up email copy
8. Calendar links — per action item (Google + Outlook) and "Add all" batch button
9. Send to integrations card — appears only when integrations are configured in `/integrations`
10. Navigation — Dashboard, Integrations, History buttons added to header

---

## Tech Stack

| Layer               | Tech                                                  |
| ------------------- | ----------------------------------------------------- |
| Frontend + Backend  | Nuxt 4 (server routes)                                |
| AI — analysis       | Anthropic SDK · OpenAI SDK · Google Generative AI SDK |
| AI — transcription  | OpenAI Whisper (`whisper-1`) via multipart upload     |
| Styling             | CSS custom properties (no UI framework)               |
| `.docx` parsing     | mammoth (client-side)                                 |
| State / persistence | Vue `ref` / `computed` + `localStorage`               |

---

## Project Structure

```
meeting-summarizer/
├── app/
│   ├── app.vue
│   ├── assets/css/main.css
│   ├── composables/
│   │   ├── useSummarizer.ts        # SSE streaming, JSON parsing, InputType
│   │   ├── useCompare.ts           # Parallel provider comparison
│   │   ├── useTranscribe.ts        # Whisper upload + XHR progress tracking
│   │   ├── useCalendar.ts          # Deep-link generation + deadline date parsing
│   │   ├── useIntegrations.ts      # Integration config reader + API caller
│   │   └── useHistory.ts           # localStorage helpers
│   └── pages/
│       ├── index.vue               # Main app (analysis + all result features)
│       ├── dashboard.vue           # Aggregate metrics dashboard
│       └── integrations.vue        # Credentials configuration
├── server/api/
│   ├── summarize.post.ts           # Streaming analysis (2 system prompts)
│   ├── compare.post.ts             # Parallel 2-provider analysis
│   ├── transcribe.post.ts          # Whisper transcription endpoint
│   └── integrations/
│       ├── jira.post.ts
│       ├── azure.post.ts
│       ├── linear.post.ts
│       └── notion.post.ts
├── nuxt.config.ts
├── package.json
├── tailwind.config.js
├── .env.example
└── .gitignore
```

---

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` with your API key(s). You only need one AI provider to get started.

### 3. Run in development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Where to get API keys

| Provider      | Link                                                                 | Free tier                                |
| ------------- | -------------------------------------------------------------------- | ---------------------------------------- |
| Anthropic     | [console.anthropic.com](https://console.anthropic.com)               | ~$5 credits on sign-up                   |
| OpenAI        | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) | ~$5 credits for 3 months                 |
| Google Gemini | [aistudio.google.com/apikey](https://aistudio.google.com/apikey)     | **Generous free tier, no credit card** ✓ |

> **Recommendation:** Start with Gemini — it has the most generous free tier and requires no credit card.

> **Whisper note:** Audio/video transcription always uses OpenAI Whisper regardless of the selected analysis provider. An OpenAI API key is required for this feature.

### Integration credentials

| Tool         | Where to create credentials                                                                                        |
| ------------ | ------------------------------------------------------------------------------------------------------------------ |
| Jira         | [id.atlassian.com → Security → API tokens](https://id.atlassian.com/manage-profile/security/api-tokens)            |
| Azure Boards | Azure DevOps → User Settings → Personal Access Tokens (scope: Work Items Read & Write)                             |
| Linear       | [linear.app/settings/api](https://linear.app/settings/api)                                                         |
| Notion       | [notion.so/my-integrations](https://www.notion.so/my-integrations) — then share your database with the integration |

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Browser (Vue)                     │
│                                                      │
│  pages/index.vue        pages/dashboard.vue          │
│  pages/integrations.vue                              │
│                                                      │
│  composables/                                        │
│    useSummarizer.ts   useCompare.ts                  │
│    useTranscribe.ts   useCalendar.ts                 │
│    useIntegrations.ts useHistory.ts                  │
└────────────┬──────────────────────┬──────────────────┘
             │                      │
     POST /api/summarize    POST /api/compare
     POST /api/transcribe   POST /api/integrations/*
             │                      │
             ▼                      ▼
┌─────────────────────────────────────────────────────┐
│                  Nuxt Server Routes                  │
│                                                      │
│  summarize.post.ts   — streams SSE to client         │
│  compare.post.ts     — Promise.allSettled, 2 providers│
│  transcribe.post.ts  — multipart → Whisper API       │
│  integrations/       — proxies to external APIs      │
│    jira · azure · linear · notion                    │
└──────┬──────────┬──────────┬───────────┬─────────────┘
       │          │          │           │
       ▼          ▼          ▼           ▼
  Anthropic    OpenAI    Gemini     Jira / Azure /
  Claude       GPT-4o    Gemini     Linear / Notion
  Haiku        mini      2.5-flash  Whisper
```

---

## Deployment

```bash
npm run build
npm run preview
```

Supports deployment to Vercel, Railway, or any Node.js host with SSR support.

> **Note:** Integration API calls (Jira, Azure, Linear, Notion) are proxied through the Nuxt server to avoid CORS issues. Ensure your deployment environment has outbound network access to the respective external APIs.

---

_Built as a portfolio demo — Nuxt 4 + AI APIs_
