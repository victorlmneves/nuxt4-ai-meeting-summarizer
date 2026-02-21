<script setup lang="ts">
import type { IActionItem } from '#server/db/schema';

interface IProps {
    meetingId: string;
}

interface ICreateActionItemResponse {
    items: IActionItem[];
}

const props = defineProps<IProps>();

const items = ref<IActionItem[]>([]);
const isLoading = ref(false);
const error = ref('');
const isCreating = ref(false);

const newItemTitle = ref('');
const newItemDescription = ref('');
const newItemAssignee = ref('');
const newItemPriority = ref<'LOW' | 'MEDIUM' | 'HIGH'>('MEDIUM');

const loadItems = async () => {
    isLoading.value = true;
    error.value = '';
    try {
        items.value = await $fetch(`/api/action-items?meetingId=${props.meetingId}`);
    } catch (err: unknown) {
        console.error('Failed to load action items:', err);

        error.value = (err as Error).message || 'Failed to load action items';
    } finally {
        isLoading.value = false;
    }
};

const updateStatus = async (item: IActionItem, newStatus: string) => {
    try {
        const updated = await $fetch(`/api/action-items/${item.id}`, {
            method: 'PATCH',
            body: { status: newStatus },
        });

        const idx = items.value.findIndex((i: IActionItem) => i.id === item.id);

        if (idx >= 0) {
            items.value[idx] = updated as IActionItem;
        }
    } catch (err: unknown) {
        error.value = `Failed to update status: ${(err as Error).message}`;
    }
};

const createActionItem = async () => {
    if (!newItemTitle.value.trim()) {
        error.value = 'Title is required';

        return;
    }

    isCreating.value = true;
    error.value = '';

    try {
        const response = await $fetch('/api/action-items', {
            method: 'POST',
            body: {
                meetingId: props.meetingId,
                items: [
                    {
                        title: newItemTitle.value.trim(),
                        description: newItemDescription.value.trim() || undefined,
                        assignee: newItemAssignee.value.trim() || undefined,
                        priority: newItemPriority.value,
                    },
                ],
            },
        });

        if ((response as unknown as ICreateActionItemResponse).items && (response as unknown as ICreateActionItemResponse).items.length > 0) {
            await loadItems();

            // Reset form
            newItemTitle.value = '';
            newItemDescription.value = '';
            newItemAssignee.value = '';
            newItemPriority.value = 'MEDIUM';
        }
    } catch (err: unknown) {
        console.error('Failed to create action item:', err);

        error.value = `Failed to create action item: ${(err as Error).message}`;
    } finally {
        isCreating.value = false;
    }
};

const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) {
        return '';
    }

    try {
        return new Date(dateStr).toLocaleDateString('en-GB', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        });
    } catch {
        return dateStr;
    }
};

const getPriorityColor = (priority: string) => {
    switch (priority) {
        case 'HIGH':
            return 'priority-high';
        case 'MEDIUM':
            return 'priority-medium';
        case 'LOW':
            return 'priority-low';
        default:
            return 'priority-medium';
    }
};

onMounted(() => {
    loadItems();
});

watch(() => props.meetingId, () => {
    loadItems();
});
</script>

<template>
    <div class="action-items-list">
        <div class="header">
            <h3>Action Items</h3>
            <button v-if="items.length > 0" class="refresh-btn" :disabled="isLoading" @click="loadItems">
                🔄
            </button>
        </div>

        <div v-if="error" class="error">{{ error }}</div>

        <!-- Create New Action Item Form -->
        <div class="create-form">
            <div class="form-group">
                <input
                    v-model="newItemTitle"
                    type="text"
                    placeholder="New action item..."
                    class="form-input"
                    :disabled="isCreating"
                    @keypress.enter="createActionItem"
                />
            </div>

            <div class="form-group">
                <textarea
                    v-model="newItemDescription"
                    placeholder="Description (optional)"
                    class="form-textarea"
                    rows="2"
                    :disabled="isCreating"
                />
            </div>

            <div class="form-row">
                <div class="form-group">
                    <input
                        v-model="newItemAssignee"
                        type="text"
                        placeholder="Assignee (optional)"
                        class="form-input"
                        :disabled="isCreating"
                    />
                </div>

                <div class="form-group">
                    <select v-model="newItemPriority" class="form-select" :disabled="isCreating">
                        <option value="LOW">Low</option>
                        <option value="MEDIUM">Medium</option>
                        <option value="HIGH">High</option>
                    </select>
                </div>

                <button
                    class="btn-create"
                    :disabled="isCreating || !newItemTitle.trim()"
                    @click="createActionItem"
                >
                    {{ isCreating ? 'Creating...' : 'Add' }}
                </button>
            </div>
        </div>

        <!-- Loading State -->
        <div v-if="isLoading && !items.length" class="loading">Loading action items...</div>

        <!-- Empty State -->
        <div v-else-if="!items.length" class="empty">No action items yet</div>

        <!-- Items List -->
        <div v-else class="items">
            <div
                v-for="item in items"
                :key="item.id"
                class="item"
                :class="[item.status.toLowerCase(), getPriorityColor(item.priority)]"
            >
                <div class="item-header">
                    <input
                        type="checkbox"
                        :checked="item.status === 'DONE'"
                        class="item-checkbox"
                        @change="updateStatus(item, ($event.target).checked ? 'DONE' : 'TODO')"
                    />
                    <h4 class="item-title">{{ item.title }}</h4>
                    <a
                        v-if="item.externalUrl"
                        :href="item.externalUrl"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="external-link"
                        title="Open in external service"
                    >
                        ↗
                    </a>
                </div>

                <p v-if="item.description" class="item-description">{{ item.description }}</p>

                <div class="item-meta">
                    <span class="badge priority" :class="`priority-${item.priority.toLowerCase()}`">
                        {{ item.priority }}
                    </span>
                    <span v-if="item.assignee" class="badge assignee">👤 {{ item.assignee }}</span>
                    <span v-if="item.dueDate" class="badge due-date">📅 {{ formatDate(item.dueDate) }}</span>
                    <span v-if="item.externalService" class="badge external">
                        <span class="service-name">{{ item.externalService }}</span>
                        ({{ item.externalServiceId }})
                    </span>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.action-items-list {
    padding: 20px;
    background: white;
    border-radius: 8px;
    border: 1px solid var(--color-border, #e5e7eb);
}

.header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
}

.header h3 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
}

.refresh-btn {
    padding: 6px 12px;
    background: transparent;
    border: 1px solid var(--color-border, #e5e7eb);
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
    transition: background 0.2s;
}

.refresh-btn:hover:not(:disabled) {
    background: var(--color-gray-50, #f9fafb);
}

.refresh-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

.error {
    padding: 12px;
    background: var(--color-red-50, #fef2f2);
    color: var(--color-red-700, #b91c1c);
    border: 1px solid var(--color-red-200, #fecaca);
    border-radius: 6px;
    font-size: 13px;
    margin-bottom: 12px;
}

.create-form {
    padding: 12px;
    background: var(--color-gray-50, #f9fafb);
    border: 1px solid var(--color-border, #e5e7eb);
    border-radius: 6px;
    margin-bottom: 16px;
}

.form-group {
    margin-bottom: 12px;
}

.form-input,
.form-textarea,
.form-select {
    width: 100%;
    padding: 8px 12px;
    border: 1px solid var(--color-border, #e5e7eb);
    border-radius: 4px;
    font-size: 13px;
    font-family: inherit;
}

.form-textarea {
    resize: vertical;
}

.form-input:focus,
.form-textarea:focus,
.form-select:focus {
    outline: none;
    border-color: var(--color-accent, #0066cc);
    box-shadow: 0 0 0 3px rgba(0, 102, 204, 0.1);
}

.form-input:disabled,
.form-textarea:disabled,
.form-select:disabled {
    background: var(--color-gray-100, #f3f4f6);
    cursor: not-allowed;
}

.form-row {
    display: grid;
    grid-template-columns: 1fr 120px 80px;
    gap: 8px;
}

.btn-create {
    padding: 8px 12px;
    background: var(--color-accent, #0066cc);
    color: white;
    border: none;
    border-radius: 4px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: opacity 0.2s;
    align-self: flex-end;
}

.btn-create:hover:not(:disabled) {
    opacity: 0.9;
}

.btn-create:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}

.loading {
    padding: 20px;
    text-align: center;
    color: var(--text-muted, #6b7280);
    font-size: 13px;
}

.empty {
    padding: 20px;
    text-align: center;
    color: var(--text-muted, #6b7280);
    font-size: 13px;
}

.items {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.item {
    padding: 12px;
    background: white;
    border: 1px solid var(--color-border, #e5e7eb);
    border-radius: 6px;
    border-left: 4px solid var(--color-accent, #0066cc);
    transition: background 0.2s;
}

.item.done {
    opacity: 0.65;
    background: var(--color-gray-50, #f9fafb);
}

.item.done .item-title {
    text-decoration: line-through;
    color: var(--text-muted, #6b7280);
}

.item.priority-high {
    border-left-color: var(--color-red-500, #ef4444);
}

.item.priority-medium {
    border-left-color: var(--color-yellow-500, #eab308);
}

.item.priority-low {
    border-left-color: var(--color-green-500, #22c55e);
}

.item-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
}

.item-checkbox {
    width: 18px;
    height: 18px;
    cursor: pointer;
    flex-shrink: 0;
    accent-color: var(--color-accent, #0066cc);
}

.item-title {
    margin: 0;
    flex: 1;
    font-size: 14px;
    font-weight: 500;
}

.external-link {
    color: var(--color-accent, #0066cc);
    text-decoration: none;
    font-size: 14px;
    cursor: pointer;
    transition: opacity 0.2s;
}

.external-link:hover {
    opacity: 0.7;
}

.item-description {
    margin: 8px 0 0 26px;
    font-size: 13px;
    color: var(--text-muted, #6b7280);
    line-height: 1.4;
}

.item-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 8px;
    margin-left: 26px;
}

.badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    background: white;
    border: 1px solid var(--color-border, #e5e7eb);
    border-radius: 4px;
    font-size: 12px;
    white-space: nowrap;
}

.badge.priority {
    border: none;
    font-weight: 500;
}

.badge.priority-high {
    background: var(--color-red-100, #fee2e2);
    color: var(--color-red-700, #b91c1c);
}

.badge.priority-medium {
    background: var(--color-yellow-100, #fef3c7);
    color: var(--color-yellow-700, #92400e);
}

.badge.priority-low {
    background: var(--color-green-100, #dcfce7);
    color: var(--color-green-700, #15803d);
}

.badge.assignee {
    background: var(--color-blue-50, #eff6ff);
    color: var(--color-blue-700, #1e40af);
    border-color: var(--color-blue-200, #bfdbfe);
}

.badge.due-date {
    background: var(--color-purple-50, #faf5ff);
    color: var(--color-purple-700, #6b21a8);
    border-color: var(--color-purple-200, #e9d5ff);
}

.badge.external {
    background: var(--color-green-50, #f0fdf4);
    color: var(--color-green-700, #15803d);
    border-color: var(--color-green-200, #bbf7d0);
}

.service-name {
    font-weight: 500;
    text-transform: capitalize;
}

@media (max-width: 768px) {
    .form-row {
        grid-template-columns: 1fr;
    }

    .item-meta {
        margin-left: 0;
    }

    .item-description {
        margin-left: 0;
    }
}
</style>
