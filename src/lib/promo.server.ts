/**
 * منطق البرومو على السيرفر فقط (ملف .server — مش بيتحط في حزمة المتصفح).
 */

export interface PromoRow {
  id: string;
  code: string;
  discount_pct: number;
  starts_at: string;
  ends_at: string;
  active: number;
  max_uses: number | null;
  used_count: number;
  created_at: string;
}

/** برومو صالح دلوقتي (نشط + جوه المدة + لسه فيه استخدامات) */
export async function findValidPromo(db: D1Database, rawCode: string): Promise<PromoRow | null> {
  const code = rawCode.trim().toUpperCase();
  if (!code) return null;
  const nowIso = new Date().toISOString();
  const row = await db
    .prepare(
      `SELECT * FROM promos
        WHERE code = ? AND active = 1
          AND starts_at <= ? AND ends_at > ?
          AND (max_uses IS NULL OR used_count < max_uses)`,
    )
    .bind(code, nowIso, nowIso)
    .first<PromoRow>();
  return row ?? null;
}

/** سبب رفض الكود — رسالة مفهومة للعميل */
export async function explainPromoFailure(db: D1Database, rawCode: string): Promise<string> {
  const code = rawCode.trim().toUpperCase();
  const row = await db.prepare("SELECT * FROM promos WHERE code = ?").bind(code).first<PromoRow>();
  if (!row) return "الكود غلط";
  if (!row.active) return "الكود مش شغال";
  const now = Date.now();
  if (Date.parse(row.starts_at) > now) return "العرض لسه ما بدأش";
  if (Date.parse(row.ends_at) <= now) return "العرض ده خلص";
  if (row.max_uses != null && row.used_count >= row.max_uses) return "العرض ده خلص";
  return "الكود مش متاح دلوقتي";
}
