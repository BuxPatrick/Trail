import { z } from 'zod'
import { TICKET_STATUSES, TICKET_PRIORITIES } from './enums.js'

export const signupSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(12, 'Password must be at least 12 characters'),
  displayName: z.string().trim().min(1).max(80),
})
export type SignupInput = z.infer<typeof signupSchema>

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
})
export type LoginInput = z.infer<typeof loginSchema>

export const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(120),
  key: z.string().trim().toUpperCase().regex(
    /^[A-Z][A-Z0-9]{1,9}$/,
    'Key must be 2-10 characters, start with a letter, letters and digits only',
  ),
  description: z.string().trim().max(2000).optional(),
})
export type CreateProjectInput = z.infer<typeof createProjectSchema>

export const createTicketSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(10000).optional(),
  status: z.enum(TICKET_STATUSES).default('backlog'),
  priority: z.enum(TICKET_PRIORITIES).default('medium'),
})
export type CreateTicketInput = z.infer<typeof createTicketSchema>

export const updateTicketSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(10000).optional(),
  status: z.enum(TICKET_STATUSES).optional(),
  priority: z.enum(TICKET_PRIORITIES).optional(),
}).refine(v => Object.keys(v).length > 0, { message: 'No fields to update' })
export type UpdateTicketInput = z.infer<typeof updateTicketSchema>
