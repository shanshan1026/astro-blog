# Astro blog CMS — first-stage MVP

A browser-based editorial blog built with Astro on Cloudflare Workers. The public site reads published D1 revisions; a protected admin area edits drafts, previews them, uploads images to a private R2 bucket, and publishes without a rebuild.

## Implemented

- Public homepage and `/blog/:slug` article pages.
- Cloudflare Access JWT verification plus D1 roles (`owner`, `editor`, `author`). Admin routes fail closed without a valid identity in production.
- Rich-text post editor with autosave, preview, publish, unpublish, version-conflict detection, and immutable published revisions.
- PNG/JPEG/WebP uploads up to 8 MB to private R2; draft media requires an editor identity. Published media is public.

Not yet included: user invitations, tags, SEO settings, scheduled publishing, deletion, CDN HTML caching, image variants, or bulk/direct-to-R2 uploads. The first image uploaded into a post becomes its cover. Previously published media remains publicly accessible after a post is unpublished; do not use the current media flow for confidential files.

## Local development

Requires Node.js 22+.

```sh
npm install
cp .dev.vars.example .dev.vars
npm run db:migrate:local
npm run db:seed:local
npm run dev
```

Open the local URL printed by Astro, then `/admin`. `DEV_AUTH_EMAIL` only works with Astro development mode on `localhost` or `127.0.0.1`; it cannot authenticate a production build. The seeded local owner is `owner@example.test`.

## Cloudflare deployment

The Worker is deployed at `https://astro-blog-cms.pengss1026.workers.dev`. Its D1 database (`astro-blog`), private R2 bucket (`astro-blog-media`), and session KV namespace are configured in `wrangler.jsonc`. The remote D1 schema from `migrations/0001_init.sql` has been applied. Do **not** apply the local-owner seed remotely.

To deploy updates, authenticate with `npx wrangler login` if needed, then run `npm run deploy`. No custom domain is attached yet. The public homepage is live but has no articles until an editor publishes one.

### Enable the admin UI

Admin access remains disabled in production until Cloudflare Access is configured:

1. Choose a separate admin hostname, attach it to the Worker, and protect the entire hostname with a Cloudflare Access self-hosted application. Add an allow policy for the intended editor identities. Set `ADMIN_HOST` to the admin hostname so admin routes are unavailable on the public hostname. Protecting only `/admin` is insufficient: draft-image previews also request `/media/*` on the admin hostname.
2. Insert each allowed editor's real email in the remote D1 `users` table with the appropriate role. The email must match the identity supplied by Cloudflare Access.
3. Set `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` as Worker secrets using the Access team domain and application audience tag, then redeploy. Never add these values or R2 credentials to browser code.

Example remote owner SQL:

```sql
INSERT INTO users (id, email, role)
VALUES ('a-unique-uuid', 'you@example.com', 'owner');
```

For local development, Wrangler simulates D1 and R2. Uploaded files and data live in its local state, not your Cloudflare account. The Worker accepts image bytes through the app for this first stage; direct browser-to-R2 uploads with presigned URLs are a later scaling improvement.

## Security notes

Every admin request checks a verified Access JWT and an active D1 user. Write endpoints also enforce same-origin requests and role/ownership rules. Draft content and private media return `no-store`; public HTML is deliberately not edge-cached yet. Content JSON is restricted to supported editor blocks before rendering. SVG and arbitrary HTML are not accepted.
