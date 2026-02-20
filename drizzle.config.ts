import { defineConfig } from 'drizzle-kit';

export default defineConfig({
    schema: './server/db/schema.ts',
    out: './server/db/migrations',
    dialect: 'turso',
    dbCredentials: {
        url: process.env.TURSO_DB_URL || 'file:./data/minutai.db',
        authToken: process.env.TURSO_AUTH_TOKEN,
    },
});
