-- ============================================================================
-- 0004: idempotency_key — يمنع تكرار الفاتورة لو نفس العملية اتنفذت مرتين
-- (مثلاً تحويل طلب أونلاين لفاتورة كاشير ثم الضغط مرتين)
-- ============================================================================

ALTER TABLE orders ADD COLUMN idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS orders_idem_uq
  ON orders(idempotency_key) WHERE idempotency_key IS NOT NULL;
