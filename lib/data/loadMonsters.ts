import fs from "node:fs";
import path from "node:path";
import Papa from "papaparse";

type MonsterRow = {
  key: string;
  name: string;
  hp: string;
  atk: string;
  def: string;
  exp: string;
  gold_min: string;
  gold_max: string;
  image_key?: string;
  element?: string;
  yinyang?: string;
  speed?: string;
  inner_max?: string;
  inner_start?: string;
  inner_regen?: string;
};

export type Monster = {
  key: string;
  name: string;
  hp: number;
  atk: number;
  def: number;
  exp: number;
  goldMin: number;
  goldMax: number;
  imageKey?: string;
  element?: string;
  yinyang?: string;
  speed?: number;
  innerMax?: number;
  innerStart?: number;
  innerRegen?: number;
};

type ParseResult = {
  data: MonsterRow[];
  errors?: unknown[];
};

function normalize(raw?: string): string {
  return (raw ?? "").replace(/\r/g, "").trim();
}

function toNumber(raw?: string): number {
  return Number(normalize(raw));
}

function toOptionalNumber(raw?: string): number | undefined {
  const parsed = toNumber(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function loadMonsters(): Monster[] {
  const filePath = path.join(process.cwd(), "data/csv/monsters.csv");
  const file = fs.readFileSync(filePath, "utf8");

  const parsed: ParseResult = Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    delimiter: ",",
  }) as ParseResult;

  if (parsed.errors?.length) {
    console.warn("CSV parse errors:", parsed.errors);
  }

  return parsed.data
    .filter((row) => normalize(row?.key))
    .map((row) => ({
      key: normalize(row.key),
      name: normalize(row.name),
      hp: toNumber(row.hp),
      atk: toNumber(row.atk),
      def: toNumber(row.def),
      exp: toNumber(row.exp),
      goldMin: toNumber(row.gold_min),
      goldMax: toNumber(row.gold_max),
      imageKey: normalize(row.image_key) || undefined,
      element: normalize(row.element) || undefined,
      yinyang: normalize(row.yinyang) || undefined,
      speed: toOptionalNumber(row.speed),
      innerMax: toOptionalNumber(row.inner_max),
      innerStart: toOptionalNumber(row.inner_start),
      innerRegen: toOptionalNumber(row.inner_regen),
    }));
}

export function buildMonsterIndex(monsters: Monster[]): Map<string, Monster> {
  const index = new Map<string, Monster>();

  for (const monster of monsters) {
    if (!monster.key) continue;
    index.set(monster.key, monster);
  }

  return index;
}
