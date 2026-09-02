import type {
  CreateProjectInput, CreateTicketInput,
  TicketPriority, TicketStatus, UpdateProjectInput, UpdateTicketInput,
} from '@trail/shared'
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

export type TaskItem = Ticket & {
  projectId: string
  projectName: string
  projectKey: string
}

const post = (body: unknown) => ({ method: 'POST', body: JSON.stringify(body) })

export const endpoints = {
  me: () => api<PublicUser>('/me'),
  listMyTasks: () => api<TaskItem[]>('/me/tasks'),

  listProjects: () => api<Project[]>('/projects'),
  createProject: (i: CreateProjectInput) => api<Project>('/projects', post(i)),
  getProject: (id: string) => api<Project>(`/projects/${id}`),
  updateProject: (id: string, i: UpdateProjectInput) =>
    api<Project>(`/projects/${id}`, { method: 'PATCH', body: JSON.stringify(i) }),

  listTickets: (projectId: string) =>
    api<Ticket[]>(`/projects/${projectId}/tickets`),
  createTicket: (projectId: string, i: CreateTicketInput) =>
    api<Ticket>(`/projects/${projectId}/tickets`, post(i)),
  updateTicket: (id: string, i: UpdateTicketInput) =>
    api<Ticket>(`/tickets/${id}`, { method: 'PATCH', body: JSON.stringify(i) }),
  getTicket: (id: string) => api<Ticket>(`/tickets/${id}`),
  deleteTicket: (id: string) => api<void>(`/tickets/${id}`, { method: 'DELETE' }),
}
