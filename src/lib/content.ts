import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import { renderToHTMLString } from '@tiptap/static-renderer/pm/html-string';

export const EMPTY_DOC = { type: 'doc', content: [{ type: 'paragraph' }] };
export const extensions = [StarterKit, Image];
const nodeTypes = new Set(['doc', 'paragraph', 'text', 'heading', 'bulletList', 'orderedList', 'listItem', 'blockquote', 'codeBlock', 'hardBreak', 'horizontalRule', 'image']);
const markTypes = new Set(['bold', 'italic', 'strike', 'code']);
const mediaPath = /^\/media\/([0-9a-f-]{36})$/i;

export function parseDocument(input: unknown): { document: Record<string, unknown>; mediaIds: string[] } {
  const mediaIds = new Set<string>();
  let count = 0;
  const walk = (node: unknown, depth: number): void => {
    if (!node || typeof node !== 'object' || Array.isArray(node) || depth > 30 || ++count > 5000) throw new Error('Invalid document');
    const value = node as Record<string, unknown>;
    if (typeof value.type !== 'string' || !nodeTypes.has(value.type)) throw new Error('Unsupported content block');
    if (Object.keys(value).some((key) => !['type', 'text', 'attrs', 'marks', 'content'].includes(key))) throw new Error('Unsupported content property');
    if (value.type === 'text' && (typeof value.text !== 'string' || value.text.length > 100000)) throw new Error('Invalid text');
    if (value.type === 'image') {
      const attrs = value.attrs as Record<string, unknown> | undefined;
      const match = typeof attrs?.src === 'string' ? attrs.src.match(mediaPath) : null;
      if (!match) throw new Error('Images must be uploaded to this site');
      if (attrs?.alt != null && (typeof attrs.alt !== 'string' || attrs.alt.length > 500)) throw new Error('Invalid image alt text');
      if (attrs && Object.keys(attrs).some((key) => !['src', 'alt', 'title'].includes(key))) throw new Error('Unsupported image attribute');
      if (attrs?.title != null && (typeof attrs.title !== 'string' || attrs.title.length > 500)) throw new Error('Invalid image title');
      mediaIds.add(match[1]);
    } else if (value.type === 'heading') {
      const attrs = value.attrs as Record<string, unknown> | undefined;
      const level = attrs?.level;
      if (![1, 2, 3].includes(level as number)) throw new Error('Invalid heading');
      if (attrs && Object.keys(attrs).some((key) => key !== 'level')) throw new Error('Unsupported heading attribute');
    } else if (value.type === 'orderedList') {
      const attrs = value.attrs as Record<string, unknown> | undefined;
      if (attrs && (Object.keys(attrs).some((key) => key !== 'start') || (attrs.start != null && (!Number.isInteger(attrs.start) || Number(attrs.start) < 1)))) throw new Error('Invalid list');
    } else if (value.type === 'codeBlock') {
      const attrs = value.attrs as Record<string, unknown> | undefined;
      if (attrs && (Object.keys(attrs).some((key) => key !== 'language') || (attrs.language != null && (typeof attrs.language !== 'string' || !/^[a-z0-9-]{0,30}$/i.test(attrs.language))))) throw new Error('Invalid code block');
    } else if (value.attrs && Object.keys(value.attrs as object).length > 0) {
      throw new Error('Unsupported block attributes');
    }
    if (value.marks !== undefined) {
      if (!Array.isArray(value.marks)) throw new Error('Invalid formatting');
      for (const mark of value.marks) {
        if (!mark || typeof mark !== 'object' || !markTypes.has(mark.type) || (mark.attrs && Object.keys(mark.attrs).length)) throw new Error('Unsupported formatting');
      }
    }
    if (value.content !== undefined) {
      if (!Array.isArray(value.content)) throw new Error('Invalid content');
      value.content.forEach((child) => walk(child, depth + 1));
    }
  };
  walk(input, 0);
  if ((input as { type?: string }).type !== 'doc') throw new Error('Document root required');
  if (JSON.stringify(input).length > 500000) throw new Error('Post is too large');
  return { document: input as Record<string, unknown>, mediaIds: [...mediaIds] };
}

export function renderDocument(input: unknown): string {
  const { document } = parseDocument(input);
  return renderToHTMLString({ extensions, content: document });
}

export function validSlug(value: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && value.length <= 120;
}
