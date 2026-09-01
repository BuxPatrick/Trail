import argon2 from 'argon2'

export function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, { type: argon2.argon2id })
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain)
  } catch {
    // A malformed hash throws rather than returning false. Treat that as a
    // failed login, not a 500 — otherwise one corrupt row becomes an outage.
    return false
  }
}
