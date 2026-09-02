import type { Kysely } from 'kysely'
import type { CreateProjectInput, UpdateProjectInput } from '@mira/shared'
import type { Database } from '../db/types.js'
import { AppError } from '../errors.js'
import { canManageProject, canView } from '../permissions/index.js'
import { projectContext } from './context.js'

export type ProjectSummary = {
  id: string
  name: string
  key: string
  description: string | null
  workspaceId: string
}

const NOT_FOUND = () => new AppError('PROJECT_NOT_FOUND', 'No such project.', 404)

function baseProjectKey(name: string): string {
  const words = name.toUpperCase().match(/[A-Z0-9]+/g) ?? []
  const initials = words
    .map(word => word.match(/[A-Z]/)?.[0])
    .filter((letter): letter is string => Boolean(letter))

  const raw = initials.length > 1
    ? initials.slice(0, 4).join('')
    : (words.join('').match(/[A-Z]/g) ?? []).join('').slice(0, 3)

  return (raw || 'PRJ').padEnd(2, 'X')
}

async function nextProjectKey(
  db: Kysely<Database>,
  workspaceId: string,
  name: string,
): Promise<string> {
  const base = baseProjectKey(name)
  const rows = await db.selectFrom('projects')
    .select('key')
    .where('workspace_id', '=', workspaceId)
    .where('key', 'like', `${base}%`)
    .execute()
  const existing = new Set(rows.map(r => r.key))

  if (!existing.has(base)) return base

  for (let n = 2; n < 1000; n += 1) {
    const suffix = String(n)
    const candidate = `${base.slice(0, 10 - suffix.length)}${suffix}`
    if (!existing.has(candidate)) return candidate
  }

  throw new AppError('KEY_SPACE_EXHAUSTED',
    'Mira could not generate a project key for that name.', 409)
}

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
  _userId: string,
  workspaceId: string,
  input: CreateProjectInput,
): Promise<ProjectSummary> {
  const key = await nextProjectKey(db, workspaceId, input.name)

  const row = await db.insertInto('projects').values({
    workspace_id: workspaceId,
    name: input.name,
    key,
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
  // Same 404 whether it is missing or merely invisible - a 403 would confirm
  // that someone else's project exists. See spec section 7.
  if (!ctx || !canView(ctx)) throw NOT_FOUND()

  const row = await db.selectFrom('projects')
    .select(['id', 'name', 'key', 'description', 'workspace_id'])
    .where('id', '=', projectId).executeTakeFirstOrThrow()

  return {
    id: row.id, name: row.name, key: row.key,
    description: row.description, workspaceId: row.workspace_id,
  }
}

export async function updateProject(
  db: Kysely<Database>,
  userId: string,
  projectId: string,
  input: UpdateProjectInput,
): Promise<ProjectSummary> {
  const ctx = await projectContext(db, userId, projectId)
  if (!ctx || !canView(ctx)) throw NOT_FOUND()
  // First caller of canManageProject: admin-only in BOTH modes (spec 4.3).
  // A non-admin member gets 404, not 403 - they may know the project exists,
  // but not that they were specifically refused.
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
