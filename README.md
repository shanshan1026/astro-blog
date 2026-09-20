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

## Cloudflare setup before deployment

1. Create a D1 database named `astro-blog` and a **private** R2 bucket named `astro-blog-media`. Replace the zero UUID in `wrangler.jsonc` with the real D1 database ID.
2. Apply `migrations/0001_init.sql` to the remote D1 database. Do **not** apply the local-owner seed remotely.
3. Insert your real email in `users` with role `owner` (use a new UUID). The email must match the identity supplied by Cloudflare Access.
4. Attach both public and admin custom domains to the Worker; set `ADMIN_HOST` to the admin hostname. Protect the entire admin hostname with a Cloudflare Access self-hosted application.
5. Set `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` as Worker secrets, then deploy with `npm run deploy`. Never add Access settings or R2 credentials to browser code.

Example remote owner SQL:

```sql
INSERT INTO users (id, email, role)
VALUES ('a-unique-uuid', 'you@example.com', 'owner');
```

For local development, Wrangler simulates D1 and R2. Uploaded files and data live in its local state, not your Cloudflare account. The Worker accepts image bytes through the app for this first stage; direct browser-to-R2 uploads with presigned URLs are a later scaling improvement.

## Security notes

Every admin request checks a verified Access JWT and an active D1 user. Write endpoints also enforce same-origin requests and role/ownership rules. Draft content and private media return `no-store`; public HTML is deliberately not edge-cached yet. Content JSON is restricted to supported editor blocks before rendering. SVG and arbitrary HTML are not accepted.
