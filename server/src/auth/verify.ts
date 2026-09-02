import * as jose from 'jose'
import { config } from '../config.js'

export type NeonClaims = {
  /** The Neon Auth subject - stable, unique per user. */
  neonUserId: string
  email: string
  displayName: string
}

/**
 * The JWKS lives at a project-specific URL, so a valid signature already
 * proves the token was issued for THIS Neon project. jose caches and
 * refreshes the key set, so this is a local check with no per-request
 * network call after the first.
 */
// String concatenation, NOT new URL('/.well-known/...', base): a leading
// slash resolves against the ORIGIN and would silently drop the /neondb/auth
// path, fetching a 404 and rejecting every valid token.
const jwks = jose.createRemoteJWKSet(
  new URL(`${config.neonAuthUrl.replace(/\/$/, '')}/.well-known/jwks.json`),
)

/** Verifies a bearer token and pulls out the claims Mira needs. */
export async function verifyToken(token: string): Promise<NeonClaims | null> {
  try {
    const { payload } = await jose.jwtVerify(token, jwks)
    const sub = payload.sub
    if (!sub) return null

    const email = typeof payload.email === 'string' ? payload.email : ''
    const name =
      typeof payload.name === 'string' && payload.name.trim()
        ? payload.name.trim()
        // Neon does not require a display name, and an empty one would break
        // the not-null column. The local part of the email is a decent stand-in.
        : (email.split('@')[0] || 'User')

    return { neonUserId: sub, email, displayName: name }
  } catch (err) {
    // Expired, malformed or wrong-signature tokens are all just "not
    // authenticated" to the caller - but log the reason, because a
    // misconfigured JWKS URL looks identical from outside and is otherwise
    // very hard to tell apart from a genuinely bad token.
    console.warn('[auth] token verification failed:',
      err instanceof Error ? err.message : err)
    return null
  }
}
