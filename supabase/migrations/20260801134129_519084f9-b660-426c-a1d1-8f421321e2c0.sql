CREATE TABLE public.menu_snapshot (
  id text PRIMARY KEY DEFAULT 'current',
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.menu_snapshot TO anon, authenticated;
GRANT ALL ON public.menu_snapshot TO service_role;
ALTER TABLE public.menu_snapshot ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Menu snapshot is publicly readable"
  ON public.menu_snapshot FOR SELECT TO anon, authenticated USING (true);

CREATE SEQUENCE public.online_order_no_seq START WITH 5001;

CREATE TABLE public.online_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token uuid NOT NULL DEFAULT gen_random_uuid(),
  order_no integer NOT NULL DEFAULT nextval('public.online_order_no_seq'),
  customer_name text NOT NULL,
  customer_phone text NOT NULL,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  total numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'new',
  proposed_items jsonb,
  proposed_total numeric,
  proposed_note text,
  proposed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER SEQUENCE public.online_order_no_seq OWNED BY public.online_orders.order_no;

GRANT ALL ON public.online_orders TO service_role;
GRANT USAGE ON SEQUENCE public.online_order_no_seq TO service_role;
ALTER TABLE public.online_orders ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$
LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER online_orders_touch BEFORE UPDATE ON public.online_orders
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER menu_snapshot_touch BEFORE UPDATE ON public.menu_snapshot
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX online_orders_created_idx ON public.online_orders (created_at DESC);