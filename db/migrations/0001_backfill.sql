-- ============================================================================
-- BulkBun POS — migration 0001 (backfill)
-- ترحيل الفواتير القديمة من sales_orders / sales_order_items إلى الموديل الجديد.
--
-- كل الفواتير القديمة => channel = 'counter'  (تيك أواي/كاشير)
-- is_legacy = 1  عشان تكرار أرقام الفواتير القديمة مايكسرش قيد الـ UNIQUE.
--
-- شغّلها بعد 0001_channels.sql. آمنة للتشغيل أكثر من مرة (INSERT OR IGNORE).
-- ============================================================================

-- 1) الفواتير
INSERT OR IGNORE INTO orders (
  id, channel, order_no, status,
  subtotal, discount, service_rate, service, tax_rate, tax, total,
  payment_method, paid_at,
  shift_id, user_id, user_name,
  is_legacy, created_at, updated_at
)
SELECT
  s.id,
  'counter',
  s.order_no,
  CASE WHEN s.status IN ('paid','cancelled') THEN s.status ELSE 'paid' END,
  COALESCE(s.subtotal, 0),
  COALESCE(s.discount, 0),
  0,
  COALESCE(s.service, 0),
  0,
  COALESCE(s.tax, 0),
  COALESCE(s.total, 0),
  s.payment_method,
  CASE WHEN s.status = 'paid' THEN s.created_at ELSE NULL END,
  s.shift_id,
  NULL,
  NULL,
  1,
  s.created_at,
  COALESCE(s.updated_at, s.created_at)
FROM sales_orders s;

-- 2) أسطر الفواتير
INSERT OR IGNORE INTO order_lines (
  id, order_id, item_id, name,
  base_price, unit_price, qty, line_total,
  kind, parent_line_id, voided, created_at
)
SELECT
  i.id,
  i.order_id,
  i.item_id,
  i.name,
  COALESCE(i.unit_price, 0),
  COALESCE(i.unit_price, 0),
  COALESCE(i.qty, 1),
  ROUND(COALESCE(i.unit_price, 0) * COALESCE(i.qty, 1), 2),
  'item',
  NULL,
  0,
  COALESCE(o.created_at, datetime('now'))
FROM sales_order_items i
LEFT JOIN sales_orders o ON o.id = i.order_id;

-- 3) تفاصيل التيك أواي لكل فاتورة قديمة (صف بصف — عشان الفيو يبقى متسق)
INSERT OR IGNORE INTO counter_orders (order_id)
SELECT id FROM orders WHERE channel = 'counter' AND is_legacy = 1;

-- 4) ضبط عدّاد الفواتير الجديد فوق أعلى رقم قديم
UPDATE order_counters
SET next_no = (
  SELECT CASE
           WHEN COALESCE(MAX(order_no), 0) + 1 > 3001
             THEN MAX(order_no) + 1
           ELSE 3001
         END
  FROM orders
)
WHERE id = 1;
