# Integration Setup Guide

This guide will help you set up and configure integrations with external services to automatically create action items from your meeting summaries.

## Supported Services

- **Jira** - Create tasks in Jira projects
- **Linear** - Create issues in Linear teams
- **Notion** - Create database entries in Notion
- **Azure DevOps** - Create work items in Azure DevOps

## General Setup Process

1. **Save Configuration**: Use `PUT /api/integrations/config` to save your integration credentials
2. **Test Connection**: Use `POST /api/integrations/{service}/test` to verify your credentials
3. **Create Action Items**: Use `POST /api/action-items` with `pushToService` parameter
4. **Track Status**: Status changes sync automatically to the external service

---

## Jira Setup

### Prerequisites
- Jira Cloud account (Server/Data Center may require different setup)
- Project access

### Steps

1. **Get API Token**
   - Go to https://id.atlassian.com/manage-profile/security/api-tokens
   - Click "Create API token"
   - Copy the generated token

2. **Get Your Email**
   - From your Jira account, copy your email address

3. **Get Base URL**
   - Your Jira base URL looks like: `https://your-domain.atlassian.net`
   - Don't include trailing slashes

4. **Get Project Key**
   - Go to your project settings
   - Find the project key (e.g., `PROJ`, `ABC`, `TEAM`)

5. **Save Configuration**
   ```json
   {
     "jira": {
       "enabled": true,
       "baseUrl": "https://your-domain.atlassian.net",
       "email": "your-email@example.com",
       "apiToken": "your-api-token-here",
       "projectKey": "PROJ",
       "issueType": "Task"  // optional, defaults to 'Task'
     }
   }
   ```

6. **Test Connection**
   ```bash
   POST /api/integrations/jira/test
   Body: { "baseUrl", "email", "apiToken", "projectKey" }
   ```

### Creating Action Items
When creating action items, include `pushToService: "jira"`:

```json
{
  "meetingId": "meeting-123",
  "items": [
    {
      "title": "Fix login bug",
      "description": "Users report login fails with special characters",
      "priority": "HIGH",
      "assignee": "john@example.com"
    }
  ],
  "pushToService": "jira"
}
```

### Supported Features
- ✅ Create issues with title, description, priority
- ✅ Set due dates
- ✅ Auto-sync status updates (TODO → In Progress → Done)
- ✅ Custom issue types

---

## Linear Setup

### Prerequisites
- Linear workspace account
- Team ID

### Steps

1. **Get API Key**
   - Go to https://linear.app/settings/api
   - Click "Create new" for a personal API key
   - Copy the key

2. **Get Team ID**
   - Go to your Linear workspace: https://linear.app/[workspace]/settings/teams
   - Copy your team ID
   - Or open any issue - team ID is in the URL

3. **Save Configuration**
   ```json
   {
     "linear": {
       "enabled": true,
       "apiKey": "lin_[...]",
       "teamId": "team-[...]"
     }
   }
   ```

4. **Test Connection**
   ```bash
   POST /api/integrations/linear/test
   Body: { "apiKey", "teamId" }
   ```

### Creating Action Items
```json
{
  "meetingId": "meeting-123",
  "items": [
    {
      "title": "Implement dark mode",
      "description": "Add dark mode toggle to settings",
      "priority": "MEDIUM"
    }
  ],
  "pushToService": "linear"
}
```

### Supported Features
- ✅ Create issues with title, description, priority
- ✅ Set due dates
- ✅ Auto-sync status updates (Backlog → In Progress → Done)
- ✅ GraphQL-based API ensures reliability

---

## Notion Setup

### Prerequisites
- Notion workspace account
- Database created with action items template

### Steps

1. **Create Integration**
   - Go to https://www.notion.so/my-integrations
   - Click "New integration"
   - Name: "MinutAI" (or your choice)
   - Click "Create"
   - Copy the Internal Integration Token

2. **Connect to Database**
   - Open your Notion database
   - Click "..." menu
   - Select "Connections"
   - Find and click your integration
   - Grant access

3. **Get Database ID**
   - Open your Notion database
   - Copy the ID from the URL: `notion.so/[ID]?v=...`
   - Or use the database URL structure: `notion.so/Your-Database-[ID]`
   - ID is 32 chars (can include dashes)

4. **Create Database Properties**
   Your Notion database should have these properties:
   - **title** (Text) - Action item title
   - **description** (Text) - Detailed description
   - **priority** (Select) - Options: Low, Medium, High
   - **status** (Select) - Options: To Do, In Progress, Done
   - **due-date** (Date) - Due date
   - **assignee** (Text) - Person assigned

5. **Save Configuration**
   ```json
   {
     "notion": {
       "enabled": true,
       "integrationToken": "secret_[...]",
       "databaseId": "abc123def456..."
     }
   }
   ```

6. **Test Connection**
   ```bash
   POST /api/integrations/notion/test
   Body: { "integrationToken", "databaseId" }
   ```

### Creating Action Items
```json
{
  "meetingId": "meeting-123",
  "items": [
    {
      "title": "Review PR #456",
      "description": "Check code quality and test coverage",
      "priority": "HIGH",
      "dueDate": "2026-02-28"
    }
  ],
  "pushToService": "notion"
}
```

### Supported Features
- ✅ Create database entries with full properties
- ✅ Set custom properties (via database schema)
- ✅ Auto-sync status updates
- ✅ Support for all Notion property types

---

## Azure DevOps Setup

### Prerequisites
- Azure DevOps account
- Project created

### Steps

1. **Get Personal Access Token**
   - Go to https://dev.azure.com/[organization]/_usersSettings/tokens
   - Replace `[organization]` with your org name
   - Click "New Token"
   - Scopes needed: Check "Work Item (Read & Write)"
   - Expiration: Set as needed
   - Click "Create"
   - Copy the token immediately

2. **Get Organization Name**
   - From URL: `dev.azure.com/[YOUR-ORG]/...`
   - Or from account settings

3. **Get Project Name**
   - From your project settings page
   - Or from the URL: `.../[YOUR-PROJECT]/...`

4. **Save Configuration**
   ```json
   {
     "azure": {
       "enabled": true,
       "organization": "my-org",
       "project": "my-project",
       "pat": "completely-private-token-here",
       "workItemType": "Task"  // optional, defaults to 'Task'
     }
   }
   ```

5. **Test Connection**
   ```bash
   POST /api/integrations/azure/test
   Body: { "organization", "project", "pat" }
   ```

### Creating Action Items
```json
{
  "meetingId": "meeting-123",
  "items": [
    {
      "title": "Update documentation",
      "description": "Add setup guide to README",
      "priority": "MEDIUM",
      "assignee": "alice@company.com"
    }
  ],
  "pushToService": "azure"
}
```

### Supported Features
- ✅ Create work items with title, description, priority
- ✅ Set due dates and assignees
- ✅ Auto-sync status updates (New → Active → Closed)
- ✅ Custom work item types supported

---

## Testing Your Setup

Each integration has a test endpoint to verify credentials:

```bash
# Jira
curl -X POST http://localhost:3000/api/integrations/jira/test \
  -H "Content-Type: application/json" \
  -d '{
    "baseUrl": "https://your-domain.atlassian.net",
    "email": "you@example.com",
    "apiToken": "your-token",
    "projectKey": "PROJ"
  }'

# Linear
curl -X POST http://localhost:3000/api/integrations/linear/test \
  -H "Content-Type: application/json" \
  -d '{
    "apiKey": "lin_xxx",
    "teamId": "team-xxx"
  }'

# Notion
curl -X POST http://localhost:3000/api/integrations/notion/test \
  -H "Content-Type: application/json" \
  -d '{
    "integrationToken": "secret_xxx",
    "databaseId": "xxx"
  }'

# Azure DevOps
curl -X POST http://localhost:3000/api/integrations/azure/test \
  -H "Content-Type: application/json" \
  -d '{
    "organization": "my-org",
    "project": "my-project",
    "pat": "your-token"
  }'
```

---

## Workflow Example

### 1. Save Integration Config
```bash
curl -X PUT http://localhost:3000/api/integrations/config \
  -H "Content-Type: application/json" \
  -d '{
    "jira": {
      "enabled": true,
      "baseUrl": "https://your-domain.atlassian.net",
      "email": "your-email@example.com",
      "apiToken": "your-api-token",
      "projectKey": "PROJ"
    }
  }'
```

### 2. Create Meeting & Get Summary
- Upload meeting transcript
- Get summary with action items

### 3. Create Action Items with Push
```bash
curl -X POST http://localhost:3000/api/action-items \
  -H "Content-Type: application/json" \
  -H "Cookie: [your-session]" \
  -d '{
    "meetingId": "meeting-123",
    "items": [
      {
        "title": "Fix login issue",
        "description": "Users report issues with special characters in passwords",
        "priority": "HIGH",
        "dueDate": "2026-02-28"
      }
    ],
    "pushToService": "jira"
  }'
```

### 4. Track Status Changes
When you update an action item status:
```bash
curl -X PATCH http://localhost:3000/api/action-items/item-123 \
  -H "Content-Type: application/json" \
  -H "Cookie: [your-session]" \
  -d '{ "status": "IN_PROGRESS" }'
```

Status automatically syncs to Jira! ✨

---

## Troubleshooting

### Authentication Failed
- Double-check your credentials
- Verify API token hasn't expired
- For Jira: Ensure email matches the account that created the token
- For Azure: Ensure PAT scope includes "Work Item" read/write

### Integration Not Found
- Ensure config is saved: `PUT /api/integrations/config`
- Verify the service is enabled: `"enabled": true`

### Issues Not Created
- Check test endpoint returns success
- Verify project/team/database access
- Check API rate limits with the service
- Review browser console for error details

### Status Sync Not Working
- Ensure external service supports status transitions
- Check Jira: Workflow must allow transitions to target status
- Check Linear: Team states must match sync status names

---

## Best Practices

1. **Start with one service**: Test and verify before adding others
2. **Use test endpoints**: Always test before creating real action items
3. **Check permissions**: Ensure your credentials have necessary scopes
4. **Monitor logs**: Watch console for any API errors
5. **Backup credentials**: Store PATs and tokens securely
6. **Rotate tokens**: Periodically rotate API tokens for security

---

## API Reference

### Config Endpoints
- `GET /api/integrations/config` - Get saved config
- `PUT /api/integrations/config` - Save config
- `POST /api/integrations/{service}/test` - Test connection

### Action Items Endpoints
- `POST /api/action-items` - Create items (with pushToService)
- `GET /api/action-items?meetingId=X` - List items
- `PATCH /api/action-items/{id}` - Update status (triggers sync)

### Setup Help
- `GET /api/integrations/setup-guide` - JSON guide reference

---

## Support

For issues or questions:
1. Check this guide first
2. Review integration-specific documentation
3. Check browser developer console for error details
4. Verify your credentials and permissions with the external service
