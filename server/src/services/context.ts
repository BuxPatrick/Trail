import type { Kysely } from 'kysely'
import type { Database } from '../db/types.js'
import { effectiveMode, type PermissionContext } from '../permissions/index.js'

/**
 * The single bridge between the database and the permission module.
 * One query resolves the project, its effective mode, and the caller's role.
 * Returns null when the project does not exist - callers turn that into a 404,
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
