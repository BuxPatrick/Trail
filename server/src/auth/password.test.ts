import { describe, it, expect } from 'vitest'
import { hashPassword, verifyPassword } from './password.js'

describe('password hashing', () => {
  it('verifies a correct password', async () => {
    const hash = await hashPassword('correct horse battery')
    expect(await verifyPassword(hash, 'correct horse battery')).toBe(true)
  })

  it('rejects an incorrect password', async () => {
    const hash = await hashPassword('correct horse battery')
    expect(await verifyPassword(hash, 'wrong horse battery')).toBe(false)
  })

  it('produces a different hash each time (the salt is random)', async () => {
    const a = await hashPassword('correct horse battery')
    const b = await hashPassword('correct horse battery')
    expect(a).not.toBe(b)
  })

  it('produces an argon2id hash', async () => {
    expect(await hashPassword('correct horse battery')).toMatch(/^\$argon2id\$/)
  })

  it('returns false rather than throwing on a malformed hash', async () => {
    expect(await verifyPassword('not-a-hash', 'anything')).toBe(false)
  })
})
