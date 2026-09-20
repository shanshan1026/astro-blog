/// <reference types="astro/client" />
import type { D1Database, R2Bucket } from '@cloudflare/workers-types';

declare global {
  namespace Cloudflare {
    interface Env {
      DB: D1Database;
      MEDIA: R2Bucket;
      DEV_AUTH_EMAIL?: string;
      ACCESS_TEAM_DOMAIN?: string;
      ACCESS_AUD?: string;
      ADMIN_HOST?: string;
    }
  }
  namespace App {
    interface Locals {
      user?: { id: string; email: string; role: 'owner' | 'editor' | 'author' };
    }
  }
}

export {};
