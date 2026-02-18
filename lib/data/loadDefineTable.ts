import fs from "node:fs";
import path from "node:path";
import Papa from "papaparse";

type DefineRow = {
  key: string;
  value: string;
};

type ParseResult = {
  data: DefineRow[];
  errors?: unknown[];
};

function normalize(raw?: string): string {
  return (raw ?? "").replace(/\r/g, "").trim();
}

export function loadDefineTable(): Map<string, string> {
  const filePath = path.join(process.cwd(), "data/csv/definetable.csv");
  const file = fs.readFileSync(filePath, "utf8");

  const parsed: ParseResult = Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    delimiter: ",",
  }) as ParseResult;

  if (parsed.errors?.length) {
    console.warn("CSV parse errors:", parsed.errors);
  }

  const table = new Map<string, string>();
  for (const row of parsed.data) {
    const key = normalize(row?.key);
    const value = normalize(row?.value);
    if (!key) continue;
    table.set(key, value);
  }

  return table;
}

export function getDefineNumber(table: Map<string, string>, key: string, fallback: number): number {
  const raw = normalize(table.get(key));
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}
