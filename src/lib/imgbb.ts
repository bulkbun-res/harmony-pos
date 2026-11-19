/**
 * رفع الصور على ImgBB (المستخدم حالياً في إعدادات الكاشير، وهنستخدمه لإيصالات التحويل).
 *
 * ملاحظة: المفتاح ظاهر في حزمة المتصفح — ده مقبول لأن imgbb مفتاح عام للرفع،
 * لكن معناه إن أي حد يقدر يرفع على نفس الحساب. لو ده بقى مشكلة ننقل الرفع لـ R2.
 */

const IMGBB_KEY = "78fd75fc68463c9ed79db671b8252f9f";

/** يرفع صورة ويرجّع الرابط المباشر (https) */
export async function uploadToImgBB(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("image", file);

  const res = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_KEY}`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) throw new Error("فشل رفع الصورة");

  const payload = (await res.json()) as {
    success: boolean;
    data?: { url?: string };
    error?: { message?: string };
  };
  if (!payload.success || !payload.data?.url) {
    throw new Error(payload.error?.message ?? "تعذر رفع الصورة");
  }
  return payload.data.url;
}

/**
 * يصغّر الصورة قبل الرفع (أقصى بُعد 1280px، JPEG جودة 82).
 * الهدف: سرعة الرفع على نت الموبايل ومساحة أقل على ImgBB.
 */
export async function shrinkImage(file: File, maxSide = 1280, quality = 0.82): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", quality),
    );
    if (!blob) return file;
    return new File([blob], "receipt.jpg", { type: "image/jpeg" });
  } catch {
    return file; // لو فشل التصغير نرفع الأصل
  }
}
