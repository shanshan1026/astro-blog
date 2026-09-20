import { defineMiddleware } from 'astro:middleware';
import { env } from 'cloudflare:workers';
import { resolveUser } from './lib/auth';

export const onRequest = defineMiddleware(async (context, next) => {
  const url = new URL(context.request.url);
  if (url.pathname !== '/admin' && !url.pathname.startsWith('/admin/')) return next();

  if (env.ADMIN_HOST && !import.meta.env.DEV && url.hostname !== env.ADMIN_HOST) {
    return new Response('Not found', { status: 404 });
  }

  const user = await resolveUser(context.request);
  if (!user) return new Response('Admin access denied. Sign in through Cloudflare Access.', { status: 401 });
  context.locals.user = user;
  const response = await next();
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
});
