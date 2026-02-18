import fs from "node:fs";
import path from "node:path";
import Papa from "papaparse";

type EncounterRow = {
  node_key: string;
  monster_key: string;
};

type ParseResult = {
  data: EncounterRow[];
  errors?: unknown[];
};

function normalize(raw?: string): string {
  return (raw ?? "").replace(/\r/g, "").trim();
}

function buildEncounterIndex(): Map<string, string> {
  const filePath = path.join(process.cwd(), "data/csv/battle_encounters.csv");
  const file = fs.readFileSync(filePath, "utf8");

  const parsed: ParseResult = Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    delimiter: ",",
  }) as ParseResult;

  if (parsed.errors?.length) {
    console.warn("CSV parse errors:", parsed.errors);
  }

  const index = new Map<string, string>();

  for (const row of parsed.data) {
    const nodeKey = normalize(row?.node_key);
    const monsterKey = normalize(row?.monster_key);
    if (!nodeKey || !monsterKey) continue;
    index.set(nodeKey, monsterKey);
  }

  return index;
}

let encounterIndexCache: Map<string, string> | null = null;

export function getMonsterKeyForNode(nodeKey: string): string | undefined {
  if (!encounterIndexCache) {
    try {
      encounterIndexCache = buildEncounterIndex();
    } catch (error) {
      console.warn("Failed to load battle_encounters.csv:", error);
      return undefined;
    }
  }

  return encounterIndexCache.get(normalize(nodeKey));
}
