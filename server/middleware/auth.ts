/**
 * Auth middleware: Syncs OAuth users to database on each request
 * Runs after nuxt-auth-utils establishes session
 */
import { defineEventHandler, type H3Event } from 'h3';
import { useDb } from '#server/utils/db';
import { users } from '#server/db/schema';
import { eq } from 'drizzle-orm';

export default defineEventHandler(async (event: H3Event) => {
    // Get session from nuxt-auth-utils
    const session = await getUserSession(event);

    if (!session?.user?.id) {
        // Not authenticated
        return;
    }

    const user = session.user;
    const db = useDb();

    try {
        // Check if user exists in DB
        const existing = await db.query.users.findFirst({
            where: eq(users.id, user.id),
        });

        if (!existing) {
            // First login — create user record
            await db.insert(users).values({
                id: user.id,
                provider: user.provider || 'unknown',
                providerAccountId: user.providerAccountId || user.id,
                email: user.email || '',
                name: user.name || '',
                avatarUrl: user.image || '',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            }).catch((err) => {
                // Silently fail if user already exists (race condition)
                console.error('[Auth Middleware] Failed to insert user:', err.message);
            });
        } else if (
            existing.updatedAt &&
            new Date(existing.updatedAt).getTime() < Date.now() - 1000 * 60 * 60
        ) {
            // Update user profile if not updated in last hour
            await db
                .update(users)
                .set({
                    name: user.name || existing.name,
                    avatarUrl: user.image || existing.avatarUrl,
                    updatedAt: new Date().toISOString(),
                })
                .where(eq(users.id, user.id))
                .catch((err) => {
                    console.error('[Auth Middleware] Failed to update user:', err.message);
                });
        }
    } catch (error) {
        console.error('[Auth Middleware] Error:', error);
        // Don't throw — continue anyway
    }
});
