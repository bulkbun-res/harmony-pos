/**
 * دوال السيرفر لمنظومة القنوات الثلاث.
 *
 * ⚠️ قاعدة أساسية: الأسعار بتتحسب هنا من نسخة المنيو المنشورة، مش من الواجهة.
 * العميل يبعت itemId + qty + modifierIds، والسيرفر هو اللي يحدد السعر.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { getD1 } from "@/integrations/d1/client.server";
import { menuSchema } from "./online-schemas";
import { round2, type Channel, type OrderDTO, type OrderLineDTO, type SettingsDTO } from "./orders-types";
import { getCurrentUser } from "./auth.server";
import { cairoDateStr } from "./dates";

// ─────────────────────────────────────────────────────────────────────────────
// أدوات مشتركة
// ─────────────────────────────────────────────────────────────────────────────

const nowIso = () => new Date().toISOString();

const channelSchema = z.enum(["counter", "table", "talabat"]);
const paymentSchema = z.enum(["cash", "visa", "vodafone", "instapay"]);

const lineInputSchema = z.object({
  itemId: z.string().min(1).max(64),
  qty: z.number().int().min(1).max(99),
  modifierIds: z.array(z.string().max(64)).max(30).optional(),
  note: z.string().max(200).optional(),
});

type LineInput = z.infer<typeof lineInputSchema>;

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error("يجب تسجيل الدخول أولًا");
  return user;
}

export async function readSettings(db: D1Database): Promise<SettingsDTO> {
  const res = await db.prepare("SELECT key, value FROM settings").all<{ key: string; value: string }>();
  const map = new Map((res.results ?? []).map((r) => [r.key, Number(r.value)]));
  return {
    tablesServicePct: map.get("tables_service_pct") ?? 0,
    talabatMarkupPct: map.get("talabat_markup_pct") ?? 20,
    taxPct: map.get("tax_pct") ?? 0,
  };
}

async function loadMenu(db: D1Database) {
  const row = await db
    .prepare("SELECT data FROM menu_snapshot WHERE id = 'current'")
    .first<{ data: string }>();
  const parsed = menuSchema.safeParse(row ? JSON.parse(row.data) : null);
  if (!parsed.success) throw new Error("المنيو غير متاح حاليًا");
  return parsed.data;
}

/** عدّاد أرقام الفواتير — ذري */
async function allocateOrderNo(db: D1Database): Promise<number> {
  const r = await db
    .prepare(
      "UPDATE order_counters SET next_no = next_no + 1 WHERE id = 1 RETURNING next_no - 1 AS no",
    )
    .first<{ no: number }>();
  if (!r) throw new Error("عدّاد الفواتير غير مهيأ (order_counters)");
  return Number(r.no);
}

type PricedLine = {
  itemId: string;
  name: string;
  basePrice: number;
  unitPrice: number;
  qty: number;
  lineTotal: number;
  modifiers: { id: string; name: string; price: number }[];
  note: string | null;
};

/** يحدد أسعار الأسطر من نسخة المنيو + معامل القناة */
function priceLines(menu: Awaited<ReturnType<typeof loadMenu>>, channel: Channel, markupPct: number, lines: LineInput[]): PricedLine[] {
  const byId = new Map(menu.items.map((i) => [i.id, i]));
  return lines.map((l) => {
    const item = byId.get(l.itemId);
    if (!item) throw new Error(`الصنف غير موجود في المنيو: ${l.itemId}`);
    if (!item.available) throw new Error(`الصنف غير متاح حاليًا: ${item.name}`);

    const mods = (l.modifierIds ?? []).map((id) => {
      const m = (item.modifiers ?? []).find((x) => x.id === id);
      if (!m) throw new Error(`الإضافة غير موجودة: ${id}`);
      return { id: m.id, name: m.name, price: m.price };
    });

    const modsTotal = mods.reduce((s, m) => s + m.price, 0);
    const markup = channel === "talabat" ? 1 + markupPct / 100 : 1;
    const basePrice = round2(item.price + modsTotal);
    const unitPrice = round2(basePrice * markup);

    return {
      itemId: item.id,
      name: item.name,
      basePrice,
      unitPrice,
      qty: l.qty,
      lineTotal: round2(unitPrice * l.qty),
      modifiers: mods,
      note: l.note ?? null,
    };
  });
}

function totalsFor(
  subtotal: number,
  discount: number,
  serviceRate: number,
  taxPct: number,
) {
  const base = Math.max(0, round2(subtotal - discount));
  const service = round2(base * (serviceRate / 100));
  const tax = round2((base + service) * (taxPct / 100));
  return { service, tax, total: round2(base + service + tax) };
}

async function loadOrder(db: D1Database, orderId: string): Promise<OrderDTO> {
  const row = await db
    .prepare(
      `SELECT o.*, t.table_id, tb.name AS table_name, t.guests, t.opened_at, t.closed_at,
              d.external_ref
         FROM orders o
         LEFT JOIN table_orders   t  ON t.order_id = o.id
         LEFT JOIN tables         tb ON tb.id      = t.table_id
         LEFT JOIN talabat_orders d  ON d.order_id = o.id
        WHERE o.id = ?`,
    )
    .bind(orderId)
    .first<Record<string, unknown>>();
  if (!row) throw new Error("الفاتورة غير موجودة");

  const linesRes = await db
    .prepare("SELECT * FROM order_lines WHERE order_id = ? AND voided = 0 ORDER BY created_at, id")
    .bind(orderId)
    .all<Record<string, unknown>>();

  const lines: OrderLineDTO[] = (linesRes.results ?? []).map((l) => {
    let mods: { id: string; name: string; price: number }[] = [];
    try {
      mods = l["modifiers"] ? JSON.parse(String(l["modifiers"])) : [];
    } catch {
      mods = [];
    }
    return {
      id: String(l["id"]),
      itemId: String(l["item_id"]),
      name: String(l["name"]),
      basePrice: Number(l["base_price"]),
      unitPrice: Number(l["unit_price"]),
      qty: Number(l["qty"]),
      lineTotal: Number(l["line_total"]),
      kind: (l["kind"] as "item" | "modifier") ?? "item",
      parentLineId: (l["parent_line_id"] as string | null) ?? null,
      modifierNames: mods.map((m) => m.name),
      note: (l["note"] as string | null) ?? null,
      voided: Number(l["voided"]) === 1,
    };
  });

  return {
    id: String(row["id"]),
    channel: row["channel"] as Channel,
    orderNo: Number(row["order_no"]),
    status: row["status"] as OrderDTO["status"],
    subtotal: Number(row["subtotal"]),
    discount: Number(row["discount"]),
    serviceRate: Number(row["service_rate"]),
    service: Number(row["service"]),
    taxRate: Number(row["tax_rate"]),
    tax: Number(row["tax"]),
    total: Number(row["total"]),
    paymentMethod: (row["payment_method"] as OrderDTO["paymentMethod"]) ?? null,
    paidAt: (row["paid_at"] as string | null) ?? null,
    shiftId: (row["shift_id"] as string | null) ?? null,
    userName: (row["user_name"] as string | null) ?? null,
    createdAt: String(row["created_at"]),
    updatedAt: String(row["updated_at"]),
    tableId: (row["table_id"] as string | null) ?? null,
    tableName: (row["table_name"] as string | null) ?? null,
    guests: row["guests"] == null ? null : Number(row["guests"]),
    openedAt: (row["opened_at"] as string | null) ?? null,
    closedAt: (row["closed_at"] as string | null) ?? null,
    externalRef: (row["external_ref"] as string | null) ?? null,
    idempotencyKey: (row["idempotency_key"] as string | null) ?? null,
    lines,
  };
}

/** إعادة حساب مجاميع فاتورة مفتوحة من أسطرها */
async function recalcOpenOrder(db: D1Database, orderId: string) {
  const head = await db
    .prepare("SELECT discount, service_rate, tax_rate FROM orders WHERE id = ? AND status = 'open'")
    .bind(orderId)
    .first<{ discount: number; service_rate: number; tax_rate: number }>();
  if (!head) throw new Error("الفاتورة غير مفتوحة أو غير موجودة");

  const sum = await db
    .prepare("SELECT COALESCE(SUM(line_total), 0) AS s FROM order_lines WHERE order_id = ? AND voided = 0")
    .bind(orderId)
    .first<{ s: number }>();
  const subtotal = round2(Number(sum?.s ?? 0));
  const { service, tax, total } = totalsFor(
    subtotal,
    Number(head.discount),
    Number(head.service_rate),
    Number(head.tax_rate),
  );

  await db
    .prepare(
      `UPDATE orders SET subtotal = ?, service = ?, tax = ?, total = ?, updated_at = ?
        WHERE id = ?`,
    )
    .bind(subtotal, service, tax, total, nowIso(), orderId)
    .run();

  return { subtotal, service, tax, total };
}

/** يحدّد الفاتورة مدفوعة بعد إعادة حساب مجاميعها */
async function markPaid(db: D1Database, orderId: string, method: string) {
  const sums = await recalcOpenOrder(db, orderId);
  await db.batch([
    db
      .prepare(
        `UPDATE orders SET status = 'paid', total = ?, payment_method = ?,
                paid_at = ?, updated_at = ?
          WHERE id = ? AND status = 'open'`,
      )
      .bind(sums.total, method, nowIso(), nowIso(), orderId),
    db
      .prepare("UPDATE table_orders SET closed_at = ? WHERE order_id = ? AND closed_at IS NULL")
      .bind(nowIso(), orderId),
  ]);
  return sums;
}

// ─────────────────────────────────────────────────────────────────────────────
// الإعدادات
// ─────────────────────────────────────────────────────────────────────────────

export const getPosSettingsFn = createServerFn({ method: "GET" }).handler(async () => {
  await requireUser();
  const db = await getD1();
  return readSettings(db);
});

export const updatePosSettingsFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      tablesServicePct: z.number().min(0).max(100).optional(),
      talabatMarkupPct: z.number().min(0).max(200).optional(),
      taxPct: z.number().min(0).max(100).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const user = await requireUser();
    if (user.role !== "admin") throw new Error("غير مصرح — مدير فقط");
    const db = await getD1();
    const map: Record<string, number | undefined> = {
      tables_service_pct: data.tablesServicePct,
      talabat_markup_pct: data.talabatMarkupPct,
      tax_pct: data.taxPct,
    };
    for (const [k, v] of Object.entries(map)) {
      if (v === undefined) continue;
      await db
        .prepare(
          `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        )
        .bind(k, String(v), nowIso())
        .run();
    }
    return readSettings(db);
  });

// ─────────────────────────────────────────────────────────────────────────────
// إنشاء فاتورة
// ─────────────────────────────────────────────────────────────────────────────

export const createOrderFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      channel: channelSchema,
      lines: z.array(lineInputSchema).min(1).max(100),
      discount: z.number().min(0).optional(),
      shiftId: z.string().max(64).nullable().optional(),
      note: z.string().max(300).optional(),
      // ترابيزات
      tableId: z.string().max(64).optional(),
      guests: z.number().int().min(1).max(50).optional(),
      // طلبات
      externalRef: z.string().max(64).optional(),
      customerName: z.string().max(120).optional(),
      customerPhone: z.string().max(32).optional(),
      // دفع فوري
      payNow: paymentSchema.optional(),
      /** مفتاح منع التكرار */
      idempotencyKey: z.string().max(80).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const user = await requireUser();
    const db = await getD1();
    const settings = await readSettings(db);
    const menu = await loadMenu(db);

    if (data.channel === "table" && !data.tableId) throw new Error("اختر الترابيزة أولًا");
    if (data.channel === "talabat" && !data.externalRef?.trim())
      throw new Error("أدخل رقم أوردر طلبات");

    // الترابيزة لازم تكون موجودة وفاضية
    if (data.channel === "table") {
      const tbl = await db
        .prepare("SELECT id FROM tables WHERE id = ? AND active = 1")
        .bind(data.tableId!)
        .first();
      if (!tbl) throw new Error("الترابيزة غير موجودة");
      const busy = await db
        .prepare("SELECT order_id FROM table_orders WHERE table_id = ? AND closed_at IS NULL")
        .bind(data.tableId!)
        .first();
      if (busy) throw new Error("الترابيزة مفتوحة بالفعل — كمّل عليها");
    }

    if (data.channel === "talabat") {
      const dup = await db
        .prepare("SELECT order_id FROM talabat_orders WHERE external_ref = ?")
        .bind(data.externalRef!.trim())
        .first();
      if (dup) throw new Error("رقم أوردر طلبات هذا مسجّل بالفعل");
    }

    // منع التكرار
    if (data.idempotencyKey) {
      const dup = await db
        .prepare("SELECT id, status FROM orders WHERE idempotency_key = ?")
        .bind(data.idempotencyKey)
        .first<{ id: string; status: string }>();
      if (dup) {
        if (data.payNow && dup.status === "open") {
          await markPaid(db, dup.id, data.payNow);
        }
        return loadOrder(db, dup.id);
      }
    }

    const priced = priceLines(menu, data.channel, settings.talabatMarkupPct, data.lines);
    const subtotal = round2(priced.reduce((s, l) => s + l.lineTotal, 0));
    const discount = round2(data.discount ?? 0);
    const serviceRate = data.channel === "table" ? settings.tablesServicePct : 0;
    const taxRate = data.channel === "table" ? settings.taxPct : 0;
    const { service, tax, total } = totalsFor(subtotal, discount, serviceRate, taxRate);

    const orderId = crypto.randomUUID();
    const orderNo = await allocateOrderNo(db);
    const status = data.payNow ? "paid" : "open";
    const ts = nowIso();

    const stmts = [
      db
        .prepare(
          `INSERT INTO orders (id, channel, order_no, status, subtotal, discount,
             service_rate, service, tax_rate, tax, total,
             payment_method, paid_at, shift_id, user_id, user_name,
             business_date, created_at, updated_at, idempotency_key)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .bind(
          orderId,
          data.channel,
          orderNo,
          status,
          subtotal,
          discount,
          serviceRate,
          service,
          taxRate,
          tax,
          total,
          data.payNow ?? null,
          data.payNow ? ts : null,
          data.shiftId ?? null,
          user.id,
          user.name,
          cairoDateStr(),
          ts,
          ts,
          data.idempotencyKey ?? null,
        ),
      ...priced.map((l) =>
        db
          .prepare(
            `INSERT INTO order_lines (id, order_id, item_id, name, base_price, unit_price,
               qty, line_total, kind, modifiers, note)
             VALUES (?,?,?,?,?,?,?,?,'item',?,?)`,
          )
          .bind(
            crypto.randomUUID(),
            orderId,
            l.itemId,
            l.name,
            l.basePrice,
            l.unitPrice,
            l.qty,
            l.lineTotal,
            JSON.stringify(l.modifiers),
            l.note,
          ),
      ),
    ];

    if (data.channel === "counter") {
      stmts.push(
        db
          .prepare("INSERT INTO counter_orders (order_id, customer_name, note) VALUES (?,?,?)")
          .bind(orderId, data.customerName ?? null, data.note ?? null),
      );
    } else if (data.channel === "table") {
      stmts.push(
        db
          .prepare(
            `INSERT INTO table_orders (order_id, table_id, guests, opened_at, closed_at, note)
             VALUES (?,?,?,?,?,?)`,
          )
          .bind(
            orderId,
            data.tableId!,
            data.guests ?? 1,
            ts,
            data.payNow ? ts : null,
            data.note ?? null,
          ),
      );
    } else {
      stmts.push(
        db
          .prepare(
            `INSERT INTO talabat_orders (order_id, external_ref, customer_name, customer_phone, markup_pct)
             VALUES (?,?,?,?,?)`,
          )
          .bind(
            orderId,
            data.externalRef!.trim(),
            data.customerName ?? null,
            data.customerPhone ?? null,
            settings.talabatMarkupPct,
          ),
      );
    }

    try {
      await db.batch(stmts);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg.includes("UNIQUE")) {
        if (msg.includes("talabat_ref")) throw new Error("رقم أوردر طلبات هذا مسجّل بالفعل");
        if (msg.includes("table_open")) throw new Error("الترابيزة مفتوحة بالفعل — كمّل عليها");
        throw new Error("تعارض في البيانات — أعد المحاولة");
      }
      throw e;
    }

    return loadOrder(db, orderId);
  });

// ─────────────────────────────────────────────────────────────────────────────
// إضافة أصناف على فاتورة مفتوحة (الترابيزات)
// ─────────────────────────────────────────────────────────────────────────────

export const addOrderLinesFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      orderId: z.string().min(1),
      lines: z.array(lineInputSchema).min(1).max(100),
    }),
  )
  .handler(async ({ data }) => {
    await requireUser();
    const db = await getD1();
    const settings = await readSettings(db);

    const head = await db
      .prepare(
        `SELECT o.channel, o.status, d.markup_pct
           FROM orders o LEFT JOIN talabat_orders d ON d.order_id = o.id
          WHERE o.id = ?`,
      )
      .bind(data.orderId)
      .first<{ channel: Channel; status: string; markup_pct: number | null }>();

    if (!head) throw new Error("الفاتورة غير موجودة");
    if (head.status !== "open") throw new Error("الفاتورة مقفولة — لا يمكن إضافة أصناف");

    const menu = await loadMenu(db);
    const markup = head.channel === "talabat" ? Number(head.markup_pct ?? settings.talabatMarkupPct) : 0;
    const priced = priceLines(menu, head.channel, markup, data.lines);

    await db.batch(
      priced.map((l) =>
        db
          .prepare(
            `INSERT INTO order_lines (id, order_id, item_id, name, base_price, unit_price,
               qty, line_total, kind, modifiers, note)
             VALUES (?,?,?,?,?,?,?,?,'item',?,?)`,
          )
          .bind(
            crypto.randomUUID(),
            data.orderId,
            l.itemId,
            l.name,
            l.basePrice,
            l.unitPrice,
            l.qty,
            l.lineTotal,
            JSON.stringify(l.modifiers),
            l.note,
          ),
      ),
    );

    await recalcOpenOrder(db, data.orderId);
    return loadOrder(db, data.orderId);
  });

// ─────────────────────────────────────────────────────────────────────────────
// إلغاء سطر
// ─────────────────────────────────────────────────────────────────────────────

export const voidOrderLineFn = createServerFn({ method: "POST" })
  .validator(z.object({ orderId: z.string(), lineId: z.string(), reason: z.string().max(200).optional() }))
  .handler(async ({ data }) => {
    await requireUser();
    const db = await getD1();
    await db
      .prepare(
        "UPDATE order_lines SET voided = 1, void_reason = ? WHERE id = ? AND order_id = ?",
      )
      .bind(data.reason ?? null, data.lineId, data.orderId)
      .run();
    await recalcOpenOrder(db, data.orderId);
    return loadOrder(db, data.orderId);
  });

// ─────────────────────────────────────────────────────────────────────────────
// الدفع / الإغلاق
// ─────────────────────────────────────────────────────────────────────────────

export const payOrderFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      orderId: z.string(),
      paymentMethod: paymentSchema,
      discount: z.number().min(0).optional(),
    }),
  )
  .handler(async ({ data }) => {
    await requireUser();
    const db = await getD1();

    if (data.discount !== undefined) {
      await db
        .prepare("UPDATE orders SET discount = ? WHERE id = ? AND status = 'open'")
        .bind(round2(data.discount), data.orderId)
        .run();
    }

    await markPaid(db, data.orderId, data.paymentMethod);
    return loadOrder(db, data.orderId);
  });

export const cancelOrderFn = createServerFn({ method: "POST" })
  .validator(z.object({ orderId: z.string(), reason: z.string().max(200).optional() }))
  .handler(async ({ data }) => {
    await requireUser();
    const db = await getD1();
    await db.batch([
      db
        .prepare("UPDATE orders SET status = 'cancelled', updated_at = ? WHERE id = ?")
        .bind(nowIso(), data.orderId),
      db
        .prepare("UPDATE table_orders SET closed_at = ? WHERE order_id = ? AND closed_at IS NULL")
        .bind(nowIso(), data.orderId),
    ]);
    return { ok: true };
  });

// ─────────────────────────────────────────────────────────────────────────────
// قراءات
// ─────────────────────────────────────────────────────────────────────────────

export const getOrderFn = createServerFn({ method: "GET" })
  .validator(z.object({ orderId: z.string() }))
  .handler(async ({ data }) => {
    await requireUser();
    const db = await getD1();
    return loadOrder(db, data.orderId);
  });

export const listOpenOrdersFn = createServerFn({ method: "GET" }).handler(async () => {
  await requireUser();
  const db = await getD1();
  const res = await db
    .prepare(
      `SELECT o.*, t.table_id, tb.name AS table_name, t.guests, t.opened_at, t.closed_at, d.external_ref
         FROM orders o
         LEFT JOIN table_orders   t  ON t.order_id = o.id
         LEFT JOIN tables         tb ON tb.id      = t.table_id
         LEFT JOIN talabat_orders d  ON d.order_id = o.id
        WHERE o.status = 'open'
        ORDER BY o.created_at ASC`,
    )
    .all<Record<string, unknown>>();

  return (res.results ?? []).map((r) => ({
    id: String(r["id"]),
    channel: r["channel"] as Channel,
    orderNo: Number(r["order_no"]),
    total: Number(r["total"]),
    tableId: (r["table_id"] as string | null) ?? null,
    tableName: (r["table_name"] as string | null) ?? null,
    externalRef: (r["external_ref"] as string | null) ?? null,
    createdAt: String(r["created_at"]),
  }));
});

/** كل الترابيزات + الفاتورة المفتوحة على كل واحدة */
export const getTableBoardFn = createServerFn({ method: "GET" }).handler(async () => {
  await requireUser();
  const db = await getD1();
  const res = await db
    .prepare(
      `SELECT tb.id, tb.name, tb.zone, tb.seats, tb.sort,
              o.id AS order_id, o.order_no, o.total, o.created_at AS opened_at
         FROM tables tb
         LEFT JOIN table_orders t ON t.table_id = tb.id AND t.closed_at IS NULL
         LEFT JOIN orders o       ON o.id = t.order_id AND o.status = 'open'
        WHERE tb.active = 1
        ORDER BY tb.sort, tb.name`,
    )
    .all<Record<string, unknown>>();

  return (res.results ?? []).map((r) => ({
    id: String(r["id"]),
    name: String(r["name"]),
    zone: String(r["zone"]),
    seats: Number(r["seats"]),
    orderId: (r["order_id"] as string | null) ?? null,
    orderNo: r["order_no"] == null ? null : Number(r["order_no"]),
    total: r["total"] == null ? null : Number(r["total"]),
    openedAt: (r["opened_at"] as string | null) ?? null,
  }));
});

export const listOrdersFn = createServerFn({ method: "GET" })
  .validator(
    z.object({
      from: z.string().optional(),
      to: z.string().optional(),
      shiftId: z.string().optional(),
      channel: channelSchema.optional(),
      limit: z.number().int().min(1).max(300).default(100),
    }),
  )
  .handler(async ({ data }) => {
    await requireUser();
    const db = await getD1();
    const where: string[] = ["o.status <> 'open'"];
    const binds: (string | number)[] = [];
    if (data.from) { where.push("o.created_at >= ?"); binds.push(data.from); }
    if (data.to) { where.push("o.created_at < ?"); binds.push(data.to); }
    if (data.shiftId) { where.push("o.shift_id = ?"); binds.push(data.shiftId); }
    if (data.channel) { where.push("o.channel = ?"); binds.push(data.channel); }

    const heads = await db
      .prepare(
        `SELECT o.*, t.table_id, tb.name AS table_name, t.guests, t.opened_at, t.closed_at,
                d.external_ref
           FROM orders o
           LEFT JOIN table_orders   t  ON t.order_id = o.id
           LEFT JOIN tables         tb ON tb.id      = t.table_id
           LEFT JOIN talabat_orders d  ON d.order_id = o.id
          WHERE ${where.join(" AND ")}
          ORDER BY o.created_at DESC
          LIMIT ?`,
      )
      .bind(...binds, data.limit)
      .all<Record<string, unknown>>();

    const rows = heads.results ?? [];
    if (!rows.length) return [] as OrderDTO[];

    const ids = rows.map((r) => String(r["id"]));
    const placeholders = ids.map(() => "?").join(",");
    const linesRes = await db
      .prepare(
        `SELECT * FROM order_lines
          WHERE order_id IN (${placeholders}) AND voided = 0
          ORDER BY created_at, id`,
      )
      .bind(...ids)
      .all<Record<string, unknown>>();

    const byOrder = new Map<string, Record<string, unknown>[]>();
    for (const l of linesRes.results ?? []) {
      const key = String(l["order_id"]);
      const arr = byOrder.get(key) ?? [];
      arr.push(l);
      byOrder.set(key, arr);
    }

    return rows.map((row): OrderDTO => {
      const id = String(row["id"]);
      const lines: OrderLineDTO[] = (byOrder.get(id) ?? []).map((l) => {
        let mods: { id: string; name: string; price: number }[] = [];
        try {
          mods = l["modifiers"] ? JSON.parse(String(l["modifiers"])) : [];
        } catch {
          mods = [];
        }
        return {
          id: String(l["id"]),
          itemId: String(l["item_id"]),
          name: String(l["name"]),
          basePrice: Number(l["base_price"]),
          unitPrice: Number(l["unit_price"]),
          qty: Number(l["qty"]),
          lineTotal: Number(l["line_total"]),
          kind: (l["kind"] as "item" | "modifier") ?? "item",
          parentLineId: (l["parent_line_id"] as string | null) ?? null,
          modifierNames: mods.map((m) => m.name),
          note: (l["note"] as string | null) ?? null,
          voided: Number(l["voided"]) === 1,
        };
      });

      return {
        id,
        channel: row["channel"] as Channel,
        orderNo: Number(row["order_no"]),
        status: row["status"] as OrderDTO["status"],
        subtotal: Number(row["subtotal"]),
        discount: Number(row["discount"]),
        serviceRate: Number(row["service_rate"]),
        service: Number(row["service"]),
        taxRate: Number(row["tax_rate"]),
        tax: Number(row["tax"]),
        total: Number(row["total"]),
        paymentMethod: (row["payment_method"] as OrderDTO["paymentMethod"]) ?? null,
        paidAt: (row["paid_at"] as string | null) ?? null,
        shiftId: (row["shift_id"] as string | null) ?? null,
        userName: (row["user_name"] as string | null) ?? null,
        createdAt: String(row["created_at"]),
        updatedAt: String(row["updated_at"]),
        tableId: (row["table_id"] as string | null) ?? null,
        tableName: (row["table_name"] as string | null) ?? null,
        guests: row["guests"] == null ? null : Number(row["guests"]),
        openedAt: (row["opened_at"] as string | null) ?? null,
        closedAt: (row["closed_at"] as string | null) ?? null,
        externalRef: (row["external_ref"] as string | null) ?? null,
        idempotencyKey: (row["idempotency_key"] as string | null) ?? null,
        lines,
      };
    });
  });

/** إجماليات الوردية مقسّمة بالقناة */
export const getShiftTotalsFn = createServerFn({ method: "GET" })
  .validator(z.object({ shiftId: z.string() }))
  .handler(async ({ data }) => {
    await requireUser();
    const db = await getD1();
    const res = await db
      .prepare(
        `SELECT channel, payment_method,
                COUNT(*) AS n,
                ROUND(COALESCE(SUM(total), 0), 2) AS total
           FROM orders
          WHERE shift_id = ? AND status = 'paid'
          GROUP BY channel, payment_method`,
      )
      .bind(data.shiftId)
      .all<{ channel: Channel; payment_method: string; n: number; total: number }>();

    const rows = res.results ?? [];
    const cash = rows
      .filter((r) => r.payment_method === "cash" && r.channel !== "talabat")
      .reduce((s, r) => s + Number(r.total), 0);
    const bank = rows
      .filter((r) => r.payment_method !== "cash")
      .reduce((s, r) => s + Number(r.total), 0);
    const talabat = rows
      .filter((r) => r.channel === "talabat")
      .reduce((s, r) => s + Number(r.total), 0);

    return {
      cash: round2(cash),
      bank: round2(bank),
      talabat: round2(talabat),
      rows,
    };
  });

// ─────────────────────────────────────────────────────────────────────────────
// الترابيزات
// ─────────────────────────────────────────────────────────────────────────────

export const listTablesFn = createServerFn({ method: "GET" }).handler(async () => {
  await requireUser();
  const db = await getD1();
  const res = await db
    .prepare("SELECT * FROM tables WHERE active = 1 ORDER BY sort, name")
    .all<Record<string, unknown>>();
  return (res.results ?? []).map((r) => ({
    id: String(r["id"]),
    name: String(r["name"]),
    zone: String(r["zone"]),
    seats: Number(r["seats"]),
    sort: Number(r["sort"]),
  }));
});

export const saveTableFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      id: z.string().max(64).optional(),
      name: z.string().trim().min(1).max(40),
      zone: z.string().trim().max(40).optional(),
      seats: z.number().int().min(1).max(50).optional(),
      sort: z.number().int().min(0).max(999).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const user = await requireUser();
    if (user.role !== "admin") throw new Error("غير مصرح — مدير فقط");
    const db = await getD1();
    if (data.id) {
      await db
        .prepare("UPDATE tables SET name = ?, zone = ?, seats = ?, sort = ? WHERE id = ?")
        .bind(
          data.name,
          data.zone ?? "صالة",
          data.seats ?? 4,
          data.sort ?? 0,
          data.id,
        )
        .run();
      return { id: data.id };
    }
    const id = crypto.randomUUID();
    await db
      .prepare("INSERT INTO tables (id, name, zone, seats, sort) VALUES (?,?,?,?,?)")
      .bind(id, data.name, data.zone ?? "صالة", data.seats ?? 4, data.sort ?? 0)
      .run();
    return { id };
  });

export const deleteTableFn = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const user = await requireUser();
    if (user.role !== "admin") throw new Error("غير مصرح — مدير فقط");
    const db = await getD1();
    const busy = await db
      .prepare("SELECT order_id FROM table_orders WHERE table_id = ? AND closed_at IS NULL")
      .bind(data.id)
      .first();
    if (busy) throw new Error("الترابيزة مفتوحة — اقفلها الأول");
    await db.prepare("UPDATE tables SET active = 0 WHERE id = ?").bind(data.id).run();
    return { ok: true };
  });

export const moveTableFn = createServerFn({ method: "POST" })
  .validator(z.object({ orderId: z.string(), toTableId: z.string() }))
  .handler(async ({ data }) => {
    await requireUser();
    const db = await getD1();
    const busy = await db
      .prepare("SELECT order_id FROM table_orders WHERE table_id = ? AND closed_at IS NULL")
      .bind(data.toTableId)
      .first();
    if (busy && String(busy["order_id"] ?? "") !== data.orderId)
      throw new Error("الترابيزة الهدف مفتوحة بالفعل");
    await db
      .prepare("UPDATE table_orders SET table_id = ? WHERE order_id = ? AND closed_at IS NULL")
      .bind(data.toTableId, data.orderId)
      .run();
    return { ok: true };
  });

// ─────────────────────────────────────────────────────────────────────────────
// طلبات — المستحقات والتسويات
// ─────────────────────────────────────────────────────────────────────────────

export const listTalabatReceivablesFn = createServerFn({ method: "GET" }).handler(async () => {
  await requireUser();
  const db = await getD1();
  const res = await db
    .prepare(
      `SELECT o.id, o.order_no, o.total, o.paid_at, d.external_ref
         FROM orders o
         JOIN talabat_orders d ON d.order_id = o.id
        WHERE o.channel = 'talabat' AND o.status = 'paid' AND d.settlement_id IS NULL
        ORDER BY o.paid_at ASC`,
    )
    .all<Record<string, unknown>>();

  const orders = (res.results ?? []).map((r) => ({
    id: String(r["id"]),
    orderNo: Number(r["order_no"]),
    total: Number(r["total"]),
    paidAt: (r["paid_at"] as string | null) ?? null,
    externalRef: String(r["external_ref"]),
  }));

  return { orders, gross: round2(orders.reduce((s, o) => s + o.total, 0)) };
});

export const createTalabatSettlementFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      periodFrom: z.string(),
      periodTo: z.string(),
      commissionPct: z.number().min(0).max(100),
      note: z.string().max(200).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const user = await requireUser();
    if (user.role !== "admin") throw new Error("غير مصرح — مدير فقط");
    const db = await getD1();

    const pending = await db
      .prepare(
        `SELECT o.id, o.total FROM orders o
           JOIN talabat_orders d ON d.order_id = o.id
          WHERE o.channel = 'talabat' AND o.status = 'paid' AND d.settlement_id IS NULL
            AND o.paid_at >= ? AND o.paid_at < ?`,
      )
      .bind(data.periodFrom, data.periodTo)
      .all<{ id: string; total: number }>();

    const rows = pending.results ?? [];
    if (!rows.length) throw new Error("مفيش أوردرات غير مسددة في الفترة دي");

    const gross = round2(rows.reduce((s, r) => s + Number(r.total), 0));
    const commission = round2(gross * (data.commissionPct / 100));
    const net = round2(gross - commission);
    const id = crypto.randomUUID();

    await db.batch([
      db
        .prepare(
          `INSERT INTO talabat_settlements (id, period_from, period_to, gross, commission, net, received_at, note)
           VALUES (?,?,?,?,?,?,?,?)`,
        )
        .bind(id, data.periodFrom, data.periodTo, gross, commission, net, nowIso(), data.note ?? null),
      ...rows.map((r) =>
        db.prepare("UPDATE talabat_orders SET settlement_id = ? WHERE order_id = ?").bind(id, r.id),
      ),
    ]);

    return { id, gross, commission, net };
  });
