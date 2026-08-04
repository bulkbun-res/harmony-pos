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

-- 1. جدول المستخدمين (كاشير ومدير)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT CHECK(role IN ('admin', 'cashier')) NOT NULL,
  name TEXT NOT NULL,
  active INTEGER DEFAULT 1, -- 1 active, 0 frozen
  session_token TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 2. الموظفين (العمال)
CREATE TABLE IF NOT EXISTS employees (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  salary_type TEXT NOT NULL,   -- monthly, daily, hourly
  base_salary REAL NOT NULL,
  active INTEGER DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 3. حضور وانصراف الموظفين
CREATE TABLE IF NOT EXISTS attendance (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  date TEXT NOT NULL,          -- YYYY-MM-DD
  status TEXT NOT NULL,        -- present, absent, excused
  hours REAL DEFAULT 0,        -- عدد الساعات لو بالراتب الساعي
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (employee_id) REFERENCES employees(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS attendance_emp_date_idx ON attendance (employee_id, date);


-- 4. حركات الرواتب وسلفيات العمال
CREATE TABLE IF NOT EXISTS salary_transactions (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  amount REAL NOT NULL,
  type TEXT NOT NULL,          -- advance (سلفة), bonus (مكافأة), deduction (خصم), payout (راتب)
  date TEXT NOT NULL DEFAULT (datetime('now')),
  notes TEXT,
  FOREIGN KEY (employee_id) REFERENCES employees(id)
);

-- 5. المصاريف النثرية والتشغيلية للمطعم
CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,      -- rent, utilities, raw_materials, marketing, maintenance, salaries, misc
  amount REAL NOT NULL,
  description TEXT,
  date TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 6. الفواتير والمبيعات الفعلية (لمزامنتها إلى الخادم)
CREATE TABLE IF NOT EXISTS sales_orders (
  id TEXT PRIMARY KEY,
  order_no INTEGER NOT NULL,
  subtotal REAL NOT NULL,
  discount REAL DEFAULT 0,
  service REAL DEFAULT 0,
  tax REAL DEFAULT 0,
  total REAL NOT NULL,
  payment_method TEXT NOT NULL, -- cash, vodafone, instapay, visa
  status TEXT NOT NULL,         -- paid, cancelled
  shift_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 7. تفاصيل الأصناف داخل الفواتير
CREATE TABLE IF NOT EXISTS sales_order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  name TEXT NOT NULL,
  unit_price REAL NOT NULL,
  qty INTEGER NOT NULL,
  FOREIGN KEY (order_id) REFERENCES sales_orders(id)
);

-- 8. حركات المخزن والهوالك
CREATE TABLE IF NOT EXISTS inventory_logs (
  id TEXT PRIMARY KEY,
  ingredient_id TEXT NOT NULL,
  qty REAL NOT NULL,
  reason TEXT NOT NULL,         -- receive, waste, sale, adjustment
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 9. الورديات وتقفيل الكاشير
CREATE TABLE IF NOT EXISTS shifts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  opened_at TEXT NOT NULL,
  closed_at TEXT,
  opening_cash REAL NOT NULL DEFAULT 0,
  expected_cash REAL NOT NULL DEFAULT 0,
  actual_cash REAL DEFAULT 0,
  difference REAL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open', -- open, closed
  notes TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

