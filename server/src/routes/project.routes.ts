import { Router } from 'express'
import type { Kysely } from 'kysely'
import { createProjectSchema, updateProjectSchema } from '@mira/shared'
import type { Database } from '../db/types.js'
import { AppError } from '../errors.js'
import { requireUser } from '../auth/middleware.js'
import {
  createProject, getProject, listMyProjects, personalWorkspaceId, updateProject,
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

  return r
}
