# MinutAI — Meeting Intelligence

Transforms meeting transcripts and raw notes into structured summaries using AI, with integrations for the most common project management tools.

Portfolio demo built with **Nuxt 4** + **Anthropic Claude** + **OpenAI GPT-4o** + **Google Gemini** + **Turso (LibSQL)** + **Drizzle ORM**.

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

- **Inline editing** — edit any field after analysis (meeting type, summary, action items, decisions, participants, topics); changes persist to the database
- **Export** — copy as Markdown, download `.md` file, copy follow-up email
- **Calendar** — add individual deadlines or all at once to Google Calendar or Outlook (deep-links, no OAuth required)
- **Send to integrations** — push action items directly to Jira, Azure Boards, Linear or Notion

### History & Dashboard

- **History sidebar** — all analyses persisted server-side in Turso (SQLite); paginated, restore any past result with one click
- **Dashboard** (`/dashboard`) — aggregate metrics across all meetings: activity chart, action items per person, provider usage, top topics, priority breakdown, meeting types
- **Auto-migration** — existing `localStorage` history is automatically migrated to the database on first load

### Integrations (`/integrations`)

Configure API credentials once; they are stored server-side in the database (per session) and proxied to external APIs.

| Tool             | Auth method                     | What gets created                           |
| ---------------- | ------------------------------- | ------------------------------------------- |
| **Jira**         | Email + API token               | Task in any project                         |
| **Azure Boards** | Personal Access Token (PAT)     | Work item (Task / Bug / User Story / Issue) |
| **Linear**       | API key                         | Issue in any team                           |
| **Notion**       | Integration token + Database ID | Page in any database                        |

---

## Project Structure

```
nuxt4-ai-meeting-summarizer/
├── app/
│   ├── app.vue
│   ├── assets/css/main.css
│   ├── types/
│   │   └── index.ts                # Shared interfaces (IHistoryEntry, IMeetingSummary, IActionItem, etc.)
│   ├── composables/
│   │   ├── useSummarizer.ts        # SSE streaming, JSON parsing, InputType
│   │   ├── useCompare.ts           # Parallel provider comparison
│   │   ├── useTranscribe.ts        # Whisper upload + XHR progress tracking
│   │   ├── useCalendar.ts          # Deep-link generation + deadline date parsing
│   │   ├── useIntegrations.ts      # Integration config — server API + localStorage fallback
│   │   └── useHistory.ts           # History — server API, pagination, localStorage migration
│   └── pages/
│       ├── index.vue               # Main app (analysis + all result features)
│       ├── dashboard.vue           # Aggregate metrics dashboard
│       └── integrations.vue        # Credentials configuration
├── server/
│   ├── db/
│   │   ├── schema.ts               # Drizzle schema — users, meetings, integrations_config
│   │   └── migrations/             # Auto-generated SQL migrations (drizzle-kit)
│   ├── utils/
│   │   └── db.ts                   # LibSQL + Drizzle singleton (Turso in prod, local file in dev)
│   ├── plugins/
│   │   └── migrate.ts              # Runs pending migrations on server boot
│   └── api/
│       ├── summarize.post.ts       # Streaming analysis (2 system prompts)
│       ├── compare.post.ts         # Parallel 2-provider analysis
│       ├── transcribe.post.ts      # Whisper transcription endpoint
│       ├── history/
│       │   ├── index.get.ts        # GET  /api/history          — paginated list
│       │   ├── index.post.ts       # POST /api/history          — create entry
│       │   ├── bulk.post.ts        # POST /api/history/bulk     — bulk import (localStorage migration)
│       │   ├── [id].get.ts         # GET  /api/history/:id      — single entry
│       │   ├── [id].patch.ts       # PATCH /api/history/:id     — update summary
│       │   └── [id].delete.ts      # DELETE /api/history/:id    — remove entry
│       └── integrations/
│           ├── config.get.ts       # GET /api/integrations/config  — load config
│           ├── config.put.ts       # PUT /api/integrations/config  — save config
│           ├── jira.post.ts        # Jira REST API v3
│           ├── azure.post.ts       # Azure DevOps REST API v7.1 (JSON Patch)
│           ├── linear.post.ts      # Linear GraphQL API
│           └── notion.post.ts      # Notion REST API v2022-06-28
├── drizzle.config.ts
├── nuxt.config.ts
├── package.json
├── tailwind.config.js
├── .env.example
└── .gitignore
```

---

## Tech Stack

| Layer               | Tech                                                       |
| ------------------- | ---------------------------------------------------------- |
| Frontend + Backend  | Nuxt 4 (server routes / Nitro)                             |
| AI — analysis       | Anthropic SDK · OpenAI SDK · Google Generative AI SDK      |
| AI — transcription  | OpenAI Whisper (`whisper-1`) via multipart upload          |
| Database            | **Turso** (LibSQL / SQLite) — free tier, 9 GB, no infra    |
| ORM                 | **Drizzle ORM** + drizzle-kit (schema, migrations, studio) |
| Auth (planned)      | `nuxt-auth-utils` — OAuth (GitHub / Google), Phase 4       |
| Styling             | CSS custom properties (no UI framework)                    |
| `.docx` parsing     | mammoth (client-side)                                      |
| State               | Vue `ref` / `computed`                                     |

---

## Getting Started

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` with your API key(s):

```env
# At least one AI provider is required
GEMINI_API_KEY=AIza...          # Recommended — generous free tier, no credit card

# Database — leave blank in development (uses a local ./data/minutai.db file)
TURSO_DB_URL=                   # libsql://your-db.turso.io  (production)
TURSO_AUTH_TOKEN=               # Turso auth token           (production)

# Session encryption — required (min 32 chars)
# Generate with: openssl rand -base64 32
NUXT_SESSION_PASSWORD=
```

### 3. Run in development

```bash
pnpm dev
```

The server will **automatically create `./data/minutai.db`** and run migrations on first boot. No manual database setup needed for local development.

Open [http://localhost:3000](http://localhost:3000)

### 4. Database scripts

```bash
pnpm db:generate   # Generate a new migration after schema changes
pnpm db:migrate    # Apply pending migrations manually
pnpm db:studio     # Open Drizzle Studio to browse data
```

---

## Where to get API keys

| Provider      | Link                                                                 | Free tier                                |
| ------------- | -------------------------------------------------------------------- | ---------------------------------------- |
| Anthropic     | [console.anthropic.com](https://console.anthropic.com)               | ~$5 credits on sign-up                   |
| OpenAI        | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) | ~$5 credits for 3 months                 |
| Google Gemini | [aistudio.google.com/apikey](https://aistudio.google.com/apikey)     | **Generous free tier, no credit card** ✓ |
| Turso         | [turso.tech](https://turso.tech)                                     | **Free — 9 GB, 500 DBs, 1B reads/month** |

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
┌───────────────────────────────────────────────────-──┐
│                    Browser (Vue)                     │
│                                                      │
│  pages/index.vue        pages/dashboard.vue          │
│  pages/integrations.vue                              │
│                                                      │
│  composables/                                        │
│    useSummarizer.ts   useCompare.ts                  │
│    useTranscribe.ts   useCalendar.ts                 │
│    useIntegrations.ts useHistory.ts                  │
└────────────┬────────────────────────┬────────────────┘
             │                        │
     AI + History APIs        Integration APIs
     POST /api/summarize       POST /api/integrations/*
     GET  /api/history         GET|PUT /api/integrations/config
     POST /api/history
             │                        │
             ▼                        ▼
┌──────────────────────────────────────────────--───────-┐
│                  Nuxt Server / Nitro                   │
│                                                        │
│  summarize.post.ts   — streams SSE to client           │
│  compare.post.ts     — Promise.allSettled, 2 providers │
│  transcribe.post.ts  — multipart → Whisper API         │
│  history/            — CRUD via Drizzle ORM            │
│  integrations/       — config CRUD + API proxies       │
│    config · jira · azure · linear · notion             │
│                                                        │
│  plugins/migrate.ts  — runs DB migrations on boot      │
│  utils/db.ts         — Drizzle + LibSQL singleton      │
└──────┬──────────────────────────────────────────────--─┘
       │
       ├──► Anthropic Claude · OpenAI GPT-4o · Gemini
       ├──► OpenAI Whisper
       ├──► Turso (LibSQL / SQLite) ──── meetings
       │                            ──── integrations_config
       │                            ──── users (reserved for auth)
       └──► Jira · Azure Boards · Linear · Notion
```

---

## Roadmap

- [x] Multi-provider AI analysis (Claude, GPT-4o, Gemini)
- [x] Compare mode (side-by-side diff)
- [x] Audio/video transcription (Whisper)
- [x] Free notes mode
- [x] Inline editing
- [x] Export (Markdown, email)
- [x] Calendar deep-links
- [x] Integrations (Jira, Azure, Linear, Notion)
- [x] Dashboard with aggregate metrics
- [x] Server-side persistence (Turso + Drizzle ORM)
- [ ] OAuth authentication (GitHub / Google) via `nuxt-auth-utils` — Phase 4
- [ ] Per-user data isolation after login
- [ ] Direct action item creation from the result UI (post-auth)

---

## Deployment

```bash
pnpm build
pnpm preview
```

Supports deployment to **Vercel**, **Railway**, or any Node.js host with SSR support.

For production, set `TURSO_DB_URL` and `TURSO_AUTH_TOKEN` in your environment to use a hosted Turso database instead of the local SQLite fallback.

---

_Built as a portfolio demo — Nuxt 4 + AI APIs + Turso + Drizzle_
