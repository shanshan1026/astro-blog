import { env } from 'cloudflare:workers';

export interface Post {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  draft_json: string;
  cover_media_id: string | null;
  published_revision_id: string | null;
  published_slug: string | null;
  status: 'draft' | 'published';
  version: number;
  author_id: string;
  updated_at: string;
  published_at: string | null;
}

export interface PublishedPost {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  body_html: string;
  cover_media_id: string | null;
  published_at: string;
}

export async function getPost(id: string): Promise<Post | null> {
  return (await env.DB.prepare('SELECT * FROM posts WHERE id = ?').bind(id).first<Post>()) ?? null;
}

export async function getPublished(slug: string): Promise<PublishedPost | null> {
  return (await env.DB.prepare(`
    SELECT p.id, r.title, r.slug, r.excerpt, r.body_html, r.cover_media_id, p.published_at
    FROM posts p JOIN post_revisions r ON r.id = p.published_revision_id
    WHERE p.status = 'published' AND p.published_slug = ?
  `).bind(slug).first<PublishedPost>()) ?? null;
}
