-- ───────────────────────────────────────────────────────────────────────────
-- Migration 0001: Add action items table and enhance existing schema
-- ───────────────────────────────────────────────────────────────────────────

-- Add updatedAt to users table (if not already present)
ALTER TABLE users ADD COLUMN updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Add createdAt to integrations_config table (if not already present)
ALTER TABLE integrations_config ADD COLUMN created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Create action_items table
CREATE TABLE IF NOT EXISTS action_items (
    id TEXT PRIMARY KEY,
    meeting_id TEXT NOT NULL,
    user_id TEXT,
    title TEXT NOT NULL,
    description TEXT,
    assignee TEXT,
    due_date TEXT,
    priority TEXT NOT NULL DEFAULT 'MEDIUM',
    status TEXT NOT NULL DEFAULT 'TODO',
    external_service TEXT,
    external_service_id TEXT,
    external_url TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Create indexes for action_items
CREATE INDEX IF NOT EXISTS action_items_meeting_id_idx ON action_items(meeting_id);
CREATE INDEX IF NOT EXISTS action_items_user_id_idx ON action_items(user_id);
CREATE INDEX IF NOT EXISTS action_items_external_service_idx ON action_items(external_service);

-- Create indexes for users for better query performance
CREATE INDEX IF NOT EXISTS users_email_idx ON users(email);
CREATE INDEX IF NOT EXISTS users_provider_idx ON users(provider);

-- Create indexes for meetings for data filtering
CREATE INDEX IF NOT EXISTS meetings_user_id_idx ON meetings(user_id);
CREATE INDEX IF NOT EXISTS meetings_date_idx ON meetings(date);

-- Create indexes for integrations_config for per-service lookups
CREATE INDEX IF NOT EXISTS integrations_config_user_id_idx ON integrations_config(user_id);
CREATE INDEX IF NOT EXISTS integrations_config_service_idx ON integrations_config(service);

-- Add unique constraint to integrations_config (if not already present)
-- Note: SQLite doesn't support adding unique constraints via ALTER, so this is a guide
-- Run this manually if needed: CREATE UNIQUE INDEX integrations_config_user_service_uq ON integrations_config(user_id, service);
