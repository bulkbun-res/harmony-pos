-- Harmony POS — D1 SQLite Schema
-- بديل عن Supabase migrations

CREATE TABLE IF NOT EXISTS menu_snapshot (
  id TEXT PRIMARY KEY DEFAULT 'current',
  data TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- رقم تسلسلي للطلبات الأونلاين (يبدأ من 5001)
CREATE TABLE IF NOT EXISTS order_seq (
  id INTEGER PRIMARY KEY DEFAULT 1,
  next_no INTEGER NOT NULL DEFAULT 5001
);
INSERT OR IGNORE INTO order_seq (id, next_no) VALUES (1, 5001);

CREATE TABLE IF NOT EXISTS online_orders (
  id TEXT PRIMARY KEY,
  token TEXT NOT NULL,
  order_no INTEGER NOT NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  items TEXT NOT NULL DEFAULT '[]',
  total REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'new',
  proposed_items TEXT,
  proposed_total REAL,
  proposed_note TEXT,
  proposed_at TEXT,
  payment_method TEXT CHECK(payment_method IS NULL OR payment_method IN ('cash','vodafone','instapay','visa')),
  paid_amount REAL,
  paid_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS online_orders_created_idx ON online_orders (created_at DESC);
CREATE INDEX IF NOT EXISTS online_orders_token_idx ON online_orders (token);
