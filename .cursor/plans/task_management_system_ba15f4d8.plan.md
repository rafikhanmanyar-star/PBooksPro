---
name: Task Management System
overview: Build a comprehensive Task Management System with personal task management for all users and Admin-to-Employee delegation. Includes task creation, progress tracking, calendar view, leaderboard, and notifications.
todos:
  - id: db-schema
    content: Create database schema for tasks, task_updates, task_performance_scores, and task_performance_config tables (both PostgreSQL and SQLite)
    status: completed
  - id: backend-api
    content: Implement backend API routes for task CRUD operations, check-ins, calendar data, and performance endpoints
    status: completed
  - id: performance-service
    content: Create taskPerformanceService for calculating performance scores with configurable weights
    status: completed
  - id: notification-service
    content: Implement taskNotificationService for assignment and deadline warning notifications via WebSocket
    status: completed
  - id: task-types
    content: Add Task interfaces and types to types.ts
    status: completed
  - id: task-service
    content: Create frontend taskService for API communication
    status: completed
  - id: tasks-page
    content: Build TasksPage component with list view, filters, and navigation to calendar/ranking
    status: completed
  - id: task-form
    content: Create TaskForm component with dynamic fields and role-based restrictions
    status: completed
  - id: task-components
    content: Build TaskCard, TaskDetailModal, and TaskCheckInModal components
    status: completed
  - id: calendar-view
    content: Implement TasksCalendar component with monthly/weekly views and color-coding
    status: completed
  - id: team-ranking
    content: Create TeamRankingPage component with sortable leaderboard and performance config modal
    status: completed
  - id: navigation-integration
    content: Add Tasks navigation items to Sidebar and update App.tsx routing
    status: completed
  - id: sync-service
    content: Implement taskSyncService for local/cloud synchronization
    status: cancelled
  - id: permissions-validation
    content: Add backend and frontend validation for task permissions and data integrity
    status: completed
---

# Task Management System Implementation Plan

## Overview

This system will add task management capabilities to the existing PBooksPro application, supporting both personal tasks and admin-to-employee task delegation. The system will integrate with the existing multi-tenant architecture, authentication system, and notification infrastructure.

## Architecture

### Data Flow

```
User Action → Frontend Component → API Route → Database Service → PostgreSQL/SQLite
                ↓
         Notification Service → WebSocket → Real-time Updates
```

### Database Schema

**Tables to Create:**

1. **tasks** - Main task table

   - `id` (TEXT PRIMARY KEY)
   - `title` (TEXT NOT NULL)
   - `description` (TEXT)
   - `type` (TEXT NOT NULL) - 'Personal' or 'Assigned'
   - `category` (TEXT NOT NULL) - 'Development', 'Admin', 'Sales', 'Personal Growth'
   - `status` (TEXT NOT NULL) - 'Not Started', 'In Progress', 'Review', 'Completed'
   - `start_date` (TEXT NOT NULL)
   - `hard_deadline` (TEXT NOT NULL)
   - `kpi_goal` (TEXT) - Measurable goal description
   - `kpi_target_value` (REAL) - Target numeric value (optional)
   - `kpi_current_value` (REAL DEFAULT 0) - Current progress
   - `kpi_unit` (TEXT) - Unit of measurement (e.g., 'modules', '$', 'hours')
   - `kpi_progress_percentage` (REAL DEFAULT 0) - Calculated progress (0-100)
   - `assigned_by_id` (TEXT) - Admin user ID who assigned (NULL for personal tasks)
   - `assigned_to_id` (TEXT) - Employee user ID (NULL for personal tasks)
   - `created_by_id` (TEXT NOT NULL)
   - `tenant_id` (TEXT NOT NULL)
   - `user_id` (TEXT) - For local SQLite compatibility
   - `created_at` (TEXT/TIMESTAMP)
   - `updated_at` (TEXT/TIMESTAMP)

2. **task_updates** - Progress log/comment history

   - `id` (TEXT PRIMARY KEY)
   - `task_id` (TEXT NOT NULL) - Foreign key to tasks
   - `user_id` (TEXT NOT NULL) - Who made the update
   - `update_type` (TEXT) - 'Status Change', 'KPI Update', 'Comment', 'Check-in'
   - `status_before` (TEXT)
   - `status_after` (TEXT)
   - `kpi_value_before` (REAL)
   - `kpi_value_after` (REAL)
   - `comment` (TEXT)
   - `created_at` (TEXT/TIMESTAMP)
   - `tenant_id` (TEXT NOT NULL)

3. **task_performance_scores** - Calculated performance metrics (for leaderboard)

   - `id` (TEXT PRIMARY KEY)
   - `user_id` (TEXT NOT NULL)
   - `tenant_id` (TEXT NOT NULL)
   - `period_start` (TEXT) - Start of calculation period
   - `period_end` (TEXT) - End of calculation period
   - `total_tasks` (INTEGER DEFAULT 0)
   - `completed_tasks` (INTEGER DEFAULT 0)
   - `on_time_completions` (INTEGER DEFAULT 0)
   - `overdue_tasks` (INTEGER DEFAULT 0)
   - `average_kpi_achievement` (REAL DEFAULT 0) - Average KPI completion %
   - `completion_rate` (REAL DEFAULT 0) - Percentage of tasks completed
   - `deadline_adherence_rate` (REAL DEFAULT 0) - Percentage completed on time
   - `performance_score` (REAL DEFAULT 0) - Calculated weighted score
   - `calculated_at` (TEXT/TIMESTAMP)
   - UNIQUE(user_id, tenant_id, period_start, period_end)

4. **task_performance_config** - Admin-configurable performance calculation weights

   - `id` (TEXT PRIMARY KEY)
   - `tenant_id` (TEXT NOT NULL UNIQUE)
   - `completion_rate_weight` (REAL DEFAULT 0.33) - Weight for completion rate (0-1)
   - `deadline_adherence_weight` (REAL DEFAULT 0.33) - Weight for deadline adherence (0-1)
   - `kpi_achievement_weight` (REAL DEFAULT 0.34) - Weight for KPI achievement (0-1)
   - `updated_at` (TEXT/TIMESTAMP)
   - CONSTRAINT: weights must sum to 1.0

### File Structure

**Backend (Server):**

- `server/migrations/tasks-schema.sql` - PostgreSQL schema
- `server/api/routes/tasks.ts` - Task CRUD endpoints
- `server/services/taskPerformanceService.ts` - Performance score calculation
- `server/services/taskNotificationService.ts` - Deadline notifications

**Frontend (Components):**

- `components/tasks/TasksPage.tsx` - Main tasks page with list view
- `components/tasks/TaskForm.tsx` - Create/edit task form
- `components/tasks/TaskCard.tsx` - Individual task card component
- `components/tasks/TaskDetailModal.tsx` - Task details and update history
- `components/tasks/TaskCheckInModal.tsx` - Check-in form for progress updates
- `components/tasks/TasksCalendar.tsx` - Calendar view component
- `components/tasks/TasksCalendarView.tsx` - Monthly/Weekly calendar wrapper
- `components/tasks/TeamRankingPage.tsx` - Admin-only leaderboard
- `components/tasks/PerformanceConfigModal.tsx` - Admin config for performance weights

**Services:**

- `services/taskService.ts` - Frontend task service (API calls)
- `services/taskSyncService.ts` - Sync between local SQLite and cloud PostgreSQL

**Types:**

- Update `types.ts` with Task interfaces

**Database:**

- Update `services/database/schema.ts` - Add SQLite schema
- Update `server/migrations/postgresql-schema.sql` - Add PostgreSQL schema

## Implementation Details

### 1. Database Schema Implementation

**PostgreSQL Migration:** `server/migrations/tasks-schema.sql`

- Create all 4 tables with proper foreign keys
- Add indexes on `tenant_id`, `assigned_to_id`, `status`, `hard_deadline`
- Add CHECK constraints for status values and date validation

**SQLite Schema:** Update `services/database/schema.ts`

- Add same table definitions (SQLite syntax)
- Ensure compatibility with existing multi-tenant structure

### 2. Backend API Routes

**File:** `server/api/routes/tasks.ts`

**Endpoints:**

- `GET /api/tasks` - List tasks (filtered by user role)
  - Admin: All tasks in tenant
  - Employee: Personal tasks + assigned tasks
- `POST /api/tasks` - Create task
  - Admin: Can assign to any employee
  - Employee: Can only create personal tasks
- `GET /api/tasks/:id` - Get task details with update history
- `PUT /api/tasks/:id` - Update task
  - Employees: Can only update progress (status, KPI, comments) on assigned tasks
  - Employees: Cannot edit/delete assigned tasks
  - Admin: Full edit access
- `DELETE /api/tasks/:id` - Delete task (Admin only, or creator of personal task)
- `POST /api/tasks/:id/check-in` - Check-in endpoint for progress updates
- `GET /api/tasks/calendar` - Get tasks for calendar view (date range)
- `GET /api/tasks/performance/leaderboard` - Get team ranking (Admin only)
- `GET /api/tasks/performance/config` - Get performance config (Admin)
- `PUT /api/tasks/performance/config` - Update performance config (Admin)

**Authorization:**

- Use existing `tenantMiddleware` for tenant isolation
- Use existing `adminOnlyMiddleware` for admin-only endpoints
- Add custom middleware to check task ownership/assignment

### 3. Performance Score Calculation

**File:** `server/services/taskPerformanceService.ts`

**Calculation Logic:**

```typescript
// For each user in a period:
completion_rate = (completed_tasks / total_tasks) * 100
deadline_adherence = (on_time_completions / completed_tasks) * 100
kpi_achievement = average(kpi_progress_percentage for all tasks)

// Weighted score:
performance_score = 
  (completion_rate * completion_weight) +
  (deadline_adherence * deadline_weight) +
  (kpi_achievement * kpi_weight)
```

**Triggers:**

- Recalculate on task completion
- Recalculate on deadline pass
- Recalculate on KPI update
- Background job to recalculate daily

### 4. Notification System

**File:** `server/services/taskNotificationService.ts`

**Notifications:**

1. **Task Assignment** - When admin assigns task to employee

   - WebSocket event: `task:assigned`
   - Toast notification in UI

2. **Deadline Warning** - 24 hours before deadline

   - Scheduled check (cron job or background worker)
   - WebSocket event: `task:deadline-warning`
   - Toast notification

**Integration:**

- Use existing `WebSocketService` for real-time notifications
- Use existing `NotificationContext` for UI toasts

### 5. Frontend Components

#### TasksPage.tsx

- List view with filters (Status, Type, Category, Date range)
- Search functionality
- Create task button (opens TaskForm)
- Toggle between List and Calendar view
- For Admin: "Team Ranking" button

#### TaskForm.tsx

- Dynamic form with all task fields
- If Admin: "Assign To" dropdown (populated with employees)
- If Employee: Type locked to "Personal"
- Category dropdown (hardcoded defaults + custom)
- Date pickers for start_date and hard_deadline
- KPI fields (goal description, target value, unit)

#### TaskCard.tsx

- Display task title, category, status, dates
- Progress bar for KPI
- Color coding: Personal (blue), Assigned (orange)
- Click to open TaskDetailModal
- Quick actions: Check-in, Edit (if allowed)

#### TasksCalendar.tsx

- Use existing `DatePicker` component patterns
- Monthly view: Grid of days with task blocks
- Weekly view: Day columns with task timeline
- Color-code by Type (Personal vs Assigned)
- Click task block to open TaskDetailModal
- Drag-and-drop support (optional, future enhancement)

#### TeamRankingPage.tsx

- Table/grid of employees with performance scores
- Sortable columns (Score, Completion Rate, etc.)
- Period selector (This Month, Last Month, Custom)
- Performance config button (Admin only)

### 6. Navigation Integration

**Update:** `components/layout/Sidebar.tsx`

- Add new nav group "Tasks" with:
  - "My Tasks" (all users)
  - "Calendar" (all users)
  - "Team Ranking" (Admin only)

**Update:** `types.ts`

- Add `'tasks' | 'tasksCalendar' | 'teamRanking'` to `Page` type

**Update:** `App.tsx`

- Add route handlers for new pages
- Add to PAGE_GROUPS

### 7. Data Integrity & Permissions

**Backend Validation:**

- Employees cannot edit `assigned_by_id`, `assigned_to_id`, `type` on assigned tasks
- Employees cannot delete assigned tasks
- Only task creator or Admin can delete personal tasks
- Validate `hard_deadline >= start_date`
- Validate KPI progress percentage (0-100)

**Frontend Validation:**

- Disable edit/delete buttons for employees on assigned tasks
- Show read-only indicators
- Form validation before submission

### 8. Sync Service

**File:** `services/taskSyncService.ts`

- Sync tasks from PostgreSQL to SQLite on login
- Queue local changes for sync when offline
- Use existing `syncEngine.ts` patterns
- Handle conflicts (cloud wins for assigned tasks)

## Technical Considerations

1. **Multi-tenancy:** All queries must filter by `tenant_id`
2. **Offline Support:** Tasks work offline, sync when online
3. **Real-time Updates:** WebSocket for task assignments and deadline warnings
4. **Performance:** Index on `hard_deadline` for deadline checks
5. **Scalability:** Background job for performance score calculation (avoid blocking)

## Testing Checklist

- [ ] Admin can create and assign tasks
- [ ] Employee receives notification when task assigned
- [ ] Employee can update progress but not edit assigned task details
- [ ] Employee can create personal tasks
- [ ] Calendar displays tasks correctly
- [ ] Deadline warning triggers 24h before
- [ ] Performance scores calculate correctly
- [ ] Leaderboard shows correct rankings
- [ ] Admin can configure performance weights
- [ ] Data syncs between local and cloud
- [ ] Permissions enforced correctly