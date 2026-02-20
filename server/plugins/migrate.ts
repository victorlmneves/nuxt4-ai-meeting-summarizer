import { migrate } from 'drizzle-orm/libsql/migrator';
import { useDb } from '#server/utils/db';
import { defineNitroPlugin } from 'nitropack';

// ── Auto-migrate on server startup ────────────────────────────────────────────
// Runs pending migrations from server/db/migrations/ each time Nitro starts.
// Safe to run on every boot — only applies new migrations.

export default defineNitroPlugin(async () => {
    try {
        const db = useDb();

        await migrate(db, { migrationsFolder: './server/db/migrations' });

        // eslint-disable-next-line no-console
        console.info('[db] Migrations applied successfully.');
    } catch (err) {
        console.error('[db] Migration failed:', err);

        throw err;
    }
});
