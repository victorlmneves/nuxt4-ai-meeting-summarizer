// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
    compatibilityDate: '2026-02-19',

    // Nuxt 4 uses the app/ directory by default
    future: {
        compatibilityVersion: 4,
    },

    modules: ['@nuxtjs/tailwindcss'],

    devtools: { enabled: true },

    autoImport: true,

    css: ['~/assets/css/main.css'],

    runtimeConfig: {
        // Server-side only — never exposed to the client
        anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
        openaiApiKey: process.env.OPENAI_API_KEY || '',
        geminiApiKey: process.env.GEMINI_API_KEY || '',
    },
});
