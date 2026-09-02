import { Router } from 'express'
import type { Kysely } from 'kysely'
import { createTicketSchema, updateTicketSchema } from '@trail/shared'
import type { Database } from '../db/types.js'
import { AppError } from '../errors.js'
import { requireUser } from '../auth/middleware.js'
import {
  createTicket, deleteTicket, getTicket, listTickets, updateTicket,
} from '../services/ticket.service.js'

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

  return r
}
