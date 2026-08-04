// كل صور المنيو محلية داخل src/assets — لا يوجد أي اعتماد على روابط خارجية
import imgSandwich from "@/assets/menu-sandwich.jpg";
import imgMeal from "@/assets/menu-meal.jpg";
import imgSalad from "@/assets/menu-salad.jpg";
import imgDrink from "@/assets/menu-drink.jpg";
import imgDrinkHot from "@/assets/menu-drink-hot.jpg";

import s0 from "@/assets/menu/sandwiches-0.jpg";
import s1 from "@/assets/menu/sandwiches-1.jpg";
import s2 from "@/assets/menu/sandwiches-2.jpg";
import s3 from "@/assets/menu/sandwiches-3.jpg";
import s4 from "@/assets/menu/sandwiches-4.jpg";
import s5 from "@/assets/menu/sandwiches-5.jpg";
import m0 from "@/assets/menu/meals-0.jpg";
import m1 from "@/assets/menu/meals-1.jpg";
import m2 from "@/assets/menu/meals-2.jpg";
import sa0 from "@/assets/menu/salads-0.jpg";
import sa1 from "@/assets/menu/salads-1.jpg";
import sa2 from "@/assets/menu/salads-2.jpg";
import si0 from "@/assets/menu/sides-0.jpg";
import si1 from "@/assets/menu/sides-1.jpg";
import si2 from "@/assets/menu/sides-2.jpg";
import d0 from "@/assets/menu/drinks-0.jpg";
import d1 from "@/assets/menu/drinks-1.jpg";
import d2 from "@/assets/menu/drinks-2.jpg";
import d3 from "@/assets/menu/drinks-3.jpg";
import dbBanana from "@/assets/menu/drinks-banana.png";
import dbMango from "@/assets/menu/drinks-mango.png";
import dbGuava from "@/assets/menu/drinks-guava.png";
import dbStrawberry from "@/assets/menu/drinks-strawberry.png";

/** مكتبة الصور المحلية: المفتاح يتخزن في الصنف بصيغة local:key */
export const LOCAL_IMAGES: { key: string; label: string; src: string }[] = [
  { key: "sandwiches-0", label: "تشيكن جريل", src: s0 },
  { key: "sandwiches-1", label: "تشيكن سيزر", src: s1 },
  { key: "sandwiches-2", label: "بيف ستيك", src: s2 },
  { key: "sandwiches-3", label: "تونة صحية", src: s3 },
  { key: "sandwiches-4", label: "شاورما فراخ", src: s4 },
  { key: "sandwiches-5", label: "فاهيتا", src: s5 },
  { key: "meals-0", label: "وجبة تشيكن جريل", src: m0 },
  { key: "meals-1", label: "وجبة بيف", src: m1 },
  { key: "meals-2", label: "وجبة تونة", src: m2 },
  { key: "salads-0", label: "سيزر سلطة", src: sa0 },
  { key: "salads-1", label: "سلطة يونانية", src: sa1 },
  { key: "salads-2", label: "كول سلو", src: sa2 },
  { key: "sides-0", label: "بطاطس ودجز", src: si0 },
  { key: "sides-1", label: "صوص إضافي", src: si1 },
  { key: "sides-2", label: "خبز إضافي", src: si2 },
  { key: "drinks-0", label: "مياه معدنية", src: d0 },
  { key: "drinks-1", label: "عصير برتقال", src: d1 },
  { key: "drinks-2", label: "بيبسي", src: d2 },
  { key: "drinks-3", label: "لاتيه بارد", src: d3 },
  { key: "drinks-banana", label: "موز باللبن", src: dbBanana },
  { key: "drinks-mango", label: "عصير مانجو", src: dbMango },
  { key: "drinks-guava", label: "عصير جوافة", src: dbGuava },
  { key: "drinks-strawberry", label: "عصير فراولة", src: dbStrawberry },
  { key: "generic-sandwich", label: "ساندويتش (عام)", src: imgSandwich },
  { key: "generic-meal", label: "وجبة (عام)", src: imgMeal },
  { key: "generic-salad", label: "سلطة (عام)", src: imgSalad },
  { key: "generic-drink", label: "مشروب (عام)", src: imgDrink },
  { key: "generic-hot-drink", label: "مشروب ساخن", src: imgDrinkHot },
];

const BY_KEY = new Map(LOCAL_IMAGES.map((x) => [x.key, x.src]));

export const groupFallbackImage = (groupId: string) => {
  if (groupId.includes("meal")) return imgMeal;
  if (groupId.includes("salad")) return imgSalad;
  if (groupId.includes("drink")) return imgDrink;
  return imgSandwich;
};

/** يرجّع صورة الصنف من الكودبيس دايمًا (local:key أو رابط مباشر أو صورة المجموعة) */
export const resolveItemImage = (item: {
  id: string;
  groupId: string;
  image?: string | undefined;
}): string => {
  const raw = item.image?.trim();
  if (raw) {
    if (raw.startsWith("http://") || raw.startsWith("https://")) {
      return raw;
    }
    const key = raw.startsWith("local:") ? raw.slice(6) : raw;
    const hit = BY_KEY.get(key);
    if (hit) return hit;
  }
  return BY_KEY.get(item.id) ?? groupFallbackImage(item.groupId);
};
