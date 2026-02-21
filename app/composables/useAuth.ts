import type { IUser } from '#server/db/schema';

interface IAuthSession {
    user?: IUser & {
        provider: string;
    };
}

export const useAuth = () => {
    const user = useState<(IUser & { provider: string }) | null>('auth.user', () => null);
    const isLoading = useState<boolean>('auth.isLoading', () => false);
    const error = useState<string>('auth.error', () => '');

    /**
     * Fetch current session from server
     * @returns {Promise<IUser & { provider: string } | null>} The authenticated user or null
     */
    const fetchSession = async () => {
        try {
            const session = await $fetch<IAuthSession>('/api/auth/session');

            user.value = session?.user || null;
            error.value = '';

            return session?.user || null;
        } catch (err: unknown) {
            user.value = null;
            error.value = (err instanceof Error && 'data' in err ? (err as { data?: { message?: string } })?.data?.message : undefined) as string || 'Failed to fetch session';

            return null;
        }
    };

    /**
     * Redirect to OAuth provider login
     * Delegates to nuxt-auth-utils endpoints which handle the OAuth flow
     * @param {string} provider - The OAuth provider ('github' or 'google')
     */
    const login = async (provider: 'github' | 'google') => {
        // nuxt-auth-utils automatically creates /api/auth/[provider] endpoints
        // that handle OAuth code exchange and session setup
        window.location.href = `/api/auth/${provider}`;
    };

    /**
     * Logout and clear session
     */
    const logout = async () => {
        isLoading.value = true;
        error.value = '';

        try {
            await $fetch('/api/auth/logout', { method: 'POST' });
            user.value = null;
            await navigateTo('/');
        } catch (err: unknown) {
            console.error('Logout failed:', err);

            error.value = (err instanceof Error && 'data' in err ? (err as { data?: { message?: string } })?.data?.message : undefined) as string || 'Logout failed';
        } finally {
            isLoading.value = false;
        }
    };

    // Initialize session on mount
    if (process.client) {
        onMounted(() => {
            fetchSession();
        });
    }

    return {
        user: readonly(user),
        isLoading: readonly(isLoading),
        error: readonly(error),
        login,
        logout,
        fetchSession,
    };
};
