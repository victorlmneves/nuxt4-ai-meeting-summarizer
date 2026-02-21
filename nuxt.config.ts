// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
    compatibilityDate: '2026-02-19',

    // Nuxt 4 uses the app/ directory by default
    future: {
        compatibilityVersion: 4,
    },

    modules: ['@nuxtjs/tailwindcss', 'nuxt-auth-utils'],

    devtools: { enabled: true },

    css: ['~/assets/css/main.css'],

    runtimeConfig: {
        // Server-side only — never exposed to the client
        anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
        openaiApiKey: process.env.OPENAI_API_KEY || '',
        geminiApiKey: process.env.GEMINI_API_KEY || '',

        // Turso (LibSQL) — falls back to a local SQLite file in development
        tursoDbUrl: process.env.TURSO_DB_URL || '',
        tursoAuthToken: process.env.TURSO_AUTH_TOKEN || '',

        // nuxt-auth-utils session secret (min 32 chars)
        // Set NUXT_SESSION_PASSWORD in .env for production
        session: {
            password: process.env.NUXT_SESSION_PASSWORD || 'dev-secret-must-be-32-characters-long',
        },

        // OAuth provider configs (Phase 2)
        oauth: {
            github: {
                id: process.env.NUXT_OAUTH_GITHUB_CLIENT_ID || '',
                secret: process.env.NUXT_OAUTH_GITHUB_CLIENT_SECRET || '',
            },
            google: {
                id: process.env.NUXT_OAUTH_GOOGLE_CLIENT_ID || '',
                secret: process.env.NUXT_OAUTH_GOOGLE_CLIENT_SECRET || '',
            },
        },

        // Public runtime config (safe to expose to client)
        public: {
            siteUrl: process.env.NUXT_PUBLIC_SITE_URL || 'http://localhost:3000',
        },
    },

    // Nitro server configuration
    nitro: {
        prerender: {
            crawlLinks: false,
        },
    },
});
