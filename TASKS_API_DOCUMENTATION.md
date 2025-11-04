# Task Management API Documentation

## Overview

This API provides task/action item management capabilities for the SignalsAI platform, replacing the Monday.com integration with a self-contained system.

**Base URL:** `/api/tasks`

---

## Authentication

All endpoints require authentication via `googleAccountId` passed as:

- Query parameter: `?googleAccountId=123`
- OR Header: `x-google-account-id: 123`

---

## Data Models

### ActionItem (Task)

```typescript
{
  id: number;
  domain_name: string;              // Client domain (e.g., "artfulorthodontics.com")
  google_account_id?: number;       // Associated Google account ID
  title: string;                    // Task title
  description?: string;             // Task description
  category: "ALLORO" | "USER";      // Task category
  status: "pending" | "in_progress" | "complete" | "archived";
  is_approved: boolean;             // Admin approval flag
  created_by_admin: boolean;        // Whether created by admin
  created_at: string;               // ISO timestamp
  updated_at: string;               // ISO timestamp
  completed_at?: string;            // ISO timestamp (when completed)
  due_date?: string;                // ISO timestamp (optional)
  metadata?: any;                   // JSON metadata for extensibility
}
```

---

## Client Endpoints

### 1. Get Tasks for Client

**GET** `/api/tasks?googleAccountId={id}`

Fetches approved tasks for the logged-in client, grouped by category.

**Query Parameters:**

- `googleAccountId` (required): Client's Google account ID

**Response:**

```json
{
  "success": true,
  "tasks": {
    "ALLORO": [
      {
        "id": 1,
        "domain_name": "artfulorthodontics.com",
        "title": "Review Q4 analytics",
        "description": "Check performance metrics",
        "category": "ALLORO",
        "status": "pending",
        "is_approved": true,
        "created_by_admin": true,
        "created_at": "2025-01-04T10:00:00Z",
        "updated_at": "2025-01-04T10:00:00Z"
      }
    ],
    "USER": [
      {
        "id": 2,
        "domain_name": "artfulorthodontics.com",
        "title": "Update website photos",
        "description": null,
        "category": "USER",
        "status": "in_progress",
        "is_approved": true,
        "created_by_admin": false,
        "created_at": "2025-01-03T15:30:00Z",
        "updated_at": "2025-01-03T15:30:00Z"
      }
    ]
  },
  "total": 2
}
```

**Notes:**

- Only returns `is_approved = true` tasks
- Excludes archived tasks
- Groups tasks by category (ALLORO/USER)
- ALLORO tasks are read-only for clients
- USER tasks can be marked complete by clients

---

### 2. Mark Task Complete

**PATCH** `/api/tasks/:id/complete`

Marks a USER category task as complete (clients only).

**URL Parameters:**

- `id` (required): Task ID

**Request Body:**

```json
{
  "googleAccountId": 123
}
```

**Response:**

```json
{
  "success": true,
  "task": {
    "id": 2,
    "status": "complete",
    "completed_at": "2025-01-04T12:00:00Z",
    "updated_at": "2025-01-04T12:00:00Z"
    // ... other fields
  },
  "message": "Task marked as complete"
}
```

**Validation:**

- Task must belong to client's domain
- Task must be category = "USER"
- ALLORO tasks cannot be completed by clients

**Error Responses:**

```json
// 403 - Not authorized
{
  "success": false,
  "error": "Cannot complete task",
  "message": "Only USER category tasks can be marked complete by clients"
}

// 403 - Wrong domain
{
  "success": false,
  "error": "Access denied",
  "message": "Task does not belong to your domain"
}
```

---

## Admin Endpoints

### 3. Create Task

**POST** `/api/tasks`

Creates a new task (admin only).

**Request Body:**

```json
{
  "domain_name": "artfulorthodontics.com",
  "title": "Implement new booking system",
  "description": "Migrate from old system to new platform",
  "category": "ALLORO",
  "is_approved": true,
  "due_date": "2025-02-01T00:00:00Z",
  "metadata": {
    "priority": "high",
    "source": "manual"
  }
}
```

**Required Fields:**

- `domain_name`: Client domain
- `title`: Task title
- `category`: "ALLORO" or "USER"

**Optional Fields:**

- `google_account_id`: Specific account ID (defaults to account matching domain)
- `description`: Task description
- `is_approved`: Approval status (default: false)
- `due_date`: Due date (ISO string)
- `metadata`: Additional JSON data

**Response:**

```json
{
  "success": true,
  "task": {
    "id": 5,
    "domain_name": "artfulorthodontics.com",
    "google_account_id": 123,
    "title": "Implement new booking system",
    "category": "ALLORO",
    "status": "pending",
    "is_approved": true,
    "created_by_admin": true,
    "created_at": "2025-01-04T14:00:00Z"
    // ... other fields
  },
  "message": "Task created successfully"
}
```

---

### 4. Get All Tasks (Admin Dashboard)

**GET** `/api/tasks/admin/all`

Fetches all tasks with filtering and pagination.

**Query Parameters:**

- `domain_name` (optional): Filter by client domain
- `status` (optional): Filter by status ("pending", "in_progress", "complete", "archived", "all")
- `category` (optional): Filter by category ("ALLORO", "USER", "all")
- `is_approved` (optional): Filter by approval status (true, false, "all")
- `date_from` (optional): Filter created_at >= this date (ISO string)
- `date_to` (optional): Filter created_at <= this date (ISO string)
- `limit` (optional): Results per page (default: 50)
- `offset` (optional): Pagination offset (default: 0)

**Examples:**

```bash
# Get all pending tasks
GET /api/tasks/admin/all?status=pending

# Get tasks for specific client
GET /api/tasks/admin/all?domain_name=artfulorthodontics.com

# Get unapproved ALLORO tasks
GET /api/tasks/admin/all?category=ALLORO&is_approved=false

# Get tasks from date range
GET /api/tasks/admin/all?date_from=2025-01-01&date_to=2025-01-31

# Paginated results
GET /api/tasks/admin/all?limit=20&offset=40
```

**Response:**

```json
{
  "success": true,
  "tasks": [
    {
      "id": 1,
      "domain_name": "artfulorthodontics.com",
      "title": "Review analytics",
      "category": "ALLORO",
      "status": "pending",
      "is_approved": false,
      "created_at": "2025-01-04T10:00:00Z"
      // ... other fields
    }
    // ... more tasks
  ],
  "total": 125
}
```

**Default Behavior:**

- If no `status` filter provided, excludes archived tasks
- Results ordered by `created_at DESC`
- Returns total count for pagination

---

### 5. Update Task

**PATCH** `/api/tasks/:id`

Updates an existing task (admin only).

**URL Parameters:**

- `id` (required): Task ID

**Request Body:**

```json
{
  "title": "Updated task title",
  "description": "Updated description",
  "status": "in_progress",
  "is_approved": true,
  "due_date": "2025-02-15T00:00:00Z"
}
```

**Updatable Fields:**

- `title`: Update task title
- `description`: Update description
- `status`: Change status
- `is_approved`: Approve/unapprove task
- `due_date`: Update due date
- `metadata`: Update metadata

**Response:**

```json
{
  "success": true,
  "task": {
    "id": 1,
    "title": "Updated task title",
    "status": "in_progress",
    "is_approved": true,
    "updated_at": "2025-01-04T15:30:00Z"
    // ... other fields
  },
  "message": "Task updated successfully"
}
```

**Automatic Behavior:**

- If status changes to "complete" and `completed_at` is null, it's automatically set
- `updated_at` is always updated

---

### 6. Archive Task

**DELETE** `/api/tasks/:id`

Archives a task (soft delete). Archived tasks won't appear in default queries.

**URL Parameters:**

- `id` (required): Task ID

**Response:**

```json
{
  "success": true,
  "message": "Task archived successfully"
}
```

**Notes:**

- This is a soft delete - sets `status = "archived"`
- Archived tasks can still be retrieved with explicit filter
- To permanently delete, use database query

---

### 7. Get Available Clients

**GET** `/api/tasks/clients`

Returns list of onboarded clients for task creation dropdown.

**Response:**

```json
{
  "success": true,
  "clients": [
    {
      "id": 1,
      "domain_name": "artfulorthodontics.com",
      "email": "admin@artfulorthodontics.com"
    },
    {
      "id": 2,
      "domain_name": "garrisonorthodontics.com",
      "email": "admin@garrisonorthodontics.com"
    }
  ],
  "total": 2
}
```

**Notes:**

- Only returns clients with `onboarding_completed = true`
- Ordered alphabetically by domain name
- Used for admin task creation dropdown

---

## Utility Endpoints

### 8. Health Check

**GET** `/api/tasks/health`

Checks if the task service is operational.

**Response:**

```json
{
  "success": true,
  "status": "healthy",
  "timestamp": "2025-01-04T16:00:00Z"
}
```

---

## Error Responses

All endpoints follow consistent error format:

```json
{
  "success": false,
  "error": "Error type",
  "message": "Human-readable error message",
  "timestamp": "2025-01-04T16:00:00Z"
}
```

**Common HTTP Status Codes:**

- `200` - Success
- `201` - Created successfully
- `400` - Bad request (validation error)
- `403` - Forbidden (permission denied)
- `404` - Not found
- `500` - Server error

---

## Frontend Integration Examples

### React Hook Example

```typescript
// Fetch tasks for client dashboard
const useTasks = (googleAccountId: number) => {
  const [tasks, setTasks] = useState<GroupedActionItemsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/tasks?googleAccountId=${googleAccountId}`)
      .then((res) => res.json())
      .then((data) => setTasks(data))
      .finally(() => setLoading(false));
  }, [googleAccountId]);

  return { tasks, loading };
};

// Complete a task
const completeTask = async (taskId: number, googleAccountId: number) => {
  const response = await fetch(`/api/tasks/${taskId}/complete`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ googleAccountId }),
  });
  return response.json();
};
```

### Admin Dashboard Example

```typescript
// Fetch filtered tasks
const fetchAdminTasks = async (filters: FetchActionItemsRequest) => {
  const params = new URLSearchParams(filters as any);
  const response = await fetch(`/api/tasks/admin/all?${params}`);
  return response.json();
};

// Create new task
const createTask = async (task: CreateActionItemRequest) => {
  const response = await fetch("/api/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(task),
  });
  return response.json();
};

// Approve task
const approveTask = async (taskId: number) => {
  const response = await fetch(`/api/tasks/${taskId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ is_approved: true }),
  });
  return response.json();
};
```

---

## Future Enhancements

### Opportunity Agent Integration

When opportunity agent runs, automatically create tasks:

```typescript
// In agentsV2.ts after opportunity agent success
const opportunityOutput = await callAgentWebhook(/*...*/);

for (const opportunity of opportunityOutput.opportunities) {
  await fetch("/api/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      domain_name: domain,
      google_account_id: googleAccountId,
      title: opportunity.title,
      description: opportunity.description,
      category: "ALLORO",
      is_approved: false, // Admin must review
      metadata: {
        source: "opportunity_agent",
        agent_output: opportunity,
      },
    }),
  });
}
```

---

## Migration from Monday.com

To migrate existing Monday tasks to the new system:

1. Export Monday tasks using existing `/api/monday/fetchTasks` endpoint
2. Transform data to match new schema
3. Bulk insert using `/api/tasks` endpoint

```typescript
// Example migration script
const migrateFromMonday = async (domain: string) => {
  // Fetch from Monday
  const mondayTasks = await fetch("/api/monday/fetchTasks", {
    method: "POST",
    body: JSON.stringify({ domain }),
  }).then((r) => r.json());

  // Transform and create in new system
  for (const task of mondayTasks.tasks) {
    await fetch("/api/tasks", {
      method: "POST",
      body: JSON.stringify({
        domain_name: domain,
        title: task.name,
        description: task.content,
        category: task.type === "ai" ? "ALLORO" : "USER",
        status: task.status === "completed" ? "complete" : "pending",
        is_approved: true,
        metadata: { migrated_from_monday: true, monday_id: task.id },
      }),
    });
  }
};
```

---

## Testing

### Using curl

```bash
# Get client tasks
curl "http://localhost:3000/api/tasks?googleAccountId=1"

# Complete a task
curl -X PATCH "http://localhost:3000/api/tasks/1/complete" \
  -H "Content-Type: application/json" \
  -d '{"googleAccountId": 1}'

# Admin: Create task
curl -X POST "http://localhost:3000/api/tasks" \
  -H "Content-Type: application/json" \
  -d '{
    "domain_name": "artfulorthodontics.com",
    "title": "Test task",
    "category": "ALLORO",
    "is_approved": true
  }'

# Admin: Get all tasks
curl "http://localhost:3000/api/tasks/admin/all?status=pending&limit=10"

# Admin: Update task
curl -X PATCH "http://localhost:3000/api/tasks/1" \
  -H "Content-Type: application/json" \
  -d '{"status": "in_progress", "is_approved": true}'

# Get clients list
curl "http://localhost:3000/api/tasks/clients"
```

---

## Database Schema Reference

```sql
CREATE TABLE tasks (
  id SERIAL PRIMARY KEY,
  domain_name VARCHAR(255) NOT NULL,
  google_account_id INTEGER,
  title TEXT NOT NULL,
  description TEXT,
  category VARCHAR(50) NOT NULL CHECK (category IN ('ALLORO', 'USER')),
  status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('complete', 'pending', 'in_progress', 'archived')),
  is_approved BOOLEAN NOT NULL DEFAULT false,
  created_by_admin BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP,
  due_date TIMESTAMP,
  metadata JSONB
);

CREATE INDEX idx_tasks_domain ON tasks(domain_name);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_category ON tasks(category);
CREATE INDEX idx_tasks_approved ON tasks(is_approved);
```

---

## Support

For issues or questions, contact the development team or refer to the main project documentation.
