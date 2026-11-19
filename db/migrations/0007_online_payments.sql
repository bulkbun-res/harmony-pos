-- ============================================================================
-- 0007: الدفع في المنيو الإلكتروني
--
-- إضافي بالكامل: أعمدة جديدة على online_orders فقط.
-- حالة الدفع في عمود منفصل (payment_status) عشان ما نلمسش status الموجود.
-- ============================================================================

ALTER TABLE online_orders ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'unpaid';
        -- unpaid | cod | pending_review | verified | rejected

ALTER TABLE online_orders ADD COLUMN receipt_url  TEXT;   -- صورة التحويل (ImgBB)
ALTER TABLE online_orders ADD COLUMN verified_at  TEXT;
ALTER TABLE online_orders ADD COLUMN verified_by  TEXT;
ALTER TABLE online_orders ADD COLUMN reject_note  TEXT;

CREATE INDEX IF NOT EXISTS online_orders_pay_idx ON online_orders (payment_status, created_at DESC);
