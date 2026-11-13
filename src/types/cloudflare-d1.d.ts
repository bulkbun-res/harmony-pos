/**
 * تعريفات Cloudflare D1 المختصرة.
 *
 * المشروع مش بيعتمد على @cloudflare/workers-types (مش في dependencies)،
 * والبناء بـ vite مش بيعمل typecheck. الملف ده بيوفّر الأنواع اللي
 * الكود بيستخدمها فعليًا عشان `tsc` يبقى مفيد بدل ما يرمي 35 خطأ
 * "Cannot find name 'D1Database'".
 */

interface D1Result<T = Record<string, unknown>> {
  results: T[];
  success: boolean;
  meta: Record<string, unknown>;
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(colName?: string): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = Record<string, unknown>>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
  exec(query: string): Promise<number>;
  dump(): Promise<ArrayBuffer>;
}
