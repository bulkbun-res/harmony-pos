import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, PackagePlus, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { AuthGuard } from "@/components/AuthGuard";
import { PosHeader } from "@/components/pos/PosHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePos } from "@/lib/pos-store";
import { STOCK_REASONS, STOCK_UNITS, type Ingredient, type StockUnit } from "@/lib/pos-types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/inventory")({
  head: () => ({
    meta: [
      { title: "المخزن | Bulk Bun POS" },
      {
        name: "description",
        content:
          "إدارة مخزن المطعم يوميًا: استلام الأصناف الخام، الخصم التلقائي مع كل طلب، تنبيه قرب النفاد، وجرد نهاية الوردية.",
      },
      { property: "og:title", content: "المخزن | Bulk Bun POS" },
      {
        property: "og:description",
        content: "مخزون Bulk Bun لحظيًا مع خصم تلقائي من المبيعات وتقرير نهاية الوردية.",
      },
    ],
  }),
  component: () => (
    <AuthGuard>
      <InventoryScreen />
    </AuthGuard>
  ),
});

const fmtQty = (n: number, unit: StockUnit) => {
  const u = STOCK_UNITS.find((x) => x.id === unit)?.label ?? unit;
  const v = Math.round(n * 100) / 100;
  return `${v.toLocaleString("ar-EG")} ${u}`;
};

const fmtTime = (t: number) =>
  new Date(t).toLocaleString("ar-EG", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

const pct = (i: Ingredient) => (i.par > 0 ? Math.max(0, Math.min(1, i.stock / i.par)) : 0);
const statusOf = (i: Ingredient) => (i.stock <= 0 ? "out" : i.stock <= i.lowAt ? "low" : "ok");

function InventoryScreen() {
  const { state, addIngredient, updateIngredient, removeIngredient, stockMove, startShift } =
    usePos();

  const [name, setName] = useState("");
  const [unit, setUnit] = useState<StockUnit>("g");
  const [par, setPar] = useState("");
  const [stock, setStock] = useState("");
  const [recvQty, setRecvQty] = useState<Record<string, string>>({});

  const ingredients = state.ingredients;
  const lowList = ingredients.filter((i) => statusOf(i) !== "ok");

  const shiftMoves = useMemo(
    () => state.stockMoves.filter((m) => m.at >= state.shiftStartedAt),
    [state.stockMoves, state.shiftStartedAt],
  );

  const shiftRows = useMemo(
    () =>
      ingredients.map((i) => {
        const mine = shiftMoves.filter((m) => m.ingredientId === i.id);
        const inQty = mine.filter((m) => m.qty > 0).reduce((s, m) => s + m.qty, 0);
        const outQty = -mine.filter((m) => m.qty < 0).reduce((s, m) => s + m.qty, 0);
        return { ing: i, inQty, outQty, opening: i.stock - inQty + outQty };
      }),
    [ingredients, shiftMoves],
  );

  return (
    <div className="min-h-screen bg-background">
      <PosHeader />

      <div className="mx-auto max-w-6xl space-y-4 p-3 lg:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-black">المخزن</h1>
          <p className="text-xs text-muted-foreground">
            بداية الوردية: {fmtTime(state.shiftStartedAt)}
          </p>
        </div>

        {lowList.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-destructive/40 bg-destructive/10 p-3">
            <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" />
            <p className="text-sm font-extrabold text-destructive">
              {lowList.length} صنف قرب ينتهي أو خلص:
            </p>
            <div className="flex flex-wrap gap-1.5">
              {lowList.map((i) => (
                <span key={i.id} className="rounded-full bg-background px-3 py-1 text-xs font-bold">
                  {i.name} — {fmtQty(i.stock, i.unit)}
                </span>
              ))}
            </div>
          </div>
        )}

        <Tabs defaultValue="stock">
          <TabsList className="h-12 w-full justify-start gap-1 bg-card p-1">
            <TabsTrigger value="stock" className="h-10 px-5 font-bold">
              الرصيد الحالي
            </TabsTrigger>
            <TabsTrigger value="receive" className="h-10 px-5 font-bold">
              استلام يومي
            </TabsTrigger>
            <TabsTrigger value="shift" className="h-10 px-5 font-bold">
              جرد الوردية
            </TabsTrigger>
            <TabsTrigger value="moves" className="h-10 px-5 font-bold">
              الحركة
            </TabsTrigger>
          </TabsList>

          {/* STOCK */}
          <TabsContent value="stock" className="space-y-4 pt-4">
            <section className="rounded-2xl border border-border bg-card p-4">
              <h2 className="mb-3 text-base font-extrabold">إضافة صنف للمخزن</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1.5">
                  <Label>اسم الصنف الخام</Label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="بصل، ثوم، صدور دجاج..."
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>الوحدة</Label>
                  <Select value={unit} onValueChange={(v) => setUnit(v as StockUnit)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STOCK_UNITS.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>الكمية المرجعية (مخزن ممتلئ)</Label>
                  <Input type="number" value={par} onChange={(e) => setPar(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>الرصيد الحالي</Label>
                  <Input type="number" value={stock} onChange={(e) => setStock(e.target.value)} />
                </div>
              </div>
              <Button
                className="mt-4 font-extrabold"
                onClick={() => {
                  if (!name.trim()) {
                    toast.error("أدخل اسم الصنف");
                    return;
                  }
                  const parN = Number(par) || 0;
                  addIngredient({
                    name: name.trim(),
                    unit,
                    par: parN,
                    stock: Number(stock) || 0,
                    lowAt: Math.round(parN * 0.1 * 100) / 100,
                  });
                  setName("");
                  setPar("");
                  setStock("");
                  toast.success("تمت الإضافة للمخزن");
                }}
              >
                <Plus className="h-4 w-4" /> إضافة
              </Button>
            </section>

            <section className="space-y-2 rounded-2xl border border-border bg-card p-4">
              {ingredients.map((i) => {
                const st = statusOf(i);
                return (
                  <div key={i.id} className="rounded-xl bg-secondary/40 p-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <Input
                        value={i.name}
                        onChange={(e) => updateIngredient(i.id, { name: e.target.value })}
                        className="h-9 max-w-[13rem] bg-background font-bold"
                      />
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-muted-foreground">الرصيد</span>
                        <Input
                          type="number"
                          value={i.stock}
                          onChange={(e) =>
                            updateIngredient(i.id, { stock: Number(e.target.value) || 0 })
                          }
                          className="h-9 w-24 bg-background text-end"
                        />
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-muted-foreground">مرجعي</span>
                        <Input
                          type="number"
                          value={i.par}
                          onChange={(e) =>
                            updateIngredient(i.id, { par: Number(e.target.value) || 0 })
                          }
                          className="h-9 w-24 bg-background text-end"
                        />
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-muted-foreground">تنبيه عند</span>
                        <Input
                          type="number"
                          value={i.lowAt}
                          onChange={(e) =>
                            updateIngredient(i.id, { lowAt: Number(e.target.value) || 0 })
                          }
                          className="h-9 w-24 bg-background text-end"
                        />
                      </div>
                      <Select
                        value={i.unit}
                        onValueChange={(v) => updateIngredient(i.id, { unit: v as StockUnit })}
                      >
                        <SelectTrigger className="h-9 w-28 bg-background">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STOCK_UNITS.map((u) => (
                            <SelectItem key={u.id} value={u.id}>
                              {u.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <span
                        className={cn(
                          "rounded-full px-3 py-1 text-xs font-extrabold",
                          st === "ok" && "bg-primary/15 text-primary",
                          st === "low" && "bg-amber-500/20 text-amber-500",
                          st === "out" && "bg-destructive/20 text-destructive",
                        )}
                      >
                        {st === "ok" ? "متوفر" : st === "low" ? "قرب ينتهي" : "انتهى"}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="ms-auto text-destructive"
                        onClick={() => removeIngredient(i.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-background">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          st === "ok"
                            ? "bg-primary"
                            : st === "low"
                              ? "bg-amber-500"
                              : "bg-destructive",
                        )}
                        style={{ width: `${pct(i) * 100}%` }}
                      />
                    </div>
                  </div>
                );
              })}
              {!ingredients.length && (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  لا توجد أصناف في المخزن بعد.
                </p>
              )}
            </section>
          </TabsContent>

          {/* RECEIVE */}
          <TabsContent value="receive" className="space-y-2 pt-4">
            <section className="space-y-2 rounded-2xl border border-border bg-card p-4">
              <h2 className="mb-1 text-base font-extrabold">
                استلام اليوم — اكتب الكميات اللي جِبتها
              </h2>
              {ingredients.map((i) => (
                <div
                  key={i.id}
                  className="flex flex-wrap items-center gap-3 rounded-xl bg-secondary/40 p-3"
                >
                  <span className="min-w-[8rem] font-bold">{i.name}</span>
                  <span className="text-xs text-muted-foreground">
                    الحالي: {fmtQty(i.stock, i.unit)}
                  </span>
                  <Input
                    type="number"
                    placeholder="الكمية الواردة"
                    value={recvQty[i.id] ?? ""}
                    onChange={(e) => setRecvQty((p) => ({ ...p, [i.id]: e.target.value }))}
                    className="h-9 w-32 bg-background text-end"
                  />
                  <Button
                    size="sm"
                    className="font-extrabold"
                    onClick={() => {
                      const q = Number(recvQty[i.id]);
                      if (!q) {
                        toast.error("أدخل كمية");
                        return;
                      }
                      stockMove(i.id, Math.abs(q), "receive", "استلام");
                      setRecvQty((p) => ({ ...p, [i.id]: "" }));
                      toast.success(`تم استلام ${fmtQty(Math.abs(q), i.unit)} ${i.name}`);
                    }}
                  >
                    <PackagePlus className="h-4 w-4" /> استلام
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="font-extrabold text-destructive"
                    onClick={() => {
                      const q = Number(recvQty[i.id]);
                      if (!q) {
                        toast.error("أدخل كمية");
                        return;
                      }
                      stockMove(i.id, -Math.abs(q), "waste", "هالك");
                      setRecvQty((p) => ({ ...p, [i.id]: "" }));
                      toast.success("تم تسجيل الهالك");
                    }}
                  >
                    هالك
                  </Button>
                </div>
              ))}
            </section>
          </TabsContent>

          {/* SHIFT */}
          <TabsContent value="shift" className="space-y-3 pt-4">
            <section className="rounded-2xl border border-border bg-card p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-base font-extrabold">الباقي في نهاية الوردية / اليوم</h2>
                <Button
                  variant="outline"
                  className="font-extrabold"
                  onClick={() => {
                    startShift();
                    toast.success("تم إقفال الوردية وبدء وردية جديدة");
                  }}
                >
                  إقفال الوردية وبدء وردية جديدة
                </Button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[34rem] text-sm">
                  <thead className="text-xs text-muted-foreground">
                    <tr className="text-start">
                      <th className="p-2 text-start">الصنف</th>
                      <th className="p-2 text-start">أول الوردية</th>
                      <th className="p-2 text-start">وارد</th>
                      <th className="p-2 text-start">منصرف</th>
                      <th className="p-2 text-start">الباقي</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shiftRows.map((r) => (
                      <tr key={r.ing.id} className="border-t border-border">
                        <td className="p-2 font-bold">{r.ing.name}</td>
                        <td className="p-2">{fmtQty(r.opening, r.ing.unit)}</td>
                        <td className="p-2 text-primary">{fmtQty(r.inQty, r.ing.unit)}</td>
                        <td className="p-2 text-destructive">{fmtQty(r.outQty, r.ing.unit)}</td>
                        <td
                          className={cn(
                            "p-2 font-extrabold",
                            statusOf(r.ing) !== "ok" && "text-destructive",
                          )}
                        >
                          {fmtQty(r.ing.stock, r.ing.unit)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </TabsContent>

          {/* MOVES */}
          <TabsContent value="moves" className="space-y-2 pt-4">
            <section className="space-y-1.5 rounded-2xl border border-border bg-card p-4">
              {state.stockMoves.slice(0, 200).map((m) => {
                const i = ingredients.find((x) => x.id === m.ingredientId);
                return (
                  <div
                    key={m.id}
                    className="flex flex-wrap items-center gap-3 rounded-xl bg-secondary/40 px-3 py-2 text-sm"
                  >
                    <span className="font-bold">{i?.name ?? "—"}</span>
                    <span
                      className={cn(
                        "font-extrabold",
                        m.qty > 0 ? "text-primary" : "text-destructive",
                      )}
                    >
                      {m.qty > 0 ? "+" : "−"}
                      {fmtQty(Math.abs(m.qty), i?.unit ?? "g")}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {STOCK_REASONS[m.reason]}
                      {m.orderNo ? ` • فاتورة #${m.orderNo}` : ""}
                    </span>
                    <span className="ms-auto text-xs text-muted-foreground">{fmtTime(m.at)}</span>
                  </div>
                );
              })}
              {!state.stockMoves.length && (
                <p className="py-6 text-center text-sm text-muted-foreground">لا توجد حركات بعد.</p>
              )}
            </section>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
