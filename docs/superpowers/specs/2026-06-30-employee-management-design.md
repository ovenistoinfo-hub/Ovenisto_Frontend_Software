# Employee Management (Manage Employees) — Design

**Date:** 2026-06-30
**Status:** Approved for planning

## Background

The client shared a demo of another POS's "Employees" module (multi-tab onboarding wizard:
Basic Information, Positional Info, Benefits, Supervisor, Biographical Info, Additional
Address, Emergency Contact, Custom, plus a list/grid page) and asked for something similar
in Ovenisto, with employee fee/pay settlement happening there instead of HR Management.

Investigation found:
- `Users.tsx` already owns login/role/permissions — this is **not** being replaced.
- `User.hourlyRate` / `User.absencePenalty` exist in the schema and are read (display-only)
  in `EmployeePortal.tsx`'s pay/penalty stat cards, but the **admin edit UI for them was
  dead code** — `editPayUser`/`payEdit` state and the `updatePayMut` mutation in
  `Attendance.tsx` are declared but never rendered in JSX. There was nothing live to remove;
  this spec retires that dead code as part of the migration below.
- No existing `Division`/`Designation`/`Employee` concept anywhere in the schema.
- `DeliveryRider` already establishes the precedent this design follows: a standalone model
  with an optional, unique `userId` link to `User`.

## Scope decisions (confirmed with user)

- **New, separate page** ("Employees"), not a merge into `Users.tsx`. An Employee record
  optionally links to an existing login via `userId`; Users.tsx is unchanged.
- **Biographical fields** adapted for Pakistan: Date of Birth, Gender, Marital Status, CNIC,
  Photograph. The demo's SSN/EEO Class/Ethnic Group/Citizenship/Work-in-State fields are
  dropped — not relevant here.
- **Positional/Pay tab**: Division, Designation, Duty Type, Hire Date, Rate Type, Rate, Pay
  Frequency, Penalty Fee. Demo's Hourly Rate2/3, Department Text, Pay Frequency Text,
  Termination tracking (Termination Date/Reason/Voluntary/Re-Hire Date) are dropped as
  template cruft / out of scope for v1. A simple Active/Inactive status replaces full
  termination workflow.
- **Tabs kept**: Basic Information, Positional Info, Supervisor, Biographical Info,
  Emergency Contact. Benefits (enterprise insurance/benefit-class tracking), Additional
  Address (redundant with phone/email on Basic Info), and Custom (undefined placeholder) are
  dropped.
- **Designation** is a free-text job title, independent of the system `Role` enum used for
  login permissions (an employee's Role, if linked to a login, still controls app access;
  Designation is just the HR-facing title).
- **Outlet-scoped**, following the same `resolveOutletScope`/`resolveCreateOutlet` pattern as
  every other operational module.
- **Login linking is optional**: a dropdown on Basic Information to an existing `Users.tsx`
  login. No login is created from this form.
- **Nav placement**: new top-level "Employees" entry in the existing "Account / HR" sidebar
  group (alongside My Portal, Users, HR Management).
- **Form style**: inline Card (not a popup Dialog), per the project's standing UI convention,
  internally organized with shadcn `Tabs` (already used this way in `Attendance.tsx`) instead
  of the demo's Previous/Next wizard — any tab can be visited in any order, one Save button.
- **List style**: matches the existing `Users.tsx` table (search, filter, badges, row
  actions) — not the demo's jQuery-DataTables toolbar (Copy/CSV/Excel/PDF/Print), which is
  inconsistent with the rest of the app and out of scope.

## Data model

New `Employee` model in `Ovenisto-backend/prisma/schema.prisma`:

```prisma
model Employee {
  id            String    @id @default(uuid())
  userId        String?   @unique
  outletId      String?
  supervisorId  String?

  // Basic
  firstName     String    @db.VarChar(100)
  lastName      String?   @db.VarChar(100)
  email         String?   @db.VarChar(100)
  phone         String    @db.VarChar(20)
  photoUrl      String?

  // Positional / Pay
  division      String?   @db.VarChar(100)
  designation   String    @db.VarChar(100)
  dutyType      String?   @db.VarChar(20)   // Full Time | Part Time
  hireDate      DateTime
  rateType      String    @db.VarChar(20)   // Hourly | Daily | Monthly | PerShift
  rate          Decimal   @db.Decimal(10, 2)
  payFrequency  String?   @db.VarChar(20)   // Weekly | BiWeekly | Monthly
  penaltyFee    Decimal?  @db.Decimal(10, 2)

  // Biographical
  dateOfBirth   DateTime?
  gender        String?   @db.VarChar(20)
  maritalStatus String?   @db.VarChar(20)
  cnic          String?   @db.VarChar(20)

  // Emergency Contact
  emergencyContactName     String? @db.VarChar(100)
  emergencyContactRelation String? @db.VarChar(50)
  emergencyContactPhone    String? @db.VarChar(20)

  status        String    @default("active") @db.VarChar(20) // active | inactive
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  user          User?      @relation(fields: [userId], references: [id])
  outlet        Outlet?    @relation(fields: [outletId], references: [id])
  supervisor    Employee?  @relation("EmployeeSupervisor", fields: [supervisorId], references: [id])
  subordinates  Employee[] @relation("EmployeeSupervisor")

  @@map("employees")
}
```

`User.hourlyRate` and `User.absencePenalty` are removed. A one-off backfill script creates
an `Employee` row (linked via `userId`, `rateType = "Hourly"`) for every existing `User` that
currently has a non-null `hourlyRate`, before the columns are dropped.

## Backend (`Ovenisto-backend/src/modules/employees/`)

`employee.controller.ts` + `employee.routes.ts`, mounted at `/api/employees`:

- `GET /employees` — list, outlet-scoped, search by name/designation/division, paginated
- `GET /employees/:id` — single record; 404 if outside scope
- `POST /employees` — create; `outletId = resolveCreateOutlet(req)`; Zod-validated
  (firstName, phone, designation, hireDate, rateType, rate required)
- `PUT /employees/:id` — update; scope-checked before mutation
- `DELETE /employees/:id` — soft delete (`status = "inactive"`), not a hard delete
- `GET /employees/me` — new; returns the Employee linked to `req.user.id` (or `null`),
  accessible to any authenticated role — replaces `myProfile?.hourlyRate` in
  `EmployeePortal.tsx`
- `GET /employees/supervisors` — lightweight `{id, name}` list for the Supervisor dropdown,
  same outlet scope, excludes the employee being edited

All Decimal fields (`rate`, `penaltyFee`) converted via `Number()` in response mappers.

## `EmployeePortal.tsx` pay calculation

Switches from `GET /auth/me` (`hourlyRate`/`absencePenalty`) to `GET /employees/me`. If no
linked Employee, the Pay/Penalty stat cards stay hidden (current behavior already hides them
when the rate is 0/null). If linked, computed by `rateType`:

| Rate Type | Pay formula |
|---|---|
| Hourly | `rate * totalHours` |
| Daily | `rate * presentDays` (present/late attendance record count) |
| Monthly | `rate` flat |
| Per-Shift | `rate * shiftsWorked` (same present/late count as Daily) |

Penalty (unchanged logic, renamed field): `penaltyFee * absentCount`.

## `Attendance.tsx` cleanup

Remove the dead, never-rendered `editPayUser`/`payEdit` state and `updatePayMut` mutation —
this is the actual "remove pay settings from HR Management" requested, since there was no
live UI to remove.

## Frontend (`Ovenisto_Frontend_Software/src/pages/Employees.tsx`)

**Route:** `/employees`. **Nav:** new entry in the "Account / HR" sidebar group, icon
`IdCard`. New permission module `"Employees"` added to the `modules` array in `Users.tsx`
(default on for Super Admin/Admin/Manager/Store Manager, view-only for others — same
treatment as `Attendance`).

**List view** — styled like the existing `Users.tsx` table:
- Search (name/designation/division) + Status filter (Active/Inactive)
- Columns: Photo thumbnail, Name, Designation, Division, Phone, Hire Date, Supervisor,
  Status badge, Actions (edit/deactivate)
- "Add Employee" button opens the form

**Add/Edit form** — inline Card (not a popup Dialog) per the project's standing convention,
toggled by the header button, organized with shadcn `Tabs` (no Previous/Next gating — any
tab, one Save button):

1. **Basic Information** — First Name*, Last Name, Phone*, Email, Photograph (Cloudinary
   upload, reusing the existing image upload component), Linked User Account (optional
   searchable dropdown over `Users.tsx` logins)
2. **Positional Info** — Division, Designation*, Duty Type (Full Time/Part Time), Hire Date*,
   Rate Type* (Hourly/Daily/Monthly/Per-Shift), Rate*, Pay Frequency, Penalty Fee
3. **Supervisor** — Reports To (dropdown of other active Employees in the same outlet; self
   excluded)
4. **Biographical Info** — Date of Birth, Gender, Marital Status, CNIC
5. **Emergency Contact** — Name, Relationship, Phone

`employee.service.ts` added following the existing `*.service.ts` wrapper pattern (extracts
`res.data`, never the two-level `res.data.data` mistake documented in project memory).

## Out of scope (v1)

- Benefits/insurance tracking
- Additional Address tab
- Custom fields tab
- Termination workflow (Termination Date/Reason, Voluntary Termination, Re-Hire Date) —
  Active/Inactive status only
- CSV/Excel/PDF export toolbar on the list page
- Creating a login (User) inline from the Employee form
