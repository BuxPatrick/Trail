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
  // for themselves - including not "unassigned", which would otherwise produce
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
 * changing modes, inviting or removing people. Admin-only in BOTH modes -
 * "free-form" describes equality over the work, not permission to destroy
 * the container everyone shares. See spec 4.3.
 */
export function canManageProject(ctx: PermissionContext): boolean {
  return isAdmin(ctx)
}
