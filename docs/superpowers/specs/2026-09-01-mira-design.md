# Mira — Design Specification

- **Date:** 2026-09-01
- **Author:** Patrick A. Asamoah (BuxPatrick)
- **Status:** Approved design, pending implementation plan

---

## 1. Purpose

Mira is a project manager and tracker in the spirit of Jira, built from scratch
as a learning project. It is not intended to clone Jira; Jira is the motivation,
not the specification.

Four goals were stated, and all four are in scope:

1. **A tool actually used daily.** Mira must be good enough to track real work.
2. **Learning full-stack development end to end** — frontend, backend, database,
   auth, deployment.
3. **Learning backend and system design** — data modelling, permissions, API
   design, testing.
4. **A portfolio piece** — polished enough to show, with a deployed demo.

These goals mostly reinforce each other. The one tension is *when* visual polish
happens: a daily-use tool tolerates a plain UI for months, a portfolio piece does
not. This is resolved by keeping every increment shippable and treating the
visual pass as its own late increment, so polish never blocks the parts that
carry the learning.

### 1.1 The governing constraint: dogfooding

Mira must become the tracker for its own remaining construction. Increment 1 is
therefore not a demo — it must be complete enough to hold Mira's own backlog, so
that increments 2 through 9 are filed inside Mira as tickets and worked from
Mira's own board.

This single constraint drives two decisions that appear throughout this document:
increments are sliced **vertically** (a thin line through every layer) rather
than horizontally (a finished layer at a time), and ticket statuses ship in
increment 1, because a tracker whose tickets cannot move cannot track anything.

---

## 2. Scope

### 2.1 In scope

Users and authentication; personal and team workspaces; projects; epics; tickets
with statuses, priorities and assignees; the two collaboration modes; project
level guests; a cross-workspace "my tasks" homepage; deployment.

### 2.2 Explicitly out of scope

The following are deliberately excluded. Each could be added later as its own
increment, but none is required by the original concept and each carries real
cost:

- **Real-time synchronisation.** Two people viewing the same board will not see
  each other's changes live; the board refreshes on navigation and on the
  viewer's own actions. Live sync requires persistent connections and an event
  bus — an entire subsystem — for a benefit that barely registers at two to five
  users.
- **Comments, attachments, sprints, story points, workflows, custom fields,
  notifications, and search across workspaces.** These are Jira features, not
  Mira requirements.

---

## 3. Domain model

The organising idea is that **"Personal" is not a special case — it is a
workspace you are the only member of.** The left-hand rail then stops being two
different concepts and becomes a single query: *list my workspaces, grouped by
kind*.

```
User ─────< WorkspaceMember >───── Workspace
                                     │  kind:  personal | team
                                     │  mode:  free | managed
                                     │
                                     └──< Project
                                            │  mode: null = inherit workspace
                                            │  key:  "MIRA"  →  MIRA-1, MIRA-2…
                                            │
                                            ├──< Epic    (optional container)
                                            └──< Ticket
```

Signing up automatically creates the user's personal workspace, so there is
always somewhere to put a project. Consequently, *"switch a project from personal
to a collaboration and back"* — a requirement from the original notes — is a
single column update to `project.workspace_id`, not a migration of contents.
This is the payoff for modelling Personal as a workspace rather than a flag.

### 3.1 Tables

Written as intent rather than final DDL; exact types are settled during
implementation.

**users**

| column | type | notes |
|---|---|---|
| id | uuid | primary key |
| email | citext | unique, not null |
| password_hash | text | argon2id |
| display_name | text | not null |
| created_at | timestamptz | default now() |

**sessions**

| column | type | notes |
|---|---|---|
| id | text | primary key; random 32-byte token |
| user_id | uuid | → users, on delete cascade |
| created_at | timestamptz | |
| expires_at | timestamptz | |
| user_agent | text | nullable; enables "sign out everywhere" later |

*Hardening note for increment 9: store a hash of the session token rather than
the token itself, so a database leak does not hand over live sessions.*

**workspaces**

| column | type | notes |
|---|---|---|
| id | uuid | primary key |
| name | text | not null |
| kind | text | `personal` \| `team` |
| mode | text | `free` \| `managed`, default `free` |
| owner_id | uuid | → users |
| created_at | timestamptz | |

Constraint: a partial unique index on `owner_id` where `kind = 'personal'`
enforces exactly one personal workspace per user.

**workspace_members**

| column | type | notes |
|---|---|---|
| workspace_id | uuid | → workspaces, cascade |
| user_id | uuid | → users, cascade |
| role | text | `admin` \| `member` |
| joined_at | timestamptz | |

Primary key `(workspace_id, user_id)`.

**projects**

| column | type | notes |
|---|---|---|
| id | uuid | primary key |
| workspace_id | uuid | → workspaces |
| name | text | not null |
| key | text | e.g. `MIRA`; unique per workspace |
| description | text | nullable |
| mode | text | nullable — **null means inherit the workspace** |
| ticket_counter | int | not null, default 0 |
| created_at | timestamptz | |
| archived_at | timestamptz | nullable |

**epics** *(increment 3)*

| column | type | notes |
|---|---|---|
| id | uuid | primary key |
| project_id | uuid | → projects, on delete cascade |
| title | text | not null |
| description | text | nullable |
| created_at | timestamptz | |

**tickets**

| column | type | notes |
|---|---|---|
| id | uuid | primary key |
| project_id | uuid | → projects, on delete cascade |
| epic_id | uuid | → epics, **on delete set null** |
| number | int | per-project sequence |
| title | text | not null |
| description | text | nullable |
| status | text | `backlog` \| `todo` \| `in_progress` \| `blocked` \| `done` \| `closed` |
| priority | text | `low` \| `medium` \| `high` \| `urgent`, default `medium` |
| assignee_id | uuid | nullable, → users, on delete set null |
| reporter_id | uuid | not null, → users |
| created_at | timestamptz | |
| updated_at | timestamptz | |

Unique `(project_id, number)`.

The `on delete set null` for `epic_id` is deliberate and load-bearing: deleting
an epic must never delete the work inside it. There is an integration test for
exactly this.

**project_members** *(increment 7)* — `(project_id, user_id, role)`, primary key
on the first two columns.

**invites** *(increment 4)* — `id`, `workspace_id`, `email`, `role`,
`token_hash`, `invited_by`, `expires_at`, `accepted_at`.

### 3.2 Ticket keys

Tickets are addressed as `MIRA-14`: the project's `key` plus the ticket's
per-project `number`. Keys exist because they make the tracker usable in
conversation and in commit messages — "I'm on MIRA-14" rather than "the one about
invites" — which matters directly given Mira is used to build Mira.

The counter is allocated inside the same transaction as the ticket insert:

```sql
UPDATE projects SET ticket_counter = ticket_counter + 1
 WHERE id = $1 RETURNING ticket_counter;
```

This is atomic and race-free, which a `SELECT max(number) + 1` would not be.

---

## 4. Permissions

### 4.1 Two modes, not a role matrix

Rather than a four-role permission matrix, permission behaviour is governed by a
**mode on the container**, with only two roles:

- **Free-form** — everyone is equal. Any member creates, edits and moves anything.
  Suited to small projects between people who trust each other, where ceremony is
  pure overhead.
- **Managed** — one admin, plus members. Members see the shared view read-only,
  and have total control over their own tickets.

This collapses to one stored field (`mode`) and one stored role
(`admin` | `member`), and the permission function branches on the mode. It is
substantially less to get wrong than a role matrix, while still expressing both
situations the project needs.

`mode` lives on the workspace, with a nullable override on the project, so a
single team can run one project loosely and another tightly.

### 4.2 The rules

A ticket is **yours** if you are its assignee.

```
effectiveMode(project) = project.mode ?? project.workspace.mode

isMember(user, project) = user ∈ workspace_members(project.workspace_id)
                          [inc 7: OR user ∈ project_members(project.id)]

isAdmin(user, project)  = workspace_members.role = 'admin'
                          [inc 7: OR project_members.role = 'admin']

canView(user, project)  = isMember(user, project)

canCreateTicket(user, project, assigneeId):
    if not isMember          → false
    free                     → true
    managed                  → isAdmin  OR  assigneeId == user.id

canEditTicket(user, ticket, project):        // also governs delete
    if not isMember          → false
    free                     → true
    managed                  → isAdmin  OR  ticket.assigneeId == user.id
```

In managed mode a member creating a ticket has it auto-assigned to themselves;
they cannot create work on another person's plate. Only the admin hands out work.

Two edge cases, made explicit so they are not decided twice:

- **An unassigned ticket created by a member in managed mode.** The request's
  `assigneeId` defaults to the member's own id. An explicit `null`, or another
  user's id, is rejected — otherwise a member could create unowned work that,
  by the rule above, nobody but the admin could then edit.
- **A member in managed mode whose ticket is reassigned away from them.** They
  immediately lose edit rights over it, since the rule keys on the *current*
  assignee. This is intended: reassignment is an admin action and is how work is
  handed over.

### 4.3 Structural actions are admin-only in both modes

**This is a refinement made during design, not part of the original notes, and is
flagged for explicit confirmation.**

Free-form means everyone is equal *on the work* — creating, editing and moving
tickets and epics. It does not mean everyone can destroy the container. The
following remain restricted to the workspace owner or an admin in **both** modes:

- deleting a project or a workspace
- moving a project between workspaces
- inviting or removing people
- changing a workspace's or project's mode

The reasoning is that these actions are irreversible or affect other people's
access, and "we're all equal here" is a statement about trust in day-to-day work,
not a wish for any member to be able to delete the shared project.

### 4.4 Implementation constraint

Every permission decision routes through a **single module**. No route handler
performs its own check. This exists specifically so that increment 7 — adding
project-level guests — is a change to one file rather than an audit of forty
handlers, and so the rules are testable without HTTP.

---

## 5. Architecture

```
mira/
├─ client/          React + TypeScript + Vite
│   ├─ src/api/         one typed fetch wrapper per resource
│   ├─ src/routes/      pages
│   └─ src/components/
├─ server/          Express + TypeScript
│   ├─ src/routes/      HTTP only — parse, call a service, respond
│   ├─ src/services/    business rules + every permission check
│   ├─ src/db/          Kysely queries + migrations
│   └─ src/auth/        hashing, sessions
└─ shared/          types + validation schemas used by BOTH sides
```

### 5.1 Stack, and why

- **TypeScript on both sides.** One language, no context switching, and a shared
  package where a single schema validates the request on the server *and* types
  the form on the client. Change a field once and both sides fail to compile.
- **Separate client and server** rather than a single full-stack framework, so
  the API boundary is explicit. Permissions and API design are the primary
  learning targets, and a visible boundary forces them into the open.
- **PostgreSQL** via **Kysely**, a typed query builder. Queries are written
  SQL-shaped and checked against the real schema, so query and indexing intuition
  is actually built — unlike an ORM, which hides the SQL and makes N+1 queries
  easy to write and hard to notice — while a mistyped column still fails at
  compile time rather than in production.

### 5.2 The layering rule

**Routes never touch the database. Services never touch `req`/`res`.**

This is what allows the permission rules to be tested directly, as pure
functions, in milliseconds. Permissions are the one place where a bug is a
security bug, so they are the place most worth making cheap to test.

### 5.3 Authentication

Server-side sessions, not JWTs: an httpOnly, `SameSite=Lax` cookie holding an
opaque session id, backed by a `sessions` table, with passwords hashed using
argon2id.

JWTs are rejected deliberately. They cannot be revoked, which means logout does
not actually log anyone out — the wrong lesson to learn while writing auth by
hand. Sessions also make "sign out everywhere" nearly free later.

---

## 6. API surface

```
POST   /api/auth/signup
POST   /api/auth/login
POST   /api/auth/logout
GET    /api/me

GET    /api/workspaces                     → the left rail
POST   /api/workspaces                     → new collaboration
GET    /api/workspaces/:id/projects
POST   /api/workspaces/:id/projects

GET    /api/projects/:id                   → project + epics + tickets
PATCH  /api/projects/:id                   → rename, archive, move workspace
POST   /api/projects/:id/tickets
POST   /api/projects/:id/epics

PATCH  /api/tickets/:id                    → status, assignee, priority, title…
DELETE /api/tickets/:id

GET    /api/me/tasks                       → the homepage
```

`GET /api/me/tasks` implements the homepage from the original notes: the current
user's tickets across every workspace. The homepage lands on this view by default
rather than on a project.

"Urgent and blocked first" is defined precisely as: tickets whose `status` is
`blocked` **or** whose `priority` is `urgent` form a pinned group at the top,
ordered by `created_at` ascending; all remaining tickets follow, also by
`created_at` ascending. Tickets with status `done` or `closed` are excluded
entirely. A ticket that is both blocked and urgent appears once, in the pinned
group.

---

## 7. Error handling

Every failure is an `AppError` carrying a machine-readable code and an HTTP
status. A single error middleware renders it as:

```json
{ "error": { "code": "TICKET_NOT_FOUND", "message": "…" } }
```

Internal details, stack traces and database errors are never returned to the
client; they are logged server-side and replaced with a generic message.

**One deliberate rule:** permission failures on resources the user cannot see
return **404, not 403**. A 403 confirms that a project exists, which leaks
information about other people's workspaces to anyone willing to enumerate ids.

---

## 8. Testing strategy

One runner — **Vitest** — on both sides. Test-first from increment 1, because
the schema and the auth written in increment 1 are what every later increment
leans on.

Three layers, deliberately unequal in size:

**Unit — the permission matrix.** Pure functions, no database, milliseconds.
Every combination of mode × role × relationship × action, written out
explicitly. This is the most valuable part of the suite: it covers the one area
where a bug is a security bug, and section 4.4 exists precisely to make it cheap.
When increment 7 adds guests, these tests are what prove nothing else broke.

**Integration — services against a real PostgreSQL.** A `mira_test` database
with migrations applied and tables truncated between tests. Not a mocked
database: a mock will happily accept a foreign key that does not exist and a
cascade that would never fire, so it passes while production breaks. This layer
is where `on delete set null` on `epic_id` is proven.

**Smoke — one Playwright path, from increment 1 onward.** Sign up → create
project → create ticket → move it to Done. Its only job is to prove that the
walking skeleton still walks after every increment.

Supporting this, a **seed script** creates the developer plus two fake users, so
collaboration is exercisable locally from increment 4 without involving anyone
else.

Deliberately not tested: React rendering minutiae, and behaviour belonging to a
library rather than to this codebase.

---

## 9. Increment ladder

The rule for every rung: **the application still runs and is still usable at the
end of it.** An increment that would leave Mira broken is sliced wrongly.

### INC 1 — A tracker that can be used *(the dogfooding gate)*

Sign up, log in, log out. Personal workspace created automatically. Create one
project with a key. Create tickets with titles and descriptions, and move them
across the six statuses on a board. Tickets get real keys (`MIRA-1`). Data
survives a restart.

**Done when:** the Mira project is created inside Mira, increments 2–9 are filed
as tickets, and work continues from Mira's own board.

*Not included:* teams, invites, assignees, epics, modes, styling beyond legible.

This is the largest rung by some margin, since it carries auth, the schema and
the first UI together. That is unavoidable in a walking skeleton and is preferred
to being unable to dogfood until increment 3.

### INC 2 — Many projects, and ticket detail

Create, rename and archive projects; a project switcher; a ticket detail page
with edit and delete. Tickets gain `priority` — which is what "urgent" in the
original notes refers to.

### INC 3 — Epics

Optional containers. Group the board by epic; show epic progress. Tickets with no
epic continue to work exactly as before.

### INC 4 — Collaborations

Team workspaces, the members table, invite-by-email with a token link, and the
left rail split into *Personal* and *Collaborations*. Tickets gain an assignee,
because only now does that mean anything. Moving a project between workspaces
lands here.

### INC 5 — Free-form and managed modes

The mode flag, admin/member roles, and the full rules from section 4, with the
permission matrix tested exhaustively. Expected to be the increment with the most
learning in it.

### INC 6 — The homepage

`GET /api/me/tasks` and the default landing screen: tickets across every
workspace, urgent and blocked first, then by date created.

### INC 7 — Project-level guests

`project_members`, and the second clause added to the permission module — one
file, by design.

### INC 8 — Visual pass and accessibility

The polish that the portfolio goal requires and daily use does not.

### INC 9 — Deploy

Hosting, HTTPS, real signup, password reset, rate limiting, secrets management,
and the session-token hashing noted in section 3.1.

---

## 10. Decisions deferred

- **Real-time sync** — excluded from v1; addable later as its own increment.
- **Increments 8 and 9 may merge** if deploying something plain and polishing it
  live proves preferable.
- **A crude single-workspace version of the homepage** may be pulled forward into
  increment 2 if the full version at increment 6 feels too late in practice.
