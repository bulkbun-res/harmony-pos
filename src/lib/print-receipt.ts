import { EGP, PAYMENT_METHODS, type Order } from "./pos-types";

const esc = (s: string) =>
  s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] ?? c);

const fmtDate = (t: number) =>
  new Date(t).toLocaleString("ar-EG", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

export interface ReceiptMeta {
  title?: string;
  customer?: string;
  phone?: string;
  footer?: string;
}

/** يبني HTML فاتورة حرارية 80mm ويفتح نافذة الطباعة */
export function printReceipt(order: Order, meta: ReceiptMeta = {}) {
  const lines = order.lines
    .map((l) => {
      const mods = l.modifiers
        .map((m) => {
          const prefix = m.name.startsWith("بدون") ? "" : "+ ";
          return `<div class="mod">${prefix}${esc(m.name)}</div>`;
        })
        .join("");
      const price = (l.unitPrice + l.modifiers.reduce((s, m) => s + m.price, 0)) * l.qty;
      return `<tr><td>${l.qty} × ${esc(l.name)}${mods}</td><td class="num">${EGP(price)}</td></tr>`;
    })
    .join("");

  const payments = order.payments
    .map(
      (p) =>
        `<tr><td>${esc(PAYMENT_METHODS.find((m) => m.id === p.method)?.label ?? p.method)}</td><td class="num">${EGP(p.amount)}</td></tr>`,
    )
    .join("");

  const html = `<!doctype html>
<html dir="rtl" lang="ar"><head><meta charset="utf-8" />
<title>فاتورة #${order.orderNo}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;800;900&amp;display=swap" rel="stylesheet" />
<style>
  *{box-sizing:border-box}
  body{font-family:"Cairo",Arial,sans-serif;margin:0;padding:4px 10px 60px;width:72mm;color:#000;background:#fff}
  h1{font-size:16px;margin:0;text-align:center;font-weight:900}
  .sub{text-align:center;font-size:11px;margin:2px 0 6px}
  table{width:100%;border-collapse:collapse;font-size:12.5px}
  td{padding:2.5px 0;vertical-align:top}
  .num{text-align:left;white-space:nowrap;font-weight:800;padding-left:4px}
  .mod{font-size:11px;color:#000;font-weight:900;margin-right:10px;display:block;margin-top:1px}
  .hr{border-top:1px dashed #000;margin:6px 0}
  .total{display:flex;justify-content:space-between;font-size:15px;font-weight:900;margin-top:4px}
  .foot{text-align:center;font-size:11px;margin-top:8px;padding-bottom:10px}
  @media print{@page{margin:0;size:72mm auto}}
</style></head>
<body>
  <h1>Bulk Bun — ${esc(meta.title ?? "فاتورة")}</h1>
  <div class="sub">فاتورة رقم #${order.orderNo}<br/>${fmtDate(order.createdAt)}</div>
  ${meta.customer ? `<div class="sub">العميل: ${esc(meta.customer)}${meta.phone ? ` — ${esc(meta.phone)}` : ""}</div>` : ""}
  <div class="hr"></div>
  <table>${lines}</table>
  <div class="hr"></div>
  <table>
    <tr><td>الإجمالي الفرعي</td><td class="num">${EGP(order.subtotal)}</td></tr>
    ${order.discount > 0 ? `<tr><td>خصم</td><td class="num">- ${EGP(order.discount)}</td></tr>` : ""}
    <tr><td>خدمة</td><td class="num">${EGP(order.service)}</td></tr>
    <tr><td>ضريبة</td><td class="num">${EGP(order.tax)}</td></tr>
  </table>
  <div class="total"><span>الإجمالي</span><span>${EGP(order.total)}</span></div>
  ${payments ? `<div class="hr"></div><table>${payments}</table>` : ""}
  ${order.status === "cancelled" ? `<div class="foot"><b>** فاتورة ملغاة **</b></div>` : ""}
  <div class="foot">${esc(meta.footer ?? "شكرًا لزيارتك — Bulk Bun Healthy Sandwiches")}</div>
  <div style="height: 50px;"></div>
</body></html>`;

  try {
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "none";
    iframe.style.visibility = "hidden";
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) {
      throw new Error("Unable to access iframe document");
    }

    doc.open();
    doc.write(html);
    doc.close();

    setTimeout(() => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch (e) {
        console.error("Iframe print error:", e);
      } finally {
        setTimeout(() => {
          if (document.body.contains(iframe)) {
            document.body.removeChild(iframe);
          }
        }, 1200);
      }
    }, 200);

    return true;
  } catch (err) {
    console.warn("Fallback to popup print window:", err);
    const popupHtml = html.replace(
      "</body></html>",
      `<script>window.onload=function(){window.focus();window.print();setTimeout(function(){window.close()},400)}<\/script></body></html>`,
    );
    const w = window.open("", "_blank", "width=380,height=640");
    if (!w) return false;
    w.document.open();
    w.document.write(popupHtml);
    w.document.close();
    return true;
  }
}
