import fs from "node:fs";
import path from "node:path";
import Papa from "papaparse";

type ElementAdvantageRow = {
  attacker_element: string;
  defender_element: string;
  damage_mult: string;
};

type ParseResult = {
  data: ElementAdvantageRow[];
  errors?: unknown[];
};

function normalize(raw?: string): string {
  return (raw ?? "").replace(/\r/g, "").trim();
}

function toNumber(raw?: string): number {
  return Number(normalize(raw));
}

function makeKey(attacker: string, defender: string): string {
  return `${attacker}>${defender}`;
}

export function loadElementAdvantage(): Map<string, number> {
  const filePath = path.join(process.cwd(), "data/csv/elements_advantage.csv");
  const file = fs.readFileSync(filePath, "utf8");

  const parsed: ParseResult = Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    delimiter: ",",
  }) as ParseResult;

  if (parsed.errors?.length) {
    console.warn("CSV parse errors:", parsed.errors);
  }

  const table = new Map<string, number>();

  for (const row of parsed.data) {
    const attacker = normalize(row?.attacker_element);
    const defender = normalize(row?.defender_element);
    const mult = toNumber(row?.damage_mult);
    if (!attacker || !defender || !Number.isFinite(mult)) continue;
    table.set(makeKey(attacker, defender), mult);
  }

  return table;
}
