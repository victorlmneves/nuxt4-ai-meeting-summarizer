// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
    compatibilityDate: '2026-02-19',

    // Nuxt 4 uses the app/ directory by default
    future: {
        compatibilityVersion: 4,
    },

    modules: ['@nuxtjs/tailwindcss', 'nuxt-auth-utils'],

    devtools: { enabled: true },

    autoImport: true,

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
            password: process.env.NUXT_SESSION_PASSWORD || '',
        },
    },
});
