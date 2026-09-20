import { env } from 'cloudflare:workers';
import { createRemoteJWKSet, jwtVerify } from 'jose';

export type User = NonNullable<App.Locals['user']>;

let cachedJwks: ReturnType<typeof createRemoteJWKSet> | undefined;
let cachedTeam: string | undefined;

export async function resolveUser(request: Request): Promise<User | null> {
  const hostname = new URL(request.url).hostname;
  let email: string | undefined;

  if (import.meta.env.DEV && (hostname === 'localhost' || hostname === '127.0.0.1')) {
    email = env.DEV_AUTH_EMAIL;
  } else if (env.ACCESS_TEAM_DOMAIN && env.ACCESS_AUD) {
    const token = request.headers.get('Cf-Access-Jwt-Assertion');
    if (!token) return null;
    try {
      const team = env.ACCESS_TEAM_DOMAIN.replace(/^https?:\/\//, '').replace(/\/$/, '');
      if (!cachedJwks || cachedTeam !== team) {
        cachedJwks = createRemoteJWKSet(new URL(`https://${team}/cdn-cgi/access/certs`));
        cachedTeam = team;
      }
      const { payload } = await jwtVerify(token, cachedJwks, {
        issuer: `https://${team}`,
        audience: env.ACCESS_AUD,
      });
      if (typeof payload.email === 'string') email = payload.email;
    } catch {
      return null;
    }
  }

  if (!email) return null;
  return (await env.DB.prepare('SELECT id, email, role FROM users WHERE lower(email) = lower(?)')
    .bind(email)
    .first<User>()) ?? null;
}

export function canEdit(user: User, authorId: string): boolean {
  return user.role !== 'author' || user.id === authorId;
}

export function canPublish(user: User): boolean {
  return user.role === 'owner' || user.role === 'editor';
}
