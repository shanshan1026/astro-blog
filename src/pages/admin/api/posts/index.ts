import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { EMPTY_DOC } from '../../../../lib/content';
import { failure, json, sameOrigin } from '../../../../lib/http';

export const POST: APIRoute = async ({ locals, request }) => {
  if (!locals.user) return failure('Unauthorized', 401);
  if (!sameOrigin(request)) return failure('Invalid origin', 403);
  const id = crypto.randomUUID();
  await env.DB.prepare('INSERT INTO posts (id, draft_json, author_id) VALUES (?, ?, ?)')
    .bind(id, JSON.stringify(EMPTY_DOC), locals.user.id).run();
  return json({ id }, 201);
};
