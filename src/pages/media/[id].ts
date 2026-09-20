import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { resolveUser } from '../../lib/auth';

export const GET: APIRoute = async ({ params, request }) => {
  const media = await env.DB.prepare('SELECT object_key, content_type, is_public FROM media WHERE id = ?')
    .bind(params.id).first<{ object_key: string; content_type: string; is_public: number }>();
  if (!media) return new Response('Not found', { status: 404 });
  if (!media.is_public && !(await resolveUser(request))) return new Response('Not found', { status: 404 });
  const object = await env.MEDIA.get(media.object_key);
  if (!object) return new Response('Not found', { status: 404 });
  return new Response(object.body as unknown as ReadableStream, {
    headers: {
      'Content-Type': media.content_type,
      'Content-Length': String(object.size),
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': media.is_public ? 'public, max-age=3600' : 'private, no-store',
    },
  });
};
