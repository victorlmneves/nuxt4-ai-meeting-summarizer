<script setup lang="ts">
const { user, login, logout } = useAuth();
const isOpen = ref(false);

const providers = [
    { name: 'GitHub', id: 'github', icon: 'github' },
    { name: 'Google', id: 'google', icon: 'google' },
] as const;

const handleLogin = async (provider: 'github' | 'google') => {
    isOpen.value = false;
    await login(provider);
};
</script>

<template>
    <div class="auth-button">
        <!-- Authenticated: Show user menu -->
        <template v-if="user">
            <div class="user-menu">
                <img
                    v-if="user.avatarUrl"
                    :src="user.avatarUrl"
                    :alt="user.name || user.email"
                    class="avatar"
                />
                <span v-else class="avatar-placeholder">{{ (user.name || user.email)?.[0]?.toUpperCase() }}</span>
                <span class="name">{{ user.name || user.email }}</span>
                <button class="logout-btn" @click="logout">Sign out</button>
            </div>
        </template>

        <!-- Not authenticated: Show login options -->
        <template v-else>
            <div class="login-menu">
                <button class="menu-toggle" @click="isOpen = !isOpen">
                    Sign in
                </button>
                <Transition name="dropdown">
                    <div v-if="isOpen" class="dropdown" @click.stop="isOpen = false">
                        <button
                            v-for="provider in providers"
                            :key="provider.id"
                            class="provider-btn"
                            @click="handleLogin(provider.id)"
                        >
                            <span class="provider-icon">{{ provider.name[0] }}</span>
                            {{ provider.name }}
                        </button>
                    </div>
                </Transition>
            </div>
        </template>
    </div>
</template>

<style scoped>
.auth-button {
    display: inline-block;
}

.user-menu {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 0;
}

.avatar,
.avatar-placeholder {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 500;
    font-size: 13px;
    color: white;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.avatar {
    object-fit: cover;
}

.name {
    font-size: 13px;
    font-weight: 500;
    color: var(--text-default);
}

.logout-btn {
    padding: 6px 12px;
    background: var(--color-red-500, #ef4444);
    color: white;
    border: none;
    border-radius: 4px;
    font-size: 12px;
    cursor: pointer;
    font-weight: 500;
    transition: opacity 0.2s;
}

.logout-btn:hover {
    opacity: 0.9;
}

.menu-toggle {
    padding: 8px 12px;
    background: var(--color-accent, #0066cc);
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: opacity 0.2s;
}

.menu-toggle:hover {
    opacity: 0.9;
}

.login-menu {
    position: relative;
}

.dropdown {
    position: absolute;
    top: 100%;
    right: 0;
    margin-top: 8px;
    background: var(--color-panel, #0f1220);
    border: 1px solid var(--color-border-strong, rgba(255, 255, 255, 0.08));
    border-radius: 12px;
    box-shadow: 0 16px 36px rgba(0, 0, 0, 0.45);
    z-index: 1000;
    min-width: 180px;
    padding: 6px;
    backdrop-filter: blur(8px);
}

.provider-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    width: 100%;
    text-align: left;
    background: none;
    border: none;
    cursor: pointer;
    font-size: 13px;
    color: var(--text-default, #e6e9f2);
    border-radius: 8px;
    transition: background 0.2s;
}

.provider-btn:hover {
    background: rgba(255, 255, 255, 0.06);
}

.provider-btn:active {
    background: rgba(255, 255, 255, 0.12);
}

.provider-icon {
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border-radius: 4px;
    font-size: 10px;
    font-weight: bold;
    box-shadow: 0 4px 10px rgba(102, 126, 234, 0.35);
}

.dropdown-enter-active,
.dropdown-leave-active {
    transition: all 0.15s ease;
}

.dropdown-enter-from,
.dropdown-leave-to {
    opacity: 0;
    transform: translateY(-4px);
}
</style>
