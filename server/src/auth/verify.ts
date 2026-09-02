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
const jwks = jose.createRemoteJWKSet(
  new URL('/.well-known/jwks.json', config.neonAuthUrl),
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
  } catch {
    // Expired, malformed, wrong signature - all are simply "not authenticated".
    return null
  }
}
