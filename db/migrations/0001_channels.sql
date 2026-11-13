-- ============================================================================
-- BulkBun POS — migration 0001: منظومة القنوات الثلاث
--   counter (تيك أواي) | table (ترابيزات) | talabat (طلبات)
--
-- مبدأ التصميم:
--   * جدول واحد للفلوس (orders) — كل القنوات بتصب فيه، فالتقارير وتقفيل
--     الوردية بيقروا من مكان واحد.
--   * جدول تفاصيل لكل قناة، متوصل 1:1 ‏(order_id).
--   * زيادة طلبات (20% افتراضيًا) بتتدفن في سعر السطر نفسه — مفيش سطر
--     عمولة في الفاتورة، ومفيش تقريب.
--   * نسبة خدمة الترابيزات بتتحفظ Snapshot على الفاتورة وقت فتحها.
--
-- آمن للتشغيل أكثر من مرة (IF NOT EXISTS).
-- ============================================================================

PRAGMA foreign_keys = OFF;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) الإعدادات — تتقرأ من كل الأجهزة، مش من المتصفح
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO settings (key, value) VALUES
  ('tables_service_pct', '0'),    -- نسبة خدمة الترابيزات % (حاليًا صفر)
  ('talabat_markup_pct', '20'),   -- زيادة أسعار طلبات %
  ('tax_pct',            '0');    -- ضريبة عامة %

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) عدّاد أرقام الفواتير — ذري على مستوى السيرفر
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_counters (
  id      INTEGER PRIMARY KEY CHECK (id = 1),
  next_no INTEGER NOT NULL
);
INSERT OR IGNORE INTO order_counters (id, next_no) VALUES (1, 3001);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) العمود الفقري: كل فاتورة في أي قناة
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
  id             TEXT PRIMARY KEY,
  channel        TEXT NOT NULL CHECK (channel IN ('counter','table','talabat')),
  order_no       INTEGER NOT NULL,
  status         TEXT NOT NULL DEFAULT 'open'
                 CHECK (status IN ('open','paid','cancelled')),

  subtotal       REAL NOT NULL DEFAULT 0,   -- مجموع الأسطر (بعد زيادة طلبات)
  discount       REAL NOT NULL DEFAULT 0,
  service_rate   REAL NOT NULL DEFAULT 0,   -- النسبة المطبقة، snapshot
  service        REAL NOT NULL DEFAULT 0,   -- قيمة الخدمة بالجنيه
  tax_rate       REAL NOT NULL DEFAULT 0,
  tax            REAL NOT NULL DEFAULT 0,
  total          REAL NOT NULL DEFAULT 0,   -- اللي العميل بيدفعه

  payment_method TEXT CHECK (payment_method IS NULL OR
                             payment_method IN ('cash','visa','vodafone','instapay')),
  paid_at        TEXT,

  shift_id       TEXT,
  user_id        TEXT,
  user_name      TEXT,

  is_legacy      INTEGER NOT NULL DEFAULT 0, -- 1 = فاتورة مرحّلة من sales_orders
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- الأرقام القديمة فيها 259 تكرار، فالفريد بيتفرض على الجديد بس.
CREATE UNIQUE INDEX IF NOT EXISTS orders_no_new_uq
  ON orders(order_no) WHERE is_legacy = 0;

CREATE INDEX IF NOT EXISTS orders_channel_idx ON orders(channel, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_status_idx  ON orders(status);
CREATE INDEX IF NOT EXISTS orders_shift_idx   ON orders(shift_id);
CREATE INDEX IF NOT EXISTS orders_paid_idx    ON orders(paid_at);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) أسطر الفاتورة (أصناف + إضافات)
--    base_price = سعر المحل (مخفي عن الفاتورة)
--    unit_price = السعر المطبق فعليًا (بعد زيادة طلبات)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_lines (
  id             TEXT PRIMARY KEY,
  order_id       TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  item_id        TEXT NOT NULL,
  name           TEXT NOT NULL,

  base_price     REAL NOT NULL,
  unit_price     REAL NOT NULL,
  qty            INTEGER NOT NULL DEFAULT 1,
  line_total     REAL NOT NULL,

  kind           TEXT NOT NULL DEFAULT 'item'
                 CHECK (kind IN ('item','modifier')),
  parent_line_id TEXT REFERENCES order_lines(id) ON DELETE CASCADE,
  note           TEXT,

  voided         INTEGER NOT NULL DEFAULT 0,
  void_reason    TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS order_lines_order_idx  ON order_lines(order_id);
CREATE INDEX IF NOT EXISTS order_lines_parent_idx ON order_lines(parent_line_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) تفاصيل التيك أواي
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS counter_orders (
  order_id      TEXT PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
  customer_name TEXT,
  note          TEXT
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6) الترابيزات
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tables (
  id     TEXT PRIMARY KEY,
  name   TEXT NOT NULL UNIQUE,
  zone   TEXT NOT NULL DEFAULT 'صالة',
  seats  INTEGER NOT NULL DEFAULT 4,
  active INTEGER NOT NULL DEFAULT 1,
  sort   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS table_orders (
  order_id  TEXT PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
  table_id  TEXT NOT NULL REFERENCES tables(id),
  guests    INTEGER NOT NULL DEFAULT 1,
  opened_at TEXT NOT NULL DEFAULT (datetime('now')),
  closed_at TEXT,
  note      TEXT
);

-- ترابيزة واحدة مفتوحة في نفس الوقت
CREATE UNIQUE INDEX IF NOT EXISTS table_open_uq
  ON table_orders(table_id) WHERE closed_at IS NULL;

CREATE INDEX IF NOT EXISTS table_orders_open_idx
  ON table_orders(closed_at);

-- ─────────────────────────────────────────────────────────────────────────────
-- 7) طلبات + التسويات
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS talabat_orders (
  order_id       TEXT PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
  external_ref   TEXT NOT NULL,
  customer_name  TEXT,
  customer_phone TEXT,
  markup_pct     REAL NOT NULL DEFAULT 20,  -- snapshot وقت البيع
  settlement_id  TEXT,
  note           TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS talabat_ref_uq ON talabat_orders(external_ref);

CREATE TABLE IF NOT EXISTS talabat_settlements (
  id          TEXT PRIMARY KEY,
  period_from TEXT NOT NULL,
  period_to   TEXT NOT NULL,
  gross       REAL NOT NULL DEFAULT 0,
  commission  REAL NOT NULL DEFAULT 0,
  net         REAL NOT NULL DEFAULT 0,
  received_at TEXT,
  note        TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 8) فيو موحّد — كل التقارير بتقرأ منه
-- ─────────────────────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS v_orders;
CREATE VIEW v_orders AS
SELECT
  o.*,
  t.table_id,
  tb.name            AS table_name,
  t.guests,
  t.opened_at,
  t.closed_at,
  d.external_ref,
  d.customer_name    AS talabat_customer,
  d.customer_phone   AS talabat_phone,
  d.markup_pct,
  d.settlement_id
FROM orders o
LEFT JOIN table_orders   t  ON t.order_id  = o.id
LEFT JOIN tables         tb ON tb.id       = t.table_id
LEFT JOIN talabat_orders d  ON d.order_id  = o.id;

PRAGMA foreign_keys = ON;
