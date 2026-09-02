# Trail INC 2 — Many projects, and ticket detail

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Trail usable across several projects at once, and let a ticket be opened, edited in full, and deleted — rather than only created and dragged between columns.

**Architecture:** No new architecture. INC 2 extends the layering INC 1 established: a service per resource holding the rules, thin routes above it, every permission decision routed through `server/src/permissions/index.ts`. The one structurally new thing is that `canManageProject` finally gets its first caller.

**Tech Stack:** Unchanged from INC 1.

**Spec:** `docs/superpowers/specs/2026-09-01-trail-design.md` (§9, INC 2)
**Predecessor:** `docs/superpowers/plans/2026-09-01-inc1-walking-skeleton.md`

## Global Constraints

Everything in INC 1's Global Constraints still holds, unchanged. Additionally:

- **Archiving is not deleting.** An archived project keeps its tickets and stays reachable by id; it merely leaves the default project list. There is no project delete in INC 2.
- **`canManageProject` guards rename and archive** — admin-only in *both* modes, per spec §4.3. This is the first caller; INC 1 defined and tested it with none.
- **Priority already exists** in the schema and in `createTicketSchema` / `updateTicketSchema` from INC 1. INC 2 exposes it through the UI; it adds no columns.
- **Deleting a ticket is permanent** and uses the same permission rule as editing it (`canEditTicket`).

## Prerequisite

INC 1 complete: 97 tests green, `tsc --noEmit` clean, smoke test passing.

---

## File Structure

```
server/src/services/project.service.ts    MODIFY  + updateProject
server/src/services/ticket.service.ts     MODIFY  + getTicket, deleteTicket
server/src/routes/project.routes.ts       MODIFY  + PATCH /:id
server/src/routes/ticket.routes.ts        MODIFY  + GET /:id, DELETE /:id
shared/src/schemas.ts                     MODIFY  + updateProjectSchema
server/tests/project.test.ts              MODIFY  + rename/archive cases
server/tests/ticket.test.ts               MODIFY  + get/delete cases

client/src/api/endpoints.ts               MODIFY  + updateProject, getTicket, deleteTicket
client/src/routes/TicketPage.tsx          CREATE  the ticket detail page
client/src/routes/ProjectListPage.tsx     MODIFY  + rename/archive controls
client/src/components/Board.tsx           MODIFY  + link each ticket to its page
client/src/components/NewTicketForm.tsx   MODIFY  + priority select
client/src/main.tsx                       MODIFY  + /tickets/:id route
e2e/smoke.spec.ts                         MODIFY  extend through detail + delete
```

---

## Task 1: Rename and archive a project

**Interfaces:**
- Consumes: `projectContext`, `canManageProject`, `AppError`.
- Produces: `updateProjectSchema` (`{ name?, description?, archived? }`, at least one key) and `UpdateProjectInput` in `@trail/shared`; `updateProject(db, userId, projectId, input): Promise<ProjectSummary>`; `PATCH /api/projects/:id`.

- [ ] **Step 1: Add the schema to `shared/src/schemas.ts`**

```ts
export const updateProjectSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(2000).optional(),
  archived: z.boolean().optional(),
}).refine(v => Object.keys(v).length > 0, { message: 'No fields to update' })
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>
```

- [ ] **Step 2: Write the failing tests, appended to `server/tests/project.test.ts`**

```ts
describe('PATCH /api/projects/:id', () => {
  it('renames a project', async () => {
    const agent = await signedInAgent()
    const p = await agent.post('/api/projects').send({ name: 'Trail', key: 'TRAIL' })
    const res = await agent.patch(`/api/projects/${p.body.id}`)
      .send({ name: 'Trail Tracker' })
    expect(res.status).toBe(200)
    expect(res.body.name).toBe('Trail Tracker')
    expect(res.body.key).toBe('TRAIL')
  })

  it('archives a project, removing it from the list but not the database', async () => {
    const agent = await signedInAgent()
    const p = await agent.post('/api/projects').send({ name: 'Trail', key: 'TRAIL' })
    await agent.patch(`/api/projects/${p.body.id}`).send({ archived: true })

    expect((await agent.get('/api/projects')).body).toEqual([])
    // Still reachable by id - archiving is not deleting.
    expect((await agent.get(`/api/projects/${p.body.id}`)).status).toBe(200)
    const row = await testDb.selectFrom('projects').selectAll()
      .where('id', '=', p.body.id).executeTakeFirstOrThrow()
    expect(row.archived_at).not.toBeNull()
  })

  it('un-archives a project', async () => {
    const agent = await signedInAgent()
    const p = await agent.post('/api/projects').send({ name: 'Trail', key: 'TRAIL' })
    await agent.patch(`/api/projects/${p.body.id}`).send({ archived: true })
    await agent.patch(`/api/projects/${p.body.id}`).send({ archived: false })
    expect((await agent.get('/api/projects')).body).toHaveLength(1)
  })

  it('rejects an empty patch', async () => {
    const agent = await signedInAgent()
    const p = await agent.post('/api/projects').send({ name: 'Trail', key: 'TRAIL' })
    expect((await agent.patch(`/api/projects/${p.body.id}`).send({})).status).toBe(400)
  })

  it('returns 404 for a project belonging to someone else', async () => {
    const mine = await signedInAgent()
    const p = await mine.post('/api/projects').send({ name: 'Trail', key: 'TRAIL' })
    const other = await signedInAgent(OTHER)
    const res = await other.patch(`/api/projects/${p.body.id}`).send({ name: 'Hijacked' })
    expect(res.status).toBe(404)
  })

  it('does NOT change the key', async () => {
    const agent = await signedInAgent()
    const p = await agent.post('/api/projects').send({ name: 'Trail', key: 'TRAIL' })
    await agent.patch(`/api/projects/${p.body.id}`).send({ name: 'X', key: 'ZZZ' } as any)
    expect((await agent.get(`/api/projects/${p.body.id}`)).body.key).toBe('TRAIL')
  })
})
```

- [ ] **Step 3: Run and confirm they fail** — `npx vitest run server/tests/project.test.ts`

- [ ] **Step 4: Implement `updateProject` in `server/src/services/project.service.ts`**

```ts
export async function updateProject(
  db: Kysely<Database>,
  userId: string,
  projectId: string,
  input: UpdateProjectInput,
): Promise<ProjectSummary> {
  const ctx = await projectContext(db, userId, projectId)
  if (!ctx || !canView(ctx)) throw NOT_FOUND()
  // First caller of canManageProject: admin-only in BOTH modes (spec 4.3).
  // A non-admin member is told 404, not 403 - it is their project's existence
  // they may see, but not that they were refused.
  if (!canManageProject(ctx)) throw NOT_FOUND()

  const row = await db.updateTable('projects')
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.archived !== undefined
        ? { archived_at: input.archived ? new Date() : null }
        : {}),
    })
    .where('id', '=', projectId)
    .returning(['id', 'name', 'key', 'description', 'workspace_id'])
    .executeTakeFirstOrThrow()

  return {
    id: row.id, name: row.name, key: row.key,
    description: row.description, workspaceId: row.workspace_id,
  }
}
```

The `key` is deliberately absent: ticket keys like `TRAIL-14` are already written
in commits and conversations, so renaming a project must not silently
invalidate them. Changing a key would be a migration, not an edit.

- [ ] **Step 5: Add the route to `server/src/routes/project.routes.ts`**

```ts
r.patch('/:id', async (req, res, next) => {
  try {
    const parsed = updateProjectSchema.safeParse(req.body)
    if (!parsed.success) {
      throw new AppError('VALIDATION_FAILED',
        parsed.error.issues[0]?.message ?? 'Invalid input.', 400)
    }
    res.json(await updateProject(db, req.userId!, req.params.id!, parsed.data))
  } catch (err) { next(err) }
})
```

- [ ] **Step 6: Run and confirm they pass**, then commit.

---

## Task 2: Read and delete a single ticket

**Interfaces:**
- Consumes: `projectContext`, `canView`, `canEditTicket`, `toView`.
- Produces: `getTicket(db, userId, ticketId): Promise<TicketView>`; `deleteTicket(db, userId, ticketId): Promise<void>`; `GET /api/tickets/:id`; `DELETE /api/tickets/:id`.

- [ ] **Step 1: Write the failing tests, appended to `server/tests/ticket.test.ts`**

```ts
describe('GET /api/tickets/:id', () => {
  it('returns one ticket with its key', async () => {
    const { agent, projectId } = await withProject()
    const t = await agent.post(`/api/projects/${projectId}/tickets`)
      .send({ title: 'Set up the database', description: 'Postgres + Kysely' })
    const res = await agent.get(`/api/tickets/${t.body.id}`)
    expect(res.status).toBe(200)
    expect(res.body.key).toBe('TRAIL-1')
    expect(res.body.description).toBe('Postgres + Kysely')
  })

  it('returns 404 for a ticket the caller cannot see', async () => {
    const { agent, projectId } = await withProject()
    const t = await agent.post(`/api/projects/${projectId}/tickets`).send({ title: 'X' })
    const other = await stranger()
    expect((await other.get(`/api/tickets/${t.body.id}`)).status).toBe(404)
  })

  it('returns 404 for an id that does not exist', async () => {
    const { agent } = await withProject()
    expect((await agent.get(
      '/api/tickets/00000000-0000-0000-0000-000000000000')).status).toBe(404)
  })
})

describe('DELETE /api/tickets/:id', () => {
  it('deletes the ticket', async () => {
    const { agent, projectId } = await withProject()
    const t = await agent.post(`/api/projects/${projectId}/tickets`).send({ title: 'X' })
    expect((await agent.delete(`/api/tickets/${t.body.id}`)).status).toBe(204)
    expect((await agent.get(`/api/projects/${projectId}/tickets`)).body).toEqual([])
  })

  it('does NOT reuse the deleted number for the next ticket', async () => {
    const { agent, projectId } = await withProject()
    const t = await agent.post(`/api/projects/${projectId}/tickets`).send({ title: 'One' })
    await agent.delete(`/api/tickets/${t.body.id}`)
    const next = await agent.post(`/api/projects/${projectId}/tickets`)
      .send({ title: 'Two' })
    // The counter never rewinds: TRAIL-1 must not come to mean a second thing.
    expect(next.body.key).toBe('TRAIL-2')
  })

  it('returns 404 for a ticket the caller cannot see', async () => {
    const { agent, projectId } = await withProject()
    const t = await agent.post(`/api/projects/${projectId}/tickets`).send({ title: 'X' })
    const other = await stranger()
    expect((await other.delete(`/api/tickets/${t.body.id}`)).status).toBe(404)
  })
})
```

- [ ] **Step 2: Run and confirm they fail.**

- [ ] **Step 3: Implement both in `server/src/services/ticket.service.ts`**

```ts
/** Resolves a ticket plus its project key and the caller's context, or 404. */
async function locate(db: Kysely<Database>, userId: string, ticketId: string) {
  const owning = await db.selectFrom('tickets')
    .innerJoin('projects', 'projects.id', 'tickets.project_id')
    .select(['tickets.project_id', 'tickets.assignee_id', 'projects.key'])
    .where('tickets.id', '=', ticketId)
    .executeTakeFirst()
  if (!owning) throw NOT_FOUND()

  const ctx = await projectContext(db, userId, owning.project_id)
  if (!ctx || !canView(ctx)) throw NOT_FOUND()
  return { owning, ctx }
}

export async function getTicket(
  db: Kysely<Database>, userId: string, ticketId: string,
): Promise<TicketView> {
  const { owning } = await locate(db, userId, ticketId)
  const row = await db.selectFrom('tickets')
    .select(['id', 'number', 'title', 'description', 'status', 'priority',
             'assignee_id', 'reporter_id', 'created_at'])
    .where('id', '=', ticketId).executeTakeFirstOrThrow()
  return toView(row as Row, owning.key)
}

export async function deleteTicket(
  db: Kysely<Database>, userId: string, ticketId: string,
): Promise<void> {
  const { owning, ctx } = await locate(db, userId, ticketId)
  if (!canEditTicket(ctx, { assigneeId: owning.assignee_id })) {
    throw new AppError('FORBIDDEN', 'You cannot delete that ticket.', 403)
  }
  await db.deleteFrom('tickets').where('id', '=', ticketId).execute()
}
```

Refactor `updateTicket` to use `locate` too, so the lookup-and-authorise
sequence exists once rather than three times.

- [ ] **Step 4: Add both routes to `server/src/routes/ticket.routes.ts`**

```ts
r.get('/:id', async (req, res, next) => {
  try {
    res.json(await getTicket(db, req.userId!, req.params.id!))
  } catch (err) { next(err) }
})

r.delete('/:id', async (req, res, next) => {
  try {
    await deleteTicket(db, req.userId!, req.params.id!)
    res.status(204).end()
  } catch (err) { next(err) }
})
```

- [ ] **Step 5: Run and confirm they pass**, then commit.

---

## Task 3: The ticket detail page

**Interfaces:**
- Consumes: `endpoints`, `Ticket`, `TICKET_STATUSES`, `TICKET_PRIORITIES`.
- Produces: `endpoints.getTicket`, `endpoints.deleteTicket`, `endpoints.updateProject`; a `TicketPage` component at route `/tickets/:id`; each board card links to it.

- [ ] **Step 1: Extend `client/src/api/endpoints.ts`**

```ts
  getTicket: (id: string) => api<Ticket>(`/tickets/${id}`),
  deleteTicket: (id: string) => api<void>(`/tickets/${id}`, { method: 'DELETE' }),
  updateProject: (id: string, i: UpdateProjectInput) =>
    api<Project>(`/projects/${id}`, { method: 'PATCH', body: JSON.stringify(i) }),
```

- [ ] **Step 2: Create `client/src/routes/TicketPage.tsx`** — loads one ticket,
edits title, description, status and priority in a single form, and deletes it
behind a confirmation. On delete, navigate back to the board.

The edit form submits only *changed* fields, because `updateTicketSchema`
rejects an empty patch and there is no reason to rewrite untouched columns.

- [ ] **Step 3: Link each board card to its ticket**

In `client/src/components/Board.tsx`, wrap the key in a link:

```tsx
<Link to={`/tickets/${t.id}`}><strong>{t.key}</strong></Link> {t.title}
```

`Board` now needs `import { Link } from 'react-router-dom'`.

- [ ] **Step 4: Add a priority select to `NewTicketForm`**, defaulting to
`medium`, using `TICKET_PRIORITIES` from `@trail/shared`.

- [ ] **Step 5: Register the route in `client/src/main.tsx`**

```tsx
<Route path="/tickets/:id" element={<TicketPage />} />
```

- [ ] **Step 6: `npx tsc --noEmit`** must exit 0, then commit.

---

## Task 4: Project switcher, rename and archive in the UI

**Interfaces:**
- Consumes: `endpoints.updateProject`, `endpoints.listProjects`.
- Produces: a project switcher on the board page; rename and archive controls on the project list.

- [ ] **Step 1: Add a switcher to `BoardPage`** — a `<select>` of the caller's
projects that navigates to the chosen board. It reuses `endpoints.listProjects`,
so it costs one request and no new endpoint.

- [ ] **Step 2: Add rename and archive controls to `ProjectListPage`** — an
inline rename field per project, and an Archive button that calls
`updateProject(id, { archived: true })` and drops the row from the list.

Archive is phrased as "Archive", never "Delete", because it is reversible and
the wording is the only thing telling the user so.

- [ ] **Step 3: `npx tsc --noEmit`** must exit 0, then commit.

---

## Task 5: Extend the smoke test and verify the increment

- [ ] **Step 1: Extend `e2e/smoke.spec.ts`** after the existing Done assertion:
open the ticket by its key, change its priority to `urgent`, save, return to the
board, and confirm the change survives a reload. Then delete the ticket and
confirm the board no longer shows it.

- [ ] **Step 2: Run all three gates**

```bash
npx vitest run        # every unit and integration test
npx tsc --noEmit      # exit 0
npx playwright test   # with both dev servers running
```

- [ ] **Step 3: Commit, and move TRAIL-2 to Done in Trail itself.**

---

## Coverage against the spec

| Spec §9 INC 2 requirement | Task |
|---|---|
| Create projects | Already shipped in INC 1 |
| Rename projects | Task 1 (API), Task 4 (UI) |
| Archive projects | Task 1 (API), Task 4 (UI) |
| Project switcher | Task 4 |
| Ticket detail page | Task 3 |
| Edit a ticket | Task 3 (API existed in INC 1) |
| Delete a ticket | Task 2 (API), Task 3 (UI) |
| Priority exposed | Task 3 |

**First caller of `canManageProject`** — the gap INC 1's coverage table flagged
honestly — closes in Task 1.
