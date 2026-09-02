import { sql, type Kysely } from 'kysely'
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
  assignee_id: string | null; reporter_id: string; created_at: any
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

  // INC 1 is single-user, so the reporter is always the assignee. INC 4 makes
  // the assignee a request field; the permission call is already here for it.
  const assigneeId = userId
  if (!canCreateTicket(ctx, assigneeId)) {
    throw new AppError('FORBIDDEN', 'You cannot create that ticket.', 403)
  }

  return db.transaction().execute(async trx => {
    // Atomic: UPDATE ... RETURNING takes a row lock, so concurrent creates
    // queue rather than racing. SELECT max(number)+1 would hand out duplicates.
    const counter = await trx.updateTable('projects')
      .set({ ticket_counter: sql<number>`ticket_counter + 1` })
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
  // Invisible and missing produce the same 404. See spec section 7.
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
      updated_at: sql`now()`,
    })
    .where('id', '=', ticketId)
    .returning(['id', 'number', 'title', 'description', 'status', 'priority',
                'assignee_id', 'reporter_id', 'created_at'])
    .executeTakeFirstOrThrow()

  return toView(row as Row, owning.key)
}
