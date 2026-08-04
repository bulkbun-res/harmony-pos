import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getD1 } from "@/integrations/d1/client.server";

// مخططات التحقق من المدخلات
const syncItemSchema = z.object({
  id: z.string(),
  itemId: z.string(),
  name: z.string(),
  unitPrice: z.number(),
  qty: z.number(),
});

const syncOrderSchema = z.object({
  id: z.string(),
  orderNo: z.number(),
  subtotal: z.number(),
  discount: z.number().default(0),
  service: z.number().default(0),
  tax: z.number().default(0),
  total: z.number(),
  paymentMethod: z.string(),
  status: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
  lines: z.array(syncItemSchema),
});

export const syncOrderFn = createServerFn({ method: "POST" })
  .validator(syncOrderSchema)
  .handler(async ({ data }) => {
    const db = await getD1();
    const createdStr = new Date(data.createdAt).toISOString();
    const updatedStr = new Date(data.updatedAt).toISOString();

    // 1. إدخال أو تحديث الفاتورة
    await db
      .prepare(
        `INSERT INTO sales_orders (id, order_no, subtotal, discount, service, tax, total, payment_method, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET 
           status = excluded.status,
           updated_at = excluded.updated_at,
           payment_method = excluded.payment_method,
           total = excluded.total`,
      )
      .bind(
        data.id,
        data.orderNo,
        data.subtotal,
        data.discount,
        data.service,
        data.tax,
        data.total,
        data.paymentMethod,
        data.status,
        createdStr,
        updatedStr,
      )
      .run();

    // 2. حذف العناصر القديمة للفاتورة (في حالة التحديث لإعادة إدخالها)
    await db.prepare("DELETE FROM sales_order_items WHERE order_id = ?").bind(data.id).run();

    // 3. إدخال العناصر الجديدة للفاتورة
    for (const item of data.lines) {
      await db
        .prepare(
          `INSERT INTO sales_order_items (id, order_id, item_id, name, unit_price, qty)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(item.id, data.id, item.itemId, item.name, item.unitPrice, item.qty)
        .run();
    }

    return { ok: true };
  });

export const syncInventoryLogFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      id: z.string(),
      ingredientId: z.string(),
      qty: z.number(),
      reason: z.string(),
      notes: z.string().optional(),
      createdAt: z.number(),
    }),
  )
  .handler(async ({ data }) => {
    const db = await getD1();
    const createdStr = new Date(data.createdAt).toISOString();

    await db
      .prepare(
        `INSERT INTO inventory_logs (id, ingredient_id, qty, reason, notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(data.id, data.ingredientId, data.qty, data.reason, data.notes ?? null, createdStr)
      .run();

    return { ok: true };
  });
