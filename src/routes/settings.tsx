import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";


import { PosHeader } from "@/components/pos/PosHeader";
import { LOCAL_IMAGES, resolveItemImage } from "@/lib/menu-images";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePos } from "@/lib/pos-store";
import {
  EGP,
  STOCK_UNITS,
  TILE_COLORS,
  type Item,
  type TileColor,
} from "@/lib/pos-types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "الإعدادات | Bulk Bun POS" },
      {
        name: "description",
        content: "إدارة المجموعات والأصناف والإضافات وتحديد الأصناف المتاحة وغير المتاحة.",
      },
      { property: "og:title", content: "الإعدادات | Bulk Bun POS" },
      { property: "og:description", content: "إدارة أصناف ومجموعات مطعم Bulk Bun." },
    ],
  }),
  component: SettingsPage,
});

async function uploadToImgBB(file: File): Promise<string> {
  const apiKey = "78fd75fc68463c9ed79db671b8252f9f";
  const formData = new FormData();
  formData.append("image", file);

  const res = await fetch(`https://api.imgbb.com/1/upload?key=${apiKey}`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    throw new Error("فشل رفع الصورة إلى ImgBB");
  }

  const payload = (await res.json()) as {
    success: boolean;
    data?: { url?: string };
    error?: { message?: string };
  };
  if (!payload.success || !payload.data?.url) {
    throw new Error(payload.error?.message ?? "حدث خطأ غير معروف أثناء رفع الصورة");
  }

  return payload.data.url;
}

function SettingsPage() {
  const { state, addGroup, updateGroup, removeGroup, addItem, updateItem, removeItem, update } =
    usePos();
  const groups = [...state.groups].sort((a, b) => a.order - b.order);

  const [gName, setGName] = useState("");
  const [gColor, setGColor] = useState<TileColor>("leaf");

  const [iName, setIName] = useState("");
  const [iPrice, setIPrice] = useState("");
  const [iGroup, setIGroup] = useState(groups[0]?.id ?? "");
  const [iColor, setIColor] = useState<TileColor>("leaf");
  const [iImage, setIImage] = useState("");


  const [modName, setModName] = useState("");
  const [modPrice, setModPrice] = useState("");
  const [modItemId, setModItemId] = useState("");

  return (
    <div className="min-h-screen bg-background">
      <PosHeader />

      <div className="mx-auto max-w-6xl space-y-4 p-3 lg:p-6">
        <h1 className="text-2xl font-black">الإعدادات</h1>

        <Tabs defaultValue="items">
          <TabsList className="h-12 w-full justify-start gap-1 bg-card p-1">
            <TabsTrigger value="items" className="h-10 px-5 font-bold">
              الأصناف
            </TabsTrigger>
            <TabsTrigger value="groups" className="h-10 px-5 font-bold">
              المجموعات
            </TabsTrigger>
            <TabsTrigger value="extras" className="h-10 px-5 font-bold">
              الإضافات
            </TabsTrigger>
            <TabsTrigger value="recipes" className="h-10 px-5 font-bold">
              الاستهلاك
            </TabsTrigger>
            <TabsTrigger value="general" className="h-10 px-5 font-bold">
              عام
            </TabsTrigger>
          </TabsList>

          {/* ITEMS */}
          <TabsContent value="items" className="space-y-4 pt-4">
            <section className="rounded-2xl border border-border bg-card p-4">
              <h2 className="mb-3 text-base font-extrabold">إضافة صنف جديد</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <div className="space-y-1.5">
                  <Label>اسم الصنف</Label>
                  <Input value={iName} onChange={(e) => setIName(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>السعر (ج.م)</Label>
                  <Input
                    type="number"
                    value={iPrice}
                    onChange={(e) => setIPrice(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>المجموعة</Label>
                  <Select value={iGroup} onValueChange={setIGroup}>
                    <SelectTrigger>
                      <SelectValue placeholder="اختر مجموعة" />
                    </SelectTrigger>
                    <SelectContent>
                      {groups.map((g) => (
                        <SelectItem key={g.id} value={g.id}>
                          {g.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>اللون</Label>
                  <ColorPicker value={iColor} onChange={setIColor} />
                </div>
                <div className="space-y-1.5">
                  <Label>صورة الصنف</Label>
                  <div className="flex items-center gap-2">
                    {iImage ? (
                      <img
                        src={iImage.startsWith("local:") ? resolveItemImage({ id: "", groupId: iGroup, image: iImage }) : iImage}
                        alt="صورة الصنف الجديد"
                        className="h-9 w-12 rounded object-cover"
                      />
                    ) : (
                      <div className="h-9 w-12 rounded bg-secondary flex items-center justify-center text-[10px] text-muted-foreground">بلا صورة</div>
                    )}
                    <Input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      id="new-item-image-file"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const toastId = toast.loading("جارٍ رفع الصورة...");
                        try {
                          const url = await uploadToImgBB(file);
                          setIImage(url);
                          toast.success("تم رفع الصورة بنجاح", { id: toastId });
                        } catch (err) {
                          toast.error(err instanceof Error ? err.message : "فشل الرفع", { id: toastId });
                        }
                      }}
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => document.getElementById("new-item-image-file")?.click()}
                      className="text-xs h-9 font-bold"
                    >
                      <Upload className="h-3.5 w-3.5 mr-1" /> رفع
                    </Button>
                    {iImage && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setIImage("")}
                        className="text-xs h-9 text-destructive font-bold px-2"
                      >
                        حذف
                      </Button>
                    )}
                  </div>
                </div>
              </div>
              <Button
                className="mt-4 font-extrabold"
                onClick={() => {
                  if (!iName.trim() || !iGroup) {
                    toast.error("أدخل اسم الصنف والمجموعة");
                    return;
                  }
                  addItem({
                    name: iName.trim(),
                    price: Number(iPrice) || 0,
                    groupId: iGroup,
                    available: true,
                    w: 1,
                    h: 1,
                    shape: "square",
                    color: iColor,
                    image: iImage || undefined,
                    modifiers: [],
                  });
                  setIName("");
                  setIPrice("");
                  setIImage("");
                  toast.success("تمت إضافة الصنف");
                }}
              >
                <Plus className="h-4 w-4" /> إضافة الصنف
              </Button>
            </section>

            {groups.map((g) => {
              const items = state.items
                .filter((i) => i.groupId === g.id)
                .sort((a, b) => a.order - b.order);
              return (
                <section key={g.id} className="rounded-2xl border border-border bg-card p-4">
                  <h3 className="mb-3 text-sm font-extrabold text-primary">{g.name}</h3>
                  <div className="space-y-2">
                    {items.map((item) => (
                      <div
                        key={item.id}
                        className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl bg-secondary/40 p-3 sm:flex sm:justify-between"
                      >
                        <div className="min-w-0 space-y-1.5">
                          <Input
                            value={item.name}
                            onChange={(e) => updateItem(item.id, { name: e.target.value })}
                            className="h-9 max-w-[16rem] bg-background font-bold"
                          />
                          <Input
                            value={item.desc ?? ""}
                            maxLength={400}
                            onChange={(e) => updateItem(item.id, { desc: e.target.value })}
                            placeholder="وصف مختصر يظهر في منيو العملاء"
                            className="h-8 max-w-[22rem] bg-background text-xs"
                          />
                          <div className="flex max-w-[22rem] items-center gap-2">
                            <img
                              src={resolveItemImage(item)}
                              alt={item.name}
                              loading="lazy"
                              width={768}
                              height={576}
                              className="h-9 w-12 shrink-0 rounded-md object-cover"
                            />
                            <select
                              value={
                                item.image?.startsWith("local:")
                                  ? item.image.slice(6)
                                  : item.image?.startsWith("http")
                                  ? "custom"
                                  : ""
                              }
                              onChange={(e) => {
                                if (e.target.value === "custom") {
                                  // do nothing, let them upload or keep existing URL
                                } else {
                                  updateItem(item.id, {
                                    image: e.target.value ? `local:${e.target.value}` : "",
                                  });
                                }
                              }}
                              className="h-8 flex-1 rounded-md border border-input bg-background px-2 text-xs"
                            >
                              <option value="">صورة تلقائية من الأصول</option>
                              {item.image?.startsWith("http") && (
                                <option value="custom">صورة مخصصة مرفوعة</option>
                              )}
                              {LOCAL_IMAGES.map((img) => (
                                <option key={img.key} value={img.key}>
                                  {img.label}
                                </option>
                              ))}
                            </select>
                            
                            <Input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              id={`upload-item-file-${item.id}`}
                              onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                const toastId = toast.loading("جارٍ رفع الصورة...");
                                try {
                                  const url = await uploadToImgBB(file);
                                  updateItem(item.id, { image: url });
                                  toast.success("تم رفع الصورة بنجاح", { id: toastId });
                                } catch (err) {
                                  toast.error(err instanceof Error ? err.message : "فشل الرفع", { id: toastId });
                                }
                              }}
                            />
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => document.getElementById(`upload-item-file-${item.id}`)?.click()}
                              className="h-8 w-8 p-0 shrink-0"
                              title="رفع صورة مخصصة"
                            >
                              <Upload className="h-4 w-4" />
                            </Button>
                          </div>

                        </div>

                        <div className="flex shrink-0 flex-wrap items-center gap-3">
                          <Input
                            type="number"
                            value={item.price}
                            onChange={(e) =>
                              updateItem(item.id, { price: Number(e.target.value) || 0 })
                            }
                            className="h-9 w-24 bg-background text-end"
                          />
                          <span className="hidden text-xs text-muted-foreground sm:inline">
                            {EGP(item.price)}
                          </span>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={item.available}
                              onCheckedChange={(v) => updateItem(item.id, { available: v })}
                            />
                            <span
                              className={cn(
                                "text-xs font-bold",
                                item.available ? "text-primary" : "text-destructive",
                              )}
                            >
                              {item.available ? "متاح" : "غير متاح"}
                            </span>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive"
                            onClick={() => removeItem(item.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                    {items.length === 0 && (
                      <p className="py-4 text-center text-sm text-muted-foreground">
                        لا توجد أصناف بعد.
                      </p>
                    )}
                  </div>
                </section>
              );
            })}
          </TabsContent>

          {/* GROUPS */}
          <TabsContent value="groups" className="space-y-4 pt-4">
            <section className="rounded-2xl border border-border bg-card p-4">
              <h2 className="mb-3 text-base font-extrabold">إضافة مجموعة</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>اسم المجموعة</Label>
                  <Input value={gName} onChange={(e) => setGName(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>اللون</Label>
                  <ColorPicker value={gColor} onChange={setGColor} />
                </div>
              </div>
              <Button
                className="mt-4 font-extrabold"
                onClick={() => {
                  if (!gName.trim()) {
                    toast.error("أدخل اسم المجموعة");
                    return;
                  }
                  addGroup(gName.trim(), gColor);
                  setGName("");
                  toast.success("تمت إضافة المجموعة");
                }}
              >
                <Plus className="h-4 w-4" /> إضافة المجموعة
              </Button>
            </section>

            <section className="space-y-2 rounded-2xl border border-border bg-card p-4">
              {groups.map((g) => (
                <div
                  key={g.id}
                  className="flex flex-wrap items-center gap-3 rounded-xl bg-secondary/40 p-3"
                >
                  <span
                    className="h-8 w-8 shrink-0 rounded-full"
                    style={{ background: TILE_COLORS[g.color].css }}
                  />
                  <Input
                    value={g.name}
                    onChange={(e) => updateGroup(g.id, { name: e.target.value })}
                    className="h-9 max-w-[14rem] bg-background font-bold"
                  />
                  <ColorPicker
                    value={g.color}
                    onChange={(c) => updateGroup(g.id, { color: c })}
                  />
                  <span className="text-xs text-muted-foreground">
                    {state.items.filter((i) => i.groupId === g.id).length} صنف
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="ms-auto text-destructive"
                    onClick={() => removeGroup(g.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </section>
          </TabsContent>

          {/* EXTRAS */}
          <TabsContent value="extras" className="space-y-4 pt-4">
            <section className="rounded-2xl border border-border bg-card p-4">
              <h2 className="mb-3 text-base font-extrabold">إضافات الأصناف (محتوى إضافي)</h2>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label>الصنف</Label>
                  <Select value={modItemId} onValueChange={setModItemId}>
                    <SelectTrigger>
                      <SelectValue placeholder="اختر صنف" />
                    </SelectTrigger>
                    <SelectContent>
                      {state.items.map((i) => (
                        <SelectItem key={i.id} value={i.id}>
                          {i.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>اسم الإضافة</Label>
                  <Input value={modName} onChange={(e) => setModName(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>سعر الإضافة</Label>
                  <Input
                    type="number"
                    value={modPrice}
                    onChange={(e) => setModPrice(e.target.value)}
                  />
                </div>
              </div>
              <Button
                className="mt-4 font-extrabold"
                onClick={() => {
                  const item = state.items.find((i) => i.id === modItemId);
                  if (!item || !modName.trim()) {
                    toast.error("اختر صنف وأدخل اسم الإضافة");
                    return;
                  }
                  updateItem(item.id, {
                    modifiers: [
                      ...item.modifiers,
                      {
                        id: Math.random().toString(36).slice(2),
                        name: modName.trim(),
                        price: Number(modPrice) || 0,
                      },
                    ],
                  });
                  setModName("");
                  setModPrice("");
                  toast.success("تمت إضافة المحتوى الإضافي");
                }}
              >
                <Plus className="h-4 w-4" /> إضافة
              </Button>
            </section>

            <section className="space-y-2 rounded-2xl border border-border bg-card p-4">
              {state.items
                .filter((i) => (i.modifiers || []).length)
                .map((i) => (
                  <div key={i.id} className="rounded-xl bg-secondary/40 p-3">
                    <p className="mb-2 text-sm font-extrabold">{i.name}</p>
                    <div className="flex flex-wrap gap-2">
                      {(i.modifiers || []).map((m) => (
                        <span
                          key={m.id}
                          className="flex items-center gap-2 rounded-full bg-background px-3 py-1.5 text-xs font-bold"
                        >
                          {m.name} • {EGP(m.price)}
                          <button
                            className="text-destructive"
                            onClick={() =>
                              updateItem(i.id, {
                                modifiers: (i.modifiers || []).filter((x) => x.id !== m.id),
                              })
                            }
                          >
                            ✕
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
            </section>
          </TabsContent>

          {/* RECIPES */}
          <TabsContent value="recipes" className="space-y-4 pt-4">
            <p className="text-sm text-muted-foreground">
              حدّد مكوّنات كل صنف والوزن المستهلك من المخزن لكل وحدة مبيعة — الخصم بيتم
              تلقائيًا مع كل طلب.
            </p>
            {state.items.map((item) => (
              <RecipeEditor key={item.id} item={item} />
            ))}
          </TabsContent>

          {/* GENERAL */}
          <TabsContent value="general" className="pt-4">
            <section className="grid gap-4 rounded-2xl border border-border bg-card p-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>نسبة الخدمة %</Label>
                <Input
                  type="number"
                  value={Math.round(state.serviceRate * 100)}
                  onChange={(e) =>
                    update((s) => ({ ...s, serviceRate: (Number(e.target.value) || 0) / 100 }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>نسبة الضريبة %</Label>
                <Input
                  type="number"
                  value={Math.round(state.taxRate * 100)}
                  onChange={(e) =>
                    update((s) => ({ ...s, taxRate: (Number(e.target.value) || 0) / 100 }))
                  }
                />
              </div>
            </section>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function RecipeEditor({ item }: { item: Item }) {
  const { state, updateItem } = usePos();
  const recipe = item.recipe ?? [];
  const [ingId, setIngId] = useState("");
  const [qty, setQty] = useState("");

  const unitOf = (id: string) => {
    const ing = state.ingredients.find((x) => x.id === id);
    return STOCK_UNITS.find((u) => u.id === ing?.unit)?.label ?? "";
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <h3 className="mb-3 text-sm font-extrabold text-primary">{item.name}</h3>
      <div className="mb-3 flex flex-wrap gap-2">
        {recipe.map((r) => {
          const ing = state.ingredients.find((x) => x.id === r.ingredientId);
          return (
            <span
              key={r.ingredientId}
              className="flex items-center gap-2 rounded-full bg-secondary/60 px-3 py-1.5 text-xs font-bold"
            >
              {ing?.name ?? "محذوف"}
              <Input
                type="number"
                value={r.qty}
                onChange={(e) =>
                  updateItem(item.id, {
                    recipe: recipe.map((x) =>
                      x.ingredientId === r.ingredientId
                        ? { ...x, qty: Number(e.target.value) || 0 }
                        : x,
                    ),
                  })
                }
                className="h-7 w-20 bg-background text-end"
              />
              {unitOf(r.ingredientId)}
              <button
                className="text-destructive"
                onClick={() =>
                  updateItem(item.id, {
                    recipe: recipe.filter((x) => x.ingredientId !== r.ingredientId),
                  })
                }
              >
                ✕
              </button>
            </span>
          );
        })}
        {!recipe.length && (
          <span className="text-xs text-muted-foreground">لا توجد مكوّنات محددة.</span>
        )}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <Select value={ingId} onValueChange={setIngId}>
          <SelectTrigger className="h-9 w-48">
            <SelectValue placeholder="اختر مكوّن من المخزن" />
          </SelectTrigger>
          <SelectContent>
            {state.ingredients
              .filter((i) => !recipe.some((r) => r.ingredientId === i.id))
              .map((i) => (
                <SelectItem key={i.id} value={i.id}>
                  {i.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        <Input
          type="number"
          placeholder="الكمية"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          className="h-9 w-28 text-end"
        />
        <Button
          size="sm"
          className="font-extrabold"
          onClick={() => {
            if (!ingId || !Number(qty)) {
              toast.error("اختر المكوّن وأدخل الكمية");
              return;
            }
            updateItem(item.id, {
              recipe: [...recipe, { ingredientId: ingId, qty: Number(qty) }],
            });
            setIngId("");
            setQty("");
          }}
        >
          <Plus className="h-4 w-4" /> إضافة مكوّن
        </Button>
      </div>
    </section>
  );
}

function ColorPicker({
  value,
  onChange,
}: {
  value: TileColor;
  onChange: (c: TileColor) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {(Object.keys(TILE_COLORS) as TileColor[]).map((c) => (
        <button
          key={c}
          type="button"
          title={TILE_COLORS[c].label}
          onClick={() => onChange(c)}
          style={{ background: TILE_COLORS[c].css }}
          className={cn(
            "h-8 w-8 rounded-full border-2 transition-transform",
            value === c ? "scale-110 border-foreground" : "border-transparent hover:scale-105",
          )}
        />
      ))}
    </div>
  );
}
