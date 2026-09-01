import type {
  CreateProjectInput, CreateTicketInput, LoginInput, SignupInput,
  TicketPriority, TicketStatus, UpdateTicketInput,
} from '@mira/shared'
import { api } from './client.js'

export type PublicUser = { id: string; email: string; displayName: string }

export type Project = {
  id: string; name: string; key: string
  description: string | null; workspaceId: string
}

export type Ticket = {
  id: string; key: string; number: number; title: string
  description: string | null; status: TicketStatus; priority: TicketPriority
  assigneeId: string | null; reporterId: string; createdAt: string
}

const post = (body: unknown) => ({ method: 'POST', body: JSON.stringify(body) })

export const endpoints = {
  signup: (i: SignupInput) => api<PublicUser>('/auth/signup', post(i)),
  login: (i: LoginInput) => api<PublicUser>('/auth/login', post(i)),
  logout: () => api<void>('/auth/logout', { method: 'POST' }),
  me: () => api<PublicUser>('/me'),

  listProjects: () => api<Project[]>('/projects'),
  createProject: (i: CreateProjectInput) => api<Project>('/projects', post(i)),
  getProject: (id: string) => api<Project>(`/projects/${id}`),

  listTickets: (projectId: string) =>
    api<Ticket[]>(`/projects/${projectId}/tickets`),
  createTicket: (projectId: string, i: CreateTicketInput) =>
    api<Ticket>(`/projects/${projectId}/tickets`, post(i)),
  updateTicket: (id: string, i: UpdateTicketInput) =>
    api<Ticket>(`/tickets/${id}`, { method: 'PATCH', body: JSON.stringify(i) }),
}
