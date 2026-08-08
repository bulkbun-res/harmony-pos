import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { publishMenu, posListOrders } from "./online.functions";
import type { PublicMenu } from "./online-schemas";
import { usePos } from "./pos-store";

/** يبني نسخة المنيو المنشورة للعملاء من بيانات الـPOS المحلية */
export function useMenuPublisher() {
  const { state, ready } = usePos();
  const push = useServerFn(publishMenu);
  const [publishing, setPublishing] = useState(false);
  const [lastPublished, setLastPublished] = useState<number | null>(null);
  const lastHash = useRef("");

  const publish = useCallback(
    async (notify = false) => {
      const menu: PublicMenu = {
        groups: state.groups.map((g) => ({
          id: g.id,
          name: g.name,
          color: g.color,
          order: g.order,
        })),
        items: state.items.map((i) => ({
          id: i.id,
          groupId: i.groupId,
          name: i.name,
          price: i.price,
          available: i.available,
          color: i.color,
          order: i.order,
          ...(i.image ? { image: i.image } : {}),
          ...(i.desc ? { desc: i.desc } : {}),
          ingredients: (i.recipe ?? [])
            .map((r) => state.ingredients.find((x) => x.id === r.ingredientId)?.name)
            .filter((n): n is string => !!n),
          modifiers: i.modifiers ?? [],
          recipe: i.recipe ?? [],
        })),
        ingredients: state.ingredients.map((ing) => ({
          id: ing.id,
          name: ing.name,
          unit: ing.unit,
          stock: ing.stock,
          par: ing.par,
          lowAt: ing.lowAt,
        })),
        taxRate: state.taxRate,
        serviceRate: state.serviceRate,
      };
      const hash = JSON.stringify(menu);
      if (!notify && hash === lastHash.current) return;
      setPublishing(true);
      try {
        await push({ data: menu });
        lastHash.current = hash;
        setLastPublished(Date.now());
        if (notify) toast.success("تم نشر المنيو للعملاء");
      } catch (e) {
        if (notify) toast.error(e instanceof Error ? e.message : "تعذر نشر المنيو");
      } finally {
        setPublishing(false);
      }
    },
    [push, state.groups, state.items, state.ingredients],
  );

  // نشر تلقائي عند أي تغيير في المنيو
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => void publish(false), 800);
    return () => clearTimeout(t);
  }, [ready, publish]);

  return { publish, publishing, lastPublished };
}

/** عدد الطلبات الأونلاين اللي محتاجة تدخّل من الكاشير */
export function useOnlineAlerts() {
  const list = useServerFn(posListOrders);
  const [pending, setPending] = useState(0);
  const seen = useRef<Set<string>>(new Set());
  const primed = useRef(false);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const rows = await list({});
        if (!alive) return;
        const actionable = rows.filter((o) => o.status === "new" || o.status === "approved");
        setPending(actionable.length);
        for (const o of actionable) {
          const key = `${o.id}:${o.status}`;
          if (seen.current.has(key)) continue;
          seen.current.add(key);
          if (!primed.current) continue;
          toast.success(
            o.status === "new"
              ? `طلب جديد من المنيو #${o.order_no} — ${o.customer_name}`
              : `العميل وافق على تعديل الطلب #${o.order_no}`,
            { duration: 8000 },
          );
        }
        primed.current = true;
      } catch {
        /* تجاهل */
      }
    };
    void tick();
    const t = setInterval(() => void tick(), 8000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [list]);

  return pending;
}
