# Mira INC 1 — Walking Skeleton Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a usable single-user ticket tracker — sign up, log in, create a project, create tickets with real keys, and move them across six statuses — complete enough that Mira can hold its own backlog.

**Architecture:** An npm-workspaces monorepo with three packages. `shared` holds Zod schemas that validate requests on the server and type forms on the client. `server` is Express over PostgreSQL via Kysely, layered so routes never touch the database and services never touch `req`/`res`. `client` is React talking to the server over a typed fetch wrapper. Authentication is server-side sessions in an httpOnly cookie.

**Tech Stack:** TypeScript, Node 24, Express 5, PostgreSQL, Kysely, Zod, argon2, React 19, Vite, Vitest, Supertest, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-01-mira-design.md`

## Global Constraints

- **Ticket statuses** are exactly: `backlog`, `todo`, `in_progress`, `blocked`, `done`, `closed`. No others.
- **Ticket priorities** are exactly: `low`, `medium`, `high`, `urgent`. Default `medium`.
- **Workspace kinds** are exactly: `personal`, `team`. **Modes**: `free`, `managed`. **Roles**: `admin`, `member`.
- **Routes never touch the database. Services never touch `req`/`res`.** No exceptions.
- **Every permission decision routes through `server/src/permissions/index.ts`.** No route or service performs its own inline check.
- **Permission failures on invisible resources return 404, never 403.** A 403 confirms the resource exists.
- **Passwords are hashed with argon2id.** Never bcrypt, never a bare hash.
- **Sessions are opaque random tokens in a database table.** Never JWTs.
- **Deleting an epic must never delete its tickets** (`epic_id` is `ON DELETE SET NULL`). Not exercised until INC 3, but the constraint ships in the INC 1 schema.
- **Ticket numbers are allocated by `UPDATE … RETURNING` inside the insert transaction.** Never `SELECT max(number) + 1`.

## Prerequisite

**Tasks 4 onward require a running PostgreSQL.** It is not installed on the development machine yet. Before starting Task 4:

```bash
winget install PostgreSQL.PostgreSQL.17     # or Docker, or a hosted URL
createdb mira_dev
createdb mira_test
```

Tasks 1, 2 and 3 have no database dependency and can be completed first.

---

## File Structure

```
Mira/
├─ package.json                   npm workspaces root, shared scripts
├─ tsconfig.json                  one config covering all three packages
├─ .env.example                   documented environment variables
├─ .gitignore
│
├─ shared/                        contracts used by BOTH sides
│  ├─ package.json
│  └─ src/
│     ├─ index.ts                 re-exports everything
│     ├─ enums.ts                 TicketStatus, TicketPriority, Role, Mode, Kind
│     └─ schemas.ts               Zod schemas for every request body
│
├─ server/
│  ├─ package.json
│  └─ src/
│     ├─ index.ts                 entrypoint: reads config, starts listening
│     ├─ app.ts                   buildApp() — an Express app with no listen()
│     ├─ config.ts                parses and validates process.env
│     ├─ errors.ts                AppError + errorMiddleware
│     ├─ db/
│     │  ├─ types.ts              the Kysely Database interface
│     │  ├─ index.ts              the Kysely instance
│     │  └─ migrations/
│     │     └─ 001_initial.ts     users, sessions, workspaces, members,
│     │                           projects, epics, tickets
│     ├─ auth/
│     │  ├─ password.ts           hashPassword / verifyPassword
│     │  ├─ session.ts            createSession / lookupSession / destroySession
│     │  └─ middleware.ts         requireUser
│     ├─ permissions/
│     │  └─ index.ts              THE permission module
│     ├─ services/
│     │  ├─ auth.service.ts       signup / login / logout
│     │  ├─ project.service.ts    create / list / get
│     │  └─ ticket.service.ts     create / update / list
│     └─ routes/
│        ├─ auth.routes.ts
│        ├─ project.routes.ts
│        └─ ticket.routes.ts
│
└─ client/
   ├─ package.json
   ├─ index.html
   ├─ vite.config.ts
   └─ src/
      ├─ main.tsx                 router setup
      ├─ api/client.ts            typed fetch wrapper, credentials: 'include'
      ├─ api/endpoints.ts         one function per endpoint
      ├─ auth/useSession.ts       current-user state
      ├─ routes/SignupPage.tsx
      ├─ routes/LoginPage.tsx
      ├─ routes/ProjectListPage.tsx
      └─ routes/BoardPage.tsx
         └─ components/Board.tsx, TicketCard.tsx, NewTicketForm.tsx
```

**Why these boundaries.** `shared` exists so a field is defined once — change it and both sides fail to compile. `permissions/` is a single module by design, so INC 7's project guests are a one-file change rather than an audit of every handler. `app.ts` is separate from `index.ts` so tests can build an app without binding a port.

---

## Task 1: Monorepo scaffold and shared contracts

**No database required.**

**Files:**
- Create: `package.json`, `tsconfig.json`, `.gitignore`, `.env.example`
- Create: `shared/package.json`, `shared/src/enums.ts`, `shared/src/schemas.ts`, `shared/src/index.ts`
- Test: `shared/src/schemas.test.ts`

**Interfaces:**
- Consumes: nothing — this is the first task.
- Produces: `TICKET_STATUSES`, `TICKET_PRIORITIES` (readonly string arrays); types `TicketStatus`, `TicketPriority`, `Role`, `Mode`, `WorkspaceKind`; Zod schemas `signupSchema`, `loginSchema`, `createProjectSchema`, `createTicketSchema`, `updateTicketSchema`; and their inferred types `SignupInput`, `LoginInput`, `CreateProjectInput`, `CreateTicketInput`, `UpdateTicketInput`.

- [ ] **Step 1: Create the workspace root**

`package.json`:

```json
{
  "name": "mira",
  "private": true,
  "type": "module",
  "workspaces": ["shared", "server", "client"],
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "@types/node": "^22.10.5",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
```

`tsconfig.json` — one config for all three packages. Project references and
`tsc -b` would be more "correct", but they need a config per package plus a
reference graph, and at this size that is ceremony that buys nothing:

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "types": ["node"],
    "baseUrl": ".",
    "paths": { "@mira/shared": ["./shared/src/index.ts"] }
  },
  "include": ["shared/src", "server/src", "server/tests", "client/src", "e2e"]
}
```

`.gitignore`:

```
node_modules/
dist/
.env
*.tsbuildinfo
playwright-report/
test-results/
```

`.env.example`:

```
DATABASE_URL=postgres://postgres:postgres@localhost:5432/mira_dev
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/mira_test
SESSION_COOKIE_NAME=mira_session
SESSION_TTL_DAYS=30
PORT=3001
CLIENT_ORIGIN=http://localhost:5173
```

Then run `npm install`.

- [ ] **Step 2: Write the failing test**

`shared/src/schemas.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { signupSchema, createTicketSchema, TICKET_STATUSES } from './index.js'

describe('signupSchema', () => {
  it('accepts a valid signup', () => {
    const r = signupSchema.safeParse({
      email: 'patrick@example.com',
      password: 'correct horse battery',
      displayName: 'Patrick',
    })
    expect(r.success).toBe(true)
  })

  it('rejects a password under 12 characters', () => {
    const r = signupSchema.safeParse({
      email: 'patrick@example.com',
      password: 'short',
      displayName: 'Patrick',
    })
    expect(r.success).toBe(false)
  })

  it('lowercases and trims the email', () => {
    const r = signupSchema.parse({
      email: '  Patrick@Example.COM ',
      password: 'correct horse battery',
      displayName: 'Patrick',
    })
    expect(r.email).toBe('patrick@example.com')
  })
})

describe('createTicketSchema', () => {
  it('defaults status to backlog and priority to medium', () => {
    const r = createTicketSchema.parse({ title: 'Set up the database' })
    expect(r.status).toBe('backlog')
    expect(r.priority).toBe('medium')
  })

  it('rejects a status that is not in the enum', () => {
    const r = createTicketSchema.safeParse({ title: 'x', status: 'wontfix' })
    expect(r.success).toBe(false)
  })

  it('rejects an empty title', () => {
    expect(createTicketSchema.safeParse({ title: '   ' }).success).toBe(false)
  })
})

describe('TICKET_STATUSES', () => {
  it('is exactly the six statuses from the spec, in board order', () => {
    expect(TICKET_STATUSES).toEqual([
      'backlog', 'todo', 'in_progress', 'blocked', 'done', 'closed',
    ])
  })
})
```

- [ ] **Step 3: Run the test and confirm it fails**

Run: `npx vitest run shared`
Expected: FAIL — cannot resolve `./index.js`.

- [ ] **Step 4: Implement the shared package**

`shared/package.json`:

```json
{
  "name": "@mira/shared",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "dependencies": { "zod": "^3.24.0" }
}
```

`shared/src/enums.ts`:

```ts
export const TICKET_STATUSES = [
  'backlog', 'todo', 'in_progress', 'blocked', 'done', 'closed',
] as const
export type TicketStatus = (typeof TICKET_STATUSES)[number]

export const TICKET_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const
export type TicketPriority = (typeof TICKET_PRIORITIES)[number]

export const WORKSPACE_KINDS = ['personal', 'team'] as const
export type WorkspaceKind = (typeof WORKSPACE_KINDS)[number]

export const MODES = ['free', 'managed'] as const
export type Mode = (typeof MODES)[number]

export const ROLES = ['admin', 'member'] as const
export type Role = (typeof ROLES)[number]

/** Statuses that are finished work and excluded from the homepage. */
export const CLOSED_STATUSES: readonly TicketStatus[] = ['done', 'closed']
```

`shared/src/schemas.ts`:

```ts
import { z } from 'zod'
import { TICKET_STATUSES, TICKET_PRIORITIES } from './enums.js'

export const signupSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(12, 'Password must be at least 12 characters'),
  displayName: z.string().trim().min(1).max(80),
})
export type SignupInput = z.infer<typeof signupSchema>

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
})
export type LoginInput = z.infer<typeof loginSchema>

export const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(120),
  key: z.string().trim().toUpperCase().regex(
    /^[A-Z][A-Z0-9]{1,9}$/,
    'Key must be 2-10 characters, start with a letter, letters and digits only',
  ),
  description: z.string().trim().max(2000).optional(),
})
export type CreateProjectInput = z.infer<typeof createProjectSchema>

export const createTicketSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(10000).optional(),
  status: z.enum(TICKET_STATUSES).default('backlog'),
  priority: z.enum(TICKET_PRIORITIES).default('medium'),
})
export type CreateTicketInput = z.infer<typeof createTicketSchema>

export const updateTicketSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(10000).optional(),
  status: z.enum(TICKET_STATUSES).optional(),
  priority: z.enum(TICKET_PRIORITIES).optional(),
}).refine(v => Object.keys(v).length > 0, { message: 'No fields to update' })
export type UpdateTicketInput = z.infer<typeof updateTicketSchema>
```

`shared/src/index.ts`:

```ts
export * from './enums.js'
export * from './schemas.js'
```

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `npx vitest run shared`
Expected: PASS, 7 tests.

- [ ] **Step 6: Commit**

```bash
git add package.json tsconfig.json .gitignore .env.example shared/
git commit -m "feat: scaffold monorepo and shared request contracts"
```

---

## Task 2: Error layer and password hashing

**No database required.**

**Files:**
- Create: `server/package.json`, `server/src/errors.ts`, `server/src/auth/password.ts`
- Test: `server/src/errors.test.ts`, `server/src/auth/password.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `class AppError extends Error` with `constructor(code: string, message: string, status: number)` and readonly fields `code`, `status`; helpers `notFound(code, message)` and `badRequest(code, message)` returning `AppError`; `errorMiddleware(err, req, res, next)` as Express error middleware; `hashPassword(plain: string): Promise<string>` and `verifyPassword(hash: string, plain: string): Promise<boolean>`.

- [ ] **Step 1: Write the failing tests**

`server/src/errors.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { AppError, notFound, badRequest, errorMiddleware } from './errors.js'

function mockRes() {
  const res: any = {}
  res.status = vi.fn().mockReturnValue(res)
  res.json = vi.fn().mockReturnValue(res)
  return res
}

describe('AppError', () => {
  it('carries a code and an HTTP status', () => {
    const e = new AppError('TICKET_NOT_FOUND', 'No such ticket', 404)
    expect(e.code).toBe('TICKET_NOT_FOUND')
    expect(e.status).toBe(404)
    expect(e).toBeInstanceOf(Error)
  })

  it('notFound builds a 404', () => {
    expect(notFound('X', 'nope').status).toBe(404)
  })

  it('badRequest builds a 400', () => {
    expect(badRequest('X', 'nope').status).toBe(400)
  })
})

describe('errorMiddleware', () => {
  it('renders an AppError as { error: { code, message } }', () => {
    const res = mockRes()
    errorMiddleware(new AppError('NOPE', 'Not allowed', 403), {} as any, res, vi.fn())
    expect(res.status).toHaveBeenCalledWith(403)
    expect(res.json).toHaveBeenCalledWith({
      error: { code: 'NOPE', message: 'Not allowed' },
    })
  })

  it('never leaks the message of an unexpected error', () => {
    const res = mockRes()
    errorMiddleware(new Error('connection string is postgres://u:pw@host'),
      {} as any, res, vi.fn())
    expect(res.status).toHaveBeenCalledWith(500)
    const body = res.json.mock.calls[0][0]
    expect(body.error.code).toBe('INTERNAL')
    expect(JSON.stringify(body)).not.toContain('postgres://')
  })
})
```

`server/src/auth/password.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { hashPassword, verifyPassword } from './password.js'

describe('password hashing', () => {
  it('verifies a correct password', async () => {
    const hash = await hashPassword('correct horse battery')
    expect(await verifyPassword(hash, 'correct horse battery')).toBe(true)
  })

  it('rejects an incorrect password', async () => {
    const hash = await hashPassword('correct horse battery')
    expect(await verifyPassword(hash, 'wrong horse battery')).toBe(false)
  })

  it('produces a different hash each time (the salt is random)', async () => {
    const a = await hashPassword('correct horse battery')
    const b = await hashPassword('correct horse battery')
    expect(a).not.toBe(b)
  })

  it('produces an argon2id hash', async () => {
    expect(await hashPassword('correct horse battery')).toMatch(/^\$argon2id\$/)
  })

  it('returns false rather than throwing on a malformed hash', async () => {
    expect(await verifyPassword('not-a-hash', 'anything')).toBe(false)
  })
})
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run server`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

`server/package.json`:

```json
{
  "name": "@mira/server",
  "private": true,
  "type": "module",
  "scripts": { "dev": "tsx watch src/index.ts" },
  "dependencies": {
    "@mira/shared": "*",
    "argon2": "^0.41.1",
    "cookie-parser": "^1.4.7",
    "cors": "^2.8.5",
    "express": "^5.0.1",
    "kysely": "^0.27.5",
    "pg": "^8.13.1",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "@types/cookie-parser": "^1.4.8",
    "@types/cors": "^2.8.17",
    "@types/express": "^5.0.0",
    "@types/pg": "^8.11.10",
    "supertest": "^7.0.0",
    "@types/supertest": "^6.0.2",
    "tsx": "^4.19.2"
  }
}
```

`server/src/errors.ts`:

```ts
import type { NextFunction, Request, Response } from 'express'

export class AppError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export const notFound = (code: string, message: string) =>
  new AppError(code, message, 404)

export const badRequest = (code: string, message: string) =>
  new AppError(code, message, 400)

export function errorMiddleware(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (err instanceof AppError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message } })
    return
  }
  // Never surface an unexpected error's message: it may contain connection
  // strings, SQL, or file paths. Log it, return something generic.
  console.error('[unhandled]', err)
  res.status(500).json({
    error: { code: 'INTERNAL', message: 'Something went wrong.' },
  })
}
```

`server/src/auth/password.ts`:

```ts
import argon2 from 'argon2'

export function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, { type: argon2.argon2id })
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain)
  } catch {
    // A malformed hash throws rather than returning false. Treat it as a
    // failed login, not a 500 — otherwise a corrupt row becomes an outage.
    return false
  }
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run server`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add server/
git commit -m "feat: add error layer and argon2id password hashing"
```

---

## Task 3: The permission module

**No database required.** These are pure functions over plain objects, which is exactly why the spec insists every check routes through here.

**Files:**
- Create: `server/src/permissions/index.ts`
- Test: `server/src/permissions/index.test.ts`

**Interfaces:**
- Consumes: `Mode`, `Role` from `@mira/shared`.
- Produces:
  - `type PermissionContext = { userId: string; role: Role | null; mode: Mode }` — `role` is `null` when the user is not a member at all.
  - `type TicketRef = { assigneeId: string | null }`
  - `effectiveMode(projectMode: Mode | null, workspaceMode: Mode): Mode`
  - `canView(ctx: PermissionContext): boolean`
  - `canCreateTicket(ctx: PermissionContext, assigneeId: string | null): boolean`
  - `canEditTicket(ctx: PermissionContext, ticket: TicketRef): boolean`
  - `canManageProject(ctx: PermissionContext): boolean` — structural actions, admin-only in both modes per spec §4.3.

- [ ] **Step 1: Write the failing tests — the full matrix**

`server/src/permissions/index.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  effectiveMode, canView, canCreateTicket, canEditTicket, canManageProject,
  type PermissionContext,
} from './index.js'

const ME = 'user-me'
const OTHER = 'user-other'

const ctx = (
  role: PermissionContext['role'],
  mode: PermissionContext['mode'],
): PermissionContext => ({ userId: ME, role, mode })

describe('effectiveMode', () => {
  it('uses the project mode when it is set', () => {
    expect(effectiveMode('managed', 'free')).toBe('managed')
  })
  it('inherits the workspace mode when the project mode is null', () => {
    expect(effectiveMode(null, 'managed')).toBe('managed')
  })
})

describe('canView', () => {
  it('allows any member', () => {
    expect(canView(ctx('member', 'free'))).toBe(true)
    expect(canView(ctx('admin', 'managed'))).toBe(true)
  })
  it('denies a non-member', () => {
    expect(canView(ctx(null, 'free'))).toBe(false)
  })
})

describe('canCreateTicket — free mode', () => {
  it('lets a member create for anyone', () => {
    expect(canCreateTicket(ctx('member', 'free'), OTHER)).toBe(true)
  })
  it('lets a member create an unassigned ticket', () => {
    expect(canCreateTicket(ctx('member', 'free'), null)).toBe(true)
  })
  it('denies a non-member', () => {
    expect(canCreateTicket(ctx(null, 'free'), ME)).toBe(false)
  })
})

describe('canCreateTicket — managed mode', () => {
  it('lets the admin create for anyone', () => {
    expect(canCreateTicket(ctx('admin', 'managed'), OTHER)).toBe(true)
  })
  it('lets a member create for themselves', () => {
    expect(canCreateTicket(ctx('member', 'managed'), ME)).toBe(true)
  })
  it('stops a member creating work for someone else', () => {
    expect(canCreateTicket(ctx('member', 'managed'), OTHER)).toBe(false)
  })
  it('stops a member creating an UNASSIGNED ticket (spec §4.2)', () => {
    expect(canCreateTicket(ctx('member', 'managed'), null)).toBe(false)
  })
  it('lets the admin create an unassigned ticket', () => {
    expect(canCreateTicket(ctx('admin', 'managed'), null)).toBe(true)
  })
})

describe('canEditTicket — free mode', () => {
  it('lets a member edit anyone else\'s ticket', () => {
    expect(canEditTicket(ctx('member', 'free'), { assigneeId: OTHER })).toBe(true)
  })
  it('denies a non-member', () => {
    expect(canEditTicket(ctx(null, 'free'), { assigneeId: ME })).toBe(false)
  })
})

describe('canEditTicket — managed mode', () => {
  it('lets the admin edit anything', () => {
    expect(canEditTicket(ctx('admin', 'managed'), { assigneeId: OTHER })).toBe(true)
  })
  it('lets a member edit their own ticket', () => {
    expect(canEditTicket(ctx('member', 'managed'), { assigneeId: ME })).toBe(true)
  })
  it('stops a member editing someone else\'s ticket', () => {
    expect(canEditTicket(ctx('member', 'managed'), { assigneeId: OTHER })).toBe(false)
  })
  it('stops a member editing an unassigned ticket', () => {
    expect(canEditTicket(ctx('member', 'managed'), { assigneeId: null })).toBe(false)
  })
  it('removes a member\'s rights once the ticket is reassigned away (spec §4.2)', () => {
    const c = ctx('member', 'managed')
    expect(canEditTicket(c, { assigneeId: ME })).toBe(true)
    expect(canEditTicket(c, { assigneeId: OTHER })).toBe(false)
  })
})

describe('canManageProject — admin only in BOTH modes (spec §4.3)', () => {
  it('allows an admin in free mode', () => {
    expect(canManageProject(ctx('admin', 'free'))).toBe(true)
  })
  it('allows an admin in managed mode', () => {
    expect(canManageProject(ctx('admin', 'managed'))).toBe(true)
  })
  it('DENIES a member in free mode — equality is about work, not the container', () => {
    expect(canManageProject(ctx('member', 'free'))).toBe(false)
  })
  it('denies a member in managed mode', () => {
    expect(canManageProject(ctx('member', 'managed'))).toBe(false)
  })
  it('denies a non-member', () => {
    expect(canManageProject(ctx(null, 'free'))).toBe(false)
  })
})
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run server/src/permissions`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the module**

`server/src/permissions/index.ts`:

```ts
import type { Mode, Role } from '@mira/shared'

/**
 * Everything the permission rules need, and nothing else. Callers resolve
 * membership once and pass it in; these functions never touch the database,
 * which is what makes the full matrix testable in milliseconds.
 */
export type PermissionContext = {
  userId: string
  /** null means "not a member of this project at all". */
  role: Role | null
  mode: Mode
}

export type TicketRef = { assigneeId: string | null }

/** A project's own mode wins; null means inherit the workspace. */
export function effectiveMode(projectMode: Mode | null, workspaceMode: Mode): Mode {
  return projectMode ?? workspaceMode
}

const isMember = (ctx: PermissionContext) => ctx.role !== null
const isAdmin = (ctx: PermissionContext) => ctx.role === 'admin'

export function canView(ctx: PermissionContext): boolean {
  return isMember(ctx)
}

export function canCreateTicket(
  ctx: PermissionContext,
  assigneeId: string | null,
): boolean {
  if (!isMember(ctx)) return false
  if (ctx.mode === 'free') return true
  // Managed: only the admin hands out work. A member may create a ticket only
  // for themselves — including not "unassigned", which would otherwise produce
  // work that nobody but the admin could ever edit.
  return isAdmin(ctx) || assigneeId === ctx.userId
}

export function canEditTicket(ctx: PermissionContext, ticket: TicketRef): boolean {
  if (!isMember(ctx)) return false
  if (ctx.mode === 'free') return true
  return isAdmin(ctx) || ticket.assigneeId === ctx.userId
}

/**
 * Structural actions: deleting a project, moving it between workspaces,
 * changing modes, inviting or removing people. Admin-only in BOTH modes —
 * "free-form" describes equality over the work, not permission to destroy
 * the container everyone shares. See spec §4.3.
 */
export function canManageProject(ctx: PermissionContext): boolean {
  return isAdmin(ctx)
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run server/src/permissions`
Expected: PASS, 24 tests.

- [ ] **Step 5: Commit**

```bash
git add server/src/permissions/
git commit -m "feat: add the permission module with the full mode matrix"
```

---

## Task 4: Database connection, migrations, and the initial schema

**REQUIRES POSTGRESQL.** Do not start until `createdb mira_dev && createdb mira_test` has succeeded.

**Files:**
- Create: `server/src/config.ts`, `server/src/db/types.ts`, `server/src/db/index.ts`
- Create: `server/src/db/migrations/001_initial.ts`, `server/src/db/migrate.ts`
- Create: `server/tests/helpers/db.ts`
- Test: `server/tests/schema.test.ts`

**Interfaces:**
- Consumes: nothing from Tasks 1-3.
- Produces: `config` (frozen: `databaseUrl`, `testDatabaseUrl`, `sessionCookieName`, `sessionTtlDays`, `port`, `clientOrigin`); `Database` (the Kysely schema interface); `db`; `makeDb(url: string): Kysely<Database>`; `migrateToLatest(db): Promise<void>`; test helpers `testDb` and `resetDb(): Promise<void>`.

- [ ] **Step 1: Write the failing test**

`server/tests/schema.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest'
import { sql } from 'kysely'
import { testDb, resetDb } from './helpers/db.js'

beforeAll(async () => { await resetDb() })

async function columns(table: string) {
  const r = await sql<{ column_name: string }>`
    SELECT column_name FROM information_schema.columns
     WHERE table_name = ${table}
  `.execute(testDb)
  return r.rows.map(x => x.column_name).sort()
}

describe('001_initial', () => {
  it('creates every INC 1 table', async () => {
    const r = await sql<{ table_name: string }>`
      SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public'
    `.execute(testDb)
    const names = r.rows.map(x => x.table_name)
    for (const t of ['users', 'sessions', 'workspaces', 'workspace_members',
                     'projects', 'epics', 'tickets']) {
      expect(names).toContain(t)
    }
  })

  it('gives tickets the columns the spec requires', async () => {
    expect(await columns('tickets')).toEqual([
      'assignee_id', 'created_at', 'description', 'epic_id', 'id', 'number',
      'priority', 'project_id', 'reporter_id', 'status', 'title', 'updated_at',
    ])
  })

  it('rejects a ticket status outside the six', async () => {
    await expect(sql`
      INSERT INTO tickets (project_id, number, title, status, reporter_id)
      VALUES (gen_random_uuid(), 1, 'x', 'wontfix', gen_random_uuid())
    `.execute(testDb)).rejects.toThrow()
  })

  it('allows only one personal workspace per user', async () => {
    const u = await sql<{ id: string }>`
      INSERT INTO users (email, password_hash, display_name)
      VALUES ('dup@example.com', 'h', 'Dup') RETURNING id
    `.execute(testDb)
    const uid = u.rows[0]!.id
    await sql`INSERT INTO workspaces (name, kind, owner_id)
              VALUES ('Personal', 'personal', ${uid})`.execute(testDb)
    await expect(sql`INSERT INTO workspaces (name, kind, owner_id)
              VALUES ('Personal 2', 'personal', ${uid})`.execute(testDb))
      .rejects.toThrow()
  })

  it('allows many TEAM workspaces for the same owner', async () => {
    const u = await sql<{ id: string }>`
      INSERT INTO users (email, password_hash, display_name)
      VALUES ('teams@example.com', 'h', 'T') RETURNING id
    `.execute(testDb)
    const uid = u.rows[0]!.id
    await sql`INSERT INTO workspaces (name, kind, owner_id)
              VALUES ('Team A', 'team', ${uid})`.execute(testDb)
    await expect(sql`INSERT INTO workspaces (name, kind, owner_id)
              VALUES ('Team B', 'team', ${uid})`.execute(testDb))
      .resolves.toBeDefined()
  })
})
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run server/tests/schema.test.ts`
Expected: FAIL — helper module not found.

- [ ] **Step 3: Implement config and the Kysely instance**

`server/src/config.ts`:

```ts
import { z } from 'zod'

const schema = z.object({
  DATABASE_URL: z.string().url(),
  TEST_DATABASE_URL: z.string().url().optional(),
  SESSION_COOKIE_NAME: z.string().default('mira_session'),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(30),
  PORT: z.coerce.number().int().positive().default(3001),
  CLIENT_ORIGIN: z.string().url().default('http://localhost:5173'),
})

const env = schema.parse(process.env)

export const config = Object.freeze({
  databaseUrl: env.DATABASE_URL,
  testDatabaseUrl: env.TEST_DATABASE_URL ?? env.DATABASE_URL,
  sessionCookieName: env.SESSION_COOKIE_NAME,
  sessionTtlDays: env.SESSION_TTL_DAYS,
  port: env.PORT,
  clientOrigin: env.CLIENT_ORIGIN,
})
```

`server/src/db/types.ts`:

```ts
import type { Generated, ColumnType } from 'kysely'
import type {
  TicketStatus, TicketPriority, WorkspaceKind, Mode, Role,
} from '@mira/shared'

type Timestamp = ColumnType<Date, Date | string | undefined, Date | string>

export interface UsersTable {
  id: Generated<string>
  email: string
  password_hash: string
  display_name: string
  created_at: Generated<Timestamp>
}

export interface SessionsTable {
  id: string
  user_id: string
  created_at: Generated<Timestamp>
  expires_at: Timestamp
  user_agent: string | null
}

export interface WorkspacesTable {
  id: Generated<string>
  name: string
  kind: WorkspaceKind
  mode: Generated<Mode>
  owner_id: string
  created_at: Generated<Timestamp>
}

export interface WorkspaceMembersTable {
  workspace_id: string
  user_id: string
  role: Role
  joined_at: Generated<Timestamp>
}

export interface ProjectsTable {
  id: Generated<string>
  workspace_id: string
  name: string
  key: string
  description: string | null
  mode: Mode | null
  ticket_counter: Generated<number>
  created_at: Generated<Timestamp>
  archived_at: Timestamp | null
}

export interface EpicsTable {
  id: Generated<string>
  project_id: string
  title: string
  description: string | null
  created_at: Generated<Timestamp>
}

export interface TicketsTable {
  id: Generated<string>
  project_id: string
  epic_id: string | null
  number: number
  title: string
  description: string | null
  status: Generated<TicketStatus>
  priority: Generated<TicketPriority>
  assignee_id: string | null
  reporter_id: string
  created_at: Generated<Timestamp>
  updated_at: Generated<Timestamp>
}

export interface Database {
  users: UsersTable
  sessions: SessionsTable
  workspaces: WorkspacesTable
  workspace_members: WorkspaceMembersTable
  projects: ProjectsTable
  epics: EpicsTable
  tickets: TicketsTable
}
```

`server/src/db/index.ts`:

```ts
import { Kysely, PostgresDialect } from 'kysely'
import pg from 'pg'
import type { Database } from './types.js'
import { config } from '../config.js'

export function makeDb(connectionString: string): Kysely<Database> {
  return new Kysely<Database>({
    dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString }) }),
  })
}

export const db = makeDb(config.databaseUrl)
```

- [ ] **Step 4: Write the migration**

`server/src/db/migrations/001_initial.ts`:

```ts
import { Kysely, sql } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  await sql`CREATE EXTENSION IF NOT EXISTS citext`.execute(db)
  await sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`.execute(db)

  await db.schema.createTable('users')
    .addColumn('id', 'uuid', c => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('email', sql`citext`, c => c.notNull().unique())
    .addColumn('password_hash', 'text', c => c.notNull())
    .addColumn('display_name', 'text', c => c.notNull())
    .addColumn('created_at', 'timestamptz', c => c.notNull().defaultTo(sql`now()`))
    .execute()

  await db.schema.createTable('sessions')
    .addColumn('id', 'text', c => c.primaryKey())
    .addColumn('user_id', 'uuid', c =>
      c.notNull().references('users.id').onDelete('cascade'))
    .addColumn('created_at', 'timestamptz', c => c.notNull().defaultTo(sql`now()`))
    .addColumn('expires_at', 'timestamptz', c => c.notNull())
    .addColumn('user_agent', 'text')
    .execute()
  await db.schema.createIndex('sessions_user_id_idx')
    .on('sessions').column('user_id').execute()

  await db.schema.createTable('workspaces')
    .addColumn('id', 'uuid', c => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('name', 'text', c => c.notNull())
    .addColumn('kind', 'text', c =>
      c.notNull().check(sql`kind IN ('personal','team')`))
    .addColumn('mode', 'text', c =>
      c.notNull().defaultTo('free').check(sql`mode IN ('free','managed')`))
    .addColumn('owner_id', 'uuid', c =>
      c.notNull().references('users.id').onDelete('cascade'))
    .addColumn('created_at', 'timestamptz', c => c.notNull().defaultTo(sql`now()`))
    .execute()

  // Exactly one personal workspace per user; team workspaces are unlimited.
  await sql`
    CREATE UNIQUE INDEX workspaces_one_personal_per_owner
        ON workspaces (owner_id) WHERE kind = 'personal'
  `.execute(db)

  await db.schema.createTable('workspace_members')
    .addColumn('workspace_id', 'uuid', c =>
      c.notNull().references('workspaces.id').onDelete('cascade'))
    .addColumn('user_id', 'uuid', c =>
      c.notNull().references('users.id').onDelete('cascade'))
    .addColumn('role', 'text', c =>
      c.notNull().check(sql`role IN ('admin','member')`))
    .addColumn('joined_at', 'timestamptz', c => c.notNull().defaultTo(sql`now()`))
    .addPrimaryKeyConstraint('workspace_members_pk', ['workspace_id', 'user_id'])
    .execute()

  await db.schema.createTable('projects')
    .addColumn('id', 'uuid', c => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('workspace_id', 'uuid', c =>
      c.notNull().references('workspaces.id').onDelete('cascade'))
    .addColumn('name', 'text', c => c.notNull())
    .addColumn('key', 'text', c => c.notNull())
    .addColumn('description', 'text')
    .addColumn('mode', 'text', c => c.check(sql`mode IN ('free','managed')`))
    .addColumn('ticket_counter', 'integer', c => c.notNull().defaultTo(0))
    .addColumn('created_at', 'timestamptz', c => c.notNull().defaultTo(sql`now()`))
    .addColumn('archived_at', 'timestamptz')
    .addUniqueConstraint('projects_workspace_key_unique', ['workspace_id', 'key'])
    .execute()

  await db.schema.createTable('epics')
    .addColumn('id', 'uuid', c => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('project_id', 'uuid', c =>
      c.notNull().references('projects.id').onDelete('cascade'))
    .addColumn('title', 'text', c => c.notNull())
    .addColumn('description', 'text')
    .addColumn('created_at', 'timestamptz', c => c.notNull().defaultTo(sql`now()`))
    .execute()

  await db.schema.createTable('tickets')
    .addColumn('id', 'uuid', c => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('project_id', 'uuid', c =>
      c.notNull().references('projects.id').onDelete('cascade'))
    // SET NULL, never CASCADE: deleting an epic must not delete the work in it.
    .addColumn('epic_id', 'uuid', c =>
      c.references('epics.id').onDelete('set null'))
    .addColumn('number', 'integer', c => c.notNull())
    .addColumn('title', 'text', c => c.notNull())
    .addColumn('description', 'text')
    .addColumn('status', 'text', c => c.notNull().defaultTo('backlog')
      .check(sql`status IN ('backlog','todo','in_progress','blocked','done','closed')`))
    .addColumn('priority', 'text', c => c.notNull().defaultTo('medium')
      .check(sql`priority IN ('low','medium','high','urgent')`))
    .addColumn('assignee_id', 'uuid', c =>
      c.references('users.id').onDelete('set null'))
    .addColumn('reporter_id', 'uuid', c => c.notNull().references('users.id'))
    .addColumn('created_at', 'timestamptz', c => c.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', c => c.notNull().defaultTo(sql`now()`))
    .addUniqueConstraint('tickets_project_number_unique', ['project_id', 'number'])
    .execute()

  await db.schema.createIndex('tickets_project_id_idx')
    .on('tickets').column('project_id').execute()
  await db.schema.createIndex('tickets_assignee_id_idx')
    .on('tickets').column('assignee_id').execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  for (const t of ['tickets', 'epics', 'projects', 'workspace_members',
                   'workspaces', 'sessions', 'users']) {
    await db.schema.dropTable(t).ifExists().execute()
  }
}
```

`server/src/db/migrate.ts`:

```ts
import { Migrator, type Kysely } from 'kysely'
import type { Database } from './types.js'
import * as m001 from './migrations/001_initial.js'

/**
 * Migrations are listed explicitly rather than read off disk, so the set is
 * identical in dev, test and production and cannot depend on the CWD.
 */
const migrations = { '001_initial': m001 }

export async function migrateToLatest(db: Kysely<Database>): Promise<void> {
  const migrator = new Migrator({
    db,
    provider: { getMigrations: async () => migrations },
  })
  const { error, results } = await migrator.migrateToLatest()
  for (const r of results ?? []) {
    if (r.status === 'Error') console.error(`migration failed: ${r.migrationName}`)
  }
  if (error) throw error
}
```

- [ ] **Step 5: Write the test helper**

`server/tests/helpers/db.ts`:

```ts
import { sql } from 'kysely'
import { makeDb } from '../../src/db/index.js'
import { migrateToLatest } from '../../src/db/migrate.js'
import { config } from '../../src/config.js'

export const testDb = makeDb(config.testDatabaseUrl)

let migrated = false

/** Applies migrations once, then empties every table. Call in beforeEach. */
export async function resetDb(): Promise<void> {
  if (!migrated) {
    await migrateToLatest(testDb)
    migrated = true
  }
  // One statement, so FK order does not matter and it stays fast.
  await sql`
    TRUNCATE tickets, epics, projects, workspace_members, workspaces,
             sessions, users RESTART IDENTITY CASCADE
  `.execute(testDb)
}
```

Add to `.env` (gitignored, unlike `.env.example`):
`TEST_DATABASE_URL=postgres://postgres:<your-password>@localhost:5432/mira_test`

- [ ] **Step 6: Run the tests and confirm they pass**

Run: `npx vitest run server/tests/schema.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 7: Commit**

```bash
git add server/src/config.ts server/src/db/ server/tests/
git commit -m "feat: add database connection, migrations, and the INC 1 schema"
```

---

## Task 5: Sessions and the auth service

**REQUIRES POSTGRESQL.**

**Files:**
- Create: `server/src/auth/session.ts`, `server/src/services/auth.service.ts`
- Test: `server/tests/auth.service.test.ts`

**Interfaces:**
- Consumes: `makeDb`, `Database` (Task 4); `hashPassword`, `verifyPassword`, `AppError` (Task 2); `SignupInput`, `LoginInput` (Task 1).
- Produces:
  - `createSession(db, userId, userAgent?): Promise<{ token: string; expiresAt: Date }>`
  - `lookupSession(db, token): Promise<{ userId: string } | null>` — null when missing **or** expired
  - `destroySession(db, token): Promise<void>`
  - `type PublicUser = { id: string; email: string; displayName: string }`
  - `signup(db, input: SignupInput): Promise<PublicUser>`
  - `login(db, input: LoginInput): Promise<PublicUser>`

- [ ] **Step 1: Write the failing tests**

`server/tests/auth.service.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { testDb, resetDb } from './helpers/db.js'
import { signup, login } from '../src/services/auth.service.js'
import { createSession, lookupSession, destroySession } from '../src/auth/session.js'

const INPUT = {
  email: 'patrick@example.com',
  password: 'correct horse battery',
  displayName: 'Patrick',
}

beforeEach(async () => { await resetDb() })

describe('signup', () => {
  it('creates the user without exposing the hash', async () => {
    const u = await signup(testDb, INPUT)
    expect(u.email).toBe('patrick@example.com')
    expect(u.displayName).toBe('Patrick')
    expect(u).not.toHaveProperty('password_hash')
  })

  it('creates a personal workspace and makes the user its admin', async () => {
    const u = await signup(testDb, INPUT)
    const ws = await testDb.selectFrom('workspaces')
      .selectAll().where('owner_id', '=', u.id).executeTakeFirstOrThrow()
    expect(ws.kind).toBe('personal')
    expect(ws.mode).toBe('free')

    const m = await testDb.selectFrom('workspace_members')
      .selectAll().where('user_id', '=', u.id).executeTakeFirstOrThrow()
    expect(m.role).toBe('admin')
    expect(m.workspace_id).toBe(ws.id)
  })

  it('rejects a duplicate email', async () => {
    await signup(testDb, INPUT)
    await expect(signup(testDb, INPUT)).rejects.toMatchObject({ code: 'EMAIL_TAKEN' })
  })

  it('creates exactly one user row even after a rejected retry', async () => {
    await signup(testDb, INPUT)
    await expect(signup(testDb, INPUT)).rejects.toThrow()
    const rows = await testDb.selectFrom('users')
      .select('id').where('email', '=', 'patrick@example.com').execute()
    expect(rows).toHaveLength(1)
  })
})

describe('login', () => {
  it('accepts the correct password', async () => {
    await signup(testDb, INPUT)
    const u = await login(testDb, { email: INPUT.email, password: INPUT.password })
    expect(u.email).toBe('patrick@example.com')
  })

  it('gives a wrong password and an unknown email the identical error', async () => {
    await signup(testDb, INPUT)
    const wrongPw = await login(testDb,
      { email: INPUT.email, password: 'wrong horse battery' }).catch(e => e)
    const noUser = await login(testDb,
      { email: 'nobody@example.com', password: 'whatever at all' }).catch(e => e)
    // Identical, so login cannot be used to enumerate registered emails.
    expect(wrongPw.code).toBe('INVALID_CREDENTIALS')
    expect(noUser.code).toBe('INVALID_CREDENTIALS')
    expect(wrongPw.message).toBe(noUser.message)
  })
})

describe('sessions', () => {
  it('round-trips a session token', async () => {
    const u = await signup(testDb, INPUT)
    const { token } = await createSession(testDb, u.id)
    expect(await lookupSession(testDb, token)).toEqual({ userId: u.id })
  })

  it('returns null for an unknown token', async () => {
    expect(await lookupSession(testDb, 'nope')).toBeNull()
  })

  it('returns null for an expired session', async () => {
    const u = await signup(testDb, INPUT)
    const { token } = await createSession(testDb, u.id)
    await testDb.updateTable('sessions')
      .set({ expires_at: new Date(Date.now() - 1000) })
      .where('id', '=', token).execute()
    expect(await lookupSession(testDb, token)).toBeNull()
  })

  it('destroys a session', async () => {
    const u = await signup(testDb, INPUT)
    const { token } = await createSession(testDb, u.id)
    await destroySession(testDb, token)
    expect(await lookupSession(testDb, token)).toBeNull()
  })

  it('issues a different token each time', async () => {
    const u = await signup(testDb, INPUT)
    const a = await createSession(testDb, u.id)
    const b = await createSession(testDb, u.id)
    expect(a.token).not.toBe(b.token)
  })
})
```

- [ ] **Step 2: Run and confirm the tests fail**

Run: `npx vitest run server/tests/auth.service.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement sessions**

`server/src/auth/session.ts`:

```ts
import { randomBytes } from 'node:crypto'
import type { Kysely } from 'kysely'
import type { Database } from '../db/types.js'
import { config } from '../config.js'

/** 32 random bytes: opaque, unguessable, and revocable — unlike a JWT. */
const newToken = () => randomBytes(32).toString('base64url')

export async function createSession(
  db: Kysely<Database>,
  userId: string,
  userAgent?: string,
): Promise<{ token: string; expiresAt: Date }> {
  const token = newToken()
  const expiresAt = new Date(
    Date.now() + config.sessionTtlDays * 24 * 60 * 60 * 1000,
  )
  await db.insertInto('sessions').values({
    id: token,
    user_id: userId,
    expires_at: expiresAt,
    user_agent: userAgent ?? null,
  }).execute()
  return { token, expiresAt }
}

export async function lookupSession(
  db: Kysely<Database>,
  token: string,
): Promise<{ userId: string } | null> {
  const row = await db.selectFrom('sessions')
    .select('user_id')
    .where('id', '=', token)
    .where('expires_at', '>', new Date())
    .executeTakeFirst()
  return row ? { userId: row.user_id } : null
}

export async function destroySession(
  db: Kysely<Database>,
  token: string,
): Promise<void> {
  await db.deleteFrom('sessions').where('id', '=', token).execute()
}
```

- [ ] **Step 4: Implement the auth service**

`server/src/services/auth.service.ts`:

```ts
import type { Kysely } from 'kysely'
import type { LoginInput, SignupInput } from '@mira/shared'
import type { Database } from '../db/types.js'
import { AppError } from '../errors.js'
import { hashPassword, verifyPassword } from '../auth/password.js'

export type PublicUser = { id: string; email: string; displayName: string }

export async function signup(
  db: Kysely<Database>,
  input: SignupInput,
): Promise<PublicUser> {
  const existing = await db.selectFrom('users').select('id')
    .where('email', '=', input.email).executeTakeFirst()
  if (existing) {
    throw new AppError('EMAIL_TAKEN', 'That email is already registered.', 409)
  }

  const passwordHash = await hashPassword(input.password)

  // One transaction: a user without a personal workspace would have nowhere
  // to put a project, so all three rows land together or not at all.
  return db.transaction().execute(async trx => {
    const user = await trx.insertInto('users').values({
      email: input.email,
      password_hash: passwordHash,
      display_name: input.displayName,
    }).returning(['id', 'email', 'display_name']).executeTakeFirstOrThrow()

    const ws = await trx.insertInto('workspaces').values({
      name: 'Personal', kind: 'personal', owner_id: user.id,
    }).returning('id').executeTakeFirstOrThrow()

    await trx.insertInto('workspace_members').values({
      workspace_id: ws.id, user_id: user.id, role: 'admin',
    }).execute()

    return { id: user.id, email: user.email, displayName: user.display_name }
  })
}

export async function login(
  db: Kysely<Database>,
  input: LoginInput,
): Promise<PublicUser> {
  // One error for both branches, so login cannot enumerate registered emails.
  const fail = () =>
    new AppError('INVALID_CREDENTIALS', 'Email or password is incorrect.', 401)

  const row = await db.selectFrom('users')
    .select(['id', 'email', 'display_name', 'password_hash'])
    .where('email', '=', input.email).executeTakeFirst()
  if (!row) throw fail()
  if (!await verifyPassword(row.password_hash, input.password)) throw fail()

  return { id: row.id, email: row.email, displayName: row.display_name }
}
```

- [ ] **Step 5: Run and confirm the tests pass**

Run: `npx vitest run server/tests/auth.service.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 6: Commit**

```bash
git add server/src/auth/session.ts server/src/services/ server/tests/
git commit -m "feat: add sessions and the signup/login service"
```

---

## Task 6: The app factory, requireUser, and auth routes

**REQUIRES POSTGRESQL.**

**Files:**
- Create: `server/src/app.ts`, `server/src/index.ts`, `server/src/auth/middleware.ts`
- Create: `server/src/routes/auth.routes.ts`
- Test: `server/tests/auth.routes.test.ts`

**Interfaces:**
- Consumes: `signup`, `login`, `PublicUser` (Task 5); `createSession`, `lookupSession`, `destroySession` (Task 5); `errorMiddleware`, `AppError` (Task 2); `signupSchema`, `loginSchema` (Task 1).
- Produces:
  - `buildApp(db: Kysely<Database>): Express` — a configured app that does **not** call `listen`, so tests can mount it without binding a port.
  - `requireUser(db)` → Express middleware that sets `req.userId` or throws a 401 `AppError`.
  - Module augmentation adding `userId?: string` to `Express.Request`.
  - `authRoutes(db): Router` mounted at `/api/auth`, plus `GET /api/me`.

- [ ] **Step 1: Write the failing tests**

`server/tests/auth.routes.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { testDb, resetDb } from './helpers/db.js'
import { buildApp } from '../src/app.js'

const app = buildApp(testDb)

const INPUT = {
  email: 'patrick@example.com',
  password: 'correct horse battery',
  displayName: 'Patrick',
}

beforeEach(async () => { await resetDb() })

describe('POST /api/auth/signup', () => {
  it('creates the account and sets an httpOnly session cookie', async () => {
    const res = await request(app).post('/api/auth/signup').send(INPUT)
    expect(res.status).toBe(201)
    expect(res.body.email).toBe('patrick@example.com')
    expect(res.body).not.toHaveProperty('passwordHash')

    const cookie = res.headers['set-cookie'][0]
    expect(cookie).toContain('mira_session=')
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Lax')
  })

  it('rejects a short password with 400 and a field message', async () => {
    const res = await request(app).post('/api/auth/signup')
      .send({ ...INPUT, password: 'short' })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_FAILED')
  })

  it('rejects a duplicate email with 409', async () => {
    await request(app).post('/api/auth/signup').send(INPUT)
    const res = await request(app).post('/api/auth/signup').send(INPUT)
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('EMAIL_TAKEN')
  })
})

describe('POST /api/auth/login', () => {
  it('logs in and sets a cookie', async () => {
    await request(app).post('/api/auth/signup').send(INPUT)
    const res = await request(app).post('/api/auth/login')
      .send({ email: INPUT.email, password: INPUT.password })
    expect(res.status).toBe(200)
    expect(res.headers['set-cookie'][0]).toContain('mira_session=')
  })

  it('returns 401 for a wrong password', async () => {
    await request(app).post('/api/auth/signup').send(INPUT)
    const res = await request(app).post('/api/auth/login')
      .send({ email: INPUT.email, password: 'wrong horse battery' })
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS')
  })
})

describe('GET /api/me', () => {
  it('returns the current user when a session cookie is present', async () => {
    const agent = request.agent(app)
    await agent.post('/api/auth/signup').send(INPUT)
    const res = await agent.get('/api/me')
    expect(res.status).toBe(200)
    expect(res.body.email).toBe('patrick@example.com')
  })

  it('returns 401 with no cookie', async () => {
    const res = await request(app).get('/api/me')
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('NOT_AUTHENTICATED')
  })

  it('returns 401 once the session is destroyed by logout', async () => {
    const agent = request.agent(app)
    await agent.post('/api/auth/signup').send(INPUT)
    await agent.post('/api/auth/logout')
    const res = await agent.get('/api/me')
    expect(res.status).toBe(401)
  })
})

describe('POST /api/auth/logout', () => {
  it('deletes the session row, not merely the cookie', async () => {
    const agent = request.agent(app)
    await agent.post('/api/auth/signup').send(INPUT)
    expect(await testDb.selectFrom('sessions').selectAll().execute())
      .toHaveLength(1)
    await agent.post('/api/auth/logout')
    // The whole point of sessions over JWTs: logout revokes server-side.
    expect(await testDb.selectFrom('sessions').selectAll().execute())
      .toHaveLength(0)
  })

  it('succeeds even with no session', async () => {
    expect((await request(app).post('/api/auth/logout')).status).toBe(204)
  })
})
```

- [ ] **Step 2: Run and confirm the tests fail**

Run: `npx vitest run server/tests/auth.routes.test.ts`
Expected: FAIL — `../src/app.js` not found.

- [ ] **Step 3: Implement the middleware**

`server/src/auth/middleware.ts`:

```ts
import type { NextFunction, Request, Response } from 'express'
import type { Kysely } from 'kysely'
import type { Database } from '../db/types.js'
import { AppError } from '../errors.js'
import { lookupSession } from './session.js'
import { config } from '../config.js'

declare global {
  namespace Express {
    interface Request { userId?: string }
  }
}

/** Reads the session cookie, resolves the user, or fails with 401. */
export function requireUser(db: Kysely<Database>) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const token = req.cookies?.[config.sessionCookieName]
      if (!token) throw new AppError('NOT_AUTHENTICATED', 'Sign in to continue.', 401)
      const session = await lookupSession(db, token)
      if (!session) throw new AppError('NOT_AUTHENTICATED', 'Sign in to continue.', 401)
      req.userId = session.userId
      next()
    } catch (err) {
      next(err)
    }
  }
}
```

- [ ] **Step 4: Implement the auth routes**

`server/src/routes/auth.routes.ts`:

```ts
import { Router } from 'express'
import type { Kysely } from 'kysely'
import { loginSchema, signupSchema } from '@mira/shared'
import type { Database } from '../db/types.js'
import { AppError } from '../errors.js'
import { login, signup } from '../services/auth.service.js'
import { createSession, destroySession } from '../auth/session.js'
import { requireUser } from '../auth/middleware.js'
import { config } from '../config.js'

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
}

export function authRoutes(db: Kysely<Database>): Router {
  const r = Router()

  r.post('/signup', async (req, res, next) => {
    try {
      const parsed = signupSchema.safeParse(req.body)
      if (!parsed.success) {
        throw new AppError('VALIDATION_FAILED',
          parsed.error.issues[0]?.message ?? 'Invalid input.', 400)
      }
      const user = await signup(db, parsed.data)
      const { token, expiresAt } = await createSession(db, user.id, req.get('user-agent'))
      res.cookie(config.sessionCookieName, token, { ...COOKIE_OPTS, expires: expiresAt })
      res.status(201).json(user)
    } catch (err) { next(err) }
  })

  r.post('/login', async (req, res, next) => {
    try {
      const parsed = loginSchema.safeParse(req.body)
      if (!parsed.success) {
        throw new AppError('VALIDATION_FAILED', 'Invalid input.', 400)
      }
      const user = await login(db, parsed.data)
      const { token, expiresAt } = await createSession(db, user.id, req.get('user-agent'))
      res.cookie(config.sessionCookieName, token, { ...COOKIE_OPTS, expires: expiresAt })
      res.status(200).json(user)
    } catch (err) { next(err) }
  })

  r.post('/logout', async (req, res, next) => {
    try {
      const token = req.cookies?.[config.sessionCookieName]
      if (token) await destroySession(db, token)
      res.clearCookie(config.sessionCookieName, COOKIE_OPTS)
      res.status(204).end()
    } catch (err) { next(err) }
  })

  return r
}

export function meRoute(db: Kysely<Database>): Router {
  const r = Router()
  r.get('/me', requireUser(db), async (req, res, next) => {
    try {
      const u = await db.selectFrom('users')
        .select(['id', 'email', 'display_name'])
        .where('id', '=', req.userId!).executeTakeFirstOrThrow()
      res.json({ id: u.id, email: u.email, displayName: u.display_name })
    } catch (err) { next(err) }
  })
  return r
}
```

- [ ] **Step 5: Implement the app factory and entrypoint**

`server/src/app.ts`:

```ts
import express, { type Express } from 'express'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import type { Kysely } from 'kysely'
import type { Database } from './db/types.js'
import { errorMiddleware } from './errors.js'
import { authRoutes, meRoute } from './routes/auth.routes.js'
import { config } from './config.js'

/**
 * Builds the app WITHOUT listening, so tests can mount it directly.
 * The db is injected rather than imported so tests use mira_test.
 */
export function buildApp(db: Kysely<Database>): Express {
  const app = express()

  // credentials: true is required for the session cookie to cross origins
  // in development, where Vite serves on 5173 and the API on 3001.
  app.use(cors({ origin: config.clientOrigin, credentials: true }))
  app.use(express.json())
  app.use(cookieParser())

  app.use('/api/auth', authRoutes(db))
  app.use('/api', meRoute(db))

  app.use(errorMiddleware)
  return app
}
```

`server/src/index.ts`:

```ts
import { buildApp } from './app.js'
import { db } from './db/index.js'
import { migrateToLatest } from './db/migrate.js'
import { config } from './config.js'

await migrateToLatest(db)
buildApp(db).listen(config.port, () => {
  console.log(`Mira API listening on http://localhost:${config.port}`)
})
```

- [ ] **Step 6: Run and confirm the tests pass**

Run: `npx vitest run server/tests/auth.routes.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 7: Commit**

```bash
git add server/src/app.ts server/src/index.ts server/src/auth/middleware.ts server/src/routes/ server/tests/
git commit -m "feat: add app factory, requireUser middleware, and auth routes"
```

---

## Task 7: Projects — context resolution, service, and routes

**REQUIRES POSTGRESQL.**

**Files:**
- Create: `server/src/services/context.ts`, `server/src/services/project.service.ts`
- Create: `server/src/routes/project.routes.ts`
- Modify: `server/src/app.ts` — mount the project router
- Test: `server/tests/project.test.ts`

**Interfaces:**
- Consumes: `PermissionContext`, `effectiveMode`, `canView`, `canManageProject` (Task 3); `requireUser` (Task 6); `createProjectSchema` (Task 1).
- Produces:
  - `projectContext(db, userId, projectId): Promise<PermissionContext | null>` — null when the project does not exist. Resolves membership and effective mode in one query.
  - `type ProjectSummary = { id: string; name: string; key: string; description: string | null; workspaceId: string }`
  - `createProject(db, userId, workspaceId, input: CreateProjectInput): Promise<ProjectSummary>`
  - `listMyProjects(db, userId): Promise<ProjectSummary[]>`
  - `getProject(db, userId, projectId): Promise<ProjectSummary>` — throws 404 when absent **or** invisible
  - `personalWorkspaceId(db, userId): Promise<string>`
  - `projectRoutes(db): Router`

- [ ] **Step 1: Write the failing tests**

`server/tests/project.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { testDb, resetDb } from './helpers/db.js'
import { buildApp } from '../src/app.js'
import { signup } from '../src/services/auth.service.js'
import { projectContext } from '../src/services/context.js'

const app = buildApp(testDb)
const INPUT = {
  email: 'patrick@example.com',
  password: 'correct horse battery',
  displayName: 'Patrick',
}

async function signedInAgent() {
  const agent = request.agent(app)
  await agent.post('/api/auth/signup').send(INPUT)
  return agent
}

beforeEach(async () => { await resetDb() })

describe('POST /api/projects', () => {
  it('creates a project in the personal workspace', async () => {
    const agent = await signedInAgent()
    const res = await agent.post('/api/projects')
      .send({ name: 'Mira', key: 'MIRA' })
    expect(res.status).toBe(201)
    expect(res.body.key).toBe('MIRA')
    expect(res.body.name).toBe('Mira')
  })

  it('uppercases the key', async () => {
    const agent = await signedInAgent()
    const res = await agent.post('/api/projects').send({ name: 'Mira', key: 'mira' })
    expect(res.body.key).toBe('MIRA')
  })

  it('rejects a key with punctuation', async () => {
    const agent = await signedInAgent()
    const res = await agent.post('/api/projects').send({ name: 'X', key: 'MI-RA' })
    expect(res.status).toBe(400)
  })

  it('rejects a duplicate key in the same workspace', async () => {
    const agent = await signedInAgent()
    await agent.post('/api/projects').send({ name: 'Mira', key: 'MIRA' })
    const res = await agent.post('/api/projects').send({ name: 'Other', key: 'MIRA' })
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('KEY_TAKEN')
  })

  it('requires authentication', async () => {
    const res = await request(app).post('/api/projects').send({ name: 'X', key: 'XX' })
    expect(res.status).toBe(401)
  })
})

describe('GET /api/projects', () => {
  it('lists only the caller\'s own projects', async () => {
    const mine = await signedInAgent()
    await mine.post('/api/projects').send({ name: 'Mira', key: 'MIRA' })

    const other = request.agent(app)
    await other.post('/api/auth/signup').send({
      email: 'ama@example.com', password: 'correct horse battery', displayName: 'Ama',
    })
    await other.post('/api/projects').send({ name: 'Theirs', key: 'THEIRS' })

    const res = await mine.get('/api/projects')
    expect(res.status).toBe(200)
    expect(res.body.map((p: any) => p.key)).toEqual(['MIRA'])
  })
})

describe('GET /api/projects/:id', () => {
  it('returns a project the caller can see', async () => {
    const agent = await signedInAgent()
    const created = await agent.post('/api/projects').send({ name: 'Mira', key: 'MIRA' })
    const res = await agent.get(`/api/projects/${created.body.id}`)
    expect(res.status).toBe(200)
    expect(res.body.key).toBe('MIRA')
  })

  it('returns 404 — NOT 403 — for someone else\'s project', async () => {
    const mine = await signedInAgent()
    const created = await mine.post('/api/projects').send({ name: 'Mira', key: 'MIRA' })

    const other = request.agent(app)
    await other.post('/api/auth/signup').send({
      email: 'ama@example.com', password: 'correct horse battery', displayName: 'Ama',
    })
    const res = await other.get(`/api/projects/${created.body.id}`)
    // 403 would confirm the project exists. See spec §7.
    expect(res.status).toBe(404)
  })

  it('returns 404 for an id that does not exist', async () => {
    const agent = await signedInAgent()
    const res = await agent.get(
      '/api/projects/00000000-0000-0000-0000-000000000000')
    expect(res.status).toBe(404)
  })
})

describe('projectContext', () => {
  it('gives the owner the admin role and the inherited free mode', async () => {
    const u = await signup(testDb, INPUT)
    const ws = await testDb.selectFrom('workspaces').select('id')
      .where('owner_id', '=', u.id).executeTakeFirstOrThrow()
    const p = await testDb.insertInto('projects')
      .values({ workspace_id: ws.id, name: 'Mira', key: 'MIRA' })
      .returning('id').executeTakeFirstOrThrow()

    expect(await projectContext(testDb, u.id, p.id))
      .toEqual({ userId: u.id, role: 'admin', mode: 'free' })
  })

  it('gives a non-member a null role', async () => {
    const u = await signup(testDb, INPUT)
    const stranger = await signup(testDb, { ...INPUT, email: 'ama@example.com' })
    const ws = await testDb.selectFrom('workspaces').select('id')
      .where('owner_id', '=', u.id).executeTakeFirstOrThrow()
    const p = await testDb.insertInto('projects')
      .values({ workspace_id: ws.id, name: 'Mira', key: 'MIRA' })
      .returning('id').executeTakeFirstOrThrow()

    expect(await projectContext(testDb, stranger.id, p.id))
      .toEqual({ userId: stranger.id, role: null, mode: 'free' })
  })

  it('returns null when the project does not exist', async () => {
    const u = await signup(testDb, INPUT)
    expect(await projectContext(testDb, u.id,
      '00000000-0000-0000-0000-000000000000')).toBeNull()
  })
})
```

- [ ] **Step 2: Run and confirm the tests fail**

Run: `npx vitest run server/tests/project.test.ts`
Expected: FAIL — `../src/services/context.js` not found.

- [ ] **Step 3: Implement context resolution**

`server/src/services/context.ts`:

```ts
import type { Kysely } from 'kysely'
import type { Database } from '../db/types.js'
import { effectiveMode, type PermissionContext } from '../permissions/index.js'

/**
 * The single bridge between the database and the permission module.
 * One query resolves the project, its effective mode, and the caller's role.
 * Returns null when the project does not exist — callers turn that into a 404,
 * the same 404 they return for a project the caller may not see.
 */
export async function projectContext(
  db: Kysely<Database>,
  userId: string,
  projectId: string,
): Promise<PermissionContext | null> {
  const row = await db.selectFrom('projects')
    .innerJoin('workspaces', 'workspaces.id', 'projects.workspace_id')
    .leftJoin('workspace_members', join => join
      .onRef('workspace_members.workspace_id', '=', 'workspaces.id')
      .on('workspace_members.user_id', '=', userId))
    .select([
      'projects.mode as project_mode',
      'workspaces.mode as workspace_mode',
      'workspace_members.role as role',
    ])
    .where('projects.id', '=', projectId)
    .executeTakeFirst()

  if (!row) return null

  return {
    userId,
    role: row.role ?? null,
    mode: effectiveMode(row.project_mode, row.workspace_mode),
  }
}
```

- [ ] **Step 4: Implement the project service**

`server/src/services/project.service.ts`:

```ts
import type { Kysely } from 'kysely'
import type { CreateProjectInput } from '@mira/shared'
import type { Database } from '../db/types.js'
import { AppError } from '../errors.js'
import { canView } from '../permissions/index.js'
import { projectContext } from './context.js'

export type ProjectSummary = {
  id: string
  name: string
  key: string
  description: string | null
  workspaceId: string
}

const NOT_FOUND = () =>
  new AppError('PROJECT_NOT_FOUND', 'No such project.', 404)

export async function personalWorkspaceId(
  db: Kysely<Database>,
  userId: string,
): Promise<string> {
  const ws = await db.selectFrom('workspaces').select('id')
    .where('owner_id', '=', userId).where('kind', '=', 'personal')
    .executeTakeFirstOrThrow()
  return ws.id
}

export async function createProject(
  db: Kysely<Database>,
  userId: string,
  workspaceId: string,
  input: CreateProjectInput,
): Promise<ProjectSummary> {
  const existing = await db.selectFrom('projects').select('id')
    .where('workspace_id', '=', workspaceId).where('key', '=', input.key)
    .executeTakeFirst()
  if (existing) {
    throw new AppError('KEY_TAKEN',
      `The key ${input.key} is already used in this workspace.`, 409)
  }

  const row = await db.insertInto('projects').values({
    workspace_id: workspaceId,
    name: input.name,
    key: input.key,
    description: input.description ?? null,
  }).returning(['id', 'name', 'key', 'description', 'workspace_id'])
    .executeTakeFirstOrThrow()

  return {
    id: row.id, name: row.name, key: row.key,
    description: row.description, workspaceId: row.workspace_id,
  }
}

export async function listMyProjects(
  db: Kysely<Database>,
  userId: string,
): Promise<ProjectSummary[]> {
  const rows = await db.selectFrom('projects')
    .innerJoin('workspace_members',
      'workspace_members.workspace_id', 'projects.workspace_id')
    .select(['projects.id', 'projects.name', 'projects.key',
             'projects.description', 'projects.workspace_id'])
    .where('workspace_members.user_id', '=', userId)
    .where('projects.archived_at', 'is', null)
    .orderBy('projects.created_at', 'asc')
    .execute()

  return rows.map(r => ({
    id: r.id, name: r.name, key: r.key,
    description: r.description, workspaceId: r.workspace_id,
  }))
}

export async function getProject(
  db: Kysely<Database>,
  userId: string,
  projectId: string,
): Promise<ProjectSummary> {
  const ctx = await projectContext(db, userId, projectId)
  // Same 404 whether it is missing or merely invisible — a 403 would confirm
  // that someone else's project exists. See spec §7.
  if (!ctx || !canView(ctx)) throw NOT_FOUND()

  const row = await db.selectFrom('projects')
    .select(['id', 'name', 'key', 'description', 'workspace_id'])
    .where('id', '=', projectId).executeTakeFirstOrThrow()

  return {
    id: row.id, name: row.name, key: row.key,
    description: row.description, workspaceId: row.workspace_id,
  }
}
```

- [ ] **Step 5: Implement the project routes**

`server/src/routes/project.routes.ts`:

```ts
import { Router } from 'express'
import type { Kysely } from 'kysely'
import { createProjectSchema } from '@mira/shared'
import type { Database } from '../db/types.js'
import { AppError } from '../errors.js'
import { requireUser } from '../auth/middleware.js'
import {
  createProject, getProject, listMyProjects, personalWorkspaceId,
} from '../services/project.service.js'

export function projectRoutes(db: Kysely<Database>): Router {
  const r = Router()
  r.use(requireUser(db))

  r.post('/', async (req, res, next) => {
    try {
      const parsed = createProjectSchema.safeParse(req.body)
      if (!parsed.success) {
        throw new AppError('VALIDATION_FAILED',
          parsed.error.issues[0]?.message ?? 'Invalid input.', 400)
      }
      // INC 1 has only the personal workspace. INC 4 adds a workspaceId param.
      const wsId = await personalWorkspaceId(db, req.userId!)
      res.status(201).json(await createProject(db, req.userId!, wsId, parsed.data))
    } catch (err) { next(err) }
  })

  r.get('/', async (req, res, next) => {
    try {
      res.json(await listMyProjects(db, req.userId!))
    } catch (err) { next(err) }
  })

  r.get('/:id', async (req, res, next) => {
    try {
      res.json(await getProject(db, req.userId!, req.params.id!))
    } catch (err) { next(err) }
  })

  return r
}
```

- [ ] **Step 6: Mount the router**

In `server/src/app.ts`, add the import and the mount line:

```ts
import { projectRoutes } from './routes/project.routes.js'
// ...after app.use('/api', meRoute(db)):
app.use('/api/projects', projectRoutes(db))
```

- [ ] **Step 7: Run and confirm the tests pass**

Run: `npx vitest run server/tests/project.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 8: Commit**

```bash
git add server/src/services/ server/src/routes/ server/src/app.ts server/tests/
git commit -m "feat: add project context resolution, service, and routes"
```

---

## Task 8: Tickets — atomic keys, service, and routes

**REQUIRES POSTGRESQL.**

**Files:**
- Create: `server/src/services/ticket.service.ts`, `server/src/routes/ticket.routes.ts`
- Modify: `server/src/app.ts` — mount the ticket router
- Test: `server/tests/ticket.test.ts`

**Interfaces:**
- Consumes: `projectContext` (Task 7); `canView`, `canCreateTicket`, `canEditTicket` (Task 3); `createTicketSchema`, `updateTicketSchema` (Task 1).
- Produces:
  - `type TicketView = { id: string; key: string; number: number; title: string; description: string | null; status: TicketStatus; priority: TicketPriority; assigneeId: string | null; reporterId: string; createdAt: Date }`
  - `createTicket(db, userId, projectId, input: CreateTicketInput): Promise<TicketView>`
  - `listTickets(db, userId, projectId): Promise<TicketView[]>`
  - `updateTicket(db, userId, ticketId, input: UpdateTicketInput): Promise<TicketView>`
  - `ticketRoutes(db): Router` mounted at `/api/tickets`; creation and listing live under `/api/projects/:id/tickets`.

- [ ] **Step 1: Write the failing tests**

`server/tests/ticket.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { testDb, resetDb } from './helpers/db.js'
import { buildApp } from '../src/app.js'

const app = buildApp(testDb)
const INPUT = {
  email: 'patrick@example.com',
  password: 'correct horse battery',
  displayName: 'Patrick',
}

async function withProject() {
  const agent = request.agent(app)
  await agent.post('/api/auth/signup').send(INPUT)
  const p = await agent.post('/api/projects').send({ name: 'Mira', key: 'MIRA' })
  return { agent, projectId: p.body.id as string }
}

beforeEach(async () => { await resetDb() })

describe('POST /api/projects/:id/tickets', () => {
  it('creates a ticket numbered from 1 and keyed MIRA-1', async () => {
    const { agent, projectId } = await withProject()
    const res = await agent.post(`/api/projects/${projectId}/tickets`)
      .send({ title: 'Set up the database' })
    expect(res.status).toBe(201)
    expect(res.body.number).toBe(1)
    expect(res.body.key).toBe('MIRA-1')
    expect(res.body.status).toBe('backlog')
    expect(res.body.priority).toBe('medium')
  })

  it('increments the number for each new ticket', async () => {
    const { agent, projectId } = await withProject()
    for (const t of ['One', 'Two', 'Three']) {
      await agent.post(`/api/projects/${projectId}/tickets`).send({ title: t })
    }
    const list = await agent.get(`/api/projects/${projectId}/tickets`)
    expect(list.body.map((t: any) => t.key)).toEqual(['MIRA-1', 'MIRA-2', 'MIRA-3'])
  })

  it('never reuses a number under concurrent creation', async () => {
    const { agent, projectId } = await withProject()
    await Promise.all(Array.from({ length: 10 }, (_, i) =>
      agent.post(`/api/projects/${projectId}/tickets`).send({ title: `T${i}` })))
    const list = await agent.get(`/api/projects/${projectId}/tickets`)
    const numbers = list.body.map((t: any) => t.number).sort((a: number, b: number) => a - b)
    expect(numbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  })

  it('rejects an empty title', async () => {
    const { agent, projectId } = await withProject()
    const res = await agent.post(`/api/projects/${projectId}/tickets`)
      .send({ title: '   ' })
    expect(res.status).toBe(400)
  })

  it('returns 404 for a project the caller cannot see', async () => {
    const { projectId } = await withProject()
    const other = request.agent(app)
    await other.post('/api/auth/signup').send({
      email: 'ama@example.com', password: 'correct horse battery', displayName: 'Ama',
    })
    const res = await other.post(`/api/projects/${projectId}/tickets`)
      .send({ title: 'Sneaky' })
    expect(res.status).toBe(404)
  })
})

describe('PATCH /api/tickets/:id', () => {
  it('moves a ticket to a new status', async () => {
    const { agent, projectId } = await withProject()
    const t = await agent.post(`/api/projects/${projectId}/tickets`)
      .send({ title: 'Set up the database' })
    const res = await agent.patch(`/api/tickets/${t.body.id}`)
      .send({ status: 'in_progress' })
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('in_progress')
  })

  it('rejects a status outside the six', async () => {
    const { agent, projectId } = await withProject()
    const t = await agent.post(`/api/projects/${projectId}/tickets`).send({ title: 'X' })
    const res = await agent.patch(`/api/tickets/${t.body.id}`).send({ status: 'wontfix' })
    expect(res.status).toBe(400)
  })

  it('rejects an empty patch', async () => {
    const { agent, projectId } = await withProject()
    const t = await agent.post(`/api/projects/${projectId}/tickets`).send({ title: 'X' })
    expect((await agent.patch(`/api/tickets/${t.body.id}`).send({})).status).toBe(400)
  })

  it('bumps updated_at', async () => {
    const { agent, projectId } = await withProject()
    const t = await agent.post(`/api/projects/${projectId}/tickets`).send({ title: 'X' })
    const before = await testDb.selectFrom('tickets').select('updated_at')
      .where('id', '=', t.body.id).executeTakeFirstOrThrow()
    await new Promise(r => setTimeout(r, 10))
    await agent.patch(`/api/tickets/${t.body.id}`).send({ status: 'done' })
    const after = await testDb.selectFrom('tickets').select('updated_at')
      .where('id', '=', t.body.id).executeTakeFirstOrThrow()
    expect(new Date(after.updated_at).getTime())
      .toBeGreaterThan(new Date(before.updated_at).getTime())
  })

  it('returns 404 for a ticket in a project the caller cannot see', async () => {
    const { agent, projectId } = await withProject()
    const t = await agent.post(`/api/projects/${projectId}/tickets`).send({ title: 'X' })
    const other = request.agent(app)
    await other.post('/api/auth/signup').send({
      email: 'ama@example.com', password: 'correct horse battery', displayName: 'Ama',
    })
    const res = await other.patch(`/api/tickets/${t.body.id}`).send({ status: 'done' })
    expect(res.status).toBe(404)
  })
})

describe('GET /api/projects/:id/tickets', () => {
  it('returns an empty array for a new project', async () => {
    const { agent, projectId } = await withProject()
    const res = await agent.get(`/api/projects/${projectId}/tickets`)
    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })

  it('returns 404 for a project the caller cannot see', async () => {
    const { projectId } = await withProject()
    const other = request.agent(app)
    await other.post('/api/auth/signup').send({
      email: 'ama@example.com', password: 'correct horse battery', displayName: 'Ama',
    })
    expect((await other.get(`/api/projects/${projectId}/tickets`)).status).toBe(404)
  })
})
```

- [ ] **Step 2: Run and confirm the tests fail**

Run: `npx vitest run server/tests/ticket.test.ts`
Expected: FAIL — ticket service not found.

- [ ] **Step 3: Implement the ticket service**

`server/src/services/ticket.service.ts`:

```ts
import type { Kysely } from 'kysely'
import type {
  CreateTicketInput, TicketPriority, TicketStatus, UpdateTicketInput,
} from '@mira/shared'
import type { Database } from '../db/types.js'
import { AppError } from '../errors.js'
import { canCreateTicket, canEditTicket, canView } from '../permissions/index.js'
import { projectContext } from './context.js'

export type TicketView = {
  id: string
  key: string
  number: number
  title: string
  description: string | null
  status: TicketStatus
  priority: TicketPriority
  assigneeId: string | null
  reporterId: string
  createdAt: Date
}

const NOT_FOUND = () => new AppError('TICKET_NOT_FOUND', 'No such ticket.', 404)
const PROJECT_NOT_FOUND = () =>
  new AppError('PROJECT_NOT_FOUND', 'No such project.', 404)

type Row = {
  id: string; number: number; title: string; description: string | null
  status: TicketStatus; priority: TicketPriority
  assignee_id: string | null; reporter_id: string; created_at: Date
}

const toView = (r: Row, projectKey: string): TicketView => ({
  id: r.id,
  key: `${projectKey}-${r.number}`,
  number: r.number,
  title: r.title,
  description: r.description,
  status: r.status,
  priority: r.priority,
  assigneeId: r.assignee_id,
  reporterId: r.reporter_id,
  createdAt: r.created_at,
})

export async function createTicket(
  db: Kysely<Database>,
  userId: string,
  projectId: string,
  input: CreateTicketInput,
): Promise<TicketView> {
  const ctx = await projectContext(db, userId, projectId)
  if (!ctx || !canView(ctx)) throw PROJECT_NOT_FOUND()

  // INC 1 is single-user, so the reporter is always the assignee. INC 4
  // makes the assignee a request field; the permission call is already here.
  const assigneeId = userId
  if (!canCreateTicket(ctx, assigneeId)) {
    throw new AppError('FORBIDDEN', 'You cannot create that ticket.', 403)
  }

  return db.transaction().execute(async trx => {
    // Atomic: UPDATE ... RETURNING takes a row lock, so concurrent creates
    // queue rather than racing. SELECT max(number)+1 would hand out duplicates.
    const counter = await trx.updateTable('projects')
      .set(eb => ({ ticket_counter: eb('ticket_counter', '+', 1) }))
      .where('id', '=', projectId)
      .returning(['ticket_counter', 'key'])
      .executeTakeFirstOrThrow()

    const row = await trx.insertInto('tickets').values({
      project_id: projectId,
      number: counter.ticket_counter,
      title: input.title,
      description: input.description ?? null,
      status: input.status,
      priority: input.priority,
      assignee_id: assigneeId,
      reporter_id: userId,
    }).returning([
      'id', 'number', 'title', 'description', 'status', 'priority',
      'assignee_id', 'reporter_id', 'created_at',
    ]).executeTakeFirstOrThrow()

    return toView(row as Row, counter.key)
  })
}

export async function listTickets(
  db: Kysely<Database>,
  userId: string,
  projectId: string,
): Promise<TicketView[]> {
  const ctx = await projectContext(db, userId, projectId)
  if (!ctx || !canView(ctx)) throw PROJECT_NOT_FOUND()

  const project = await db.selectFrom('projects').select('key')
    .where('id', '=', projectId).executeTakeFirstOrThrow()

  const rows = await db.selectFrom('tickets')
    .select(['id', 'number', 'title', 'description', 'status', 'priority',
             'assignee_id', 'reporter_id', 'created_at'])
    .where('project_id', '=', projectId)
    .orderBy('number', 'asc')
    .execute()

  return rows.map(r => toView(r as Row, project.key))
}

export async function updateTicket(
  db: Kysely<Database>,
  userId: string,
  ticketId: string,
  input: UpdateTicketInput,
): Promise<TicketView> {
  const owning = await db.selectFrom('tickets')
    .innerJoin('projects', 'projects.id', 'tickets.project_id')
    .select(['tickets.project_id', 'tickets.assignee_id', 'projects.key'])
    .where('tickets.id', '=', ticketId)
    .executeTakeFirst()
  if (!owning) throw NOT_FOUND()

  const ctx = await projectContext(db, userId, owning.project_id)
  // Invisible and missing produce the same 404. See spec §7.
  if (!ctx || !canView(ctx)) throw NOT_FOUND()
  if (!canEditTicket(ctx, { assigneeId: owning.assignee_id })) {
    throw new AppError('FORBIDDEN', 'You cannot edit that ticket.', 403)
  }

  const row = await db.updateTable('tickets')
    .set({
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.priority !== undefined ? { priority: input.priority } : {}),
      updated_at: new Date(),
    })
    .where('id', '=', ticketId)
    .returning(['id', 'number', 'title', 'description', 'status', 'priority',
                'assignee_id', 'reporter_id', 'created_at'])
    .executeTakeFirstOrThrow()

  return toView(row as Row, owning.key)
}
```

- [ ] **Step 4: Implement the ticket routes**

`server/src/routes/ticket.routes.ts`:

```ts
import { Router } from 'express'
import type { Kysely } from 'kysely'
import { createTicketSchema, updateTicketSchema } from '@mira/shared'
import type { Database } from '../db/types.js'
import { AppError } from '../errors.js'
import { requireUser } from '../auth/middleware.js'
import { createTicket, listTickets, updateTicket } from '../services/ticket.service.js'

const invalid = (msg: string) => new AppError('VALIDATION_FAILED', msg, 400)

/** Mounted at /api/projects/:projectId/tickets */
export function projectTicketRoutes(db: Kysely<Database>): Router {
  const r = Router({ mergeParams: true })
  r.use(requireUser(db))

  r.post('/', async (req, res, next) => {
    try {
      const parsed = createTicketSchema.safeParse(req.body)
      if (!parsed.success) {
        throw invalid(parsed.error.issues[0]?.message ?? 'Invalid input.')
      }
      const projectId = (req.params as { projectId: string }).projectId
      res.status(201).json(
        await createTicket(db, req.userId!, projectId, parsed.data))
    } catch (err) { next(err) }
  })

  r.get('/', async (req, res, next) => {
    try {
      const projectId = (req.params as { projectId: string }).projectId
      res.json(await listTickets(db, req.userId!, projectId))
    } catch (err) { next(err) }
  })

  return r
}

/** Mounted at /api/tickets */
export function ticketRoutes(db: Kysely<Database>): Router {
  const r = Router()
  r.use(requireUser(db))

  r.patch('/:id', async (req, res, next) => {
    try {
      const parsed = updateTicketSchema.safeParse(req.body)
      if (!parsed.success) {
        throw invalid(parsed.error.issues[0]?.message ?? 'Invalid input.')
      }
      res.json(await updateTicket(db, req.userId!, req.params.id!, parsed.data))
    } catch (err) { next(err) }
  })

  return r
}
```

- [ ] **Step 5: Mount both routers**

In `server/src/app.ts`, add:

```ts
import { projectTicketRoutes, ticketRoutes } from './routes/ticket.routes.js'
// ...after app.use('/api/projects', projectRoutes(db)):
app.use('/api/projects/:projectId/tickets', projectTicketRoutes(db))
app.use('/api/tickets', ticketRoutes(db))
```

- [ ] **Step 6: Run and confirm the tests pass**

Run: `npx vitest run server/tests/ticket.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 7: Run the whole suite**

Run: `npx vitest run`
Expected: PASS — every test from Tasks 1-8.

- [ ] **Step 8: Commit**

```bash
git add server/src/services/ticket.service.ts server/src/routes/ticket.routes.ts server/src/app.ts server/tests/
git commit -m "feat: add tickets with atomic per-project key allocation"
```

---

## Task 9: Client scaffold, API client, and auth pages

**Can be written without PostgreSQL; running it end-to-end needs the API up.**

**Testing note:** per spec §8, React rendering minutiae are deliberately not
unit-tested — the client's automated coverage is the Playwright smoke test in
Task 11. The one piece of real client logic, the API client's error unwrapping,
*is* unit-tested here.

**Files:**
- Create: `client/package.json`, `client/index.html`, `client/vite.config.ts`
- Create: `client/src/main.tsx`, `client/src/api/client.ts`, `client/src/api/endpoints.ts`
- Create: `client/src/auth/useSession.ts`
- Create: `client/src/routes/SignupPage.tsx`, `client/src/routes/LoginPage.tsx`
- Test: `client/src/api/client.test.ts`

**Interfaces:**
- Consumes: the shared schemas and types (Task 1); the HTTP API (Tasks 6-8).
- Produces:
  - `class ApiError extends Error` with `code: string` and `status: number`
  - `api<T>(path: string, init?: RequestInit): Promise<T>` — prefixes the base URL, sends `credentials: 'include'`, throws `ApiError` on a non-2xx
  - `endpoints`: `signup`, `login`, `logout`, `me`, `listProjects`, `createProject`, `getProject`, `listTickets`, `createTicket`, `updateTicket`
  - `useSession(): { user: PublicUser | null; loading: boolean; refresh(): Promise<void> }`

- [ ] **Step 1: Scaffold the client package**

`client/package.json`:

```json
{
  "name": "@mira/client",
  "private": true,
  "type": "module",
  "scripts": { "dev": "vite", "build": "vite build" },
  "dependencies": {
    "@mira/shared": "*",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-router-dom": "^7.1.1"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.4",
    "vite": "^6.0.7"
  }
}
```

`client/vite.config.ts`:

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
})
```

`client/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Mira</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Then run `npm install` from the repo root.

- [ ] **Step 2: Write the failing test for the API client**

`client/src/api/client.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { api, ApiError } from './client.js'

afterEach(() => { vi.unstubAllGlobals() })

function stubFetch(status: number, body: unknown) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }))
}

describe('api', () => {
  it('returns the parsed body on success', async () => {
    stubFetch(200, { id: '1', email: 'p@example.com' })
    expect(await api('/me')).toEqual({ id: '1', email: 'p@example.com' })
  })

  it('always sends credentials so the session cookie travels', async () => {
    stubFetch(200, {})
    await api('/me')
    const init = (fetch as any).mock.calls[0][1]
    expect(init.credentials).toBe('include')
  })

  it('throws an ApiError carrying the server code and status', async () => {
    stubFetch(401, { error: { code: 'NOT_AUTHENTICATED', message: 'Sign in.' } })
    const err = await api('/me').catch(e => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err.code).toBe('NOT_AUTHENTICATED')
    expect(err.status).toBe(401)
    expect(err.message).toBe('Sign in.')
  })

  it('still throws a usable error when the body is not the expected shape', async () => {
    stubFetch(500, 'gateway exploded')
    const err = await api('/me').catch(e => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err.code).toBe('UNKNOWN')
    expect(err.status).toBe(500)
  })
})
```

- [ ] **Step 3: Run and confirm it fails**

Run: `npx vitest run client`
Expected: FAIL — `./client.js` not found.

- [ ] **Step 4: Implement the API client**

`client/src/api/client.ts`:

```ts
const BASE = 'http://localhost:3001/api'

export class ApiError extends Error {
  constructor(readonly code: string, message: string, readonly status: number) {
    super(message)
    this.name = 'ApiError'
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    // Without this the session cookie is not sent across the dev origins.
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    ...init,
  })

  if (!res.ok) {
    // The server always sends { error: { code, message } } — but a proxy or a
    // crash might not, so never assume the shape.
    let code = 'UNKNOWN'
    let message = 'Something went wrong.'
    try {
      const body: any = await res.json()
      if (body?.error?.code) { code = body.error.code; message = body.error.message }
    } catch { /* keep the defaults */ }
    throw new ApiError(code, message, res.status)
  }

  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}
```

- [ ] **Step 5: Run and confirm the tests pass**

Run: `npx vitest run client`
Expected: PASS, 4 tests.

- [ ] **Step 6: Implement the endpoints and the session hook**

`client/src/api/endpoints.ts`:

```ts
import type {
  CreateProjectInput, CreateTicketInput, LoginInput, SignupInput,
  TicketPriority, TicketStatus, UpdateTicketInput,
} from '@mira/shared'
import { api } from './client.js'

export type PublicUser = { id: string; email: string; displayName: string }
export type Project = {
  id: string; name: string; key: string
  description: string | null; workspaceId: string
}
export type Ticket = {
  id: string; key: string; number: number; title: string
  description: string | null; status: TicketStatus; priority: TicketPriority
  assigneeId: string | null; reporterId: string; createdAt: string
}

const post = (body: unknown) => ({ method: 'POST', body: JSON.stringify(body) })

export const endpoints = {
  signup: (i: SignupInput) => api<PublicUser>('/auth/signup', post(i)),
  login: (i: LoginInput) => api<PublicUser>('/auth/login', post(i)),
  logout: () => api<void>('/auth/logout', { method: 'POST' }),
  me: () => api<PublicUser>('/me'),

  listProjects: () => api<Project[]>('/projects'),
  createProject: (i: CreateProjectInput) => api<Project>('/projects', post(i)),
  getProject: (id: string) => api<Project>(`/projects/${id}`),

  listTickets: (projectId: string) =>
    api<Ticket[]>(`/projects/${projectId}/tickets`),
  createTicket: (projectId: string, i: CreateTicketInput) =>
    api<Ticket>(`/projects/${projectId}/tickets`, post(i)),
  updateTicket: (id: string, i: UpdateTicketInput) =>
    api<Ticket>(`/tickets/${id}`, { method: 'PATCH', body: JSON.stringify(i) }),
}
```

`client/src/auth/useSession.ts`:

```ts
import { useCallback, useEffect, useState } from 'react'
import { endpoints, type PublicUser } from '../api/endpoints.js'

export function useSession() {
  const [user, setUser] = useState<PublicUser | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setUser(await endpoints.me())
    } catch {
      // A 401 here is the normal signed-out state, not an error to surface.
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  return { user, loading, refresh }
}
```

- [ ] **Step 7: Implement the auth pages**

`client/src/routes/SignupPage.tsx`:

```tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { signupSchema } from '@mira/shared'
import { endpoints } from '../api/endpoints.js'
import { ApiError } from '../api/client.js'

export function SignupPage({ onDone }: { onDone: () => Promise<void> }) {
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    // The SAME schema the server validates with — one definition, both sides.
    const parsed = signupSchema.safeParse({ email, password, displayName })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check your details.')
      return
    }
    setBusy(true)
    try {
      await endpoints.signup(parsed.data)
      await onDone()
      navigate('/')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit}>
      <h1>Create your Mira account</h1>
      {error && <p role="alert">{error}</p>}
      <label>Name
        <input value={displayName} onChange={e => setDisplayName(e.target.value)}
               autoComplete="name" required />
      </label>
      <label>Email
        <input type="email" value={email} onChange={e => setEmail(e.target.value)}
               autoComplete="email" required />
      </label>
      <label>Password
        <input type="password" value={password}
               onChange={e => setPassword(e.target.value)}
               autoComplete="new-password" required />
      </label>
      <button type="submit" disabled={busy}>
        {busy ? 'Creating…' : 'Create account'}
      </button>
    </form>
  )
}
```

`client/src/routes/LoginPage.tsx`:

```tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { loginSchema } from '@mira/shared'
import { endpoints } from '../api/endpoints.js'
import { ApiError } from '../api/client.js'

export function LoginPage({ onDone }: { onDone: () => Promise<void> }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const parsed = loginSchema.safeParse({ email, password })
    if (!parsed.success) {
      setError('Enter your email and password.')
      return
    }
    setBusy(true)
    try {
      await endpoints.login(parsed.data)
      await onDone()
      navigate('/')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit}>
      <h1>Sign in to Mira</h1>
      {error && <p role="alert">{error}</p>}
      <label>Email
        <input type="email" value={email} onChange={e => setEmail(e.target.value)}
               autoComplete="email" required />
      </label>
      <label>Password
        <input type="password" value={password}
               onChange={e => setPassword(e.target.value)}
               autoComplete="current-password" required />
      </label>
      <button type="submit" disabled={busy}>
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  )
}
```

- [ ] **Step 8: Commit**

```bash
git add client/
git commit -m "feat: add client scaffold, typed API client, and auth pages"
```

---

## Task 10: The board

**Needs the API running to exercise; Playwright covers it in Task 11.**

**Design note:** status changes use a `<select>` per ticket, not drag-and-drop.
A select is keyboard-accessible and screen-reader-friendly for free, works on
touch, and is roughly forty lines less code. Drag-and-drop is a genuine
improvement but belongs in INC 8, where polish is the deliverable — and it
would be layered on top of this, not instead of it.

**Files:**
- Create: `client/src/main.tsx`, `client/src/routes/ProjectListPage.tsx`
- Create: `client/src/routes/BoardPage.tsx`
- Create: `client/src/components/Board.tsx`, `client/src/components/NewTicketForm.tsx`

**Interfaces:**
- Consumes: `endpoints`, `Project`, `Ticket` (Task 9); `useSession` (Task 9); `TICKET_STATUSES` (Task 1).
- Produces: a mounted router with `/` (project list), `/login`, `/signup`, and `/projects/:id` (board).

- [ ] **Step 1: Implement the router entrypoint**

`client/src/main.tsx`:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { useSession } from './auth/useSession.js'
import { SignupPage } from './routes/SignupPage.js'
import { LoginPage } from './routes/LoginPage.js'
import { ProjectListPage } from './routes/ProjectListPage.js'
import { BoardPage } from './routes/BoardPage.js'

function App() {
  const { user, loading, refresh } = useSession()

  if (loading) return <p>Loading…</p>

  if (!user) {
    return (
      <Routes>
        <Route path="/signup" element={<SignupPage onDone={refresh} />} />
        <Route path="/login" element={<LoginPage onDone={refresh} />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }

  return (
    <Routes>
      <Route path="/" element={<ProjectListPage user={user} onSignOut={refresh} />} />
      <Route path="/projects/:id" element={<BoardPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter><App /></BrowserRouter>
  </StrictMode>,
)
```

- [ ] **Step 2: Implement the project list**

`client/src/routes/ProjectListPage.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { createProjectSchema } from '@mira/shared'
import { endpoints, type Project, type PublicUser } from '../api/endpoints.js'
import { ApiError } from '../api/client.js'

export function ProjectListPage(
  { user, onSignOut }: { user: PublicUser; onSignOut: () => Promise<void> },
) {
  const [projects, setProjects] = useState<Project[]>([])
  const [name, setName] = useState('')
  const [key, setKey] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { void endpoints.listProjects().then(setProjects) }, [])

  async function create(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const parsed = createProjectSchema.safeParse({ name, key })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the details.')
      return
    }
    try {
      setProjects(p => [...p, await endpoints.createProject(parsed.data)])
      setName(''); setKey('')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.')
    }
  }

  return (
    <main>
      <header>
        <h1>Mira</h1>
        <p>Signed in as {user.displayName}</p>
        <button onClick={async () => { await endpoints.logout(); await onSignOut() }}>
          Sign out
        </button>
      </header>

      <h2>Projects</h2>
      {projects.length === 0 && <p>No projects yet. Create the first one below.</p>}
      <ul>
        {projects.map(p => (
          <li key={p.id}>
            <Link to={`/projects/${p.id}`}>{p.key} — {p.name}</Link>
          </li>
        ))}
      </ul>

      <form onSubmit={create}>
        <h3>New project</h3>
        {error && <p role="alert">{error}</p>}
        <label>Name
          <input value={name} onChange={e => setName(e.target.value)} required />
        </label>
        <label>Key
          <input value={key} onChange={e => setKey(e.target.value)}
                 placeholder="MIRA" required />
        </label>
        <button type="submit">Create project</button>
      </form>
    </main>
  )
}
```

- [ ] **Step 3: Implement the board page and its components**

`client/src/routes/BoardPage.tsx`:

```tsx
import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { endpoints, type Project, type Ticket } from '../api/endpoints.js'
import { Board } from '../components/Board.js'
import { NewTicketForm } from '../components/NewTicketForm.js'

export function BoardPage() {
  const { id } = useParams<{ id: string }>()
  const [project, setProject] = useState<Project | null>(null)
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!id) return
    try {
      const [p, t] = await Promise.all([
        endpoints.getProject(id), endpoints.listTickets(id),
      ])
      setProject(p); setTickets(t)
    } catch {
      setError('That project could not be loaded.')
    }
  }, [id])

  useEffect(() => { void load() }, [load])

  if (error) return <main><p role="alert">{error}</p><Link to="/">Back</Link></main>
  if (!project || !id) return <main><p>Loading…</p></main>

  return (
    <main>
      <Link to="/">← All projects</Link>
      <h1>{project.key} — {project.name}</h1>

      <NewTicketForm
        projectId={id}
        onCreated={t => setTickets(prev => [...prev, t])}
      />

      <Board
        tickets={tickets}
        onStatusChange={async (ticketId, status) => {
          const updated = await endpoints.updateTicket(ticketId, { status })
          setTickets(prev => prev.map(t => (t.id === ticketId ? updated : t)))
        }}
      />
    </main>
  )
}
```

`client/src/components/Board.tsx`:

```tsx
import { TICKET_STATUSES, type TicketStatus } from '@mira/shared'
import type { Ticket } from '../api/endpoints.js'

const LABELS: Record<TicketStatus, string> = {
  backlog: 'Backlog',
  todo: 'To do',
  in_progress: 'In progress',
  blocked: 'Blocked',
  done: 'Done',
  closed: 'Closed',
}

export function Board(
  { tickets, onStatusChange }: {
    tickets: Ticket[]
    onStatusChange: (id: string, status: TicketStatus) => Promise<void>
  },
) {
  return (
    <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
      {TICKET_STATUSES.map(status => {
        const column = tickets.filter(t => t.status === status)
        return (
          <section key={status} aria-label={LABELS[status]} style={{ flex: 1 }}>
            <h2>{LABELS[status]} ({column.length})</h2>
            <ul>
              {column.map(t => (
                <li key={t.id}>
                  <strong>{t.key}</strong> {t.title}
                  <label>
                    <span className="sr-only">Status for {t.key}</span>
                    <select
                      value={t.status}
                      onChange={e =>
                        void onStatusChange(t.id, e.target.value as TicketStatus)}
                    >
                      {TICKET_STATUSES.map(s => (
                        <option key={s} value={s}>{LABELS[s]}</option>
                      ))}
                    </select>
                  </label>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
```

`client/src/components/NewTicketForm.tsx`:

```tsx
import { useState } from 'react'
import { createTicketSchema } from '@mira/shared'
import { endpoints, type Ticket } from '../api/endpoints.js'
import { ApiError } from '../api/client.js'

export function NewTicketForm(
  { projectId, onCreated }: {
    projectId: string
    onCreated: (t: Ticket) => void
  },
) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const parsed = createTicketSchema.safeParse({
      title,
      ...(description.trim() ? { description } : {}),
    })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Enter a title.')
      return
    }
    try {
      onCreated(await endpoints.createTicket(projectId, parsed.data))
      setTitle(''); setDescription('')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.')
    }
  }

  return (
    <form onSubmit={submit}>
      <h2>New ticket</h2>
      {error && <p role="alert">{error}</p>}
      <label>Title
        <input value={title} onChange={e => setTitle(e.target.value)} required />
      </label>
      <label>Description
        <textarea value={description} onChange={e => setDescription(e.target.value)} />
      </label>
      <button type="submit">Add ticket</button>
    </form>
  )
}
```

- [ ] **Step 4: Run it and check it by hand**

In one terminal: `npm run dev --workspace @mira/server`
In another: `npm run dev --workspace @mira/client`

Open `http://localhost:5173`, sign up, create a project keyed `MIRA`, add a
ticket, and move it from Backlog to In progress. Reload the page and confirm
the ticket is still there in the new column — that is the "data survives a
restart" requirement.

- [ ] **Step 5: Commit**

```bash
git add client/
git commit -m "feat: add the project list and the status board"
```

---

## Task 11: Playwright smoke test and the INC 1 acceptance gate

**REQUIRES POSTGRESQL and both dev servers.**

**Files:**
- Create: `playwright.config.ts`, `e2e/smoke.spec.ts`
- Modify: root `package.json` — add the `e2e` script

**Interfaces:**
- Consumes: the running client (5173) and server (3001).
- Produces: `npm run e2e`, the guard that proves the walking skeleton still
  walks after every future increment.

- [ ] **Step 1: Install Playwright**

```bash
npm install -D @playwright/test
npx playwright install chromium
```

- [ ] **Step 2: Write the config**

`playwright.config.ts`:

```ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  use: { baseURL: 'http://localhost:5173' },
  // Both servers must already be running. Starting them here would need the
  // test database, and this suite deliberately runs against mira_dev.
  webServer: undefined,
})
```

Add to the root `package.json` scripts: `"e2e": "playwright test"`.

- [ ] **Step 3: Write the smoke test**

`e2e/smoke.spec.ts`:

```ts
import { test, expect } from '@playwright/test'

// A unique email per run, since this hits mira_dev rather than a wiped
// test database.
const stamp = Date.now()
const EMAIL = `smoke-${stamp}@example.com`
const KEY = `SM${String(stamp).slice(-4)}`

test('sign up, create a project, create a ticket, move it to Done', async ({ page }) => {
  await page.goto('/signup')

  await page.getByLabel('Name').fill('Smoke Test')
  await page.getByLabel('Email').fill(EMAIL)
  await page.getByLabel('Password').fill('correct horse battery')
  await page.getByRole('button', { name: 'Create account' }).click()

  await expect(page.getByRole('heading', { name: 'Mira' })).toBeVisible()

  await page.getByLabel('Name').fill('Smoke Project')
  await page.getByLabel('Key').fill(KEY)
  await page.getByRole('button', { name: 'Create project' }).click()

  await page.getByRole('link', { name: `${KEY} — Smoke Project` }).click()

  await page.getByLabel('Title').fill('Prove the skeleton walks')
  await page.getByRole('button', { name: 'Add ticket' }).click()

  const backlog = page.getByRole('region', { name: 'Backlog' })
  await expect(backlog.getByText(`${KEY}-1`)).toBeVisible()

  await page.getByLabel(`Status for ${KEY}-1`).selectOption('done')

  const done = page.getByRole('region', { name: 'Done' })
  await expect(done.getByText(`${KEY}-1`)).toBeVisible()

  // The requirement is persistence, not optimistic UI: reload and re-check.
  await page.reload()
  await expect(page.getByRole('region', { name: 'Done' })
    .getByText(`${KEY}-1`)).toBeVisible()
})
```

- [ ] **Step 4: Run it**

With both dev servers running: `npm run e2e`
Expected: 1 passed.

- [ ] **Step 5: Commit**

```bash
git add playwright.config.ts e2e/ package.json
git commit -m "test: add the end-to-end smoke path for the walking skeleton"
```

- [ ] **Step 6: THE DOGFOODING GATE — open Mira and file the rest of the work**

This is what INC 1 was for. It is not optional decoration; it is the acceptance
criterion from spec §1.1.

1. Run both dev servers and sign up with your real account.
2. Create a project named **Mira** with the key **MIRA**.
3. Create one ticket per remaining increment, in `backlog`:
   - `INC 2 — Many projects, and ticket detail`
   - `INC 3 — Epics`
   - `INC 4 — Collaborations`
   - `INC 5 — Free-form and managed modes`
   - `INC 6 — The homepage`
   - `INC 7 — Project-level guests`
   - `INC 8 — Visual pass and accessibility`
   - `INC 9 — Deploy`
4. Move `MIRA-1` to `in_progress` when you start INC 2.

**INC 1 is complete when the remaining work lives in Mira rather than in a
markdown file.** From here, the plan for each increment is written against the
ticket, and the board is the source of truth.

- [ ] **Step 7: Final verification of the whole increment**

```bash
npx vitest run        # every unit and integration test
npm run typecheck     # no type errors across all three packages
npm run e2e           # the smoke path
```

All three must pass before INC 1 is called done.

---

## Coverage against the spec

| Spec section | Where it is implemented |
|---|---|
| §3.1 schema — all seven tables | Task 4, `001_initial.ts` |
| §3.1 one personal workspace per user | Task 4, partial unique index + test |
| §3.1 `epic_id ON DELETE SET NULL` | Task 4, migration + schema test |
| §3.2 ticket keys, atomic counter | Task 8, `UPDATE … RETURNING` in a transaction |
| §4.2 permission rules, both modes | Task 3, full matrix unit-tested |
| §4.3 structural actions admin-only | Task 3, `canManageProject` — defined and fully tested, but INC 1 has no archive/rename/move action to call it. First caller arrives in INC 2. |
| §4.4 single permission module | Task 3 defines it; Tasks 7-8 are its only callers |
| §5.1 shared schemas both sides | Task 1 defines; Tasks 6-10 consume |
| §5.2 routes/services layering | Tasks 6-8 |
| §5.3 argon2id + server-side sessions | Tasks 2 and 5 |
| §6 API surface (INC 1 subset) | Tasks 6, 7, 8 |
| §7 error shape, 404-not-403 | Task 2 defines; Tasks 7-8 tested |
| §8 unit / integration / smoke layers | Tasks 3, 4-8, 11 |
| §9 INC 1 scope and dogfooding gate | Task 11, Step 6 |

**Deferred to later increments, deliberately:** assignee as a request field
(INC 4), epics UI (INC 3), modes UI (INC 5), `GET /api/me/tasks` (INC 6),
project guests (INC 7), styling (INC 8), session-token hashing and rate
limiting (INC 9).
