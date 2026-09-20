import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { canEdit } from '../../../../lib/auth';
import { parseDocument, validSlug } from '../../../../lib/content';
import { failure, json, sameOrigin } from '../../../../lib/http';
import { getPost } from '../../../../lib/posts';

export const PUT: APIRoute = async ({ locals, params, request }) => {
  if (!locals.user) return failure('Unauthorized', 401);
  if (!sameOrigin(request)) return failure('Invalid origin', 403);
  const post = await getPost(params.id ?? '');
  if (!post) return failure('Post not found', 404);
  if (!canEdit(locals.user, post.author_id)) return failure('Forbidden', 403);

  let data: Record<string, unknown>;
  try { data = await request.json(); } catch { return failure('Invalid JSON'); }
  const { title, slug, excerpt, body, coverMediaId, version } = data;
  if (typeof title !== 'string' || title.length > 200 ||
      typeof slug !== 'string' || (slug !== '' && !validSlug(slug)) ||
      typeof excerpt !== 'string' || excerpt.length > 500 ||
      !Number.isInteger(version)) return failure('Invalid post fields');
  if (coverMediaId !== null && coverMediaId !== undefined && typeof coverMediaId !== 'string') return failure('Invalid cover image');
  try { parseDocument(body); } catch (error) { return failure(error instanceof Error ? error.message : 'Invalid content'); }
  if (coverMediaId) {
    const exists = await env.DB.prepare('SELECT id FROM media WHERE id = ?').bind(coverMediaId).first();
    if (!exists) return failure('Cover image not found');
  }

  const result = await env.DB.prepare(`
    UPDATE posts SET title = ?, slug = ?, excerpt = ?, draft_json = ?, cover_media_id = ?,
      version = version + 1, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND version = ?
  `).bind(title.trim(), slug.trim(), excerpt.trim(), JSON.stringify(body), coverMediaId || null, post.id, version).run();
  if (result.meta.changes !== 1) return failure('This post changed elsewhere. Reload before saving.', 409);
  return json({ version: Number(version) + 1 });
};
