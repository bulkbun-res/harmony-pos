// D1 database client — بديل عن Supabase client.server.ts
// يصل للـ D1 binding عبر cloudflare-env.server (يُحفظ في server.ts)

import { getDB } from "@/lib/cloudflare-env.server";

/** يولّد UUID v4 صالح للاستخدام في D1 */
export function generateUUID(): string {
  return crypto.randomUUID();
}

/** يولّد رقم الطلب الأونلاين التسلسلي من جدول order_seq */
export async function nextOrderNo(db: D1Database): Promise<number> {
  const result = await db
    .prepare(
      `UPDATE order_seq SET next_no = next_no + 1 WHERE id = 1 RETURNING next_no`
    )
    .first<{ next_no: number }>();
  return result?.next_no ?? 5001;
}

/** يُرجع الـ D1 binding الجاهز للاستخدام */
export async function getD1(): Promise<D1Database> {
  return getDB();
}
