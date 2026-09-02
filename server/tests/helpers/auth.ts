import type { NeonClaims } from '../../src/auth/verify.js'

/**
 * Tests must not depend on Neon issuing real tokens. Each test file mocks
 * `verifyToken` (see the vi.mock at the top of those files) so that a "token"
 * is simply base64url-encoded claims - which keeps the integration tests
 * exercising Trail's provisioning, permissions and routes rather than jose.
 *
 * The signature check itself is jose's job and is covered by its own tests.
 */
export function tokenFor(claims: Partial<NeonClaims> & { neonUserId: string }): string {
  const full: NeonClaims = {
    neonUserId: claims.neonUserId,
    email: claims.email ?? `${claims.neonUserId}@example.com`,
    displayName: claims.displayName ?? claims.neonUserId,
  }
  return Buffer.from(JSON.stringify(full)).toString('base64url')
}

/** The mock implementation each test file installs for verifyToken. */
export function fakeVerifyToken(token: string): Promise<NeonClaims | null> {
  try {
    return Promise.resolve(
      JSON.parse(Buffer.from(token, 'base64url').toString('utf8')) as NeonClaims,
    )
  } catch {
    return Promise.resolve(null)
  }
}

export const PATRICK = tokenFor({
  neonUserId: 'neon-patrick', email: 'patrick@example.com', displayName: 'Patrick',
})
export const AMA = tokenFor({
  neonUserId: 'neon-ama', email: 'ama@example.com', displayName: 'Ama',
})

/** Header helper: supertest `.set(...bearer(TOKEN))` reads cleanly. */
export const bearer = (token: string) =>
  ['Authorization', `Bearer ${token}`] as const
