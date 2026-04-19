import type { Json } from "@/types/database";

/** JSON-serializable snapshot for jsonb columns (Dates → ISO, strips NaN). */
export function jsonSafe(v: unknown): Json {
  try {
    return JSON.parse(
      JSON.stringify(v, (_k, x) => {
        if (x instanceof Date) return x.toISOString();
        if (typeof x === "number" && (!Number.isFinite(x) || Number.isNaN(x))) return null;
        if (typeof x === "bigint") return x.toString();
        return x;
      }),
    ) as Json;
  } catch {
    return null;
  }
}
