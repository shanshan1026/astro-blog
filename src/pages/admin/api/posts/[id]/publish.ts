import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { canPublish } from '../../../../../lib/auth';
import { parseDocument, renderDocument, validSlug } from '../../../../../lib/content';
import { failure, json, sameOrigin } from '../../../../../lib/http';
import { getPost } from '../../../../../lib/posts';

export const POST: APIRoute = async ({ locals, params, request }) => {
  if (!locals.user) return failure('Unauthorized', 401);
  if (!canPublish(locals.user)) return failure('Only editors can publish', 403);
  if (!sameOrigin(request)) return failure('Invalid origin', 403);
  const post = await getPost(params.id ?? '');
  if (!post) return failure('Post not found', 404);
  if (!post.title.trim() || !validSlug(post.slug)) return failure('A title and valid slug are required');

  let body: unknown;
  try { body = JSON.parse(post.draft_json); } catch { return failure('Draft content is invalid'); }
  let mediaIds: string[];
  let html: string;
  try {
    mediaIds = parseDocument(body).mediaIds;
    html = renderDocument(body);
  } catch (error) { return failure(error instanceof Error ? error.message : 'Invalid content'); }
  if (post.cover_media_id) mediaIds.push(post.cover_media_id);
  mediaIds = [...new Set(mediaIds)];
  for (const id of mediaIds) {
    const record = await env.DB.prepare('SELECT object_key FROM media WHERE id = ?').bind(id).first<{ object_key: string }>();
    if (!record || !(await env.MEDIA.head(record.object_key))) return failure(`Missing image: ${id}`);
  }

  const revisionId = crypto.randomUUID();
  const statements = [
    env.DB.prepare(`
      INSERT INTO post_revisions (id, post_id, title, slug, excerpt, body_json, body_html, cover_media_id, created_by)
      SELECT ?, id, title, slug, excerpt, draft_json, ?, cover_media_id, ?
      FROM posts WHERE id = ? AND version = ?
    `).bind(revisionId, html, locals.user.id, post.id, post.version),
    env.DB.prepare(`
      UPDATE posts SET published_revision_id = ?, published_slug = slug, status = 'published',
        published_at = CURRENT_TIMESTAMP, version = version + 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND version = ?
    `).bind(revisionId, post.id, post.version),
    ...mediaIds.map((id) => env.DB.prepare(`
      UPDATE media SET is_public = 1 WHERE id = ?
        AND EXISTS (SELECT 1 FROM posts WHERE id = ? AND published_revision_id = ?)
    `).bind(id, post.id, revisionId)),
  ];
  try {
    const result = await env.DB.batch(statements);
    if (result[0].meta.changes !== 1 || result[1].meta.changes !== 1) return failure('Draft changed. Reload before publishing.', 409);
  } catch (error) {
    if (String(error).includes('UNIQUE')) return failure('That published URL is already in use', 409);
    throw error;
  }
  return json({ revisionId, slug: post.slug, version: post.version + 1 });
};
