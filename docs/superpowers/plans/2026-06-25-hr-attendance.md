# HR & Attendance System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a full API-backed HR & Attendance system — check-in/out, leave requests, staff schedules — replacing all localStorage reads in EmployeePortal and Attendance pages.

**Architecture:** Three new Express modules (attendance, leave-requests, staff-schedules) backed by five new Prisma models. Frontend has three new service files and two fully rewritten pages (EmployeePortal: 4-tab employee self-service; Attendance: 3-tab admin HR hub).

**Tech Stack:** Express + TypeScript + Prisma + PostgreSQL/Neon (backend); React 18 + Vite + TypeScript + Tailwind + shadcn/ui + @tanstack/react-query (frontend).

## Global Constraints

- Backend `.ts` files import with `.js` extension: `from '../../utils/ApiError.js'` — never `.ts`
- No `prisma migrate dev` — schema changes go via `npm run db:push` (with `--accept-data-loss` when dropping/renaming columns)
- Every scoped route MUST have `authenticate` middleware or `resolveOutletScope` silently returns `null` (cross-outlet data leak)
- `api.ts` returns the JSON envelope; services extract with `res.data` (one level only — `res.data.data` returns `undefined`)
- All Prisma `Decimal` fields → `Number()` in response mappers
- Backend lives at `Ovenisto-backend/`, frontend at `Ovenisto_Frontend_Software/`
- Backend has NO test runner — verify with `npm run typecheck` then `npm run build`
- Inline Card forms (not Dialog) for add/edit per UI convention

---

## File Map

**Backend — create:**
- `Ovenisto-backend/src/modules/attendance/attendance.controller.ts`
- `Ovenisto-backend/src/modules/attendance/attendance.routes.ts`
- `Ovenisto-backend/src/modules/leave-requests/leave-request.controller.ts`
- `Ovenisto-backend/src/modules/leave-requests/leave-request.routes.ts`
- `Ovenisto-backend/src/modules/staff-schedules/staff-schedule.controller.ts`
- `Ovenisto-backend/src/modules/staff-schedules/staff-schedule.routes.ts`

**Backend — modify:**
- `Ovenisto-backend/prisma/schema.prisma` (replace 5 old HR models, update User + Outlet relations)
- `Ovenisto-backend/src/routes/index.ts` (wire 3 new routers)

**Frontend — create:**
- `Ovenisto_Frontend_Software/src/services/attendance.service.ts`
- `Ovenisto_Frontend_Software/src/services/leave.service.ts`
- `Ovenisto_Frontend_Software/src/services/schedule.service.ts`

**Frontend — modify:**
- `Ovenisto_Frontend_Software/src/services/shift.service.ts` (add `getShifts()`)
- `Ovenisto_Frontend_Software/src/pages/EmployeePortal.tsx` (full rewrite)
- `Ovenisto_Frontend_Software/src/pages/Attendance.tsx` (full rewrite)
- `Ovenisto_Frontend_Software/src/contexts/AuthContext.tsx` (restrict `attendance` module)

---

## Task 1: Prisma Schema Migration

**Files:**
- Modify: `Ovenisto-backend/prisma/schema.prisma`

**Interfaces:**
- Produces: `AttendanceRecord`, `LeaveRequest`, `LeaveBalance`, `StaffSchedule`, `ScheduleShift` Prisma models usable in all backend tasks

**Context:** The schema already has old stubs (`Attendance`, `ShiftTemplate`, `StaffSchedule`, `LeaveRequest`, `LeaveBalance`) from the localStorage era. These have wrong field names, missing `outletId`, and wrong relation names. They must be replaced. Since no production data exists in these tables, `--accept-data-loss` is safe.

- [ ] **Step 1: Replace HR models in schema.prisma**

Open `Ovenisto-backend/prisma/schema.prisma` and make these changes:

**1a. In the `Outlet` model**, add three relations after `customers Customer[]`:
```prisma
  attendanceRecords AttendanceRecord[]
  leaveRequests     LeaveRequest[]
  staffSchedules    StaffSchedule[]
```

**1b. In the `User` model**, replace these four existing lines:
```prisma
  attendance               Attendance[]
  staffSchedules           StaffSchedule[]
  leaveRequests            LeaveRequest[]
  leaveBalance             LeaveBalance?
```
With:
```prisma
  attendanceRecords        AttendanceRecord[]  @relation("UserAttendance")
  leaveRequests            LeaveRequest[]      @relation("UserLeaves")
  leaveReviews             LeaveRequest[]      @relation("LeaveReviewer")
  leaveBalance             LeaveBalance[]
  staffSchedules           StaffSchedule[]     @relation("UserSchedules")
```

**1c. Find and DELETE the entire PHASE 9 block** (from `// PHASE 9: HR & Staff` through the closing `}` of `LeaveBalance`). This removes the old `Attendance`, `ShiftTemplate`, `StaffSchedule`, `LeaveRequest`, and `LeaveBalance` models.

**1d. Paste the following new models** in their place (under `// PHASE 9: HR & Staff`):
```prisma
// =============================================
// PHASE 9: HR & Staff
// =============================================

model AttendanceRecord {
  id        String    @id @default(cuid())
  userId    String
  user      User      @relation("UserAttendance", fields: [userId], references: [id])
  outletId  String
  outlet    Outlet    @relation(fields: [outletId], references: [id])
  date      String    // "YYYY-MM-DD" — one record per person per day
  clockIn   DateTime?
  clockOut  DateTime?
  status    String    @default("present") // present | late | absent
  notes     String?
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt

  @@unique([userId, date])
  @@map("attendance_records")
}

model LeaveRequest {
  id           String   @id @default(cuid())
  userId       String
  user         User     @relation("UserLeaves", fields: [userId], references: [id])
  outletId     String
  outlet       Outlet   @relation(fields: [outletId], references: [id])
  leaveType    String   // casual | sick | annual | emergency
  startDate    String   // "YYYY-MM-DD"
  endDate      String
  totalDays    Int
  reason       String
  status       String   @default("pending") // pending | approved | rejected
  reviewedById String?
  reviewedBy   User?    @relation("LeaveReviewer", fields: [reviewedById], references: [id])
  reviewedOn   String?
  reviewNote   String?
  appliedOn    String
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@map("leave_requests")
}

model LeaveBalance {
  id         String   @id @default(cuid())
  userId     String
  user       User     @relation(fields: [userId], references: [id])
  year       Int
  annual     Int      @default(14)
  annualUsed Int      @default(0)
  sick       Int      @default(6)
  sickUsed   Int      @default(0)
  casual     Int      @default(6)
  casualUsed Int      @default(0)
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  @@unique([userId, year])
  @@map("leave_balances")
}

model StaffSchedule {
  id        String          @id @default(cuid())
  userId    String
  user      User            @relation("UserSchedules", fields: [userId], references: [id])
  outletId  String
  outlet    Outlet          @relation(fields: [outletId], references: [id])
  weekStart String          // "YYYY-MM-DD" always a Monday
  status    String          @default("draft") // draft | published
  shifts    ScheduleShift[]
  createdAt DateTime        @default(now())
  updatedAt DateTime        @updatedAt

  @@unique([userId, weekStart])
  @@map("staff_schedules")
}

model ScheduleShift {
  id         String        @id @default(cuid())
  scheduleId String
  schedule   StaffSchedule @relation(fields: [scheduleId], references: [id], onDelete: Cascade)
  dayIndex   Int           // 0=Mon, 1=Tue, ..., 6=Sun
  shiftType  String        // morning | evening | night | off
  startTime  String?       // "09:00"
  endTime    String?       // "17:00"

  @@map("schedule_shifts")
}
```

- [ ] **Step 2: Push schema to Neon**

```bash
cd Ovenisto-backend
npm run db:push -- --accept-data-loss
```

Expected output: `Your database is now in sync with your Prisma schema.`
If it hangs on "Applying migration" for >60s, Ctrl-C and re-run.

- [ ] **Step 3: Verify typecheck passes**

```bash
npm run typecheck
```

Expected: no errors. If `Property 'attendanceRecord' does not exist`, run `npm run db:generate` first then recheck.

- [ ] **Step 4: Commit**

```bash
cd Ovenisto-backend
git add prisma/schema.prisma
git commit -m "feat(schema): replace HR models with outletId-scoped AttendanceRecord/LeaveRequest/LeaveBalance/StaffSchedule/ScheduleShift"
```

---

## Task 2: Attendance Backend Module

**Files:**
- Create: `Ovenisto-backend/src/modules/attendance/attendance.controller.ts`
- Create: `Ovenisto-backend/src/modules/attendance/attendance.routes.ts`
- Modify: `Ovenisto-backend/src/routes/index.ts`

**Interfaces:**
- Consumes: `AttendanceRecord` Prisma model (Task 1), `resolveOutletScope`, `resolveCreateOutlet` from `../../middleware/outletScope.js`
- Produces: `GET /api/attendance/my-status`, `GET /api/attendance/my-history`, `POST /api/attendance/clock-in`, `POST /api/attendance/clock-out`, `GET /api/attendance`, `PATCH /api/attendance/:id`

- [ ] **Step 1: Create attendance.controller.ts**

Create `Ovenisto-backend/src/modules/attendance/attendance.controller.ts`:

```typescript
import type { Request, Response } from 'express';
import { prisma } from '../../config/database.js';
import { ApiResponse } from '../../utils/ApiResponse.js';
import { ApiError } from '../../utils/ApiError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { resolveOutletScope, resolveCreateOutlet } from '../../middleware/outletScope.js';

function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

function currentWeekStart(): string {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const d = new Date(now);
  d.setDate(diff);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString().split('T')[0];
}

function todayDayIndex(): number {
  const day = new Date().getDay();
  return day === 0 ? 6 : day - 1;
}

export const clockIn = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const date = todayStr();

  const existing = await prisma.attendanceRecord.findUnique({
    where: { userId_date: { userId, date } },
  });
  if (existing?.clockIn) throw new ApiError('Already clocked in today', 400);

  const outletId = resolveCreateOutlet(req);
  const now = new Date();

  const record = existing
    ? await prisma.attendanceRecord.update({
        where: { id: existing.id },
        data: { clockIn: now },
      })
    : await prisma.attendanceRecord.create({
        data: { userId, outletId, date, clockIn: now, status: 'present' },
      });

  return res.status(201).json(ApiResponse.created(record, 'Clocked in'));
});

export const clockOut = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const date = todayStr();

  const record = await prisma.attendanceRecord.findUnique({
    where: { userId_date: { userId, date } },
  });
  if (!record?.clockIn) throw new ApiError('Not clocked in today', 400);
  if (record.clockOut) throw new ApiError('Already clocked out today', 400);

  let status = 'present';
  const weekStart = currentWeekStart();
  const dayIndex = todayDayIndex();

  const schedule = await prisma.staffSchedule.findFirst({
    where: { userId, weekStart, status: 'published' },
    include: { shifts: true },
  });
  const todayShift = schedule?.shifts.find(s => s.dayIndex === dayIndex);

  if (todayShift?.startTime && record.clockIn) {
    const [schedH, schedM] = todayShift.startTime.split(':').map(Number);
    const graceMinutes = schedH * 60 + schedM + 15;
    // clockIn is UTC; schedule times are PKT (UTC+5). Adjust by 300 min.
    const clockInMinutes =
      record.clockIn.getUTCHours() * 60 + record.clockIn.getUTCMinutes() + 300;
    if (clockInMinutes % (24 * 60) > graceMinutes) status = 'late';
  }

  const updated = await prisma.attendanceRecord.update({
    where: { id: record.id },
    data: { clockOut: new Date(), status },
  });

  return res.json(ApiResponse.success(updated, 'Clocked out'));
});

export const getMyStatus = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const date = todayStr();
  const record = await prisma.attendanceRecord.findUnique({
    where: { userId_date: { userId, date } },
  });
  return res.json(ApiResponse.success(record));
});

export const getMyHistory = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { page = '1', limit = '30' } = req.query as Record<string, string>;
  const skip = (Number(page) - 1) * Number(limit);

  const [data, total] = await Promise.all([
    prisma.attendanceRecord.findMany({
      where: { userId },
      skip,
      take: Number(limit),
      orderBy: { date: 'desc' },
    }),
    prisma.attendanceRecord.count({ where: { userId } }),
  ]);

  return res.json(ApiResponse.paginated(data, Number(page), Number(limit), total));
});

export const getAllAttendance = asyncHandler(async (req: Request, res: Response) => {
  const { date, userId, status, page = '1', limit = '50' } = req.query as Record<string, string>;
  const skip = (Number(page) - 1) * Number(limit);

  const where: any = {};
  if (date) where.date = date;
  if (userId) where.userId = userId;
  if (status) where.status = status;

  const scope = resolveOutletScope(req);
  if (scope) where.outletId = scope;

  const [data, total] = await Promise.all([
    prisma.attendanceRecord.findMany({
      where,
      skip,
      take: Number(limit),
      orderBy: [{ date: 'desc' }, { clockIn: 'desc' }],
      include: { user: { select: { id: true, name: true, role: true } } },
    }),
    prisma.attendanceRecord.count({ where }),
  ]);

  return res.json(ApiResponse.paginated(data, Number(page), Number(limit), total));
});

export const correctAttendance = asyncHandler(async (req: Request, res: Response) => {
  const existing = await prisma.attendanceRecord.findUnique({ where: { id: req.params.id } });
  if (!existing) throw new ApiError('Attendance record not found', 404);

  const scope = resolveOutletScope(req);
  if (scope && existing.outletId !== scope) throw new ApiError('Attendance record not found', 404);

  const { clockIn: ci, clockOut: co, status, notes } = req.body;

  const updated = await prisma.attendanceRecord.update({
    where: { id: req.params.id },
    data: {
      ...(ci !== undefined ? { clockIn: ci ? new Date(ci) : null } : {}),
      ...(co !== undefined ? { clockOut: co ? new Date(co) : null } : {}),
      ...(status !== undefined ? { status } : {}),
      ...(notes !== undefined ? { notes } : {}),
    },
  });

  return res.json(ApiResponse.success(updated, 'Attendance corrected'));
});
```

- [ ] **Step 2: Create attendance.routes.ts**

Create `Ovenisto-backend/src/modules/attendance/attendance.routes.ts`:

```typescript
import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import {
  clockIn,
  clockOut,
  getMyStatus,
  getMyHistory,
  getAllAttendance,
  correctAttendance,
} from './attendance.controller.js';

const adminRoles = ['Super Admin', 'Admin', 'Manager'];

export const attendanceRouter = Router();

attendanceRouter.post('/clock-in',    authenticate, clockIn);
attendanceRouter.post('/clock-out',   authenticate, clockOut);
attendanceRouter.get('/my-status',    authenticate, getMyStatus);
attendanceRouter.get('/my-history',   authenticate, getMyHistory);

attendanceRouter.get('/',             authenticate, authorize(adminRoles), getAllAttendance);
attendanceRouter.patch('/:id',        authenticate, authorize(adminRoles), correctAttendance);
```

- [ ] **Step 3: Wire into routes/index.ts**

In `Ovenisto-backend/src/routes/index.ts`, add the import at the top with other imports:
```typescript
import { attendanceRouter } from '../modules/attendance/attendance.routes.js';
```

Replace the commented-out attendance line:
```typescript
// router.use('/attendance', attendanceRoutes);
```
With:
```typescript
router.use('/attendance', attendanceRouter);
```

- [ ] **Step 4: Typecheck + build**

```bash
cd Ovenisto-backend
npm run typecheck
npm run build
```

Expected: both commands exit with no errors.

- [ ] **Step 5: Commit**

```bash
cd Ovenisto-backend
git add src/modules/attendance/ src/routes/index.ts
git commit -m "feat(attendance): add clock-in/out, my-status, my-history, admin correction endpoints"
```

---

## Task 3: Leave Requests Backend Module

**Files:**
- Create: `Ovenisto-backend/src/modules/leave-requests/leave-request.controller.ts`
- Create: `Ovenisto-backend/src/modules/leave-requests/leave-request.routes.ts`
- Modify: `Ovenisto-backend/src/routes/index.ts`

**Interfaces:**
- Consumes: `LeaveRequest`, `LeaveBalance` Prisma models (Task 1)
- Produces: `GET/POST /api/leave-requests`, `DELETE /api/leave-requests/:id`, `PUT /api/leave-requests/:id/review`, `GET /api/leave-requests/my-balance`, `GET/PUT /api/leave-requests/balances`

- [ ] **Step 1: Create leave-request.controller.ts**

Create `Ovenisto-backend/src/modules/leave-requests/leave-request.controller.ts`:

```typescript
import type { Request, Response } from 'express';
import { prisma } from '../../config/database.js';
import { ApiResponse } from '../../utils/ApiResponse.js';
import { ApiError } from '../../utils/ApiError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { resolveOutletScope, resolveCreateOutlet } from '../../middleware/outletScope.js';

const adminRoles = ['Super Admin', 'Admin', 'Manager'];

function currentYear(): number {
  return new Date().getFullYear();
}

function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

export const getMyBalance = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const year = currentYear();

  const balance = await prisma.leaveBalance.upsert({
    where: { userId_year: { userId, year } },
    update: {},
    create: { userId, year },
  });

  return res.json(ApiResponse.success(balance));
});

export const getAllBalances = asyncHandler(async (req: Request, res: Response) => {
  const year = currentYear();

  const balances = await prisma.leaveBalance.findMany({
    where: { year },
    include: { user: { select: { id: true, name: true, role: true } } },
    orderBy: { user: { name: 'asc' } },
  });

  return res.json(ApiResponse.success(balances));
});

export const updateBalance = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = req.params;
  const year = currentYear();
  const { annual, sick, casual } = req.body;

  const balance = await prisma.leaveBalance.upsert({
    where: { userId_year: { userId, year } },
    update: {
      ...(annual != null ? { annual: Number(annual) } : {}),
      ...(sick   != null ? { sick:   Number(sick)   } : {}),
      ...(casual != null ? { casual: Number(casual) } : {}),
    },
    create: {
      userId,
      year,
      annual: annual != null ? Number(annual) : 14,
      sick:   sick   != null ? Number(sick)   : 6,
      casual: casual != null ? Number(casual) : 6,
    },
  });

  return res.json(ApiResponse.success(balance, 'Balance updated'));
});

export const getLeaveRequests = asyncHandler(async (req: Request, res: Response) => {
  const { status, userId: filterUserId } = req.query as Record<string, string>;
  const role = req.user!.role;
  const isAdmin = adminRoles.includes(role);

  const where: any = {};
  if (!isAdmin) {
    where.userId = req.user!.id;
  } else {
    if (filterUserId) where.userId = filterUserId;
    const scope = resolveOutletScope(req);
    if (scope) where.outletId = scope;
  }
  if (status) where.status = status;

  const data = await prisma.leaveRequest.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      user: { select: { id: true, name: true, role: true } },
      reviewedBy: { select: { id: true, name: true } },
    },
  });

  return res.json(ApiResponse.success(data));
});

export const submitLeaveRequest = asyncHandler(async (req: Request, res: Response) => {
  const { leaveType, startDate, endDate, reason } = req.body;
  if (!leaveType || !startDate || !endDate || !reason) {
    throw new ApiError('leaveType, startDate, endDate, reason are required', 400);
  }

  const validTypes = ['casual', 'sick', 'annual', 'emergency'];
  if (!validTypes.includes(leaveType)) throw new ApiError('Invalid leave type', 400);

  const start = new Date(startDate);
  const end   = new Date(endDate);
  if (end < start) throw new ApiError('endDate must be >= startDate', 400);

  let totalDays = 0;
  const d = new Date(start);
  while (d <= end) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) totalDays++;
    d.setDate(d.getDate() + 1);
  }
  if (totalDays === 0) totalDays = 1;

  const userId = req.user!.id;
  if (leaveType !== 'emergency') {
    const balance = await prisma.leaveBalance.findUnique({
      where: { userId_year: { userId, year: currentYear() } },
    });
    if (balance) {
      const used = balance[`${leaveType}Used` as keyof typeof balance] as number;
      const total = balance[leaveType as keyof typeof balance] as number;
      if (used + totalDays > total) {
        throw new ApiError(`Insufficient ${leaveType} leave balance (${total - used} days left)`, 400);
      }
    }
  }

  const outletId = resolveCreateOutlet(req);

  const request = await prisma.leaveRequest.create({
    data: {
      userId,
      outletId,
      leaveType,
      startDate,
      endDate,
      totalDays,
      reason,
      appliedOn: todayStr(),
    },
  });

  return res.status(201).json(ApiResponse.created(request, 'Leave request submitted'));
});

export const cancelLeaveRequest = asyncHandler(async (req: Request, res: Response) => {
  const existing = await prisma.leaveRequest.findUnique({ where: { id: req.params.id } });
  if (!existing) throw new ApiError('Leave request not found', 404);
  if (existing.userId !== req.user!.id) throw new ApiError('Leave request not found', 404);
  if (existing.status !== 'pending') throw new ApiError('Only pending requests can be cancelled', 400);

  await prisma.leaveRequest.delete({ where: { id: req.params.id } });
  return res.json(ApiResponse.success(null, 'Leave request cancelled'));
});

export const reviewLeaveRequest = asyncHandler(async (req: Request, res: Response) => {
  const { action, reviewNote } = req.body;
  if (!action || !['approve', 'reject'].includes(action)) {
    throw new ApiError('action must be "approve" or "reject"', 400);
  }

  const existing = await prisma.leaveRequest.findUnique({ where: { id: req.params.id } });
  if (!existing) throw new ApiError('Leave request not found', 404);

  const scope = resolveOutletScope(req);
  if (scope && existing.outletId !== scope) throw new ApiError('Leave request not found', 404);

  if (existing.status !== 'pending') throw new ApiError('Only pending requests can be reviewed', 400);

  const newStatus = action === 'approve' ? 'approved' : 'rejected';

  const updated = await prisma.$transaction(async (tx) => {
    const req_ = await tx.leaveRequest.update({
      where: { id: existing.id },
      data: {
        status: newStatus,
        reviewedById: req.user!.id,
        reviewedOn: todayStr(),
        reviewNote: reviewNote || null,
      },
    });

    if (action === 'approve') {
      const year = currentYear();
      const field = `${existing.leaveType}Used` as 'annualUsed' | 'sickUsed' | 'casualUsed';
      if (field in { annualUsed: 1, sickUsed: 1, casualUsed: 1 }) {
        await tx.leaveBalance.upsert({
          where: { userId_year: { userId: existing.userId, year } },
          update: { [field]: { increment: existing.totalDays } },
          create: { userId: existing.userId, year, [field]: existing.totalDays },
        });
      }
    }

    return req_;
  });

  return res.json(ApiResponse.success(updated, `Leave request ${newStatus}`));
});
```

- [ ] **Step 2: Create leave-request.routes.ts**

Create `Ovenisto-backend/src/modules/leave-requests/leave-request.routes.ts`:

```typescript
import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import {
  getMyBalance,
  getAllBalances,
  updateBalance,
  getLeaveRequests,
  submitLeaveRequest,
  cancelLeaveRequest,
  reviewLeaveRequest,
} from './leave-request.controller.js';

const adminRoles = ['Super Admin', 'Admin', 'Manager'];

export const leaveRequestsRouter = Router();

// Specific paths before parameterized — ORDER MATTERS
leaveRequestsRouter.get('/my-balance',           authenticate, getMyBalance);
leaveRequestsRouter.get('/balances',             authenticate, authorize(adminRoles), getAllBalances);
leaveRequestsRouter.put('/balances/:userId',     authenticate, authorize(adminRoles), updateBalance);

leaveRequestsRouter.get('/',                     authenticate, getLeaveRequests);
leaveRequestsRouter.post('/',                    authenticate, submitLeaveRequest);
leaveRequestsRouter.delete('/:id',              authenticate, cancelLeaveRequest);
leaveRequestsRouter.put('/:id/review',           authenticate, authorize(adminRoles), reviewLeaveRequest);
```

- [ ] **Step 3: Wire into routes/index.ts**

Add import:
```typescript
import { leaveRequestsRouter } from '../modules/leave-requests/leave-request.routes.js';
```

Add mount after the attendance router line:
```typescript
router.use('/leave-requests', leaveRequestsRouter);
```

- [ ] **Step 4: Typecheck + build**

```bash
cd Ovenisto-backend
npm run typecheck
npm run build
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
cd Ovenisto-backend
git add src/modules/leave-requests/ src/routes/index.ts
git commit -m "feat(leave-requests): add submit, cancel, review, balance CRUD endpoints"
```

---

## Task 4: Staff Schedules Backend Module

**Files:**
- Create: `Ovenisto-backend/src/modules/staff-schedules/staff-schedule.controller.ts`
- Create: `Ovenisto-backend/src/modules/staff-schedules/staff-schedule.routes.ts`
- Modify: `Ovenisto-backend/src/routes/index.ts`

**Interfaces:**
- Consumes: `StaffSchedule`, `ScheduleShift` Prisma models (Task 1)
- Produces: `GET /api/staff-schedules/my`, `GET/POST /api/staff-schedules`, `PATCH /api/staff-schedules/:id/publish`, `DELETE /api/staff-schedules/:id`

- [ ] **Step 1: Create staff-schedule.controller.ts**

Create `Ovenisto-backend/src/modules/staff-schedules/staff-schedule.controller.ts`:

```typescript
import type { Request, Response } from 'express';
import { prisma } from '../../config/database.js';
import { ApiResponse } from '../../utils/ApiResponse.js';
import { ApiError } from '../../utils/ApiError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { resolveOutletScope, resolveCreateOutlet } from '../../middleware/outletScope.js';

const SHIFT_TEMPLATES: Record<string, { startTime: string | null; endTime: string | null }> = {
  morning: { startTime: '09:00', endTime: '17:00' },
  evening: { startTime: '17:00', endTime: '01:00' },
  night:   { startTime: '01:00', endTime: '09:00' },
  off:     { startTime: null,    endTime: null    },
};

export const getMySchedule = asyncHandler(async (req: Request, res: Response) => {
  const { week } = req.query as Record<string, string>;
  if (!week) throw new ApiError('week query param required (YYYY-MM-DD Monday)', 400);

  const schedule = await prisma.staffSchedule.findFirst({
    where: { userId: req.user!.id, weekStart: week },
    include: { shifts: { orderBy: { dayIndex: 'asc' } } },
  });

  return res.json(ApiResponse.success(schedule));
});

export const getAllSchedules = asyncHandler(async (req: Request, res: Response) => {
  const { weekStart, userId } = req.query as Record<string, string>;
  const where: any = {};
  if (weekStart) where.weekStart = weekStart;
  if (userId)    where.userId    = userId;

  const scope = resolveOutletScope(req);
  if (scope) where.outletId = scope;

  const schedules = await prisma.staffSchedule.findMany({
    where,
    include: {
      shifts:  { orderBy: { dayIndex: 'asc' } },
      user:    { select: { id: true, name: true, role: true } },
    },
    orderBy: [{ weekStart: 'desc' }, { user: { name: 'asc' } }],
  });

  return res.json(ApiResponse.success(schedules));
});

export const saveSchedule = asyncHandler(async (req: Request, res: Response) => {
  const { userId, weekStart, shifts } = req.body;
  if (!userId || !weekStart || !Array.isArray(shifts)) {
    throw new ApiError('userId, weekStart, and shifts[] are required', 400);
  }

  const outletId = resolveCreateOutlet(req);

  const schedule = await prisma.$transaction(async (tx) => {
    const existing = await tx.staffSchedule.findFirst({
      where: { userId, weekStart },
    });

    if (existing) {
      const scope = resolveOutletScope(req);
      if (scope && existing.outletId !== scope) throw new ApiError('Schedule not found', 404);
      await tx.scheduleShift.deleteMany({ where: { scheduleId: existing.id } });
      await tx.staffSchedule.update({
        where: { id: existing.id },
        data: { status: 'draft', updatedAt: new Date() },
      });
      await tx.scheduleShift.createMany({
        data: shifts.map((s: any) => ({
          scheduleId: existing.id,
          dayIndex: Number(s.dayIndex),
          shiftType: s.shiftType,
          startTime: SHIFT_TEMPLATES[s.shiftType]?.startTime ?? null,
          endTime:   SHIFT_TEMPLATES[s.shiftType]?.endTime   ?? null,
        })),
      });
      return tx.staffSchedule.findUnique({
        where: { id: existing.id },
        include: { shifts: { orderBy: { dayIndex: 'asc' } } },
      });
    } else {
      const created = await tx.staffSchedule.create({
        data: { userId, outletId, weekStart, status: 'draft' },
      });
      await tx.scheduleShift.createMany({
        data: shifts.map((s: any) => ({
          scheduleId: created.id,
          dayIndex: Number(s.dayIndex),
          shiftType: s.shiftType,
          startTime: SHIFT_TEMPLATES[s.shiftType]?.startTime ?? null,
          endTime:   SHIFT_TEMPLATES[s.shiftType]?.endTime   ?? null,
        })),
      });
      return tx.staffSchedule.findUnique({
        where: { id: created.id },
        include: { shifts: { orderBy: { dayIndex: 'asc' } } },
      });
    }
  });

  return res.status(201).json(ApiResponse.created(schedule, 'Schedule saved'));
});

export const publishSchedule = asyncHandler(async (req: Request, res: Response) => {
  const existing = await prisma.staffSchedule.findUnique({ where: { id: req.params.id } });
  if (!existing) throw new ApiError('Schedule not found', 404);

  const scope = resolveOutletScope(req);
  if (scope && existing.outletId !== scope) throw new ApiError('Schedule not found', 404);

  const updated = await prisma.staffSchedule.update({
    where: { id: req.params.id },
    data: { status: 'published' },
    include: { shifts: { orderBy: { dayIndex: 'asc' } } },
  });

  return res.json(ApiResponse.success(updated, 'Schedule published'));
});

export const deleteSchedule = asyncHandler(async (req: Request, res: Response) => {
  const existing = await prisma.staffSchedule.findUnique({ where: { id: req.params.id } });
  if (!existing) throw new ApiError('Schedule not found', 404);

  const scope = resolveOutletScope(req);
  if (scope && existing.outletId !== scope) throw new ApiError('Schedule not found', 404);

  await prisma.staffSchedule.delete({ where: { id: req.params.id } });
  return res.json(ApiResponse.success(null, 'Schedule deleted'));
});
```

- [ ] **Step 2: Create staff-schedule.routes.ts**

Create `Ovenisto-backend/src/modules/staff-schedules/staff-schedule.routes.ts`:

```typescript
import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import {
  getMySchedule,
  getAllSchedules,
  saveSchedule,
  publishSchedule,
  deleteSchedule,
} from './staff-schedule.controller.js';

const adminRoles = ['Super Admin', 'Admin', 'Manager'];

export const staffSchedulesRouter = Router();

staffSchedulesRouter.get('/my',            authenticate, getMySchedule);

staffSchedulesRouter.get('/',              authenticate, authorize(adminRoles), getAllSchedules);
staffSchedulesRouter.post('/',             authenticate, authorize(adminRoles), saveSchedule);
staffSchedulesRouter.patch('/:id/publish', authenticate, authorize(adminRoles), publishSchedule);
staffSchedulesRouter.delete('/:id',        authenticate, authorize(adminRoles), deleteSchedule);
```

- [ ] **Step 3: Wire into routes/index.ts**

Add import:
```typescript
import { staffSchedulesRouter } from '../modules/staff-schedules/staff-schedule.routes.js';
```

Add mount:
```typescript
router.use('/staff-schedules', staffSchedulesRouter);
```

- [ ] **Step 4: Typecheck + build**

```bash
cd Ovenisto-backend
npm run typecheck
npm run build
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
cd Ovenisto-backend
git add src/modules/staff-schedules/ src/routes/index.ts
git commit -m "feat(staff-schedules): add weekly schedule CRUD + publish endpoint"
```

---

## Task 5: Frontend Services

**Files:**
- Create: `Ovenisto_Frontend_Software/src/services/attendance.service.ts`
- Create: `Ovenisto_Frontend_Software/src/services/leave.service.ts`
- Create: `Ovenisto_Frontend_Software/src/services/schedule.service.ts`
- Modify: `Ovenisto_Frontend_Software/src/services/shift.service.ts`

**Interfaces:**
- Consumes: `api.ts` wrapper — `api.get/post/put/patch/delete` resolve the JSON envelope; services extract `res.data` (ONE level)
- Produces: exported service objects + TypeScript interfaces used by Tasks 6 & 7

- [ ] **Step 1: Create attendance.service.ts**

Create `Ovenisto_Frontend_Software/src/services/attendance.service.ts`:

```typescript
import { api } from './api';

export interface AttendanceRecord {
  id: string;
  userId: string;
  outletId: string;
  date: string;
  clockIn: string | null;
  clockOut: string | null;
  status: 'present' | 'late' | 'absent';
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  user?: { id: string; name: string; role: string };
}

export interface AttendancePage {
  data: AttendanceRecord[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export const attendanceService = {
  async clockIn(): Promise<AttendanceRecord> {
    const res = await api.post<{ success: boolean; data: AttendanceRecord }>('/attendance/clock-in', {});
    return res.data;
  },

  async clockOut(): Promise<AttendanceRecord> {
    const res = await api.post<{ success: boolean; data: AttendanceRecord }>('/attendance/clock-out', {});
    return res.data;
  },

  async getMyStatus(): Promise<AttendanceRecord | null> {
    const res = await api.get<{ success: boolean; data: AttendanceRecord | null }>('/attendance/my-status');
    return res.data;
  },

  async getMyHistory(page = 1): Promise<AttendancePage> {
    const res = await api.get<{ success: boolean; data: AttendanceRecord[]; meta: AttendancePage['meta'] }>(
      `/attendance/my-history?page=${page}&limit=30`
    );
    return { data: res.data, meta: (res as any).meta };
  },

  async getAll(params?: { date?: string; userId?: string; status?: string; page?: number }): Promise<AttendancePage> {
    const q = new URLSearchParams();
    if (params?.date)   q.set('date',   params.date);
    if (params?.userId) q.set('userId', params.userId);
    if (params?.status) q.set('status', params.status);
    if (params?.page)   q.set('page',   String(params.page));
    q.set('limit', '50');
    const res = await api.get<{ success: boolean; data: AttendanceRecord[]; meta: AttendancePage['meta'] }>(
      `/attendance?${q}`
    );
    return { data: res.data, meta: (res as any).meta };
  },

  async correct(
    id: string,
    data: { clockIn?: string | null; clockOut?: string | null; status?: string; notes?: string }
  ): Promise<AttendanceRecord> {
    const res = await api.patch<{ success: boolean; data: AttendanceRecord }>(`/attendance/${id}`, data);
    return res.data;
  },
};
```

- [ ] **Step 2: Create leave.service.ts**

Create `Ovenisto_Frontend_Software/src/services/leave.service.ts`:

```typescript
import { api } from './api';

export interface LeaveRequest {
  id: string;
  userId: string;
  outletId: string;
  leaveType: 'casual' | 'sick' | 'annual' | 'emergency';
  startDate: string;
  endDate: string;
  totalDays: number;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewedById: string | null;
  reviewedOn: string | null;
  reviewNote: string | null;
  appliedOn: string;
  createdAt: string;
  user?: { id: string; name: string; role: string };
  reviewedBy?: { id: string; name: string } | null;
}

export interface LeaveBalance {
  id: string;
  userId: string;
  year: number;
  annual: number;
  annualUsed: number;
  sick: number;
  sickUsed: number;
  casual: number;
  casualUsed: number;
  user?: { id: string; name: string; role: string };
}

export const leaveService = {
  async getMyBalance(): Promise<LeaveBalance> {
    const res = await api.get<{ success: boolean; data: LeaveBalance }>('/leave-requests/my-balance');
    return res.data;
  },

  async getAllBalances(): Promise<LeaveBalance[]> {
    const res = await api.get<{ success: boolean; data: LeaveBalance[] }>('/leave-requests/balances');
    return res.data;
  },

  async updateBalance(
    userId: string,
    data: { annual?: number; sick?: number; casual?: number }
  ): Promise<LeaveBalance> {
    const res = await api.put<{ success: boolean; data: LeaveBalance }>(`/leave-requests/balances/${userId}`, data);
    return res.data;
  },

  async getMyRequests(): Promise<LeaveRequest[]> {
    const res = await api.get<{ success: boolean; data: LeaveRequest[] }>('/leave-requests');
    return res.data;
  },

  async getAll(params?: { status?: string; userId?: string }): Promise<LeaveRequest[]> {
    const q = new URLSearchParams();
    if (params?.status) q.set('status', params.status);
    if (params?.userId) q.set('userId', params.userId);
    const res = await api.get<{ success: boolean; data: LeaveRequest[] }>(`/leave-requests?${q}`);
    return res.data;
  },

  async submit(data: {
    leaveType: string;
    startDate: string;
    endDate: string;
    reason: string;
  }): Promise<LeaveRequest> {
    const res = await api.post<{ success: boolean; data: LeaveRequest }>('/leave-requests', data);
    return res.data;
  },

  async cancel(id: string): Promise<void> {
    await api.delete(`/leave-requests/${id}`);
  },

  async review(id: string, action: 'approve' | 'reject', reviewNote?: string): Promise<LeaveRequest> {
    const res = await api.put<{ success: boolean; data: LeaveRequest }>(`/leave-requests/${id}/review`, {
      action,
      reviewNote,
    });
    return res.data;
  },
};
```

- [ ] **Step 3: Create schedule.service.ts**

Create `Ovenisto_Frontend_Software/src/services/schedule.service.ts`:

```typescript
import { api } from './api';

export interface ScheduleShift {
  id: string;
  scheduleId: string;
  dayIndex: number; // 0=Mon ... 6=Sun
  shiftType: 'morning' | 'evening' | 'night' | 'off';
  startTime: string | null;
  endTime: string | null;
}

export interface StaffSchedule {
  id: string;
  userId: string;
  outletId: string;
  weekStart: string;
  status: 'draft' | 'published';
  shifts: ScheduleShift[];
  createdAt: string;
  user?: { id: string; name: string; role: string };
}

export const SHIFT_COLORS: Record<string, string> = {
  morning: 'bg-blue-100 text-blue-700',
  evening: 'bg-amber-100 text-amber-700',
  night:   'bg-purple-100 text-purple-700',
  off:     'bg-muted text-muted-foreground',
};

export const scheduleService = {
  async getMySchedule(week: string): Promise<StaffSchedule | null> {
    const res = await api.get<{ success: boolean; data: StaffSchedule | null }>(
      `/staff-schedules/my?week=${week}`
    );
    return res.data;
  },

  async getAll(params?: { weekStart?: string; userId?: string }): Promise<StaffSchedule[]> {
    const q = new URLSearchParams();
    if (params?.weekStart) q.set('weekStart', params.weekStart);
    if (params?.userId)    q.set('userId',    params.userId);
    const res = await api.get<{ success: boolean; data: StaffSchedule[] }>(`/staff-schedules?${q}`);
    return res.data;
  },

  async save(data: {
    userId: string;
    weekStart: string;
    shifts: Array<{ dayIndex: number; shiftType: string }>;
  }): Promise<StaffSchedule> {
    const res = await api.post<{ success: boolean; data: StaffSchedule }>('/staff-schedules', data);
    return res.data;
  },

  async publish(id: string): Promise<StaffSchedule> {
    const res = await api.patch<{ success: boolean; data: StaffSchedule }>(`/staff-schedules/${id}/publish`, {});
    return res.data;
  },

  async remove(id: string): Promise<void> {
    await api.delete(`/staff-schedules/${id}`);
  },
};
```

- [ ] **Step 4: Add getShifts() to shift.service.ts**

First, read `Ovenisto_Frontend_Software/src/services/shift.service.ts` to find the `ShiftRecord` interface name and the last method in the service object. Then add `getShifts` as a new method in the service object:

```typescript
  async getShifts(params?: { status?: string; page?: number; limit?: number }): Promise<{ data: ShiftRecord[]; meta: { total: number; page: number; limit: number; totalPages: number } }> {
    const q = new URLSearchParams();
    if (params?.status) q.set('status', params.status);
    q.set('page',  String(params?.page  ?? 1));
    q.set('limit', String(params?.limit ?? 50));
    const res = await api.get<{ success: boolean; data: ShiftRecord[]; meta: any }>(`/shifts?${q}`);
    return { data: res.data, meta: (res as any).meta };
  },
```

- [ ] **Step 5: Typecheck frontend**

```bash
cd Ovenisto_Frontend_Software
npm run typecheck
```

Expected: no errors. If `ShiftRecord` is not found, check the actual interface name in `shift.service.ts` and update Step 4's generic accordingly.

- [ ] **Step 6: Commit**

```bash
cd Ovenisto_Frontend_Software
git add src/services/attendance.service.ts src/services/leave.service.ts src/services/schedule.service.ts src/services/shift.service.ts
git commit -m "feat(services): add attendance, leave, schedule services; add getShifts to shift service"
```

---

## Task 6: EmployeePortal.tsx Full Rewrite

**Files:**
- Modify: `Ovenisto_Frontend_Software/src/pages/EmployeePortal.tsx` (full replacement)

**Interfaces:**
- Consumes: `attendanceService` (Task 5), `leaveService` (Task 5), `scheduleService` (Task 5), `shiftService.getShifts()` (Task 5)
- Produces: `/my-portal` page with 4 tabs (Schedule, Attendance, Leaves, Cash Shifts)

- [ ] **Step 1: Rewrite EmployeePortal.tsx**

Replace the entire contents of `Ovenisto_Frontend_Software/src/pages/EmployeePortal.tsx`:

```tsx
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Calendar, Clock, FileText, ChevronLeft, ChevronRight,
  LogIn, LogOut, Plus, X, Timer
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/ui/page-header";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { attendanceService, type AttendanceRecord } from "@/services/attendance.service";
import { leaveService, type LeaveRequest, type LeaveBalance } from "@/services/leave.service";
import { scheduleService, type StaffSchedule, SHIFT_COLORS } from "@/services/schedule.service";
import { shiftService } from "@/services/shift.service";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const LEAVE_TYPE_COLORS: Record<string, string> = {
  sick:      "bg-destructive/10 text-destructive",
  casual:    "bg-blue-100 text-blue-700",
  annual:    "bg-success/10 text-success",
  emergency: "bg-warning/10 text-warning",
};
const LEAVE_STATUS_COLORS: Record<string, string> = {
  pending:  "bg-warning/10 text-warning",
  approved: "bg-success/10 text-success",
  rejected: "bg-destructive/10 text-destructive",
};
const ATT_STATUS_COLORS: Record<string, string> = {
  present: "bg-success/10 text-success",
  late:    "bg-warning/10 text-warning",
  absent:  "bg-destructive/10 text-destructive",
};

function getWeekStart(offset = 0): string {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1) + offset * 7;
  const d = new Date(now);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().split("T")[0];
}

function formatTime(dt: string | null | undefined): string {
  if (!dt) return "—";
  return new Date(dt).toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit", hour12: true });
}

function hoursWorked(clockIn: string | null, clockOut: string | null): string {
  if (!clockIn || !clockOut) return "—";
  const diff = (new Date(clockOut).getTime() - new Date(clockIn).getTime()) / 3600000;
  return `${diff.toFixed(1)}h`;
}

function ElapsedTimer({ clockIn }: { clockIn: string }) {
  const [elapsed, setElapsed] = useState("");
  useEffect(() => {
    const update = () => {
      const ms = Date.now() - new Date(clockIn).getTime();
      const h = Math.floor(ms / 3600000);
      const m = Math.floor((ms % 3600000) / 60000);
      setElapsed(`${h}h ${m}m`);
    };
    update();
    const id = setInterval(update, 60000);
    return () => clearInterval(id);
  }, [clockIn]);
  return <span className="text-primary font-mono font-bold">{elapsed}</span>;
}

export default function EmployeePortal() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [weekOffset, setWeekOffset] = useState(0);
  const [showLeaveForm, setShowLeaveForm] = useState(false);
  const [leaveForm, setLeaveForm] = useState({ leaveType: "casual", startDate: "", endDate: "", reason: "" });
  const [viewLeave, setViewLeave] = useState<LeaveRequest | null>(null);

  const weekStart = getWeekStart(weekOffset);
  const today = new Date().toISOString().split("T")[0];
  const todayDayIndex = (() => { const d = new Date().getDay(); return d === 0 ? 6 : d - 1; })();

  const { data: schedule } = useQuery({
    queryKey: ["my-schedule", weekStart],
    queryFn: () => scheduleService.getMySchedule(weekStart),
  });

  const { data: todayStatus, refetch: refetchStatus } = useQuery({
    queryKey: ["my-attendance-status"],
    queryFn: () => attendanceService.getMyStatus(),
    refetchInterval: 60000,
  });

  const { data: historyData } = useQuery({
    queryKey: ["my-attendance-history"],
    queryFn: () => attendanceService.getMyHistory(),
  });

  const { data: leaveBalance } = useQuery({
    queryKey: ["my-leave-balance"],
    queryFn: () => leaveService.getMyBalance(),
  });

  const { data: myRequests } = useQuery({
    queryKey: ["my-leave-requests"],
    queryFn: () => leaveService.getMyRequests(),
  });

  const { data: shiftsData } = useQuery({
    queryKey: ["my-shifts"],
    queryFn: () => shiftService.getShifts({ limit: 50 }),
    enabled: user?.role === "Cashier",
  });

  const clockInMut = useMutation({
    mutationFn: () => attendanceService.clockIn(),
    onSuccess: () => { toast.success("Clocked in!"); refetchStatus(); },
    onError: (e: any) => toast.error(e?.message || "Clock-in failed"),
  });

  const clockOutMut = useMutation({
    mutationFn: () => attendanceService.clockOut(),
    onSuccess: () => {
      toast.success("Clocked out!");
      refetchStatus();
      qc.invalidateQueries({ queryKey: ["my-attendance-history"] });
    },
    onError: (e: any) => toast.error(e?.message || "Clock-out failed"),
  });

  const submitLeaveMut = useMutation({
    mutationFn: () => leaveService.submit(leaveForm),
    onSuccess: () => {
      toast.success("Leave request submitted");
      setShowLeaveForm(false);
      setLeaveForm({ leaveType: "casual", startDate: "", endDate: "", reason: "" });
      qc.invalidateQueries({ queryKey: ["my-leave-requests"] });
      qc.invalidateQueries({ queryKey: ["my-leave-balance"] });
    },
    onError: (e: any) => toast.error(e?.message || "Submission failed"),
  });

  const cancelLeaveMut = useMutation({
    mutationFn: (id: string) => leaveService.cancel(id),
    onSuccess: () => {
      toast.success("Request cancelled");
      qc.invalidateQueries({ queryKey: ["my-leave-requests"] });
    },
    onError: (e: any) => toast.error(e?.message || "Cancel failed"),
  });

  const historyRows: AttendanceRecord[] = historyData?.data ?? [];
  const myShifts = (shiftsData?.data ?? []).filter((s: any) => s.cashierId === user?.id);

  const monthStr = today.slice(0, 7);
  const monthRows = historyRows.filter(r => r.date.startsWith(monthStr));
  const presentCount = monthRows.filter(r => r.status === "present").length;
  const lateCount    = monthRows.filter(r => r.status === "late").length;
  const absentCount  = monthRows.filter(r => r.status === "absent").length;
  const totalHours   = monthRows.reduce((acc, r) => {
    if (!r.clockIn || !r.clockOut) return acc;
    return acc + (new Date(r.clockOut).getTime() - new Date(r.clockIn).getTime()) / 3600000;
  }, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<Timer className="h-5 w-5" />}
        title="My Portal"
        subtitle={`Welcome, ${user?.name || "Staff"}`}
      />

      <Tabs defaultValue="schedule">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="schedule" className="gap-1.5"><Calendar className="h-3.5 w-3.5" />Schedule</TabsTrigger>
          <TabsTrigger value="attendance" className="gap-1.5"><Clock className="h-3.5 w-3.5" />Attendance</TabsTrigger>
          <TabsTrigger value="leaves" className="gap-1.5"><FileText className="h-3.5 w-3.5" />Leaves</TabsTrigger>
          {user?.role === "Cashier" && (
            <TabsTrigger value="cash-shifts" className="gap-1.5"><Timer className="h-3.5 w-3.5" />Cash Shifts</TabsTrigger>
          )}
        </TabsList>

        {/* SCHEDULE TAB */}
        <TabsContent value="schedule" className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button size="icon" variant="outline" onClick={() => setWeekOffset(o => o - 1)}><ChevronLeft className="h-4 w-4" /></Button>
              <span className="text-sm font-medium w-40 text-center">Week of {weekStart}</span>
              <Button size="icon" variant="outline" onClick={() => setWeekOffset(o => o + 1)}><ChevronRight className="h-4 w-4" /></Button>
            </div>
            <Button size="sm" variant="outline" onClick={() => setWeekOffset(0)}>Today</Button>
          </div>

          {!schedule || schedule.status === "draft" ? (
            <p className="text-center text-muted-foreground py-12">No published schedule for this week.</p>
          ) : (
            <div className="grid grid-cols-7 gap-2">
              {DAY_LABELS.map((label, i) => {
                const shift = schedule.shifts.find(s => s.dayIndex === i);
                const dateObj = new Date(weekStart);
                dateObj.setDate(dateObj.getDate() + i);
                const dateStr = dateObj.toISOString().split("T")[0];
                const isToday = dateStr === today;
                return (
                  <Card key={i} className={cn("shadow-sm text-center", isToday && "ring-2 ring-primary")}>
                    <CardContent className="p-3 space-y-1">
                      <p className="text-xs text-muted-foreground">{label}</p>
                      <p className="text-xs font-medium">{dateObj.getDate()}</p>
                      <Badge variant="secondary" className={cn("text-[10px] px-1", SHIFT_COLORS[shift?.shiftType ?? "off"])}>
                        {shift?.shiftType ?? "—"}
                      </Badge>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ATTENDANCE TAB */}
        <TabsContent value="attendance" className="mt-4 space-y-4">
          <Card className="shadow-sm border-primary/20">
            <CardHeader className="pb-2"><CardTitle className="text-base">Today — {today}</CardTitle></CardHeader>
            <CardContent>
              {!todayStatus?.clockIn ? (
                <div className="text-center py-4">
                  <p className="text-sm text-muted-foreground mb-3">You have not clocked in today.</p>
                  <Button size="lg" className="gradient-primary text-primary-foreground gap-2 w-full max-w-xs"
                    onClick={() => clockInMut.mutate()} disabled={clockInMut.isPending}>
                    <LogIn className="h-5 w-5" />Check In
                  </Button>
                </div>
              ) : !todayStatus.clockOut ? (
                <div className="text-center py-4 space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Clocked in at {formatTime(todayStatus.clockIn)} · Elapsed: <ElapsedTimer clockIn={todayStatus.clockIn} />
                  </p>
                  <Button size="lg" variant="outline" className="gap-2 border-warning/40 text-warning w-full max-w-xs"
                    onClick={() => clockOutMut.mutate()} disabled={clockOutMut.isPending}>
                    <LogOut className="h-5 w-5" />Check Out
                  </Button>
                </div>
              ) : (
                <div className="text-center py-4 space-y-1">
                  <p className="text-sm">In: {formatTime(todayStatus.clockIn)} · Out: {formatTime(todayStatus.clockOut)}</p>
                  <p className="text-sm font-medium">Total: {hoursWorked(todayStatus.clockIn, todayStatus.clockOut)}</p>
                  <Badge className={cn("mt-1", ATT_STATUS_COLORS[todayStatus.status])}>{todayStatus.status}</Badge>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Present", value: presentCount, color: "text-success" },
              { label: "Late",    value: lateCount,    color: "text-warning" },
              { label: "Absent",  value: absentCount,  color: "text-destructive" },
              { label: "Hours",   value: `${totalHours.toFixed(1)}h`, color: "text-primary" },
            ].map(s => (
              <Card key={s.label} className="shadow-sm">
                <CardContent className="p-3 text-center">
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <p className={cn("text-xl font-bold", s.color)}>{s.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="shadow-sm">
            <CardHeader><CardTitle className="text-sm">History</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead>Date</TableHead><TableHead>Clock In</TableHead><TableHead>Clock Out</TableHead><TableHead>Hours</TableHead><TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historyRows.slice(0, 30).map(r => (
                    <TableRow key={r.id}>
                      <TableCell className="text-sm">{r.date}</TableCell>
                      <TableCell className="text-sm">{formatTime(r.clockIn)}</TableCell>
                      <TableCell className="text-sm">{formatTime(r.clockOut)}</TableCell>
                      <TableCell className="text-sm">{hoursWorked(r.clockIn, r.clockOut)}</TableCell>
                      <TableCell><Badge variant="secondary" className={ATT_STATUS_COLORS[r.status]}>{r.status}</Badge></TableCell>
                    </TableRow>
                  ))}
                  {historyRows.length === 0 && (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No attendance history</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* LEAVES TAB */}
        <TabsContent value="leaves" className="mt-4 space-y-4">
          {leaveBalance && (
            <div className="grid grid-cols-3 gap-3">
              {(["annual", "sick", "casual"] as const).map(type => {
                const used = leaveBalance[`${type}Used` as keyof LeaveBalance] as number;
                const total = leaveBalance[type] as number;
                return (
                  <Card key={type} className="shadow-sm">
                    <CardContent className="p-3 space-y-1">
                      <p className="text-xs font-medium capitalize">{type}</p>
                      <p className="text-lg font-bold">{total - used}<span className="text-xs text-muted-foreground font-normal"> / {total}</span></p>
                      <Progress value={(used / total) * 100} className="h-1.5" />
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          <div className="flex justify-end">
            <Button size="sm" onClick={() => setShowLeaveForm(v => !v)}>
              {showLeaveForm ? <X className="h-3.5 w-3.5 mr-1" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
              {showLeaveForm ? "Cancel" : "Request Leave"}
            </Button>
          </div>

          {showLeaveForm && (
            <Card className="shadow-sm border-primary/30">
              <CardHeader><CardTitle className="text-sm">New Leave Request</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label>Leave Type</Label>
                  <Select value={leaveForm.leaveType} onValueChange={v => setLeaveForm(f => ({ ...f, leaveType: v }))}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["casual", "sick", "annual", "emergency"].map(t => (
                        <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Start Date</Label>
                    <Input type="date" value={leaveForm.startDate} onChange={e => setLeaveForm(f => ({ ...f, startDate: e.target.value }))} className="mt-1" />
                  </div>
                  <div>
                    <Label>End Date</Label>
                    <Input type="date" value={leaveForm.endDate} onChange={e => setLeaveForm(f => ({ ...f, endDate: e.target.value }))} className="mt-1" />
                  </div>
                </div>
                <div>
                  <Label>Reason</Label>
                  <Textarea value={leaveForm.reason} onChange={e => setLeaveForm(f => ({ ...f, reason: e.target.value }))} className="mt-1" rows={3} />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => setShowLeaveForm(false)}>Cancel</Button>
                  <Button size="sm" className="gradient-primary text-primary-foreground"
                    disabled={!leaveForm.startDate || !leaveForm.endDate || !leaveForm.reason || submitLeaveMut.isPending}
                    onClick={() => submitLeaveMut.mutate()}>Submit</Button>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="space-y-2">
            {(myRequests ?? []).map(r => (
              <Card key={r.id} className="shadow-sm cursor-pointer hover:bg-muted/30" onClick={() => setViewLeave(r)}>
                <CardContent className="p-3 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className={cn("text-xs", LEAVE_TYPE_COLORS[r.leaveType])}>{r.leaveType}</Badge>
                      <Badge variant="secondary" className={cn("text-xs", LEAVE_STATUS_COLORS[r.status])}>{r.status}</Badge>
                    </div>
                    <p className="text-sm">{r.startDate} → {r.endDate} <span className="text-muted-foreground">({r.totalDays}d)</span></p>
                    <p className="text-xs text-muted-foreground">{r.reason}</p>
                  </div>
                  {r.status === "pending" && (
                    <Button size="sm" variant="ghost" className="text-destructive h-7"
                      onClick={e => { e.stopPropagation(); cancelLeaveMut.mutate(r.id); }}>
                      Cancel
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
            {(myRequests ?? []).length === 0 && (
              <p className="text-center text-muted-foreground py-8">No leave requests</p>
            )}
          </div>
        </TabsContent>

        {/* CASH SHIFTS TAB */}
        {user?.role === "Cashier" && (
          <TabsContent value="cash-shifts" className="mt-4">
            <Card className="shadow-sm">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                      <TableHead>Opened</TableHead><TableHead>Closed</TableHead>
                      <TableHead className="text-right">Opening Cash</TableHead>
                      <TableHead className="text-right">Total Sales</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {myShifts.map((s: any) => (
                      <TableRow key={s.id}>
                        <TableCell className="text-sm">{new Date(s.openedAt).toLocaleDateString("en-PK")}</TableCell>
                        <TableCell className="text-sm">{s.closedAt ? new Date(s.closedAt).toLocaleDateString("en-PK") : "—"}</TableCell>
                        <TableCell className="text-right text-sm">Rs. {s.openingCash?.toLocaleString() ?? "—"}</TableCell>
                        <TableCell className="text-right text-sm text-success">Rs. {s.totalSales?.toLocaleString()}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={s.status === "open" ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}>
                            {s.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                    {myShifts.length === 0 && (
                      <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No shift history</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      <Dialog open={!!viewLeave} onOpenChange={() => setViewLeave(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Leave Request Detail</DialogTitle></DialogHeader>
          {viewLeave && (
            <div className="space-y-2 text-sm">
              <div className="flex gap-2">
                <Badge variant="secondary" className={LEAVE_TYPE_COLORS[viewLeave.leaveType]}>{viewLeave.leaveType}</Badge>
                <Badge variant="secondary" className={LEAVE_STATUS_COLORS[viewLeave.status]}>{viewLeave.status}</Badge>
              </div>
              <p><strong>Dates:</strong> {viewLeave.startDate} → {viewLeave.endDate} ({viewLeave.totalDays} day{viewLeave.totalDays !== 1 ? "s" : ""})</p>
              <p><strong>Reason:</strong> {viewLeave.reason}</p>
              {viewLeave.reviewNote && <p><strong>Review note:</strong> {viewLeave.reviewNote}</p>}
              {viewLeave.reviewedBy && <p><strong>Reviewed by:</strong> {viewLeave.reviewedBy.name} on {viewLeave.reviewedOn}</p>}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd Ovenisto_Frontend_Software
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd Ovenisto_Frontend_Software
git add src/pages/EmployeePortal.tsx
git commit -m "feat(my-portal): rewrite EmployeePortal with API-backed schedule/attendance/leaves/cash-shifts tabs"
```

---

## Task 7: Attendance.tsx Full Rewrite (Admin HR Hub)

**Files:**
- Modify: `Ovenisto_Frontend_Software/src/pages/Attendance.tsx` (full replacement)

**Interfaces:**
- Consumes: `attendanceService` (Task 5), `leaveService` (Task 5), `scheduleService` (Task 5); `userService` (existing — check method name before writing)
- Produces: `/attendance` page with 3 tabs (Attendance, Leave Requests, Schedules)

- [ ] **Step 1: Check userService method name**

Run:
```bash
grep -n "export\|async get" Ovenisto_Frontend_Software/src/services/user.service.ts | head -20
```

Note the exact method name for fetching all users (likely `getUsers()` or `getAllUsers()`). Use that exact name in the import and call below.

- [ ] **Step 2: Rewrite Attendance.tsx**

Replace the entire contents of `Ovenisto_Frontend_Software/src/pages/Attendance.tsx`:

```tsx
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Clock, FileText, Calendar, ChevronLeft, ChevronRight,
  Check, X, Edit2, Save, Lock
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/ui/page-header";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { attendanceService, type AttendanceRecord } from "@/services/attendance.service";
import { leaveService, type LeaveBalance } from "@/services/leave.service";
import { scheduleService, type StaffSchedule, SHIFT_COLORS } from "@/services/schedule.service";
import { userService } from "@/services/user.service";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const SHIFT_CYCLE = ["morning", "evening", "night", "off"] as const;

const LEAVE_TYPE_COLORS: Record<string, string> = {
  sick:      "bg-destructive/10 text-destructive",
  casual:    "bg-blue-100 text-blue-700",
  annual:    "bg-success/10 text-success",
  emergency: "bg-warning/10 text-warning",
};
const LEAVE_STATUS_COLORS: Record<string, string> = {
  pending:  "bg-warning/10 text-warning",
  approved: "bg-success/10 text-success",
  rejected: "bg-destructive/10 text-destructive",
};
const ATT_STATUS_COLORS: Record<string, string> = {
  present: "bg-success/10 text-success",
  late:    "bg-warning/10 text-warning",
  absent:  "bg-destructive/10 text-destructive",
};

function getWeekStart(offset = 0): string {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1) + offset * 7;
  const d = new Date(now);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().split("T")[0];
}

function formatTime(dt: string | null | undefined): string {
  if (!dt) return "—";
  return new Date(dt).toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit", hour12: true });
}

function hoursWorked(clockIn: string | null, clockOut: string | null): string {
  if (!clockIn || !clockOut) return "—";
  const diff = (new Date(clockOut).getTime() - new Date(clockIn).getTime()) / 3600000;
  return `${diff.toFixed(1)}h`;
}

export default function AttendancePage() {
  const qc = useQueryClient();
  const today = new Date().toISOString().split("T")[0];

  const [attDate, setAttDate] = useState(today);
  const [attUserFilter, setAttUserFilter] = useState("all");
  const [editRow, setEditRow] = useState<string | null>(null);
  const [editData, setEditData] = useState({ clockIn: "", clockOut: "", status: "present", notes: "" });

  const [leaveFilter, setLeaveFilter] = useState("pending");
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [editBalance, setEditBalance] = useState<string | null>(null);
  const [balanceEdit, setBalanceEdit] = useState({ annual: 14, sick: 6, casual: 6 });

  const [schedWeekOffset, setSchedWeekOffset] = useState(0);
  const schedWeekStart = getWeekStart(schedWeekOffset);
  const [draftShifts, setDraftShifts] = useState<Record<string, Record<number, string>>>({});

  const { data: users = [] } = useQuery({
    queryKey: ["users-list"],
    // IMPORTANT: replace getUsers() with the actual method name found in Step 1
    queryFn: () => userService.getUsers(),
  });

  const { data: attPage, refetch: refetchAtt } = useQuery({
    queryKey: ["all-attendance", attDate, attUserFilter],
    queryFn: () => attendanceService.getAll({
      date: attDate,
      userId: attUserFilter !== "all" ? attUserFilter : undefined,
    }),
  });

  const { data: leaveRequests = [], refetch: refetchLeaves } = useQuery({
    queryKey: ["all-leaves", leaveFilter],
    queryFn: () => leaveService.getAll({ status: leaveFilter === "all" ? undefined : leaveFilter }),
  });

  const { data: balances = [], refetch: refetchBalances } = useQuery({
    queryKey: ["all-balances"],
    queryFn: () => leaveService.getAllBalances(),
  });

  const { data: schedules = [], refetch: refetchSchedules } = useQuery({
    queryKey: ["all-schedules", schedWeekStart],
    queryFn: () => scheduleService.getAll({ weekStart: schedWeekStart }),
  });

  const correctMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => attendanceService.correct(id, data),
    onSuccess: () => { toast.success("Attendance updated"); setEditRow(null); refetchAtt(); },
    onError: (e: any) => toast.error(e?.message || "Update failed"),
  });

  const reviewMut = useMutation({
    mutationFn: ({ id, action, note }: { id: string; action: "approve" | "reject"; note?: string }) =>
      leaveService.review(id, action, note),
    onSuccess: (_, vars) => {
      toast.success(`Request ${vars.action}d`);
      if (vars.action === "reject") setRejectId(null);
      refetchLeaves();
      refetchBalances();
    },
    onError: (e: any) => toast.error(e?.message || "Review failed"),
  });

  const updateBalanceMut = useMutation({
    mutationFn: ({ userId, data }: { userId: string; data: any }) => leaveService.updateBalance(userId, data),
    onSuccess: () => { toast.success("Balance updated"); setEditBalance(null); refetchBalances(); },
    onError: (e: any) => toast.error(e?.message || "Update failed"),
  });

  const saveSched = useMutation({
    mutationFn: ({ userId, shifts }: { userId: string; shifts: Array<{ dayIndex: number; shiftType: string }> }) =>
      scheduleService.save({ userId, weekStart: schedWeekStart, shifts }),
    onSuccess: () => { toast.success("Schedule saved"); refetchSchedules(); },
    onError: (e: any) => toast.error(e?.message || "Save failed"),
  });

  const publishSched = useMutation({
    mutationFn: (id: string) => scheduleService.publish(id),
    onSuccess: () => { toast.success("Schedule published"); refetchSchedules(); },
    onError: (e: any) => toast.error(e?.message || "Publish failed"),
  });

  const attRows: AttendanceRecord[] = attPage?.data ?? [];
  const present = attRows.filter(r => r.status === "present").length;
  const late     = attRows.filter(r => r.status === "late").length;
  const absent   = attRows.filter(r => r.status === "absent").length;

  function startEdit(r: AttendanceRecord) {
    setEditRow(r.id);
    setEditData({
      clockIn:  r.clockIn  ? new Date(r.clockIn).toTimeString().slice(0, 5)  : "",
      clockOut: r.clockOut ? new Date(r.clockOut).toTimeString().slice(0, 5) : "",
      status:   r.status,
      notes:    r.notes ?? "",
    });
  }

  function saveEdit(r: AttendanceRecord) {
    const base = attDate;
    correctMut.mutate({
      id: r.id,
      data: {
        clockIn:  editData.clockIn  ? `${base}T${editData.clockIn}:00.000Z`  : null,
        clockOut: editData.clockOut ? `${base}T${editData.clockOut}:00.000Z` : null,
        status:   editData.status,
        notes:    editData.notes || null,
      },
    });
  }

  function getDraftOrSaved(userId: string, dayIndex: number, saved?: StaffSchedule): string {
    return draftShifts[userId]?.[dayIndex] ??
           saved?.shifts.find(s => s.dayIndex === dayIndex)?.shiftType ??
           "off";
  }

  function buildShiftsPayload(userId: string, saved?: StaffSchedule) {
    return DAY_LABELS.map((_, i) => ({
      dayIndex: i,
      shiftType: getDraftOrSaved(userId, i, saved),
    }));
  }

  function cycleDayShift(userId: string, dayIndex: number, current: string) {
    const next = SHIFT_CYCLE[(SHIFT_CYCLE.indexOf(current as any) + 1) % SHIFT_CYCLE.length];
    setDraftShifts(prev => ({ ...prev, [userId]: { ...(prev[userId] ?? {}), [dayIndex]: next } }));
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<Clock className="h-5 w-5" />}
        title="HR Management"
        subtitle="Attendance, leave requests, and staff schedules"
      />

      <Tabs defaultValue="attendance">
        <TabsList>
          <TabsTrigger value="attendance" className="gap-1.5"><Clock className="h-3.5 w-3.5" />Attendance</TabsTrigger>
          <TabsTrigger value="leaves" className="gap-1.5"><FileText className="h-3.5 w-3.5" />Leave Requests</TabsTrigger>
          <TabsTrigger value="schedules" className="gap-1.5"><Calendar className="h-3.5 w-3.5" />Schedules</TabsTrigger>
        </TabsList>

        {/* ATTENDANCE TAB */}
        <TabsContent value="attendance" className="mt-4 space-y-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <Label className="text-xs">Date</Label>
              <Input type="date" value={attDate} onChange={e => setAttDate(e.target.value)} className="mt-1 w-44" />
            </div>
            <div>
              <Label className="text-xs">Employee</Label>
              <Select value={attUserFilter} onValueChange={setAttUserFilter}>
                <SelectTrigger className="mt-1 w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Employees</SelectItem>
                  {users.map((u: any) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Present", value: present, color: "text-success" },
              { label: "Late",    value: late,    color: "text-warning" },
              { label: "Absent",  value: absent,  color: "text-destructive" },
              { label: "Not Recorded", value: Math.max(0, users.length - attRows.length), color: "text-muted-foreground" },
            ].map(s => (
              <Card key={s.label} className="shadow-sm">
                <CardContent className="p-3 text-center">
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <p className={cn("text-xl font-bold", s.color)}>{s.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="shadow-sm">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead>Employee</TableHead><TableHead>Clock In</TableHead><TableHead>Clock Out</TableHead>
                    <TableHead>Hours</TableHead><TableHead>Status</TableHead><TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {attRows.map(r => (
                    <>
                      <TableRow key={r.id} className="hover:bg-muted/30">
                        <TableCell>
                          <p className="text-sm font-medium">{r.user?.name ?? "—"}</p>
                          <p className="text-xs text-muted-foreground">{r.user?.role ?? ""}</p>
                        </TableCell>
                        <TableCell className="text-sm">
                          {editRow === r.id
                            ? <Input type="time" value={editData.clockIn} onChange={e => setEditData(d => ({ ...d, clockIn: e.target.value }))} className="h-7 w-28" />
                            : formatTime(r.clockIn)}
                        </TableCell>
                        <TableCell className="text-sm">
                          {editRow === r.id
                            ? <Input type="time" value={editData.clockOut} onChange={e => setEditData(d => ({ ...d, clockOut: e.target.value }))} className="h-7 w-28" />
                            : formatTime(r.clockOut)}
                        </TableCell>
                        <TableCell className="text-sm">{hoursWorked(r.clockIn, r.clockOut)}</TableCell>
                        <TableCell>
                          {editRow === r.id
                            ? <Select value={editData.status} onValueChange={v => setEditData(d => ({ ...d, status: v }))}>
                                <SelectTrigger className="h-7 w-28"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {["present", "late", "absent"].map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            : <Badge variant="secondary" className={ATT_STATUS_COLORS[r.status]}>{r.status}</Badge>}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {editRow === r.id ? (
                              <>
                                <Button size="icon" variant="ghost" className="h-7 w-7 text-success" onClick={() => saveEdit(r)}><Save className="h-3.5 w-3.5" /></Button>
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditRow(null)}><X className="h-3.5 w-3.5" /></Button>
                              </>
                            ) : (
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(r)}><Edit2 className="h-3.5 w-3.5" /></Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                      {editRow === r.id && (
                        <TableRow key={`${r.id}-notes`}>
                          <TableCell colSpan={6} className="pt-0 pb-2 px-4">
                            <Input placeholder="Notes (optional)" value={editData.notes} onChange={e => setEditData(d => ({ ...d, notes: e.target.value }))} className="h-7" />
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  ))}
                  {attRows.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No records for {attDate}</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* LEAVE REQUESTS TAB */}
        <TabsContent value="leaves" className="mt-4 space-y-4">
          <div className="flex gap-2">
            {["pending", "all"].map(f => (
              <Button key={f} size="sm" variant={leaveFilter === f ? "default" : "outline"} className="capitalize" onClick={() => setLeaveFilter(f)}>{f}</Button>
            ))}
          </div>

          <div className="space-y-2">
            {leaveRequests.map(r => (
              <Card key={r.id} className="shadow-sm">
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{r.user?.name ?? "—"}</span>
                        <span className="text-xs text-muted-foreground">{r.user?.role}</span>
                        <Badge variant="secondary" className={cn("text-xs", LEAVE_TYPE_COLORS[r.leaveType])}>{r.leaveType}</Badge>
                        <Badge variant="secondary" className={cn("text-xs", LEAVE_STATUS_COLORS[r.status])}>{r.status}</Badge>
                      </div>
                      <p className="text-sm">{r.startDate} → {r.endDate} ({r.totalDays}d)</p>
                      <p className="text-xs text-muted-foreground">{r.reason}</p>
                    </div>
                    {r.status === "pending" && (
                      <div className="flex gap-1 shrink-0">
                        <Button size="sm" className="h-8 bg-success hover:bg-success/90 text-white gap-1"
                          onClick={() => reviewMut.mutate({ id: r.id, action: "approve" })} disabled={reviewMut.isPending}>
                          <Check className="h-3.5 w-3.5" />Approve
                        </Button>
                        <Button size="sm" variant="outline" className="h-8 text-destructive border-destructive/30 gap-1"
                          onClick={() => setRejectId(r.id)}>
                          <X className="h-3.5 w-3.5" />Reject
                        </Button>
                      </div>
                    )}
                  </div>
                  {rejectId === r.id && (
                    <div className="space-y-2 border-t pt-2">
                      <Textarea placeholder="Rejection note (optional)" value={rejectNote} onChange={e => setRejectNote(e.target.value)} rows={2} className="text-sm" />
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="outline" onClick={() => setRejectId(null)}>Cancel</Button>
                        <Button size="sm" variant="destructive" onClick={() => { reviewMut.mutate({ id: r.id, action: "reject", note: rejectNote }); setRejectNote(""); }}>
                          Confirm Reject
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
            {leaveRequests.length === 0 && (
              <p className="text-center text-muted-foreground py-8">No {leaveFilter !== "all" ? leaveFilter : ""} leave requests</p>
            )}
          </div>

          <Card className="shadow-sm">
            <CardHeader><CardTitle className="text-sm">Leave Balances — {new Date().getFullYear()}</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead>Employee</TableHead>
                    <TableHead className="text-center">Annual</TableHead>
                    <TableHead className="text-center">Sick</TableHead>
                    <TableHead className="text-center">Casual</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {balances.map(b => (
                    <TableRow key={b.id} className="hover:bg-muted/30">
                      <TableCell>
                        <p className="text-sm font-medium">{b.user?.name ?? "—"}</p>
                        <p className="text-xs text-muted-foreground">{b.user?.role}</p>
                      </TableCell>
                      {(["annual", "sick", "casual"] as const).map(type => (
                        <TableCell key={type} className="text-center text-sm">
                          {editBalance === b.id
                            ? <Input type="number" min="0" value={balanceEdit[type]} onChange={e => setBalanceEdit(d => ({ ...d, [type]: Number(e.target.value) }))} className="h-7 w-16 text-center" />
                            : <span>{b[`${type}Used` as keyof LeaveBalance] as number} / {b[type]}</span>}
                        </TableCell>
                      ))}
                      <TableCell>
                        {editBalance === b.id ? (
                          <div className="flex gap-1">
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-success" onClick={() => updateBalanceMut.mutate({ userId: b.userId, data: balanceEdit })}><Save className="h-3.5 w-3.5" /></Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditBalance(null)}><X className="h-3.5 w-3.5" /></Button>
                          </div>
                        ) : (
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditBalance(b.id); setBalanceEdit({ annual: b.annual, sick: b.sick, casual: b.casual }); }}><Edit2 className="h-3.5 w-3.5" /></Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {balances.length === 0 && (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No balances yet</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* SCHEDULES TAB */}
        <TabsContent value="schedules" className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button size="icon" variant="outline" onClick={() => setSchedWeekOffset(o => o - 1)}><ChevronLeft className="h-4 w-4" /></Button>
              <span className="text-sm font-medium w-40 text-center">Week of {schedWeekStart}</span>
              <Button size="icon" variant="outline" onClick={() => setSchedWeekOffset(o => o + 1)}><ChevronRight className="h-4 w-4" /></Button>
            </div>
            <Button size="sm" variant="outline" onClick={() => setSchedWeekOffset(0)}>Current Week</Button>
          </div>

          <Card className="shadow-sm overflow-x-auto">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead className="w-44">Employee</TableHead>
                    {DAY_LABELS.map(d => <TableHead key={d} className="text-center text-xs w-24">{d}</TableHead>)}
                    <TableHead className="w-36"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.filter((u: any) => !["Rider", "Customer Screen"].includes(u.role)).map((u: any) => {
                    const saved = schedules.find(s => s.userId === u.id);
                    const isPublished = saved?.status === "published" && !draftShifts[u.id];
                    return (
                      <TableRow key={u.id} className="hover:bg-muted/20">
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {isPublished && <Lock className="h-3 w-3 text-muted-foreground" />}
                            <div>
                              <p className="text-sm font-medium">{u.name}</p>
                              <p className="text-xs text-muted-foreground">{u.role}</p>
                            </div>
                          </div>
                        </TableCell>
                        {DAY_LABELS.map((_, i) => {
                          const shiftType = getDraftOrSaved(u.id, i, saved);
                          return (
                            <TableCell key={i} className="text-center p-1">
                              <button
                                disabled={isPublished}
                                className={cn("text-[10px] px-1.5 py-1 rounded font-medium transition-colors w-full", SHIFT_COLORS[shiftType], !isPublished && "cursor-pointer hover:opacity-80")}
                                onClick={() => cycleDayShift(u.id, i, shiftType)}
                              >
                                {shiftType}
                              </button>
                            </TableCell>
                          );
                        })}
                        <TableCell>
                          <div className="flex gap-1 justify-end">
                            {!isPublished && (
                              <Button size="sm" variant="outline" className="h-7 text-xs" disabled={saveSched.isPending}
                                onClick={() => saveSched.mutate({ userId: u.id, shifts: buildShiftsPayload(u.id, saved) })}>
                                Save Draft
                              </Button>
                            )}
                            {saved?.status === "draft" && !draftShifts[u.id] && (
                              <Button size="sm" className="h-7 text-xs gradient-primary text-primary-foreground"
                                disabled={publishSched.isPending} onClick={() => publishSched.mutate(saved.id)}>
                                Publish
                              </Button>
                            )}
                            {isPublished && (
                              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setDraftShifts(prev => ({ ...prev, [u.id]: {} }))}>
                                Edit
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {users.length === 0 && (
                    <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">No staff found</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

```bash
cd Ovenisto_Frontend_Software
npm run typecheck
```

Fix any errors (most commonly: `userService` method name mismatch from Step 1). Re-run until clean.

- [ ] **Step 4: Commit**

```bash
cd Ovenisto_Frontend_Software
git add src/pages/Attendance.tsx
git commit -m "feat(attendance-page): rewrite as admin HR hub with attendance/leave/schedule tabs"
```

---

## Task 8: Restrict /attendance Route to Admins

**Files:**
- Modify: `Ovenisto_Frontend_Software/src/contexts/AuthContext.tsx`

**Context:** Currently every role has `"attendance"` in its permissions. The admin HR hub should only be accessible to Super Admin, Admin, Manager. All other roles use `/my-portal` instead.

- [ ] **Step 1: Remove "attendance" from non-admin roles**

In `Ovenisto_Frontend_Software/src/contexts/AuthContext.tsx`, find the `rolePermissions` object and remove `"attendance"` from each of these roles' permission arrays:

- `"Floor Manager"` — remove `"attendance"`
- `"Cashier"` — remove `"attendance"`
- `"Waiter"` — remove `"attendance"`
- `"Kitchen Manager"` — remove `"attendance"`
- `"Kitchen Staff"` — remove `"attendance"`
- `"Delivery Manager"` — remove `"attendance"`
- `"Store Manager"` — remove `"attendance"`
- `"Accountant"` — remove `"attendance"`
- `"Rider"` — remove `"attendance"`

Keep `"attendance"` in: `"Super Admin"`, `"Admin"`, `"Manager"` arrays.

- [ ] **Step 2: Typecheck**

```bash
cd Ovenisto_Frontend_Software
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd Ovenisto_Frontend_Software
git add src/contexts/AuthContext.tsx
git commit -m "feat(auth): restrict /attendance HR hub to Admin/Manager/Super Admin only"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|---|---|
| AttendanceRecord model with outletId + @@unique([userId, date]) | Task 1 |
| LeaveRequest model with outletId + reviewedById FK | Task 1 |
| LeaveBalance with year + @@unique([userId, year]) | Task 1 |
| StaffSchedule + ScheduleShift (relation, not JSON) | Task 1 |
| POST clock-in / clock-out with status logic | Task 2 |
| GET my-status, my-history | Task 2 |
| GET all attendance + PATCH correction (admin) | Task 2 |
| Submit/cancel leave + balance validation | Task 3 |
| Review (approve/reject) + deduct balance in $transaction | Task 3 |
| my-balance upsert, getAllBalances, updateBalance | Task 3 |
| GET my-schedule, saveSchedule (upsert+cascade), publish, delete | Task 4 |
| attendance.service.ts, leave.service.ts, schedule.service.ts | Task 5 |
| getShifts() added to shift.service.ts | Task 5 |
| EmployeePortal: 4 tabs (schedule/attendance/leaves/cash-shifts) | Task 6 |
| Inline clock-in/out card with ElapsedTimer | Task 6 |
| Leave balance progress bars + inline form | Task 6 |
| Cash Shifts tab only for Cashier role | Task 6 |
| Admin HR hub: attendance table with inline correction | Task 7 |
| Admin HR hub: leave requests with approve/reject + balance editor | Task 7 |
| Admin HR hub: schedule grid with cycle-click + save/publish | Task 7 |
| /attendance restricted to Admin/Manager/Super Admin | Task 8 |

**Placeholder scan:** No TBD, TODO, or unimplemented stubs present.

**Type consistency check:**
- `AttendanceRecord.clockIn` is `string | null` in frontend (ISO string from JSON), `DateTime?` in Prisma — correct
- `SHIFT_COLORS` exported from `schedule.service.ts`, imported in both Task 6 and Task 7 — consistent
- `leaveService.getAll()` signature matches between Task 5 definition and Task 7 usage
- `userService.getUsers()` usage in Task 7 — Step 1 of Task 7 explicitly checks the actual export name before writing
