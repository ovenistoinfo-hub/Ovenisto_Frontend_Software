# HR & Attendance System — Design Spec
**Date:** 2026-06-25
**Status:** Approved
**Scope:** Account / HR section — Attendance check-in/out, Leave requests & balances, Staff schedules

---

## Overview

Build a full API-backed HR & Attendance system for Ovenisto. Replaces all existing DataContext (localStorage) reads in `EmployeePortal.tsx` and `Attendance.tsx`. Three independent backend modules; three new frontend service files; two pages fully rewritten.

---

## Decisions Made

| Question | Decision |
|----------|----------|
| Backend scope | Full API — new Prisma models, new Express modules |
| Page structure | `/shifts` stays cash registers; `/attendance` becomes admin HR hub |
| Check-in mechanism | Simple single punch per day (one clock-in, one clock-out) |
| Leave balances | Tracked per employee; admin sets allowances; system deducts on approve |
| Schedule model | Hardcoded templates (Morning/Evening/Night/Off); weekly grid per employee |
| Backend architecture | Three separate modules (attendance, leave-requests, staff-schedules) |

---

## Data Model (Prisma)

### New Models

```prisma
model AttendanceRecord {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation("UserAttendance", fields: [userId], references: [id])
  outletId  String
  outlet    Outlet   @relation(fields: [outletId], references: [id])
  date      String   // "2026-06-25" — one record per person per day
  clockIn   DateTime?
  clockOut  DateTime?
  status    String   @default("present") // present | late | absent
  notes     String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([userId, date])
}

model LeaveRequest {
  id           String   @id @default(cuid())
  userId       String
  user         User     @relation("UserLeaves", fields: [userId], references: [id])
  outletId     String
  outlet       Outlet   @relation(fields: [outletId], references: [id])
  leaveType    String   // casual | sick | annual | emergency
  startDate    String   // "2026-07-01"
  endDate      String   // "2026-07-03"
  totalDays    Int
  reason       String
  status       String   @default("pending") // pending | approved | rejected
  reviewedById String?
  reviewedBy   User?    @relation("LeaveReviewer", fields: [reviewedById], references: [id])
  reviewedOn   String?
  reviewNote   String?
  appliedOn    String   // "2026-06-25"
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}

model LeaveBalance {
  id         String   @id @default(cuid())
  userId     String
  user       User     @relation(fields: [userId], references: [id])
  year       Int      // calendar year e.g. 2026
  annual     Int      @default(14)
  annualUsed Int      @default(0)
  sick       Int      @default(6)
  sickUsed   Int      @default(0)
  casual     Int      @default(6)
  casualUsed Int      @default(0)
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  @@unique([userId, year])
}

model StaffSchedule {
  id        String          @id @default(cuid())
  userId    String
  user      User            @relation("UserSchedules", fields: [userId], references: [id])
  outletId  String
  outlet    Outlet          @relation(fields: [outletId], references: [id])
  weekStart String          // "2026-06-23" — always a Monday
  status    String          @default("draft") // draft | published
  shifts    ScheduleShift[]
  createdAt DateTime        @default(now())
  updatedAt DateTime        @updatedAt

  @@unique([userId, weekStart])
}

model ScheduleShift {
  id         String        @id @default(cuid())
  scheduleId String
  schedule   StaffSchedule @relation(fields: [scheduleId], references: [id], onDelete: Cascade)
  dayIndex   Int           // 0=Mon, 1=Tue, ..., 6=Sun
  shiftType  String        // morning | evening | night | off
  startTime  String?       // "09:00"
  endTime    String?       // "17:00"
}
```

### Shift Templates (hardcoded constants — no DB table)

```ts
const SHIFT_TEMPLATES = {
  morning: { label: "Morning", startTime: "09:00", endTime: "17:00" },
  evening: { label: "Evening", startTime: "17:00", endTime: "01:00" },
  night:   { label: "Night",   startTime: "01:00", endTime: "09:00" },
  off:     { label: "Off",     startTime: null,    endTime: null    },
};
```

### Outlet Scoping

- `AttendanceRecord`, `LeaveRequest`, `StaffSchedule` — scoped by `outletId` via `resolveOutletScope` / `resolveCreateOutlet`.
- `LeaveBalance` — chain-wide (no `outletId`); scoped to `userId` only.

### User Model Additions

```prisma
// Add to existing User model:
attendanceRecords AttendanceRecord[] @relation("UserAttendance")
leaveRequests     LeaveRequest[]     @relation("UserLeaves")
leaveReviews      LeaveRequest[]     @relation("LeaveReviewer")
leaveBalance      LeaveBalance[]
staffSchedules    StaffSchedule[]    @relation("UserSchedules")
```

---

## Backend API Routes

### Module 1: `attendance/`

Base path: `/api/attendance`. All routes behind `authenticate`.

| Method | Path | Authorize | Description |
|--------|------|-----------|-------------|
| `POST` | `/clock-in` | Any | Create today's record; `clockIn = now()`. 400 if already clocked in. |
| `POST` | `/clock-out` | Any | Update today's record; `clockOut = now()`. Compute status vs scheduled start. 400 if not clocked in or already out. |
| `GET` | `/my-status` | Any | Today's record for logged-in user (null if none). |
| `GET` | `/my-history` | Any | Own records paginated, newest first. |
| `GET` | `/` | Admin/Manager | All records; filter by `?date=`, `?userId=`, `?status=`. |
| `PATCH` | `/:id` | Admin/Manager | Manually correct clockIn/clockOut/status/notes. Outlet-scope check before update. |

**Clock-out status logic:** compare `clockIn` against today's `ScheduleShift.startTime` for this user. If `clockIn > scheduledStart + 15 min` → `late`, else → `present`. If no schedule found → `present`. `absent` is never auto-set — admin uses PATCH.

### Module 2: `leave-requests/`

Base path: `/api/leave-requests`. All routes behind `authenticate`.

| Method | Path | Authorize | Description |
|--------|------|-----------|-------------|
| `GET` | `/` | Any | Staff: own. Admin/Manager: all; filter `?status=`, `?userId=`. |
| `POST` | `/` | Any | Submit request. Backend validates balance remaining before creating. |
| `DELETE` | `/:id` | Any | Cancel own `pending` request only. |
| `PUT` | `/:id/review` | Admin/Manager | Body: `{ action: "approve"|"reject", reviewNote? }`. On approve: deduct `totalDays` from `LeaveBalance`. |
| `GET` | `/my-balance` | Any | Own `LeaveBalance` for current year. Creates with defaults if none exists. |
| `GET` | `/balances` | Admin/Manager | All staff balances for current year, joined with user name/role. |
| `PUT` | `/balances/:userId` | Admin/Manager | Set annual/sick/casual allowances. Upsert by `[userId, year]`. |

### Module 3: `staff-schedules/`

Base path: `/api/staff-schedules`. All routes behind `authenticate`.

| Method | Path | Authorize | Description |
|--------|------|-----------|-------------|
| `GET` | `/my` | Any | Own schedule for `?week=YYYY-MM-DD`. Null if none. |
| `GET` | `/` | Admin/Manager | All schedules; filter `?weekStart=`, `?userId=`. Includes nested shifts. |
| `POST` | `/` | Admin/Manager | Create or replace week schedule. Upserts on `@@unique([userId, weekStart])`. Deletes old shifts, inserts new ones in `$transaction`. |
| `PATCH` | `/:id/publish` | Admin/Manager | Set `status = "published"`. |
| `DELETE` | `/:id` | Admin/Manager | Delete schedule + cascade shifts. |

---

## Frontend

### New Service Files (`src/services/`)

**`attendance.service.ts`**
- `clockIn()` → `POST /attendance/clock-in`
- `clockOut()` → `POST /attendance/clock-out`
- `getMyStatus()` → `GET /attendance/my-status`
- `getMyHistory(page?)` → `GET /attendance/my-history`
- `getAll(params?)` → `GET /attendance`
- `correct(id, data)` → `PATCH /attendance/:id`

**`leave.service.ts`**
- `getMyRequests()` → `GET /leave-requests`
- `submit(data)` → `POST /leave-requests`
- `cancel(id)` → `DELETE /leave-requests/:id`
- `review(id, action, note?)` → `PUT /leave-requests/:id/review`
- `getMyBalance()` → `GET /leave-requests/my-balance`
- `getAllBalances()` → `GET /leave-requests/balances`
- `updateBalance(userId, data)` → `PUT /leave-requests/balances/:userId`

**`schedule.service.ts`**
- `getMySchedule(week)` → `GET /staff-schedules/my?week=`
- `getAll(params?)` → `GET /staff-schedules`
- `save(data)` → `POST /staff-schedules`
- `publish(id)` → `PATCH /staff-schedules/:id/publish`
- `remove(id)` → `DELETE /staff-schedules/:id`

---

### Page 1: My Portal (`/my-portal` — `EmployeePortal.tsx`, full rewrite)

All DataContext imports removed. Uses react-query `useQuery` / `useMutation`.

**4 tabs:**

#### Tab 1 — Schedule
- Week navigator (prev / next / Today buttons).
- 7-day card grid. Each card: day label, date, shift type badge (colour-coded: morning=blue, evening=amber, night=purple, off=muted). Today's card: `ring-2 ring-primary`.
- "No schedule published yet" empty state when draft or missing.
- Query: `GET /staff-schedules/my?week=YYYY-MM-DD`

#### Tab 2 — Attendance
- **Today's card (prominent, touch-first):**
  - Not clocked in → large green "Check In" button.
  - Clocked in, not out → shows clock-in time + elapsed timer; large orange "Check Out" button.
  - Clocked in + out → shows both times, total hours, status badge. No buttons.
- Monthly summary cards: Present / Late / Absent / Total Hours.
- History table: Date | Clock In | Clock Out | Hours | Status.
- Queries: `GET /attendance/my-status` (on mount + after mutation) + `GET /attendance/my-history`.

#### Tab 3 — Leaves
- 3 balance cards: Annual / Sick / Casual (X remaining of Y total, progress bar).
- Inline "Request Leave" form toggled by header "+ Request Leave" button: leave type select, start/end date, reason textarea, real-time balance preview.
- Own leave request list: type badge, status badge, date range, days, reason. Click → read-only detail dialog (shows reviewNote if rejected).
- Queries: `GET /leave-requests/my-balance` + `GET /leave-requests`.

#### Tab 4 — Cash Shifts *(only when `user.role === "Cashier"`)*
- Read-only list of own cash register sessions from existing `shiftService.getShifts()`, filtered client-side by `shift.staffId === user.id`.
- Columns: Opened At | Closed At | Opening Cash | Total Sales | Status.
- Note: open/close register remains on `/shifts` page.

---

### Page 2: Admin HR Hub (`/attendance` — `Attendance.tsx`, full rewrite)

Access: Super Admin, Admin, Manager only.

**3 tabs:**

#### Tab 1 — Attendance
- Date picker (default today) + employee dropdown filter.
- Summary cards: Present / Late / Absent / Not Recorded.
- Table: Employee | Role | Clock In | Clock Out | Hours | Status | Edit.
- Edit opens inline correction row (clockIn time input, clockOut time input, status select, notes, Save/Cancel).

#### Tab 2 — Leave Requests
- Pending / All toggle filter.
- Request rows: employee name + role, leave type badge, status badge, date range, days, reason.
- Pending rows: "Approve" button (green) + "Reject" button (red). Reject expands an inline note field before confirming.
- Below table: **Leave Balance Editor** — table of all staff (name, role, annual total/used, sick total/used, casual total/used). Each row editable inline with Save button.

#### Tab 3 — Schedules
- Week navigator (prev / next / Today).
- Outlet filter (Super Admin only).
- Grid: one row per staff member, 7 columns (Mon–Sun).
- Each cell: chip/button cycling through Morning → Evening → Night → Off → (clear).
- Row-level "Save Draft" and "Publish" buttons.
- Published rows show a lock icon; cells become read-only unless re-opened via an "Edit" button.

---

### Navigation & Route Changes

| Nav Label | Route | Before | After |
|-----------|-------|--------|-------|
| Attendance | `/attendance` | localStorage admin attendance view | Admin HR hub (rewritten) — restrict to Admin/Manager in ProtectedRoute |
| Shifts & Schedule | `/shifts` | Cash register shifts (API) | Unchanged |
| My Portal | `/my-portal` | localStorage employee portal | API-backed, 4 tabs |

---

## Implementation Order

1. **Prisma schema** — add 5 models + User relation arrays → `npm run db:push`
2. **Backend: `attendance/`** — controller + routes + wire `routes/index.ts`
3. **Backend: `leave-requests/`** — controller + routes + wire
4. **Backend: `staff-schedules/`** — controller + routes + wire
5. **Frontend services** — `attendance.service.ts`, `leave.service.ts`, `schedule.service.ts`
6. **`EmployeePortal.tsx`** — full rewrite (4 tabs, API-backed)
7. **`Attendance.tsx`** — full rewrite (admin HR hub, 3 tabs)
8. **ProtectedRoute** — restrict `/attendance` to Admin/Manager/Super Admin

---

## Out of Scope

- Automatic `absent` marking (no cron — admin corrects manually)
- Payroll / salary calculation
- Biometric or GPS check-in
- SMS/push notifications for leave approval
- Shift swap requests between staff
- Leave accrual (balances are set manually by admin)
