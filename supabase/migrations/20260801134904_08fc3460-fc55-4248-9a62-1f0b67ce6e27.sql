-- online_orders holds PII (customer name + phone). It must NEVER be reachable
-- directly from the browser. All access goes through TanStack server functions
-- that use the service role and validate the per-order token (customer) or the
-- cashier POS screen. Make the deny-by-default posture explicit.

REVOKE ALL ON public.online_orders FROM anon;
REVOKE ALL ON public.online_orders FROM authenticated;
GRANT ALL ON public.online_orders TO service_role;

ALTER TABLE public.online_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.online_orders FORCE ROW LEVEL SECURITY;

COMMENT ON TABLE public.online_orders IS
  'Contains customer PII (name, phone). Deny-by-default: no Data API grants and no RLS policies for anon/authenticated. Access only via server-side service-role code that validates the per-order token or the authenticated cashier screen.';
