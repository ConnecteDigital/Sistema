import { readFile } from "node:fs/promises";
import { convertLegacyExport, type LegacyExport } from "@/lib/legacy-import";

/**
 * Só em desenvolvimento: serve os dados do export do FCS V1 apontado por
 * LOCAL_LEGACY_EXPORT, para trabalhar nas telas antes do Supabase existir.
 */
export async function GET() {
  const path = process.env.LOCAL_LEGACY_EXPORT;
  if (process.env.NODE_ENV !== "development" || !path) {
    return Response.json({ error: "indisponível" }, { status: 404 });
  }
  const src = JSON.parse(await readFile(path, "utf8")) as LegacyExport;
  let n = 0;
  const { data } = convertLegacyExport(src, () => `dev-${++n}`);
  return Response.json(data);
}
