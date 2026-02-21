import { useDb } from '#server/utils/db';
import { users } from '#server/db/schema';
import { eq, and } from 'drizzle-orm';

export default defineOAuthGitHubEventHandler({
    config: {
        emailRequired: true,
    },
    async onSuccess(event, { user: githubUser }) {
        const db = useDb();

        // Find or create user
        const existing = await db
            .select()
            .from(users)
            .where(and(eq(users.provider, 'github'), eq(users.providerAccountId, String(githubUser.id))))
            .get();

        let userId: string;

        if (existing) {
            // Update existing user
            userId = existing.id;
            await db
                .update(users)
                .set({
                    name: githubUser.name || existing.name,
                    email: githubUser.email,
                    avatarUrl: githubUser.avatar_url,
                    updatedAt: new Date().toISOString(),
                })
                .where(eq(users.id, userId));
        } else {
            // Create new user
            userId = crypto.randomUUID();
            await db.insert(users).values({
                id: userId,
                provider: 'github',
                providerAccountId: String(githubUser.id),
                name: githubUser.name || null,
                email: githubUser.email,
                avatarUrl: githubUser.avatar_url,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            });
        }

        // Set session
        await setUserSession(event, {
            user: {
                id: userId,
                provider: 'github',
                providerAccountId: String(githubUser.id),
                name: githubUser.name || null,
                email: githubUser.email,
                avatarUrl: githubUser.avatar_url,
            },
        });

        // Redirect to home
        return sendRedirect(event, '/');
    },
});
