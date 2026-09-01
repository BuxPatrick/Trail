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

/** Statuses that count as finished work and are excluded from the homepage. */
export const CLOSED_STATUSES: readonly TicketStatus[] = ['done', 'closed']
