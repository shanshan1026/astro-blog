import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { canPublish } from '../../../../../lib/auth';
import { failure, json, sameOrigin } from '../../../../../lib/http';

export const POST: APIRoute = async ({ locals, params, request }) => {
  if (!locals.user) return failure('Unauthorized', 401);
  if (!canPublish(locals.user)) return failure('Only editors can unpublish', 403);
  if (!sameOrigin(request)) return failure('Invalid origin', 403);
  const result = await env.DB.prepare(`
    UPDATE posts SET status = 'draft', published_slug = NULL, published_revision_id = NULL,
      version = version + 1, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND status = 'published'
  `).bind(params.id).run();
  if (result.meta.changes !== 1) return failure('Published post not found', 404);
  return json({ status: 'draft' });
};
