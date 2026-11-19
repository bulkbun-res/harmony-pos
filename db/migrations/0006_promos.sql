-- ============================================================================
-- 0006: البروموهات (كودات خصم على المنيو الإلكتروني)
--
-- إضافي بالكامل: جدول جديد + عمودين على online_orders.
-- التواريخ بتتخزن ISO/UTC، والمقارنة بتتم على السيرفر.
-- ============================================================================

CREATE TABLE IF NOT EXISTS promos (
  id           TEXT PRIMARY KEY,
  code         TEXT NOT NULL UNIQUE,        -- دايماً UPPERCASE
  discount_pct REAL NOT NULL CHECK (discount_pct > 0 AND discount_pct <= 100),
  starts_at    TEXT NOT NULL,               -- ISO UTC
  ends_at      TEXT NOT NULL,               -- ISO UTC
  active       INTEGER NOT NULL DEFAULT 1,
  max_uses     INTEGER,                     -- NULL = بلا حد
  used_count   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS promos_active_idx ON promos (active, ends_at);

-- الخصم على الأوردر الأونلاين (الداتا القديمة = 0)
ALTER TABLE online_orders ADD COLUMN subtotal   REAL NOT NULL DEFAULT 0;
ALTER TABLE online_orders ADD COLUMN discount   REAL NOT NULL DEFAULT 0;
ALTER TABLE online_orders ADD COLUMN promo_code TEXT;
