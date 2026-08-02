ALTER TABLE public.online_orders
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS paid_amount numeric,
  ADD COLUMN IF NOT EXISTS paid_at timestamp with time zone;

ALTER TABLE public.online_orders
  ADD CONSTRAINT online_orders_payment_method_chk
  CHECK (payment_method IS NULL OR payment_method IN ('cash','vodafone','instapay','visa'));