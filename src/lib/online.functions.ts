import { createServerFn } from "@tanstack/react-start";

import {
  menuSchema,
  orderKeySchema,
  placeOrderSchema,
  markPaidSchema,
  proposeSchema,
  respondSchema,
  setStatusSchema,
  sumLines,
  toCustomerView,
  type OnlineOrderRow,
  type PublicMenu,
} from "./online-schemas";
import { generateUUID, nextOrderNo, getD1 } from "@/integrations/d1/client.server";

// ─── helper: parse JSON safely ────────────────────────────────────────────────
function parseJson<T>(val: unknown): T {
  if (typeof val === "string") return JSON.parse(val) as T;
  return val as T;
}

// ─── helper: row from D1 to OnlineOrderRow ────────────────────────────────────
function rowToOrderRow(row: Record<string, unknown>): OnlineOrderRow {
  return {
    id: row["id"] as string,
    order_no: row["order_no"] as number,
    customer_name: row["customer_name"] as string,
    customer_phone: row["customer_phone"] as string,
    items: parseJson(row["items"]),
    total: Number(row["total"] ?? 0),
    status: row["status"] as OnlineOrderRow["status"],
    proposed_items: row["proposed_items"] ? parseJson(row["proposed_items"]) : null,
    proposed_total: row["proposed_total"] == null ? null : Number(row["proposed_total"]),
    proposed_note: (row["proposed_note"] ?? null) as string | null,
    proposed_at: (row["proposed_at"] ?? null) as string | null,
    payment_method: (row["payment_method"] ?? null) as OnlineOrderRow["payment_method"],
    paid_amount: row["paid_amount"] == null ? null : Number(row["paid_amount"]),
    paid_at: (row["paid_at"] ?? null) as string | null,
    created_at: row["created_at"] as string,
    updated_at: row["updated_at"] as string,
  };
}

// ─── publishMenu ──────────────────────────────────────────────────────────────
export const publishMenu = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => menuSchema.parse(d))
  .handler(async ({ data }) => {
    const db = await getD1();
    await db
      .prepare(
        `INSERT INTO menu_snapshot (id, data, updated_at)
         VALUES ('current', ?, datetime('now'))
         ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
      )
      .bind(JSON.stringify(data))
      .run();
    return { ok: true };
  });

// ─── getPublicMenu ────────────────────────────────────────────────────────────
export const getPublicMenu = createServerFn({ method: "GET" }).handler(async () => {
  const db = await getD1();
  const row = await db
    .prepare(`SELECT data, updated_at FROM menu_snapshot WHERE id = 'current'`)
    .first<{ data: string; updated_at: string }>();

  const parsed = menuSchema.safeParse(row ? parseJson(row.data) : null);
  return {
    menu: parsed.success ? parsed.data : ({ groups: [], items: [] } as PublicMenu),
    updatedAt: row?.updated_at ?? null,
  };
});

// ─── placeOrder ───────────────────────────────────────────────────────────────
export const placeOrder = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => placeOrderSchema.parse(d))
  .handler(async ({ data }) => {
    const db = await getD1();

    // التحقق من توفر الأصناف وأسعارها من نسخة المنيو المنشورة
    const snap = await db
      .prepare(`SELECT data FROM menu_snapshot WHERE id = 'current'`)
      .first<{ data: string }>();
    const parsedMenu = menuSchema.safeParse(snap ? parseJson(snap.data) : null);
    if (!parsedMenu.success) throw new Error("المنيو مش متاح دلوقتي");

    const byId = new Map(parsedMenu.data.items.map((i) => [i.id, i]));
    const unavailable = data.lines.filter((l) => !byId.get(l.itemId)?.available);
    if (unavailable.length) {
      throw new Error(`الأصناف دي مش متاحة حاليًا: ${unavailable.map((l) => l.name).join("، ")}`);
    }
    const lines = data.lines.map((l) => ({
      ...l,
      name: byId.get(l.itemId)!.name,
      unitPrice: byId.get(l.itemId)!.price,
    }));

    const id = generateUUID();
    const token = generateUUID();
    const order_no = await nextOrderNo(db);
    const total = sumLines(lines);

    await db
      .prepare(
        `INSERT INTO online_orders
           (id, token, order_no, customer_name, customer_phone, items, total, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'new', datetime('now'), datetime('now'))`,
      )
      .bind(id, token, order_no, data.name, data.phone, JSON.stringify(lines), total)
      .run();

    return { id, token, orderNo: order_no };
  });

// ─── getOrderStatus ───────────────────────────────────────────────────────────
export const getOrderStatus = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => orderKeySchema.parse(d))
  .handler(async ({ data }) => {
    const db = await getD1();
    const row = await db
      .prepare(`SELECT * FROM online_orders WHERE id = ? AND token = ?`)
      .bind(data.id, data.token)
      .first<Record<string, unknown>>();
    if (!row) return null;
    return toCustomerView(rowToOrderRow(row));
  });

// ─── respondToProposal ────────────────────────────────────────────────────────
export const respondToProposal = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => respondSchema.parse(d))
  .handler(async ({ data }) => {
    const db = await getD1();
    const row = await db
      .prepare(`SELECT * FROM online_orders WHERE id = ? AND token = ?`)
      .bind(data.id, data.token)
      .first<Record<string, unknown>>();

    if (!row || row["status"] !== "awaiting_customer") {
      throw new Error("لا يوجد تعديل بانتظار الموافقة");
    }

    if (data.accept) {
      await db
        .prepare(
          `UPDATE online_orders SET
             items = COALESCE(proposed_items, items),
             total = COALESCE(proposed_total, total),
             status = 'approved',
             proposed_items = NULL,
             proposed_total = NULL,
             proposed_at = NULL,
             updated_at = datetime('now')
           WHERE id = ?`,
        )
        .bind(data.id)
        .run();
    } else {
      await db
        .prepare(
          `UPDATE online_orders SET
             status = 'rejected',
             proposed_items = NULL,
             proposed_total = NULL,
             proposed_at = NULL,
             updated_at = datetime('now')
           WHERE id = ?`,
        )
        .bind(data.id)
        .run();
    }

    const updated = await db
      .prepare(`SELECT * FROM online_orders WHERE id = ?`)
      .bind(data.id)
      .first<Record<string, unknown>>();
    if (!updated) throw new Error("فشل تحديث الطلب");
    return toCustomerView(rowToOrderRow(updated));
  });

// ─── posListOrders ────────────────────────────────────────────────────────────
export const posListOrders = createServerFn({ method: "GET" }).handler(async () => {
  const db = await getD1();
  const since = new Date(Date.now() - 24 * 3600 * 1000)
    .toISOString()
    .replace("T", " ")
    .slice(0, 19);
  const result = await db
    .prepare(
      `SELECT * FROM online_orders
       WHERE created_at >= ?
       ORDER BY created_at DESC
       LIMIT 100`,
    )
    .bind(since)
    .all<Record<string, unknown>>();
  return (result.results ?? []).map(rowToOrderRow) as OnlineOrderRow[];
});

// ─── posProposeEdit ───────────────────────────────────────────────────────────
export const posProposeEdit = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => proposeSchema.parse(d))
  .handler(async ({ data }) => {
    const db = await getD1();
    await db
      .prepare(
        `UPDATE online_orders SET
           proposed_items = ?,
           proposed_total = ?,
           proposed_note = ?,
           proposed_at = datetime('now'),
           status = 'awaiting_customer',
           updated_at = datetime('now')
         WHERE id = ?`,
      )
      .bind(JSON.stringify(data.lines), sumLines(data.lines), data.note ?? null, data.id)
      .run();
    return { ok: true };
  });

// ─── posSetStatus ─────────────────────────────────────────────────────────────
export const posSetStatus = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => setStatusSchema.parse(d))
  .handler(async ({ data }) => {
    const db = await getD1();

    if (data.applyProposed) {
      const row = await db
        .prepare(`SELECT proposed_items, proposed_total FROM online_orders WHERE id = ?`)
        .bind(data.id)
        .first<{ proposed_items: string | null; proposed_total: number | null }>();
      if (row?.proposed_items) {
        await db
          .prepare(
            `UPDATE online_orders SET
               items = ?,
               total = ?,
               proposed_items = NULL,
               proposed_total = NULL,
               proposed_at = NULL,
               status = ?,
               updated_at = datetime('now')
             WHERE id = ?`,
          )
          .bind(row.proposed_items, row.proposed_total, data.status, data.id)
          .run();
      } else {
        await db
          .prepare(`UPDATE online_orders SET status = ?, updated_at = datetime('now') WHERE id = ?`)
          .bind(data.status, data.id)
          .run();
      }
    } else {
      await db
        .prepare(`UPDATE online_orders SET status = ?, updated_at = datetime('now') WHERE id = ?`)
        .bind(data.status, data.id)
        .run();
    }

    const updated = await db
      .prepare(`SELECT * FROM online_orders WHERE id = ?`)
      .bind(data.id)
      .first<Record<string, unknown>>();
    if (!updated) throw new Error("الطلب غير موجود");
    return rowToOrderRow(updated);
  });

// ─── posMarkPaid ──────────────────────────────────────────────────────────────
export const posMarkPaid = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => markPaidSchema.parse(d))
  .handler(async ({ data }) => {
    const db = await getD1();
    await db
      .prepare(
        `UPDATE online_orders SET
           payment_method = ?,
           paid_amount = ?,
           paid_at = datetime('now'),
           updated_at = datetime('now')
         WHERE id = ?`,
      )
      .bind(data.method, data.amount, data.id)
      .run();
    const updated = await db
      .prepare(`SELECT * FROM online_orders WHERE id = ?`)
      .bind(data.id)
      .first<Record<string, unknown>>();
    if (!updated) throw new Error("الطلب غير موجود");
    return rowToOrderRow(updated);
  });
