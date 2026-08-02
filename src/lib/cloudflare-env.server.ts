// Cloudflare env store — يُحفظ قبل كل request في server.ts
// آمن لأن Cloudflare Workers تعالج request واحد في الوقت بنفس الـ isolate

let _env: Record<string, unknown> | null = null;

/** يُستدعى من server.ts في بداية كل fetch request */
export function setCloudflareEnv(env: unknown): void {
  _env = env as Record<string, unknown>;
}

/** يُرجع D1 database binding */
export function getDB(): D1Database {
  if (!_env) {
    throw new Error(
      "Cloudflare env not initialized — setCloudflareEnv() must be called first from server.ts"
    );
  }
  const db = _env["DB"] as D1Database | undefined;
  if (!db) {
    throw new Error(
      "D1 binding 'DB' not found. Verify [[d1_databases]] in wrangler.toml."
    );
  }
  return db;
}
