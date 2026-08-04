const GLOBAL_ENV_KEY = Symbol.for("bulkbun:cloudflare_env");

const globalObj = globalThis as typeof globalThis & {
  [GLOBAL_ENV_KEY]?: Record<string, unknown>;
};

/** يُستدعى من server.ts في بداية كل fetch request */
export function setCloudflareEnv(env: unknown): void {
  globalObj[GLOBAL_ENV_KEY] = env as Record<string, unknown>;
}

/** يُرجع D1 database binding */
export function getDB(): D1Database {
  const env = (globalThis as any).__env__ || globalObj[GLOBAL_ENV_KEY];
  if (!env) {
    throw new Error(
      "Cloudflare env not initialized — setCloudflareEnv() must be called first from server.ts",
    );
  }
  const db = env["DB"] as D1Database | undefined;
  if (!db) {
    throw new Error("D1 binding 'DB' not found. Verify [[d1_databases]] in wrangler.toml.");
  }
  return db;
}

