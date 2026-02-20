import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import { mkdirSync } from 'node:fs';
import * as schema from '#server/db/schema';

// ── Singleton ─────────────────────────────────────────────────────────────────
// Re-used across all server requests within the same Nitro process.
// In development, falls back to a local SQLite file when TURSO_DB_URL is unset.

let _db: ReturnType<typeof drizzle> | null = null;

/**
 * Returns true when the URL looks like an unfilled placeholder.
 * @param {string} url - The URL string to check.
 * @returns {boolean} true if the URL is a placeholder, false otherwise.
 */
function isPlaceholder(url: string): boolean {
    return !url || url.includes('your-db-name') || url === 'libsql://';
}

export function useDb() {
    if (_db) {
        return _db;
    }

    const config = useRuntimeConfig();

    const rawUrl = config.tursoDbUrl as string;
    const useLocal = isPlaceholder(rawUrl);

    const url = useLocal ? 'file:./data/minutai.db' : rawUrl;
    const authToken = !useLocal ? (config.tursoAuthToken as string | undefined) : undefined;

    // Ensure the local data directory exists before creating a file-based client
    if (useLocal) {
        mkdirSync('./data', { recursive: true });
    }

    const client = createClient({
        url,
        ...(authToken ? { authToken } : {}),
    });

    _db = drizzle(client, { schema });

    return _db;
}
