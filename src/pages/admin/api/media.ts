import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { failure, json, sameOrigin } from '../../../lib/http';

const MAX_BYTES = 8 * 1024 * 1024;

function detectType(bytes: Uint8Array): { type: string; ext: string } | null {
  if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return { type: 'image/png', ext: 'png' };
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { type: 'image/jpeg', ext: 'jpg' };
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') return { type: 'image/webp', ext: 'webp' };
  return null;
}

export const POST: APIRoute = async ({ locals, request }) => {
  if (!locals.user) return failure('Unauthorized', 401);
  if (!sameOrigin(request)) return failure('Invalid origin', 403);
  const form = await request.formData();
  const file = form.get('file');
  const alt = form.get('alt');
  if (!(file instanceof File) || file.size === 0 || file.size > MAX_BYTES) return failure('Upload a PNG, JPEG, or WebP image up to 8 MB');
  if (typeof alt !== 'string' || alt.trim().length === 0 || alt.length > 500) return failure('Alt text is required');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const detected = detectType(bytes);
  if (!detected || file.type !== detected.type) return failure('File content does not match a supported image type');
  const id = crypto.randomUUID();
  const key = `${id}.${detected.ext}`;
  await env.MEDIA.put(key, bytes, { httpMetadata: { contentType: detected.type } });
  try {
    await env.DB.prepare(`
      INSERT INTO media (id, object_key, filename, content_type, byte_size, alt_text, uploaded_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(id, key, file.name.slice(0, 255), detected.type, file.size, alt.trim(), locals.user.id).run();
  } catch (error) {
    await env.MEDIA.delete(key);
    throw error;
  }
  return json({ id, url: `/media/${id}`, alt: alt.trim() }, 201);
};
