import { useCallback, useEffect, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';

interface EditorPost {
  id: string; title: string; slug: string; excerpt: string; body: Record<string, unknown>;
  coverMediaId: string | null; status: 'draft' | 'published'; version: number; publishedSlug: string | null;
}

function slugify(value: string) {
  return value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9\s-]/g, '').trim().replace(/[\s-]+/g, '-').slice(0, 120);
}

export default function PostEditor({ post, canPublish }: { post: EditorPost; canPublish: boolean }) {
  const [title, setTitle] = useState(post.title);
  const [slug, setSlug] = useState(post.slug);
  const [excerpt, setExcerpt] = useState(post.excerpt);
  const [coverMediaId, setCoverMediaId] = useState(post.coverMediaId);
  const [status, setStatus] = useState(post.status);
  const [message, setMessage] = useState('All changes saved');
  const [busy, setBusy] = useState(false);
  const [alt, setAlt] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [publishedSlug, setPublishedSlug] = useState(post.publishedSlug);
  const versionRef = useRef(post.version);
  const editCount = useRef(0);
  const savedCount = useRef(0);
  const pending = useRef<Promise<boolean> | null>(null);
  const slugTouched = useRef(!!post.slug);

  const markDirty = useCallback(() => { editCount.current += 1; setMessage('Unsaved changes'); }, []);
  const editor = useEditor({
    extensions: [StarterKit, Image],
    content: post.body,
    immediatelyRender: false,
    onUpdate: markDirty,
  });

  const save = useCallback(async (): Promise<boolean> => {
    if (pending.current) await pending.current;
    if (!editor || savedCount.current === editCount.current) return true;
    const snapshot = editCount.current;
    const task = (async () => {
      setMessage('Saving…');
      try {
        const response = await fetch(`/admin/api/posts/${post.id}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, slug, excerpt, body: editor.getJSON(), coverMediaId, version: versionRef.current }),
        });
        const result = await response.json() as { error?: string; version: number };
        if (!response.ok) throw new Error(result.error || 'Save failed');
        versionRef.current = result.version;
        savedCount.current = snapshot;
        setMessage(editCount.current === snapshot ? 'All changes saved' : 'Unsaved changes');
        return true;
      } catch (error) { setMessage(error instanceof Error ? error.message : 'Save failed'); return false; }
    })();
    pending.current = task;
    const ok = await task;
    pending.current = null;
    return ok;
  }, [editor, title, slug, excerpt, coverMediaId, post.id]);

  useEffect(() => {
    const timer = setInterval(() => { if (editCount.current !== savedCount.current) void save(); }, 12000);
    return () => clearInterval(timer);
  }, [save]);

  async function preview() { if (await save()) window.open(`/admin/preview/${post.id}`, '_blank', 'noopener'); }
  async function publish() {
    if (!(await save())) return;
    setBusy(true);
    try {
      const response = await fetch(`/admin/api/posts/${post.id}/publish`, { method: 'POST' });
      const result = await response.json() as { error?: string; version: number; slug: string };
      if (!response.ok) throw new Error(result.error || 'Publish failed');
      versionRef.current = result.version;
      setStatus('published'); setPublishedSlug(result.slug); setMessage('Published successfully');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Publish failed'); }
    finally { setBusy(false); }
  }
  async function unpublish() {
    if (!confirm('Remove this post from the public site?')) return;
    setBusy(true);
    try {
      const response = await fetch(`/admin/api/posts/${post.id}/unpublish`, { method: 'POST' });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Unpublish failed');
      setStatus('draft'); setPublishedSlug(null); versionRef.current += 1; setMessage('Post unpublished');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unpublish failed'); }
    finally { setBusy(false); }
  }
  async function upload() {
    if (!file || !alt.trim() || !editor) { setMessage('Choose an image and add alt text'); return; }
    setUploading(true);
    try {
      const form = new FormData(); form.append('file', file); form.append('alt', alt.trim());
      const response = await fetch('/admin/api/media', { method: 'POST', body: form });
      const result = await response.json() as { error?: string; id: string; url: string; alt: string };
      if (!response.ok) throw new Error(result.error || 'Upload failed');
      editor.chain().focus().setImage({ src: result.url, alt: result.alt }).run();
      if (!coverMediaId) { setCoverMediaId(result.id); markDirty(); }
      setFile(null); setAlt(''); setMessage('Image added to post');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Upload failed'); }
    finally { setUploading(false); }
  }

  return <div className="editor-page">
    <div className="editor-top">
      <div><a className="back-link" href="/admin">← Posts</a><div className="editor-state"><span className={`status ${status}`}>{status}</span><span aria-live="polite">{message}</span></div></div>
      <div className="editor-actions">
        {publishedSlug && <a className="button subtle" href={`/blog/${publishedSlug}`} target="_blank" rel="noreferrer">View live</a>}
        <button className="button subtle" onClick={preview} disabled={busy}>Preview</button>
        <button className="button subtle" onClick={() => void save()} disabled={busy}>Save draft</button>
        {canPublish && (status === 'published' ? <button className="button subtle" onClick={unpublish} disabled={busy}>Unpublish</button> : null)}
        {canPublish && <button className="button primary" onClick={publish} disabled={busy}>Publish</button>}
      </div>
    </div>
    <div className="editor-layout">
      <section className="editor-canvas" aria-label="Post content">
        <input className="title-input" aria-label="Post title" placeholder="Your story title" value={title} onChange={(event) => {
          const next = event.target.value; setTitle(next);
          if (!slugTouched.current) setSlug(slugify(next));
          markDirty();
        }} />
        <textarea className="excerpt-input" aria-label="Post excerpt" placeholder="A short introduction to your story…" value={excerpt} maxLength={500} onChange={(event) => { setExcerpt(event.target.value); markDirty(); }} />
        <div className="editor-toolbar" aria-label="Formatting">
          <button title="Bold" aria-label="Bold" className={editor?.isActive('bold') ? 'active' : ''} onClick={() => editor?.chain().focus().toggleBold().run()}><strong>B</strong></button>
          <button title="Italic" aria-label="Italic" className={editor?.isActive('italic') ? 'active' : ''} onClick={() => editor?.chain().focus().toggleItalic().run()}><em>I</em></button>
          <button title="Heading" aria-label="Heading" className={editor?.isActive('heading', { level: 2 }) ? 'active' : ''} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}>H2</button>
          <button title="Bullet list" aria-label="Bullet list" className={editor?.isActive('bulletList') ? 'active' : ''} onClick={() => editor?.chain().focus().toggleBulletList().run()}>• List</button>
          <button title="Quote" aria-label="Quote" className={editor?.isActive('blockquote') ? 'active' : ''} onClick={() => editor?.chain().focus().toggleBlockquote().run()}>“ ”</button>
          <button title="Undo" aria-label="Undo" onClick={() => editor?.chain().focus().undo().run()}>↶</button>
          <button title="Redo" aria-label="Redo" onClick={() => editor?.chain().focus().redo().run()}>↷</button>
        </div>
        <EditorContent editor={editor} className="rich-editor prose" />
      </section>
      <aside className="editor-sidebar">
        <section><h2>Publishing</h2><label htmlFor="slug">URL slug</label><input id="slug" value={slug} placeholder="your-story-url" onChange={(event) => { slugTouched.current = true; setSlug(event.target.value); markDirty(); }} /><small>Lowercase letters, numbers, and hyphens.</small></section>
        <section><h2>Images</h2>{coverMediaId && <img className="cover-preview" src={`/media/${coverMediaId}`} alt="Current cover" />}
          <label htmlFor="image-file">Upload image</label><input id="image-file" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setFile(event.target.files?.[0] || null)} />
          <label htmlFor="image-alt">Alt text</label><input id="image-alt" value={alt} onChange={(event) => setAlt(event.target.value)} placeholder="Describe the image" />
          <button className="button subtle" onClick={upload} disabled={uploading}>{uploading ? 'Uploading…' : 'Upload and insert'}</button><small>PNG, JPEG, or WebP; maximum 8 MB. First image becomes the cover.</small>
        </section>
      </aside>
    </div>
  </div>;
}
