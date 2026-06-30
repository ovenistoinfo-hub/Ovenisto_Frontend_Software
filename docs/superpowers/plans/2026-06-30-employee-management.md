# Employee Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new "Employees" section (list + tabbed onboarding form) to Ovenisto, backed by
a new `Employee` model that owns pay/fee settlement — replacing the dead `hourlyRate`/
`absencePenalty` fields currently sitting unused on `User`.

**Architecture:** New standalone `Employee` Prisma model (optional `userId` link to `User`,
mirrors the existing `DeliveryRider` pattern), a new outlet-scoped `employees` backend module
following the established controller/routes pattern (see `expense.controller.ts`), and a new
`Employees.tsx` frontend page using the project's standing "inline Card, not popup Dialog" UI
convention with an internal `Tabs` form. `EmployeePortal.tsx`'s pay/penalty display switches
from `User.hourlyRate` to the linked `Employee` record.

**Tech Stack:** Express + TypeScript + Prisma + PostgreSQL (Neon) backend; React + Vite + TS +
Tailwind + shadcn/ui + TanStack Query frontend. No backend test runner exists — verify with
`npm run typecheck` + `npm run build` (backend) and `npm run build` (frontend), plus manual
curl/Playwright checks, per this repo's established convention. Do not author `*.test.ts`
files in the backend.

## Global Constraints

- ESM backend imports use `.js` extensions even for `.ts` files (e.g. `from '../../utils/ApiError.js'`).
- `ApiError` style is per-file; new `employee.controller.ts` uses the constructor style
  (`throw new ApiError('msg', 404)`), matching `supplier.controller.ts`/`expense.controller.ts`.
- Every Prisma `Decimal` field must be converted via `Number()` in response mappers.
- Outlet scoping: list → `if (scope) where.outletId = scope`; by-id/mutate → load then
  `if (scope && row.outletId !== scope) throw new ApiError('Employee not found', 404)` before
  any mutation; create → `outletId = resolveCreateOutlet(req)`.
- A scoped route only works with `authenticate` wired in — verify every new route has it.
- Frontend services extract `res.data` (one level) from the `api.ts` wrapper — never
  `res.data.data`.
- Add/Edit forms are inline `Card`s toggled by a header button, not popup `Dialog`s (per
  `CLAUDE.md` convention; mirrors `Suppliers.tsx`).
- Prod DB is Neon; schema changes apply via `npm run db:push` (never `prisma migrate dev`).
  Dropping a populated column needs `--accept-data-loss` — Task 4's push step is destructive
  and must only run after Task 3's backfill has been verified.

---

### Task 1: Add the `Employee` model to the schema (additive, non-destructive)

**Files:**
- Modify: `Ovenisto-backend/prisma/schema.prisma`

**Interfaces:**
- Produces: `Employee` Prisma model with fields `id, userId, outletId, supervisorId,
  firstName, lastName, email, phone, photoUrl, division, designation, dutyType, hireDate,
  rateType, rate, payFrequency, penaltyFee, dateOfBirth, gender, maritalStatus, cnic,
  emergencyContactName, emergencyContactRelation, emergencyContactPhone, status, createdAt,
  updatedAt` and relations `user, outlet, supervisor, subordinates`. Later tasks query this
  via `prisma.employee.*`.

- [ ] **Step 1: Add the model**

Insert this new model immediately after the closing `}` of `model User` (currently ending at
schema.prisma:109, right before the `// PHASE 2: Settings` comment block):

```prisma
model Employee {
  id           String    @id @default(uuid())
  userId       String?   @unique
  outletId     String?
  supervisorId String?

  // Basic
  firstName String  @db.VarChar(100)
  lastName  String? @db.VarChar(100)
  email     String? @db.VarChar(100)
  phone     String  @db.VarChar(20)
  photoUrl  String?

  // Positional / Pay
  division     String?  @db.VarChar(100)
  designation  String   @db.VarChar(100)
  dutyType     String?  @db.VarChar(20) // Full Time | Part Time
  hireDate     DateTime
  rateType     String   @db.VarChar(20) // Hourly | Daily | Monthly | PerShift
  rate         Decimal  @db.Decimal(10, 2)
  payFrequency String?  @db.VarChar(20) // Weekly | BiWeekly | Monthly
  penaltyFee   Decimal? @db.Decimal(10, 2)

  // Biographical
  dateOfBirth   DateTime?
  gender        String?   @db.VarChar(20)
  maritalStatus String?   @db.VarChar(20)
  cnic          String?   @db.VarChar(20)

  // Emergency Contact
  emergencyContactName     String? @db.VarChar(100)
  emergencyContactRelation String? @db.VarChar(50)
  emergencyContactPhone    String? @db.VarChar(20)

  status    String   @default("active") @db.VarChar(20) // active | inactive
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  user         User?      @relation(fields: [userId], references: [id])
  outlet       Outlet?    @relation(fields: [outletId], references: [id])
  supervisor   Employee?  @relation("EmployeeSupervisor", fields: [supervisorId], references: [id])
  subordinates Employee[] @relation("EmployeeSupervisor")

  @@map("employees")
}
```

- [ ] **Step 2: Add the reverse relations**

In `model User` (schema.prisma:71-109), add one line to the Relations block, right after
`outlet Outlet? @relation(fields: [outletId], references: [id])` (line 88):

```prisma
  employee                  Employee?
```

In `model Outlet` (schema.prisma:19-49), add one line to the Relations block, right after
`leaveRequests LeaveRequest[]` (line 49):

```prisma
  employees         Employee[]
```

- [ ] **Step 3: Generate the Prisma client and push the additive change**

Run:
```bash
cd Ovenisto-backend
npm run db:generate
npm run db:push
```
Expected: both commands exit 0. `db:push` reports the new `employees` table created and the
new nullable `employee` back-relation on `users` — no data-loss prompt, since this step adds
a table and a nullable relation only.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(db): add Employee model"
```

---

### Task 2: Backend `employees` module (CRUD + `/me` + `/supervisors`)

**Files:**
- Create: `Ovenisto-backend/src/modules/employees/employee.controller.ts`
- Create: `Ovenisto-backend/src/modules/employees/employee.routes.ts`
- Modify: `Ovenisto-backend/src/routes/index.ts`

**Interfaces:**
- Consumes: `resolveOutletScope(req): string | null` and
  `resolveCreateOutlet(req): string` from `../../middleware/outletScope.js`
  (`Ovenisto-backend/src/middleware/outletScope.ts`); `ApiResponse.success/created/paginated`
  from `../../utils/ApiResponse.js`; `ApiError` from `../../utils/ApiError.js`; `asyncHandler`
  from `../../utils/asyncHandler.js`; `authenticate` from `../../middleware/authenticate.js`;
  `authorize` from `../../middleware/authorize.js`.
- Produces: `GET/POST /api/employees`, `GET/PUT/DELETE /api/employees/:id`,
  `GET /api/employees/me`, `GET /api/employees/supervisors` — consumed by
  `employee.service.ts` in Task 5.

- [ ] **Step 1: Write the controller**

Create `Ovenisto-backend/src/modules/employees/employee.controller.ts`:

```typescript
/**
 * Employee Controller
 */
import type { Request, Response } from 'express';
import { prisma } from '../../config/database.js';
import { ApiResponse } from '../../utils/ApiResponse.js';
import { ApiError } from '../../utils/ApiError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { resolveOutletScope, resolveCreateOutlet } from '../../middleware/outletScope.js';

const supervisorSelect = { id: true, firstName: true, lastName: true };
const userSelect = { id: true, name: true, email: true };

function mapEmployee(e: any) {
  return {
    ...e,
    rate: Number(e.rate),
    penaltyFee: e.penaltyFee != null ? Number(e.penaltyFee) : null,
  };
}

export const getEmployees = asyncHandler(async (req: Request, res: Response) => {
  const { page = '1', limit = '20', search, status } = req.query as Record<string, string>;
  const skip = (Number(page) - 1) * Number(limit);

  const where: any = {};
  const scope = resolveOutletScope(req);
  if (scope) where.outletId = scope;
  if (status) where.status = status;
  if (search) {
    where.OR = [
      { firstName: { contains: search, mode: 'insensitive' } },
      { lastName: { contains: search, mode: 'insensitive' } },
      { designation: { contains: search, mode: 'insensitive' } },
      { division: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [data, total] = await Promise.all([
    prisma.employee.findMany({
      where,
      skip,
      take: Number(limit),
      orderBy: { firstName: 'asc' },
      include: { supervisor: { select: supervisorSelect }, user: { select: userSelect } },
    }),
    prisma.employee.count({ where }),
  ]);

  return res.json(ApiResponse.paginated(data.map(mapEmployee), Number(page), Number(limit), total));
});

export const getEmployee = asyncHandler(async (req: Request, res: Response) => {
  const e = await prisma.employee.findUnique({
    where: { id: req.params.id },
    include: { supervisor: { select: supervisorSelect }, user: { select: userSelect } },
  });
  if (!e) throw new ApiError('Employee not found', 404);
  const scope = resolveOutletScope(req);
  if (scope && e.outletId !== scope) throw new ApiError('Employee not found', 404);
  return res.json(ApiResponse.success(mapEmployee(e)));
});

export const getMyEmployee = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user?.id) throw new ApiError('Not authenticated', 401);
  const e = await prisma.employee.findUnique({ where: { userId: req.user.id } });
  return res.json(ApiResponse.success(e ? mapEmployee(e) : null));
});

export const getSupervisorOptions = asyncHandler(async (req: Request, res: Response) => {
  const where: any = { status: 'active' };
  const scope = resolveOutletScope(req);
  if (scope) where.outletId = scope;
  const excludeId = req.query.excludeId as string | undefined;
  if (excludeId) where.id = { not: excludeId };

  const data = await prisma.employee.findMany({
    where,
    select: { id: true, firstName: true, lastName: true },
    orderBy: { firstName: 'asc' },
  });
  return res.json(ApiResponse.success(data));
});

const REQUIRED_FIELDS = ['firstName', 'phone', 'designation', 'hireDate', 'rateType', 'rate'] as const;
const RATE_TYPES = ['Hourly', 'Daily', 'Monthly', 'PerShift'];

function validateBody(body: any) {
  for (const field of REQUIRED_FIELDS) {
    if (body[field] === undefined || body[field] === null || body[field] === '') {
      throw new ApiError(`${field} is required`, 400);
    }
  }
  if (!RATE_TYPES.includes(body.rateType)) {
    throw new ApiError(`rateType must be one of: ${RATE_TYPES.join(', ')}`, 400);
  }
}

export const createEmployee = asyncHandler(async (req: Request, res: Response) => {
  validateBody(req.body);
  const {
    firstName, lastName, email, phone, photoUrl, userId, supervisorId,
    division, designation, dutyType, hireDate, rateType, rate, payFrequency, penaltyFee,
    dateOfBirth, gender, maritalStatus, cnic,
    emergencyContactName, emergencyContactRelation, emergencyContactPhone,
  } = req.body;

  const outletId = resolveCreateOutlet(req);

  try {
    const e = await prisma.employee.create({
      data: {
        firstName, lastName: lastName || null, email: email || null, phone,
        photoUrl: photoUrl || null,
        userId: userId || null,
        supervisorId: supervisorId || null,
        outletId,
        division: division || null,
        designation,
        dutyType: dutyType || null,
        hireDate: new Date(hireDate),
        rateType,
        rate: Number(rate),
        payFrequency: payFrequency || null,
        penaltyFee: penaltyFee != null ? Number(penaltyFee) : null,
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
        gender: gender || null,
        maritalStatus: maritalStatus || null,
        cnic: cnic || null,
        emergencyContactName: emergencyContactName || null,
        emergencyContactRelation: emergencyContactRelation || null,
        emergencyContactPhone: emergencyContactPhone || null,
      },
    });
    return res.status(201).json(ApiResponse.created(mapEmployee(e), 'Employee created'));
  } catch (err: any) {
    if (err.code === 'P2002') throw new ApiError('This user account is already linked to another employee', 400);
    throw err;
  }
});

export const updateEmployee = asyncHandler(async (req: Request, res: Response) => {
  const existing = await prisma.employee.findUnique({ where: { id: req.params.id } });
  if (!existing) throw new ApiError('Employee not found', 404);
  const scope = resolveOutletScope(req);
  if (scope && existing.outletId !== scope) throw new ApiError('Employee not found', 404);

  const {
    firstName, lastName, email, phone, photoUrl, userId, supervisorId,
    division, designation, dutyType, hireDate, rateType, rate, payFrequency, penaltyFee,
    dateOfBirth, gender, maritalStatus, cnic,
    emergencyContactName, emergencyContactRelation, emergencyContactPhone, status,
  } = req.body;

  if (rateType !== undefined && !RATE_TYPES.includes(rateType)) {
    throw new ApiError(`rateType must be one of: ${RATE_TYPES.join(', ')}`, 400);
  }

  try {
    const e = await prisma.employee.update({
      where: { id: req.params.id },
      data: {
        firstName: firstName ?? existing.firstName,
        lastName: lastName !== undefined ? lastName : existing.lastName,
        email: email !== undefined ? email : existing.email,
        phone: phone ?? existing.phone,
        photoUrl: photoUrl !== undefined ? photoUrl : existing.photoUrl,
        userId: userId !== undefined ? (userId || null) : existing.userId,
        supervisorId: supervisorId !== undefined ? (supervisorId || null) : existing.supervisorId,
        division: division !== undefined ? division : existing.division,
        designation: designation ?? existing.designation,
        dutyType: dutyType !== undefined ? dutyType : existing.dutyType,
        hireDate: hireDate ? new Date(hireDate) : existing.hireDate,
        rateType: rateType ?? existing.rateType,
        rate: rate != null ? Number(rate) : existing.rate,
        payFrequency: payFrequency !== undefined ? payFrequency : existing.payFrequency,
        penaltyFee: penaltyFee !== undefined ? (penaltyFee != null ? Number(penaltyFee) : null) : existing.penaltyFee,
        dateOfBirth: dateOfBirth !== undefined ? (dateOfBirth ? new Date(dateOfBirth) : null) : existing.dateOfBirth,
        gender: gender !== undefined ? gender : existing.gender,
        maritalStatus: maritalStatus !== undefined ? maritalStatus : existing.maritalStatus,
        cnic: cnic !== undefined ? cnic : existing.cnic,
        emergencyContactName: emergencyContactName !== undefined ? emergencyContactName : existing.emergencyContactName,
        emergencyContactRelation: emergencyContactRelation !== undefined ? emergencyContactRelation : existing.emergencyContactRelation,
        emergencyContactPhone: emergencyContactPhone !== undefined ? emergencyContactPhone : existing.emergencyContactPhone,
        status: status ?? existing.status,
      },
    });
    return res.json(ApiResponse.success(mapEmployee(e), 'Employee updated'));
  } catch (err: any) {
    if (err.code === 'P2002') throw new ApiError('This user account is already linked to another employee', 400);
    throw err;
  }
});

export const deleteEmployee = asyncHandler(async (req: Request, res: Response) => {
  const existing = await prisma.employee.findUnique({ where: { id: req.params.id } });
  if (!existing) throw new ApiError('Employee not found', 404);
  const scope = resolveOutletScope(req);
  if (scope && existing.outletId !== scope) throw new ApiError('Employee not found', 404);
  const e = await prisma.employee.update({ where: { id: req.params.id }, data: { status: 'inactive' } });
  return res.json(ApiResponse.success(mapEmployee(e), 'Employee deactivated'));
});
```

- [ ] **Step 2: Write the routes**

Create `Ovenisto-backend/src/modules/employees/employee.routes.ts`:

```typescript
import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import {
  getEmployees,
  getEmployee,
  getMyEmployee,
  getSupervisorOptions,
  createEmployee,
  updateEmployee,
  deleteEmployee,
} from './employee.controller.js';

const writeRoles = ['Super Admin', 'Admin', 'Manager', 'Store Manager'];

export const employeesRouter = Router();

// Specific paths BEFORE /:id to avoid Express param shadowing.
employeesRouter.get('/me',          authenticate, getMyEmployee);
employeesRouter.get('/supervisors', authenticate, getSupervisorOptions);
employeesRouter.get('/',            authenticate, getEmployees);
employeesRouter.get('/:id',         authenticate, getEmployee);
employeesRouter.post('/',           authenticate, authorize(writeRoles), createEmployee);
employeesRouter.put('/:id',         authenticate, authorize(writeRoles), updateEmployee);
employeesRouter.delete('/:id',      authenticate, authorize(writeRoles), deleteEmployee);
```

- [ ] **Step 3: Mount the router**

In `Ovenisto-backend/src/routes/index.ts`, add the import after line 34
(`import { staffSchedulesRouter } ...`):

```typescript
import { employeesRouter } from '../modules/employees/employee.routes.js';
```

And add the route mount after line 155 (`router.use('/shifts', shiftsRouter);`), inside the
"Phase 9: HR & Staff" block:

```typescript
router.use('/employees', employeesRouter);
```

- [ ] **Step 4: Verify it builds**

Run:
```bash
cd Ovenisto-backend
npm run typecheck
npm run build
```
Expected: both exit 0, no TypeScript errors.

- [ ] **Step 5: Manual API verification**

With the dev server running (`npm run dev` in `Ovenisto-backend`, port 3001) and a valid JWT
for a Super Admin (obtain via `POST /api/auth/login`), run:

```bash
TOKEN="<jwt from login>"
curl -s -X POST http://localhost:3001/api/employees \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -H "X-Outlet-Id: <a real outlet id>" \
  -d '{"firstName":"Test","phone":"03001234567","designation":"Tester","hireDate":"2026-01-01","rateType":"Hourly","rate":200}'
```
Expected: `{"success":true,"data":{...,"rate":200,"rateType":"Hourly",...},"message":"Employee created"}`.

```bash
curl -s http://localhost:3001/api/employees -H "Authorization: Bearer $TOKEN" -H "X-Outlet-Id: <same outlet id>"
```
Expected: `{"success":true,"data":[{...the employee just created...}],"meta":{...}}`.

- [ ] **Step 6: Commit**

```bash
git add src/modules/employees src/routes/index.ts
git commit -m "feat(employees): add employee CRUD module"
```

---

### Task 3: Backfill existing `User.hourlyRate`/`absencePenalty` into `Employee`

**Files:**
- Create: `Ovenisto-backend/src/seeds/employeeBackfill.ts`
- Modify: `Ovenisto-backend/package.json`

**Interfaces:**
- Consumes: `prisma` from `../config/database.js` (`Ovenisto-backend/src/config/database.ts`).
- Produces: one `Employee` row per `User` with a non-null `hourlyRate`, linked via `userId`.
  Task 4 depends on this having run before the columns are dropped.

- [ ] **Step 1: Write the backfill script**

Create `Ovenisto-backend/src/seeds/employeeBackfill.ts`:

```typescript
/**
 * Employee Backfill Seed Script
 * Creates an Employee row (linked via userId) for every existing User that has
 * a non-null hourlyRate, before those columns are dropped from User.
 */
import { prisma } from '../config/database.js';

async function main() {
  console.log('👤 Starting employee backfill...');

  const users = await prisma.user.findMany({
    where: { hourlyRate: { not: null } },
  });

  let created = 0;
  let skipped = 0;

  for (const user of users) {
    const existing = await prisma.employee.findUnique({ where: { userId: user.id } });
    if (existing) {
      console.log(`✓ ${user.name} already has an Employee record, skipping`);
      skipped++;
      continue;
    }

    const [firstName, ...rest] = user.name.split(' ');
    await prisma.employee.create({
      data: {
        userId: user.id,
        outletId: user.outletId,
        firstName: firstName || user.name,
        lastName: rest.length ? rest.join(' ') : null,
        email: user.email,
        phone: user.phone || 'N/A',
        designation: user.role,
        hireDate: user.createdAt,
        rateType: 'Hourly',
        rate: user.hourlyRate!,
        penaltyFee: user.absencePenalty,
        status: user.status === 'active' ? 'active' : 'inactive',
      },
    });
    console.log(`✓ Created Employee record for ${user.name}`);
    created++;
  }

  console.log(`\n✅ Backfill complete! Created ${created}, skipped ${skipped} (already existed).`);
}

main()
  .catch((e) => {
    console.error('❌ Backfill failed:', e.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

- [ ] **Step 2: Add the npm script**

In `Ovenisto-backend/package.json`, add this line to `scripts`, after
`"db:seed-outlet-purchase": "tsx src/seeds/outletPurchaseBackfill.ts",`:

```json
    "db:seed-employee-backfill": "tsx src/seeds/employeeBackfill.ts",
```

- [ ] **Step 3: Run the backfill against the dev database**

```bash
cd Ovenisto-backend
npm run db:seed-employee-backfill
```
Expected: console output `✅ Backfill complete! Created N, skipped 0.` where N is the count of
users that had a non-null `hourlyRate` (0 is a valid, expected count if none were ever set).

- [ ] **Step 4: Verify via Prisma Studio or curl**

```bash
npm run db:studio
```
Open the `employees` table and confirm one row exists per user that previously had
`hourlyRate` set, with matching `rate` and `userId`.

- [ ] **Step 5: Commit**

```bash
git add src/seeds/employeeBackfill.ts package.json
git commit -m "feat(employees): add backfill script for legacy hourlyRate/absencePenalty"
```

---

### Task 4: Remove `User.hourlyRate`/`absencePenalty` (destructive — confirm before pushing)

**Files:**
- Modify: `Ovenisto-backend/prisma/schema.prisma`
- Modify: `Ovenisto-backend/src/modules/auth/auth.controller.ts`
- Modify: `Ovenisto-backend/src/modules/auth/auth.schema.ts`
- Modify: `Ovenisto-backend/src/modules/users/user.controller.ts`

**Interfaces:**
- Produces: `User` model with no `hourlyRate`/`absencePenalty` fields. Task 12
  (`EmployeePortal.tsx`) and Task 6 (`user.service.ts`) depend on these being gone from the
  API response shape.

⚠️ **This task drops populated database columns. Do not run Step 6 (`db:push
--accept-data-loss`) until Task 3's backfill has been verified (Task 3 Step 4). Confirm with
the user before running Step 6 against the shared dev/Neon database.**

- [ ] **Step 1: Remove the fields from the schema**

In `Ovenisto-backend/prisma/schema.prisma`, in `model User` (around lines 83-85), delete:

```prisma
  hourlyRate     Decimal?  @db.Decimal(10, 2)
  absencePenalty Decimal?  @db.Decimal(10, 2)
```

- [ ] **Step 2: Clean up `auth.controller.ts`**

In `Ovenisto-backend/src/modules/auth/auth.controller.ts`:

Around line 135-136, remove these two lines from the `select` block:
```typescript
      hourlyRate: true,
      absencePenalty: true,
```

Around line 149-150, remove these two lines from the response object:
```typescript
      hourlyRate: user.hourlyRate != null ? Number(user.hourlyRate) : null,
      absencePenalty: user.absencePenalty != null ? Number(user.absencePenalty) : null,
```

- [ ] **Step 3: Clean up `auth.schema.ts`**

In `Ovenisto-backend/src/modules/auth/auth.schema.ts`, around lines 77-78, remove:
```typescript
  hourlyRate: z.coerce.number().nonnegative().nullable().optional(),
  absencePenalty: z.coerce.number().nonnegative().nullable().optional(),
```

- [ ] **Step 4: Clean up `user.controller.ts`**

In `Ovenisto-backend/src/modules/users/user.controller.ts`, remove all occurrences of the
`select` lines:
```typescript
        hourlyRate: true,
        absencePenalty: true,
```
(at the `select` blocks around lines 117-118 and 198-199 — match the indentation at each
site), the mapper lines around 62-63:
```typescript
    hourlyRate: rest.hourlyRate != null ? Number(rest.hourlyRate) : null,
    absencePenalty: rest.absencePenalty != null ? Number(rest.absencePenalty) : null,
```
and the update-handling lines around 249-250:
```typescript
  if ((input as any).hourlyRate !== undefined) updateData.hourlyRate = (input as any).hourlyRate != null ? Number((input as any).hourlyRate) : null;
  if ((input as any).absencePenalty !== undefined) updateData.absencePenalty = (input as any).absencePenalty != null ? Number((input as any).absencePenalty) : null;
```
Read the file first with line numbers to confirm each occurrence before deleting, since exact
line numbers shift as earlier removals in this same task are applied — there are 3 `select`
blocks containing these two lines (around 117-118, 147-148, 198-199) plus the mapper and
update-handling lines, 4 sites total.

- [ ] **Step 5: Verify it builds**

```bash
cd Ovenisto-backend
npm run typecheck
npm run build
```
Expected: both exit 0. If `tsc` reports an unused-variable or missing-property error referencing
`hourlyRate`/`absencePenalty` anywhere else, search with `grep -rn "hourlyRate\|absencePenalty" src` and remove that reference too before proceeding.

- [ ] **Step 6: Push the destructive schema change (confirm with user first)**

```bash
cd Ovenisto-backend
npx prisma db push --accept-data-loss
```
Expected: Prisma reports the `users.hourlyRate` and `users.absencePenalty` columns dropped.
Confirm Task 3's backfill ran successfully against this same database before executing this
step.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma src/modules/auth/auth.controller.ts src/modules/auth/auth.schema.ts src/modules/users/user.controller.ts
git commit -m "refactor(users): remove hourlyRate/absencePenalty, superseded by Employee"
```

---

### Task 5: Frontend `employee.service.ts`

**Files:**
- Create: `Ovenisto_Frontend_Software/src/services/employee.service.ts`

**Interfaces:**
- Consumes: `api` from `./api` (`Ovenisto_Frontend_Software/src/services/api.ts`).
- Produces: `EmployeeRecord`, `EmployeeInput`, `employeeService.{getAll, getById, getMe,
  getSupervisorOptions, create, update, deactivate}` — consumed by `Employees.tsx` (Tasks
  8-10) and `EmployeePortal.tsx` (Task 11).

- [ ] **Step 1: Write the service**

Create `Ovenisto_Frontend_Software/src/services/employee.service.ts`:

```typescript
/**
 * Employee Service - API calls for employee/HR profile management
 */
import { api } from './api';

export interface EmployeeRecord {
  id: string;
  userId: string | null;
  outletId: string | null;
  supervisorId: string | null;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string;
  photoUrl: string | null;
  division: string | null;
  designation: string;
  dutyType: string | null;
  hireDate: string;
  rateType: 'Hourly' | 'Daily' | 'Monthly' | 'PerShift';
  rate: number;
  payFrequency: string | null;
  penaltyFee: number | null;
  dateOfBirth: string | null;
  gender: string | null;
  maritalStatus: string | null;
  cnic: string | null;
  emergencyContactName: string | null;
  emergencyContactRelation: string | null;
  emergencyContactPhone: string | null;
  status: string;
  createdAt: string;
  supervisor: { id: string; firstName: string; lastName: string | null } | null;
  user: { id: string; name: string; email: string } | null;
}

export interface SupervisorOption {
  id: string;
  firstName: string;
  lastName: string | null;
}

export interface EmployeeInput {
  firstName: string;
  lastName?: string | null;
  email?: string | null;
  phone: string;
  photoUrl?: string | null;
  userId?: string | null;
  supervisorId?: string | null;
  division?: string | null;
  designation: string;
  dutyType?: string | null;
  hireDate: string;
  rateType: 'Hourly' | 'Daily' | 'Monthly' | 'PerShift';
  rate: number;
  payFrequency?: string | null;
  penaltyFee?: number | null;
  dateOfBirth?: string | null;
  gender?: string | null;
  maritalStatus?: string | null;
  cnic?: string | null;
  emergencyContactName?: string | null;
  emergencyContactRelation?: string | null;
  emergencyContactPhone?: string | null;
  status?: string;
}

interface ListResponse {
  success: boolean;
  data: EmployeeRecord[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export const employeeService = {
  async getAll(params?: { page?: number; limit?: number; search?: string; status?: string }): Promise<{ data: EmployeeRecord[]; meta: ListResponse['meta'] }> {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.search) query.set('search', params.search);
    if (params?.status) query.set('status', params.status);
    const qs = query.toString();
    const res = await api.get<ListResponse>(`/employees${qs ? `?${qs}` : ''}`);
    return { data: res.data, meta: res.meta };
  },

  async getById(id: string): Promise<EmployeeRecord> {
    const res = await api.get<{ success: boolean; data: EmployeeRecord }>(`/employees/${id}`);
    return res.data;
  },

  async getMe(): Promise<EmployeeRecord | null> {
    const res = await api.get<{ success: boolean; data: EmployeeRecord | null }>('/employees/me');
    return res.data;
  },

  async getSupervisorOptions(excludeId?: string): Promise<SupervisorOption[]> {
    const qs = excludeId ? `?excludeId=${excludeId}` : '';
    const res = await api.get<{ success: boolean; data: SupervisorOption[] }>(`/employees/supervisors${qs}`);
    return res.data;
  },

  async create(data: EmployeeInput): Promise<EmployeeRecord> {
    const res = await api.post<{ success: boolean; data: EmployeeRecord }>('/employees', data);
    return res.data;
  },

  async update(id: string, data: Partial<EmployeeInput>): Promise<EmployeeRecord> {
    const res = await api.put<{ success: boolean; data: EmployeeRecord }>(`/employees/${id}`, data);
    return res.data;
  },

  async deactivate(id: string): Promise<void> {
    await api.delete(`/employees/${id}`);
  },
};
```

- [ ] **Step 2: Verify it compiles**

```bash
cd Ovenisto_Frontend_Software
npm run build
```
Expected: exits 0, no TypeScript errors (this file isn't imported anywhere yet, so the build
only confirms the file itself is syntactically and structurally valid).

- [ ] **Step 3: Commit**

```bash
git add src/services/employee.service.ts
git commit -m "feat(employees): add employee.service.ts"
```

---

### Task 6: Clean up `user.service.ts` and `Attendance.tsx` dead code

**Files:**
- Modify: `Ovenisto_Frontend_Software/src/services/user.service.ts`
- Modify: `Ovenisto_Frontend_Software/src/pages/Attendance.tsx`

**Interfaces:**
- Produces: `UserRecord`/`UpdateUserInput` without `hourlyRate`/`absencePenalty` (matches
  Task 4's backend response shape).

- [ ] **Step 1: Remove the fields from `UserRecord`**

In `Ovenisto_Frontend_Software/src/services/user.service.ts`, remove from the `UserRecord`
interface (lines 19-20):
```typescript
  hourlyRate: number | null;
  absencePenalty: number | null;
```

- [ ] **Step 2: Remove the fields from `UpdateUserInput`**

Remove from the `UpdateUserInput` interface (lines 63-64):
```typescript
  hourlyRate?: number | null;
  absencePenalty?: number | null;
```

- [ ] **Step 3: Remove the dead pay-settings state from `Attendance.tsx`**

In `Ovenisto_Frontend_Software/src/pages/Attendance.tsx`, remove lines 171-173:
```typescript

  // Pay settings
  const [editPayUser, setEditPayUser] = useState<string | null>(null);
  const [payEdit, setPayEdit]         = useState({ hourlyRate: 0, absencePenalty: 0 });
```

Read the file with line numbers around the `updatePayMut` declaration (currently starting at
line 300, `const updatePayMut = useMutation({`) and delete the entire mutation block through
its closing `});` — confirm the exact end line by reading the file, since it was not fully
visible during planning. Also delete any other reference to `editPayUser`/`payEdit`/
`updatePayMut` found via the search below.

- [ ] **Step 4: Verify it builds and search for stragglers**

```bash
cd Ovenisto_Frontend_Software
npm run build
```
Expected: exits 0.

Run:
```bash
grep -rn "hourlyRate\|absencePenalty\|editPayUser\|payEdit\|updatePayMut" src/pages/Attendance.tsx src/services/user.service.ts
```
Expected: no output (all references removed). If any line is printed, remove it and re-run
`npm run build`.

- [ ] **Step 5: Commit**

```bash
git add src/services/user.service.ts src/pages/Attendance.tsx
git commit -m "refactor: remove dead pay-settings code, superseded by Employee"
```

---

### Task 7: Nav, routing, and permissions for the new Employees page

**Files:**
- Modify: `Ovenisto_Frontend_Software/src/contexts/AuthContext.tsx`
- Modify: `Ovenisto_Frontend_Software/src/components/layout/AppSidebar.tsx`
- Modify: `Ovenisto_Frontend_Software/src/App.tsx`

**Interfaces:**
- Produces: route `/employees` gated by `hasPermission("employees")`, with a sidebar entry
  in the "Account / HR" group. Task 8 implements the page this route renders.

- [ ] **Step 1: Grant the `employees` permission to the relevant roles**

In `Ovenisto_Frontend_Software/src/contexts/AuthContext.tsx`, in the `rolePermissions` map
(lines 6-35): `"Super Admin"` and `"Admin"` already have `["*"]` (no change needed). Add
`"employees"` to the `"Manager"` array (lines 9-15) and the `"Store Manager"` array (lines
25-28):

Manager, before:
```typescript
  "Manager": [
    "dashboard", "pos", "kitchens", "waiter", "order-status",
    "customer-display", "outlets", "items", "production", "stock", "warehouses",
    "sales", "customers", "purchases", "purchase-requests", "suppliers", "supplier-dues",
    "expenses", "transfers", "demands", "waste", "attendance", "reports", "sms",
    "settings", "my-portal",
  ],
```
Manager, after (add `"employees"` next to `"attendance"`):
```typescript
  "Manager": [
    "dashboard", "pos", "kitchens", "waiter", "order-status",
    "customer-display", "outlets", "items", "production", "stock", "warehouses",
    "sales", "customers", "purchases", "purchase-requests", "suppliers", "supplier-dues",
    "expenses", "transfers", "demands", "waste", "attendance", "employees", "reports", "sms",
    "settings", "my-portal",
  ],
```

Store Manager, before:
```typescript
  "Store Manager": [
    "items", "stock", "warehouses", "production", "purchases", "suppliers",
    "transfers", "demands", "waste", "my-portal",
  ],
```
Store Manager, after:
```typescript
  "Store Manager": [
    "items", "stock", "warehouses", "production", "purchases", "suppliers",
    "transfers", "demands", "waste", "employees", "my-portal",
  ],
```

- [ ] **Step 2: Add the sidebar entry**

In `Ovenisto_Frontend_Software/src/components/layout/AppSidebar.tsx`, add `IdCard` to the
`lucide-react` import on lines 6-7:
```typescript
  Trash2, Users, Clock, FileText, MessageSquare, ChevronDown, ChevronRight, Flame, LogOut, Link2,
  Bike, CalendarCheck, LayoutGrid, ClipboardList, CalendarOff, UserCircle, IdCard
```

Add the nav entry to the "Account / HR" section (lines 80-83), after the "My Portal" entry:
```typescript
  { label: "Account / HR", items: [
    { title: "My Portal", url: "/my-portal", icon: UserCircle, module: "my-portal" },
    { title: "Employees", url: "/employees", icon: IdCard, module: "employees" },
    { title: "Users", url: "/users", icon: Users, module: "users" },
    { title: "HR Management", url: "/attendance", icon: Clock, module: "attendance" },
  ]},
```

- [ ] **Step 3: Add the route**

In `Ovenisto_Frontend_Software/src/App.tsx`, add the lazy import after line 52
(`const Attendance = lazy(() => import("./pages/Attendance"));`):
```typescript
const Employees = lazy(() => import("./pages/Employees"));
```

Add the route after line 169
(`<Route path="/attendance" element={<ProtectedRoute module="attendance"><AppLayout><Attendance /></AppLayout></ProtectedRoute>} />`):
```typescript
      <Route path="/employees" element={<ProtectedRoute module="employees"><AppLayout><Employees /></AppLayout></ProtectedRoute>} />
```

- [ ] **Step 4: Verify it builds**

This will fail until Task 8 creates `src/pages/Employees.tsx` — create a minimal placeholder
first so this task is independently verifiable:

```bash
cd Ovenisto_Frontend_Software
cat > src/pages/Employees.tsx << 'EOF'
const Employees = () => <div>Employees (placeholder)</div>;
export default Employees;
EOF
npm run build
```
Expected: exits 0.

- [ ] **Step 5: Manual verification**

Start the dev server (`npm run dev`) and the backend (`npm run dev` in `Ovenisto-backend`),
log in as a Manager or Super Admin, and confirm an "Employees" item appears in the "Account /
HR" sidebar group and navigates to a page showing "Employees (placeholder)".

- [ ] **Step 6: Commit**

```bash
git add src/contexts/AuthContext.tsx src/components/layout/AppSidebar.tsx src/App.tsx src/pages/Employees.tsx
git commit -m "feat(employees): wire up nav, route, and permissions"
```

---

### Task 8: `Employees.tsx` — list view

**Files:**
- Modify: `Ovenisto_Frontend_Software/src/pages/Employees.tsx` (replaces the Task 7 placeholder)

**Interfaces:**
- Consumes: `employeeService.getAll` (Task 5); `TablePagination, paginate` from
  `@/components/TablePagination`; `PageHeader` from `@/components/ui/page-header`; `useAuth`
  from `@/contexts/AuthContext`.
- Produces: default export `Employees` component with list/search/empty-state. Task 9 adds
  the add/edit form to this same file.

- [ ] **Step 1: Write the list view**

Replace the contents of `Ovenisto_Frontend_Software/src/pages/Employees.tsx`:

```tsx
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { employeeService, type EmployeeRecord } from "@/services/employee.service";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Plus, Search, Pencil, IdCard } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/ui/page-header";
import { TablePagination, paginate } from "@/components/TablePagination";
import { useAuth } from "@/contexts/AuthContext";

const Employees = () => {
  const { user } = useAuth();
  const canManage = ["Super Admin", "Admin", "Manager", "Store Manager"].includes(user?.role ?? "");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [page, setPage] = useState(1);

  const { data: list = [], isLoading: loading } = useQuery({
    queryKey: ["employees", statusFilter],
    queryFn: () => employeeService.getAll({ limit: 200, status: statusFilter === "all" ? undefined : statusFilter }).then(r => r.data),
  });

  const filtered = list.filter(e => {
    const name = `${e.firstName} ${e.lastName ?? ""}`.toLowerCase();
    return name.includes(search.toLowerCase()) ||
      e.designation.toLowerCase().includes(search.toLowerCase()) ||
      (e.division ?? "").toLowerCase().includes(search.toLowerCase());
  });
  const paged = paginate(filtered, page);

  const initials = (e: EmployeeRecord) => `${e.firstName[0] ?? ""}${e.lastName?.[0] ?? ""}`.toUpperCase();

  if (loading) return <div className="space-y-6"><div className="flex items-center justify-between"><Skeleton className="h-8 w-48" /><Skeleton className="h-10 w-32" /></div><Card className="shadow-sm"><CardContent className="pt-6 space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</CardContent></Card></div>;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<IdCard className="h-5 w-5" />}
        title="Employees"
        subtitle={`${list.length} employee records`}
        actions={canManage ? <Button className="gradient-primary text-primary-foreground"><Plus className="h-4 w-4 mr-2" />Add Employee</Button> : undefined}
      />

      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search by name, designation, division..." className="pl-9" />
            </div>
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <div className="text-center py-12">
              <IdCard className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-30" />
              <p className="text-muted-foreground">No employees found</p>
              {canManage && <Button size="sm" className="gradient-primary text-primary-foreground mt-3"><Plus className="h-4 w-4 mr-1" />Add Employee</Button>}
            </div>
          ) : (
            <>
              <div className="rounded-lg border overflow-auto max-h-[calc(100vh-300px)]">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-card">
                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                      <TableHead>Photo</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Designation</TableHead>
                      <TableHead>Division</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Hire Date</TableHead>
                      <TableHead>Supervisor</TableHead>
                      <TableHead>Status</TableHead>
                      {canManage && <TableHead>Actions</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>{paged.map(e => (
                    <TableRow key={e.id} className="hover:bg-muted/30 transition-colors">
                      <TableCell>
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={e.photoUrl ?? undefined} />
                          <AvatarFallback className="text-xs">{initials(e)}</AvatarFallback>
                        </Avatar>
                      </TableCell>
                      <TableCell className="font-medium">{e.firstName} {e.lastName ?? ""}</TableCell>
                      <TableCell>{e.designation}</TableCell>
                      <TableCell>{e.division ?? "—"}</TableCell>
                      <TableCell>{e.phone}</TableCell>
                      <TableCell>{new Date(e.hireDate).toLocaleDateString("en-PK")}</TableCell>
                      <TableCell>{e.supervisor ? `${e.supervisor.firstName} ${e.supervisor.lastName ?? ""}` : "—"}</TableCell>
                      <TableCell><Badge variant="secondary" className={e.status === "active" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}>{e.status}</Badge></TableCell>
                      {canManage && (
                        <TableCell>
                          <Button variant="ghost" size="icon" className="h-7 w-7"><Pencil className="h-3 w-3" /></Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}</TableBody>
                </Table>
              </div>
              <TablePagination currentPage={page} totalItems={filtered.length} onPageChange={setPage} />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
export default Employees;
```

- [ ] **Step 2: Verify it builds**

```bash
cd Ovenisto_Frontend_Software
npm run build
```
Expected: exits 0.

- [ ] **Step 3: Manual verification**

With both dev servers running, navigate to `/employees` as a Manager or Super Admin. Confirm
the page shows the empty state (no employees yet, since none have been created through the UI)
with a working "Add Employee" button placeholder (it won't open a form until Task 9), and that
the Status filter and search box render without errors.

- [ ] **Step 4: Commit**

```bash
git add src/pages/Employees.tsx
git commit -m "feat(employees): add Employees list view"
```

---

### Task 9: `Employees.tsx` — Add/Edit form: Basic Information + Positional Info tabs

**Files:**
- Modify: `Ovenisto_Frontend_Software/src/pages/Employees.tsx`

**Interfaces:**
- Consumes: `employeeService.create/update/getSupervisorOptions` (Task 5); `userService.getUsers`
  (existing, `Ovenisto_Frontend_Software/src/services/user.service.ts`); `getAccessToken`
  from `@/services/api`.
- Produces: working create/update flow for the fields covered by these two tabs, plus the
  `form`/`showForm`/`editingId` state Task 10 extends with three more tabs.

- [ ] **Step 1: Add state, queries, and handlers to the component**

In `Ovenisto_Frontend_Software/src/pages/Employees.tsx`, update the import block at the top to
add the new imports (merge into the existing statements where the module matches — e.g. add
`useRef` to the existing `"react"` import, add `Plus, Search, Pencil, IdCard` siblings to the
existing `"lucide-react"` import — do not create duplicate import statements for the same
module):

```typescript
import { useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { employeeService, type EmployeeRecord, type EmployeeInput } from "@/services/employee.service";
import { userService, type UserRecord } from "@/services/user.service";
import { getAccessToken } from "@/services/api";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Search, Pencil, IdCard, ChevronUp, Upload, Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/ui/page-header";
import { TablePagination, paginate } from "@/components/TablePagination";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
```

Add the form constants near the top of the file, after the imports:

```typescript
const RATE_TYPES = ["Hourly", "Daily", "Monthly", "PerShift"];
const PAY_FREQUENCIES = ["Weekly", "BiWeekly", "Monthly"];
const DUTY_TYPES = ["Full Time", "Part Time"];
const GENDERS = ["Male", "Female", "Other"];
const MARITAL_STATUSES = ["Single", "Married", "Divorced", "Widowed"];

const emptyForm: EmployeeInput = {
  firstName: "", lastName: "", email: "", phone: "", photoUrl: "",
  userId: "", supervisorId: "",
  division: "", designation: "", dutyType: "", hireDate: "",
  rateType: "Hourly", rate: 0, payFrequency: "", penaltyFee: null,
  dateOfBirth: "", gender: "", maritalStatus: "", cnic: "",
  emergencyContactName: "", emergencyContactRelation: "", emergencyContactPhone: "",
};
```

Inside the `Employees` component, after the existing `const [page, setPage] = useState(1);`
line, add:

```typescript
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<EmployeeInput>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: users = [] } = useQuery({
    queryKey: ["users-for-employee-link"],
    queryFn: () => userService.getUsers({ limit: 200 }).then(r => r.data),
    enabled: showForm,
  });

  const { data: supervisors = [] } = useQuery({
    queryKey: ["supervisor-options", editingId],
    queryFn: () => employeeService.getSupervisorOptions(editingId ?? undefined),
    enabled: showForm,
  });

  const resetForm = () => { setShowForm(false); setEditingId(null); setForm(emptyForm); };

  const openAdd = () => { setEditingId(null); setForm(emptyForm); setShowForm(true); };

  const openEdit = (e: EmployeeRecord) => {
    setEditingId(e.id);
    setForm({
      firstName: e.firstName, lastName: e.lastName ?? "", email: e.email ?? "", phone: e.phone,
      photoUrl: e.photoUrl ?? "", userId: e.userId ?? "", supervisorId: e.supervisorId ?? "",
      division: e.division ?? "", designation: e.designation, dutyType: e.dutyType ?? "",
      hireDate: e.hireDate.slice(0, 10), rateType: e.rateType, rate: e.rate,
      payFrequency: e.payFrequency ?? "", penaltyFee: e.penaltyFee,
      dateOfBirth: e.dateOfBirth ? e.dateOfBirth.slice(0, 10) : "", gender: e.gender ?? "",
      maritalStatus: e.maritalStatus ?? "", cnic: e.cnic ?? "",
      emergencyContactName: e.emergencyContactName ?? "", emergencyContactRelation: e.emergencyContactRelation ?? "",
      emergencyContactPhone: e.emergencyContactPhone ?? "",
    });
    setShowForm(true);
  };

  const handleImageUpload = async (ev: React.ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0];
    if (!file) return;
    ev.target.value = "";
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("image", file);
      const token = getAccessToken();
      const res = await fetch(`${import.meta.env.VITE_API_URL || "http://localhost:3001/api"}/upload/image`, {
        method: "POST",
        headers: { ...(token && { Authorization: `Bearer ${token}` }) },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setForm(p => ({ ...p, photoUrl: data.data.url }));
      toast.success("Photo uploaded");
    } catch (err: any) {
      toast.error(err.message || "Photo upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!form.firstName.trim() || !form.phone.trim() || !form.designation.trim() || !form.hireDate || !form.rate) {
      toast.error("First name, phone, designation, hire date, and rate are required");
      return;
    }
    setSaving(true);
    try {
      const payload: EmployeeInput = {
        ...form,
        lastName: form.lastName || null,
        email: form.email || null,
        photoUrl: form.photoUrl || null,
        userId: form.userId || null,
        supervisorId: form.supervisorId || null,
        division: form.division || null,
        dutyType: form.dutyType || null,
        payFrequency: form.payFrequency || null,
        penaltyFee: form.penaltyFee || null,
        dateOfBirth: form.dateOfBirth || null,
        gender: form.gender || null,
        maritalStatus: form.maritalStatus || null,
        cnic: form.cnic || null,
        emergencyContactName: form.emergencyContactName || null,
        emergencyContactRelation: form.emergencyContactRelation || null,
        emergencyContactPhone: form.emergencyContactPhone || null,
      };
      if (editingId) {
        await employeeService.update(editingId, payload);
        toast.success("Employee updated");
      } else {
        await employeeService.create(payload);
        toast.success("Employee added");
      }
      resetForm();
      queryClient.invalidateQueries({ queryKey: ["employees"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to save employee");
    } finally {
      setSaving(false);
    }
  };
```

- [ ] **Step 2: Wire the header button and row edit button to the form**

Replace both `<Button className="gradient-primary text-primary-foreground"><Plus
className="h-4 w-4 mr-2" />Add Employee</Button>` occurrences (in `PageHeader`'s `actions` and
in the empty-state) by adding `onClick={openAdd}`:

```tsx
<Button className="gradient-primary text-primary-foreground" onClick={openAdd}><Plus className="h-4 w-4 mr-2" />Add Employee</Button>
```

Wire the row-level edit button's `onClick`:
```tsx
<Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(e)}><Pencil className="h-3 w-3" /></Button>
```

- [ ] **Step 3: Render the inline form (Basic Information + Positional Info tabs only)**

Insert this block in the JSX, immediately after the `<PageHeader ... />` element and before
the list `<Card>`:

```tsx
      {showForm && canManage && (
        <Card className="shadow-sm border-primary/30 bg-primary/[0.02]">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">{editingId ? "Edit" : "Add"} Employee</Label>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={resetForm}><ChevronUp className="h-4 w-4" /></Button>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="basic">
              <TabsList className="flex-wrap h-auto gap-1">
                <TabsTrigger value="basic">Basic Information</TabsTrigger>
                <TabsTrigger value="positional">Positional Info</TabsTrigger>
              </TabsList>

              <TabsContent value="basic" className="mt-4 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <div className="space-y-1.5"><Label>First Name <span className="text-destructive">*</span></Label><Input value={form.firstName} onChange={(e) => setForm(p => ({ ...p, firstName: e.target.value }))} /></div>
                  <div className="space-y-1.5"><Label>Last Name</Label><Input value={form.lastName ?? ""} onChange={(e) => setForm(p => ({ ...p, lastName: e.target.value }))} /></div>
                  <div className="space-y-1.5"><Label>Phone <span className="text-destructive">*</span></Label><Input value={form.phone} onChange={(e) => setForm(p => ({ ...p, phone: e.target.value }))} /></div>
                  <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={form.email ?? ""} onChange={(e) => setForm(p => ({ ...p, email: e.target.value }))} /></div>
                  <div className="space-y-1.5">
                    <Label>Linked User Account</Label>
                    <Select value={form.userId ?? ""} onValueChange={(v) => setForm(p => ({ ...p, userId: v }))}>
                      <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                      <SelectContent>
                        {users.map((u: UserRecord) => <SelectItem key={u.id} value={u.id}>{u.name} ({u.email})</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Photograph</Label>
                    <input type="file" accept="image/*" ref={fileInputRef} className="hidden" onChange={handleImageUpload} />
                    {uploading ? (
                      <div className="border rounded-lg p-2 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Uploading...</div>
                    ) : form.photoUrl ? (
                      <div className="flex items-center gap-2">
                        <Avatar className="h-10 w-10"><AvatarImage src={form.photoUrl} /></Avatar>
                        <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>Change</Button>
                      </div>
                    ) : (
                      <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}><Upload className="h-3 w-3 mr-1.5" />Upload</Button>
                    )}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="positional" className="mt-4 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <div className="space-y-1.5"><Label>Division</Label><Input value={form.division ?? ""} onChange={(e) => setForm(p => ({ ...p, division: e.target.value }))} /></div>
                  <div className="space-y-1.5"><Label>Designation <span className="text-destructive">*</span></Label><Input value={form.designation} onChange={(e) => setForm(p => ({ ...p, designation: e.target.value }))} /></div>
                  <div className="space-y-1.5">
                    <Label>Duty Type</Label>
                    <Select value={form.dutyType ?? ""} onValueChange={(v) => setForm(p => ({ ...p, dutyType: v }))}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>{DUTY_TYPES.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5"><Label>Hire Date <span className="text-destructive">*</span></Label><Input type="date" value={form.hireDate} onChange={(e) => setForm(p => ({ ...p, hireDate: e.target.value }))} /></div>
                  <div className="space-y-1.5">
                    <Label>Rate Type <span className="text-destructive">*</span></Label>
                    <Select value={form.rateType} onValueChange={(v) => setForm(p => ({ ...p, rateType: v as EmployeeInput["rateType"] }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{RATE_TYPES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5"><Label>Rate (PKR) <span className="text-destructive">*</span></Label><Input type="number" min="0" value={form.rate} onChange={(e) => setForm(p => ({ ...p, rate: Number(e.target.value) }))} /></div>
                  <div className="space-y-1.5">
                    <Label>Pay Frequency</Label>
                    <Select value={form.payFrequency ?? ""} onValueChange={(v) => setForm(p => ({ ...p, payFrequency: v }))}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>{PAY_FREQUENCIES.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5"><Label>Penalty Fee (PKR, per absence)</Label><Input type="number" min="0" value={form.penaltyFee ?? ""} onChange={(e) => setForm(p => ({ ...p, penaltyFee: e.target.value ? Number(e.target.value) : null }))} /></div>
                </div>
              </TabsContent>
            </Tabs>

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={resetForm}>Cancel</Button>
              <Button className="gradient-primary text-primary-foreground" onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
            </div>
          </CardContent>
        </Card>
      )}
```

- [ ] **Step 4: Verify it builds**

```bash
cd Ovenisto_Frontend_Software
npm run build
```
Expected: exits 0. Note `Save` will not yet persist the Supervisor/Biographical/Emergency
Contact tabs' data since those tabs don't exist until Task 10 — the fields default to `null`
via `emptyForm`, which is valid per the backend's optional-field handling.

- [ ] **Step 5: Manual verification**

With both dev servers running, click "Add Employee", fill in First Name, Phone, Designation,
Hire Date, and Rate, click Save. Confirm a toast reads "Employee added" and the new row
appears in the list table. Click the row's edit (pencil) button, confirm the form re-opens
pre-filled with the saved values, change a field, save, and confirm the table updates.

- [ ] **Step 6: Commit**

```bash
git add src/pages/Employees.tsx
git commit -m "feat(employees): add Basic Information + Positional Info form tabs"
```

---

### Task 10: `Employees.tsx` — Add/Edit form: Supervisor, Biographical Info, Emergency Contact tabs

**Files:**
- Modify: `Ovenisto_Frontend_Software/src/pages/Employees.tsx`

**Interfaces:**
- Consumes: `supervisors` (from Task 9's `useQuery`).
- Produces: the form's remaining three tabs, completing the spec's field list.

- [ ] **Step 1: Add the three remaining `TabsTrigger`s**

In the `<TabsList>` block added in Task 9, add three more triggers after `Positional Info`:

```tsx
                <TabsTrigger value="supervisor">Supervisor</TabsTrigger>
                <TabsTrigger value="biographical">Biographical Info</TabsTrigger>
                <TabsTrigger value="emergency">Emergency Contact</TabsTrigger>
```

- [ ] **Step 2: Add the three `TabsContent` panels**

Insert these immediately after the `positional` `TabsContent` block closes (after its
`</TabsContent>`), before the closing `</Tabs>`:

```tsx
              <TabsContent value="supervisor" className="mt-4 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-md">
                  <div className="space-y-1.5">
                    <Label>Reports To</Label>
                    <Select value={form.supervisorId ?? ""} onValueChange={(v) => setForm(p => ({ ...p, supervisorId: v }))}>
                      <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                      <SelectContent>
                        {supervisors.map(s => <SelectItem key={s.id} value={s.id}>{s.firstName} {s.lastName ?? ""}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="biographical" className="mt-4 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <div className="space-y-1.5"><Label>Date of Birth</Label><Input type="date" value={form.dateOfBirth ?? ""} onChange={(e) => setForm(p => ({ ...p, dateOfBirth: e.target.value }))} /></div>
                  <div className="space-y-1.5">
                    <Label>Gender</Label>
                    <Select value={form.gender ?? ""} onValueChange={(v) => setForm(p => ({ ...p, gender: v }))}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>{GENDERS.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Marital Status</Label>
                    <Select value={form.maritalStatus ?? ""} onValueChange={(v) => setForm(p => ({ ...p, maritalStatus: v }))}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>{MARITAL_STATUSES.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5"><Label>CNIC</Label><Input placeholder="42101-1234567-1" value={form.cnic ?? ""} onChange={(e) => setForm(p => ({ ...p, cnic: e.target.value }))} /></div>
                </div>
              </TabsContent>

              <TabsContent value="emergency" className="mt-4 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <div className="space-y-1.5"><Label>Contact Name</Label><Input value={form.emergencyContactName ?? ""} onChange={(e) => setForm(p => ({ ...p, emergencyContactName: e.target.value }))} /></div>
                  <div className="space-y-1.5"><Label>Relationship</Label><Input value={form.emergencyContactRelation ?? ""} onChange={(e) => setForm(p => ({ ...p, emergencyContactRelation: e.target.value }))} /></div>
                  <div className="space-y-1.5"><Label>Phone</Label><Input value={form.emergencyContactPhone ?? ""} onChange={(e) => setForm(p => ({ ...p, emergencyContactPhone: e.target.value }))} /></div>
                </div>
              </TabsContent>
```

- [ ] **Step 3: Verify it builds**

```bash
cd Ovenisto_Frontend_Software
npm run build
```
Expected: exits 0.

- [ ] **Step 4: Manual verification**

Open "Add Employee", fill the Basic Information and Positional Info tabs as in Task 9, then
switch to Supervisor and select a previously-created employee, fill Biographical Info (DOB,
Gender, Marital Status, CNIC) and Emergency Contact (Name, Relationship, Phone), Save. Re-open
the saved record via Edit and confirm every field across all five tabs is pre-filled
correctly.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Employees.tsx
git commit -m "feat(employees): add Supervisor, Biographical Info, Emergency Contact form tabs"
```

---

### Task 11: `EmployeePortal.tsx` — switch pay/penalty display to the linked `Employee`

**Files:**
- Modify: `Ovenisto_Frontend_Software/src/pages/EmployeePortal.tsx`

**Interfaces:**
- Consumes: `employeeService.getMe()` (Task 5).

- [ ] **Step 1: Swap the data source**

Replace the import on line 25:
```typescript
import { userService } from "@/services/user.service";
```
with:
```typescript
import { employeeService } from "@/services/employee.service";
```

Replace the query block at lines 164-169:
```typescript
  // Full profile for hourlyRate / absencePenalty — use /auth/me (accessible to any role)
  const { data: myProfile } = useQuery({
    queryKey: ["my-profile"],
    queryFn: () => userService.getMe(),
    enabled: !!user?.id,
  });
```
with:
```typescript
  // Linked Employee profile for pay/penalty — accessible to any role
  const { data: myEmployee } = useQuery({
    queryKey: ["my-employee"],
    queryFn: () => employeeService.getMe(),
    enabled: !!user?.id,
  });
```

- [ ] **Step 2: Replace the pay calculation**

Replace lines 304-315:
```typescript
  const presentCount = historyRows.filter(r => r.status === "present").length;
  const lateCount    = historyRows.filter(r => r.status === "late").length;
  const halfdayCount = historyRows.filter(r => r.status === "halfday").length;
  const absentCount  = historyRows.filter(r => r.status === "absent").length;
  const notRecordedCount = unrecordedRows.length;
  const totalHours   = historyRows.reduce((acc, r) => acc + hoursWorkedNum(r.clockIn, r.clockOut), 0);
  const totalOvertimeHours = historyRows.reduce((acc, r) => acc + (r.overtimeMinutes ?? 0), 0) / 60;

  const hourlyRate     = myProfile?.hourlyRate     ?? 0;
  const absencePenalty = myProfile?.absencePenalty ?? 0;
  const totalPay       = totalHours * hourlyRate;
  const totalPenalty   = absentCount * absencePenalty;
```
with:
```typescript
  const presentCount = historyRows.filter(r => r.status === "present").length;
  const lateCount    = historyRows.filter(r => r.status === "late").length;
  const halfdayCount = historyRows.filter(r => r.status === "halfday").length;
  const absentCount  = historyRows.filter(r => r.status === "absent").length;
  const notRecordedCount = unrecordedRows.length;
  const totalHours   = historyRows.reduce((acc, r) => acc + hoursWorkedNum(r.clockIn, r.clockOut), 0);
  const totalOvertimeHours = historyRows.reduce((acc, r) => acc + (r.overtimeMinutes ?? 0), 0) / 60;

  const presentDays  = presentCount + lateCount;
  const rateType     = myEmployee?.rateType ?? null;
  const rate         = myEmployee?.rate ?? 0;
  const penaltyFee   = myEmployee?.penaltyFee ?? 0;
  const hasPay       = !!myEmployee && rate > 0;
  const totalPay =
    rateType === "Hourly"   ? totalHours * rate :
    rateType === "Daily"    ? presentDays * rate :
    rateType === "Monthly"  ? rate :
    rateType === "PerShift" ? presentDays * rate :
    0;
  const totalPenalty = absentCount * penaltyFee;
```

- [ ] **Step 3: Update the stat cards**

Replace lines 493-494:
```typescript
              { label: "Est. Pay",     value: hourlyRate > 0 ? fmt(totalPay)    : "—", color: "text-success",     extra: <DollarSign className="h-3 w-3" />, statusKey: null },
              { label: "Penalty",      value: absencePenalty > 0 ? fmt(totalPenalty) : "—", color: "text-destructive", extra: <AlertTriangle className="h-3 w-3" />, statusKey: null },
```
with:
```typescript
              { label: "Est. Pay",     value: hasPay ? fmt(totalPay)    : "—", color: "text-success",     extra: <DollarSign className="h-3 w-3" />, statusKey: null },
              { label: "Penalty",      value: penaltyFee > 0 ? fmt(totalPenalty) : "—", color: "text-destructive", extra: <AlertTriangle className="h-3 w-3" />, statusKey: null },
```

- [ ] **Step 4: Update the history table's per-row Pay column**

The per-row column only makes sense for `Hourly` rate type (it multiplies that day's hours by
the rate). Replace line 529:
```typescript
                    {hourlyRate > 0 && <TableHead>Pay</TableHead>}
```
with:
```typescript
                    {rateType === "Hourly" && hasPay && <TableHead>Pay</TableHead>}
```

Replace lines 547-551:
```typescript
                        {hourlyRate > 0 && (
                          <TableCell className="text-sm text-success">
                            {hrs > 0 ? `Rs. ${Math.round(hrs * hourlyRate).toLocaleString("en-PK")}` : "—"}
                          </TableCell>
                        )}
```
with:
```typescript
                        {rateType === "Hourly" && hasPay && (
                          <TableCell className="text-sm text-success">
                            {hrs > 0 ? `Rs. ${Math.round(hrs * rate).toLocaleString("en-PK")}` : "—"}
                          </TableCell>
                        )}
```

Replace line 562:
```typescript
                      <TableCell colSpan={hourlyRate > 0 ? 7 : 6} className="text-center text-muted-foreground py-6">
```
with:
```typescript
                      <TableCell colSpan={rateType === "Hourly" && hasPay ? 7 : 6} className="text-center text-muted-foreground py-6">
```

- [ ] **Step 5: Verify it builds**

```bash
cd Ovenisto_Frontend_Software
npm run build
```
Expected: exits 0. If `tsc` flags any remaining reference to `myProfile`, `hourlyRate`, or
`absencePenalty` in this file, replace it following the same pattern as above.

- [ ] **Step 6: Manual verification**

Log in as the staff user whose login is linked to the Employee record created in Task 9/10
(or link one now via the Employees page), navigate to My Portal → Cash Shifts/Attendance tab,
and confirm "Est. Pay" and "Penalty" stat cards show computed values matching the Employee's
`rateType`/`rate`/`penaltyFee`. Log in as a staff user with no linked Employee and confirm
both cards show "—".

- [ ] **Step 7: Commit**

```bash
git add src/pages/EmployeePortal.tsx
git commit -m "feat(employee-portal): source pay/penalty from linked Employee record"
```

---

### Task 12: Full end-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Backend health check**

```bash
cd Ovenisto-backend
npm run typecheck && npm run build
```
Expected: both exit 0.

- [ ] **Step 2: Frontend health check**

```bash
cd Ovenisto_Frontend_Software
npm run build
```
Expected: exits 0.

- [ ] **Step 3: Full happy-path walkthrough**

With both dev servers running:
1. Log in as Super Admin, select a specific outlet (not "All Outlets").
2. Navigate to Employees, create a new employee with a Linked User Account, Supervisor, and
   all five tabs filled in.
3. Confirm the new row appears in the list with the correct photo, designation, division, and
   supervisor name.
4. Log in as the linked user; on My Portal, confirm the Est. Pay / Penalty stat cards reflect
   the new employee's `rateType`/`rate`/`penaltyFee`.
5. Log in as a Manager scoped to a different outlet and confirm the employee created in step 2
   does **not** appear in their Employees list (outlet scoping works).
6. Navigate to HR Management (`/attendance`) and confirm there is no remaining "Pay Settings"
   UI or console error referencing the removed fields.

- [ ] **Step 4: Report results**

Summarize pass/fail for each of the six checks above. Do not mark this plan complete until
all six pass.
