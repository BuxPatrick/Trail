import { describe, it, expect } from 'vitest'
import {
  effectiveMode, canView, canCreateTicket, canEditTicket, canManageProject,
  type PermissionContext,
} from './index.js'

const ME = 'user-me'
const OTHER = 'user-other'

const ctx = (
  role: PermissionContext['role'],
  mode: PermissionContext['mode'],
): PermissionContext => ({ userId: ME, role, mode })

describe('effectiveMode', () => {
  it('uses the project mode when it is set', () => {
    expect(effectiveMode('managed', 'free')).toBe('managed')
  })
  it('inherits the workspace mode when the project mode is null', () => {
    expect(effectiveMode(null, 'managed')).toBe('managed')
  })
})

describe('canView', () => {
  it('allows any member', () => {
    expect(canView(ctx('member', 'free'))).toBe(true)
    expect(canView(ctx('admin', 'managed'))).toBe(true)
  })
  it('denies a non-member', () => {
    expect(canView(ctx(null, 'free'))).toBe(false)
  })
})

describe('canCreateTicket - free mode', () => {
  it('lets a member create for anyone', () => {
    expect(canCreateTicket(ctx('member', 'free'), OTHER)).toBe(true)
  })
  it('lets a member create an unassigned ticket', () => {
    expect(canCreateTicket(ctx('member', 'free'), null)).toBe(true)
  })
  it('denies a non-member', () => {
    expect(canCreateTicket(ctx(null, 'free'), ME)).toBe(false)
  })
})

describe('canCreateTicket - managed mode', () => {
  it('lets the admin create for anyone', () => {
    expect(canCreateTicket(ctx('admin', 'managed'), OTHER)).toBe(true)
  })
  it('lets a member create for themselves', () => {
    expect(canCreateTicket(ctx('member', 'managed'), ME)).toBe(true)
  })
  it('stops a member creating work for someone else', () => {
    expect(canCreateTicket(ctx('member', 'managed'), OTHER)).toBe(false)
  })
  it('stops a member creating an UNASSIGNED ticket (spec 4.2)', () => {
    expect(canCreateTicket(ctx('member', 'managed'), null)).toBe(false)
  })
  it('lets the admin create an unassigned ticket', () => {
    expect(canCreateTicket(ctx('admin', 'managed'), null)).toBe(true)
  })
})

describe('canEditTicket - free mode', () => {
  it('lets a member edit a ticket belonging to someone else', () => {
    expect(canEditTicket(ctx('member', 'free'), { assigneeId: OTHER })).toBe(true)
  })
  it('denies a non-member', () => {
    expect(canEditTicket(ctx(null, 'free'), { assigneeId: ME })).toBe(false)
  })
})

describe('canEditTicket - managed mode', () => {
  it('lets the admin edit anything', () => {
    expect(canEditTicket(ctx('admin', 'managed'), { assigneeId: OTHER })).toBe(true)
  })
  it('lets a member edit their own ticket', () => {
    expect(canEditTicket(ctx('member', 'managed'), { assigneeId: ME })).toBe(true)
  })
  it('stops a member editing a ticket belonging to someone else', () => {
    expect(canEditTicket(ctx('member', 'managed'), { assigneeId: OTHER })).toBe(false)
  })
  it('stops a member editing an unassigned ticket', () => {
    expect(canEditTicket(ctx('member', 'managed'), { assigneeId: null })).toBe(false)
  })
  it('removes a member rights once the ticket is reassigned away (spec 4.2)', () => {
    const c = ctx('member', 'managed')
    expect(canEditTicket(c, { assigneeId: ME })).toBe(true)
    expect(canEditTicket(c, { assigneeId: OTHER })).toBe(false)
  })
})

describe('canManageProject - admin only in BOTH modes (spec 4.3)', () => {
  it('allows an admin in free mode', () => {
    expect(canManageProject(ctx('admin', 'free'))).toBe(true)
  })
  it('allows an admin in managed mode', () => {
    expect(canManageProject(ctx('admin', 'managed'))).toBe(true)
  })
  it('DENIES a member in free mode - equality is about work, not the container', () => {
    expect(canManageProject(ctx('member', 'free'))).toBe(false)
  })
  it('denies a member in managed mode', () => {
    expect(canManageProject(ctx('member', 'managed'))).toBe(false)
  })
  it('denies a non-member', () => {
    expect(canManageProject(ctx(null, 'free'))).toBe(false)
  })
})
