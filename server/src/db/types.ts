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
