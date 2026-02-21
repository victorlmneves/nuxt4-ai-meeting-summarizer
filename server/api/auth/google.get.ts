import { useDb } from '#server/utils/db';
import { users } from '#server/db/schema';
import { eq, and } from 'drizzle-orm';

export default defineOAuthGoogleEventHandler({
    config: {
        emailRequired: true,
    },
    async onSuccess(event, { user: googleUser }) {
        const db = useDb();

        // Find or create user
        const existing = await db
            .select()
            .from(users)
            .where(and(eq(users.provider, 'google'), eq(users.providerAccountId, googleUser.sub)))
            .get();

        let userId: string;

        if (existing) {
            // Update existing user
            userId = existing.id;
            await db
                .update(users)
                .set({
                    name: googleUser.name || existing.name,
                    email: googleUser.email,
                    avatarUrl: googleUser.picture,
                    updatedAt: new Date().toISOString(),
                })
                .where(eq(users.id, userId));
        } else {
            // Create new user
            userId = crypto.randomUUID();
            await db.insert(users).values({
                id: userId,
                provider: 'google',
                providerAccountId: googleUser.sub,
                name: googleUser.name || null,
                email: googleUser.email,
                avatarUrl: googleUser.picture,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            });
        }

        // Set session
        await setUserSession(event, {
            user: {
                id: userId,
                provider: 'google',
                providerAccountId: googleUser.sub,
                name: googleUser.name || null,
                email: googleUser.email,
                avatarUrl: googleUser.picture,
            },
        });

        // Redirect to home
        return sendRedirect(event, '/');
    },
});
