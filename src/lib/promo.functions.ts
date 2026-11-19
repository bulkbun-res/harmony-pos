/**
 * البروموهات (كودات الخصم) — إدارة من الإعدادات + تحقق للعميل.
 *
 * قاعدة الأمان: الخصم بيتحسب على السيرفر. المتصفح بيبعت الكود بس،
 * والسيرفر هو اللي بيقرر النسبة والصلاحية.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { getD1 } from "@/integrations/d1/client.server";
import { getCurrentUser } from "./auth.server";
import { findValidPromo, explainPromoFailure, type PromoRow } from "./promo.server";

async function assertAdmin() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") throw new Error("غير مصرح — مدير فقط");
}

const codeSchema = z
  .string()
  .trim()
  .min(2, "الكود قصير جدًا")
  .max(24, "الكود طويل جدًا")
  .regex(/^[A-Za-z0-9_-]+$/, "الكود حروف إنجليزي وأرقام و - _ بس")
  .transform((v) => v.toUpperCase());

// ─────────────────────────────────────────────────────────────────────────────
// إدارة (أدمن)
// ─────────────────────────────────────────────────────────────────────────────

export const listPromosFn = createServerFn({ method: "GET" }).handler(async () => {
  await assertAdmin();
  const db = await getD1();
  const res = await db
    .prepare("SELECT * FROM promos ORDER BY created_at DESC LIMIT 200")
    .all<PromoRow>();
  return res.results ?? [];
});

export const savePromoFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      id: z.string().max(64).optional(),
      code: codeSchema,
      discountPct: z.number().min(1, "النسبة لازم تكون أكبر من صفر").max(100, "النسبة أقصاها 100"),
      startsAt: z.string().min(10, "حدد بداية العرض"),
      endsAt: z.string().min(10, "حدد نهاية العرض"),
      maxUses: z.number().int().min(1).nullable().optional(),
      active: z.boolean().optional(),
    }),
  )
  .handler(async ({ data }) => {
    await assertAdmin();
    const db = await getD1();

    const starts = new Date(data.startsAt);
    const ends = new Date(data.endsAt);
    if (Number.isNaN(starts.getTime()) || Number.isNaN(ends.getTime()))
      throw new Error("تاريخ غير صالح");
    if (ends.getTime() <= starts.getTime())
      throw new Error("النهاية لازم تكون بعد البداية");

    const maxUses = data.maxUses ?? null;
    const active = data.active === false ? 0 : 1;

    if (data.id) {
      await db
        .prepare(
          `UPDATE promos SET code=?, discount_pct=?, starts_at=?, ends_at=?, active=?, max_uses=?
            WHERE id=?`,
        )
        .bind(
          data.code,
          data.discountPct,
          starts.toISOString(),
          ends.toISOString(),
          active,
          maxUses,
          data.id,
        )
        .run();
      return { id: data.id };
    }

    const id = crypto.randomUUID();
    try {
      await db
        .prepare(
          `INSERT INTO promos (id, code, discount_pct, starts_at, ends_at, active, max_uses)
           VALUES (?,?,?,?,?,?,?)`,
        )
        .bind(id, data.code, data.discountPct, starts.toISOString(), ends.toISOString(), active, maxUses)
        .run();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg.includes("UNIQUE")) throw new Error("الكود ده مستخدم بالفعل");
      throw e;
    }
    return { id };
  });

export const togglePromoFn = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string(), active: z.boolean() }))
  .handler(async ({ data }) => {
    await assertAdmin();
    const db = await getD1();
    await db
      .prepare("UPDATE promos SET active = ? WHERE id = ?")
      .bind(data.active ? 1 : 0, data.id)
      .run();
    return { ok: true };
  });

export const deletePromoFn = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    await assertAdmin();
    const db = await getD1();
    await db.prepare("DELETE FROM promos WHERE id = ?").bind(data.id).run();
    return { ok: true };
  });

// ─────────────────────────────────────────────────────────────────────────────
// للعميل (بدون تسجيل دخول) — مفيش كودات هنا
// ─────────────────────────────────────────────────────────────────────────────

export const getActivePromosFn = createServerFn({ method: "GET" }).handler(async () => {
  const db = await getD1();
  const nowIso = new Date().toISOString();
  const res = await db
    .prepare(
      `SELECT id, discount_pct, starts_at, ends_at
         FROM promos
        WHERE active = 1 AND starts_at <= ? AND ends_at > ?
          AND (max_uses IS NULL OR used_count < max_uses)
        ORDER BY discount_pct DESC, ends_at ASC`,
    )
    .bind(nowIso, nowIso)
    .all<{ id: string; discount_pct: number; starts_at: string; ends_at: string }>();

  return {
    serverNow: nowIso,
    promos: (res.results ?? []).map((r) => ({
      id: r.id,
      discountPct: Number(r.discount_pct),
      startsAt: r.starts_at,
      endsAt: r.ends_at,
    })),
  };
});

/** العميل بيسأل: الكود ده شغال؟ — بيرجع النسبة بس، مفيش بيانات تانية */
export const checkPromoFn = createServerFn({ method: "POST" })
  .validator(z.object({ code: z.string().trim().min(1).max(24) }))
  .handler(async ({ data }) => {
    const db = await getD1();
    const promo = await findValidPromo(db, data.code);
    if (!promo) {
      return { ok: false as const, message: await explainPromoFailure(db, data.code) };
    }
    return {
      ok: true as const,
      code: promo.code,
      discountPct: Number(promo.discount_pct),
      endsAt: promo.ends_at,
    };
  });
