// D1 database client — بديل عن Supabase client.server.ts
// يُستخدم فقط في Server Functions مع Cloudflare D1 binding
//
// الـ D1 binding يأتي من Cloudflare Workers عبر env.DB
// في TanStack Start يصل عبر getCloudflareContext()

export interface D1Env {
  DB: D1Database;
}

/** يولّد UUID v4 صالح للاستخدام في D1 */
export function generateUUID(): string {
  return crypto.randomUUID();
}

/** يولّد رقم الطلب الأونلاين التسلسلي من جدول order_seq */
export async function nextOrderNo(db: D1Database): Promise<number> {
  // atomic increment باستخدام UPDATE + RETURNING
  const result = await db
    .prepare(
      `UPDATE order_seq SET next_no = next_no + 1 WHERE id = 1 RETURNING next_no`
    )
    .first<{ next_no: number }>();
  return result?.next_no ?? 5001;
}

/** يحصل على الـ D1 binding من Cloudflare context */
export async function getD1(): Promise<D1Database> {
  // في TanStack Start على Cloudflare Pages/Workers
  // يتم تمرير env عبر getCloudflareContext أو عبر request context
  const { getCloudflareContext } = await import("@opennextjs/cloudflare");
  const ctx = await getCloudflareContext({ async: true });
  const db = (ctx.env as D1Env).DB;
  if (!db) throw new Error("D1 database binding 'DB' not found in Cloudflare environment");
  return db;
}
