import fs from "node:fs";
import path from "node:path";
import Papa from "papaparse";

type PlayerRow = {
  key: string;
  name: string;
  job: string;
  element: string;
  yinyang: string;
  hp: string;
  atk: string;
  def: string;
  speed: string;
  image_key?: string;
  inner_max?: string;
  inner_start?: string;
  inner_regen?: string;
};

export type PlayerTemplate = {
  key: string;
  name: string;
  job: string;
  element: string;
  yinyang: string;
  hp: number;
  atk: number;
  def: number;
  speed: number;
  imageKey?: string;
  innerMax: number;
  innerStart: number;
  innerRegen: number;
};

function normalize(raw?: string): string {
  return (raw ?? "").replace(/\r/g, "").trim();
}

function toNumber(raw?: string, fallback = 0): number {
  const n = Number(normalize(raw));
  return Number.isFinite(n) ? n : fallback;
}

export function loadPlayerTemplates(): PlayerTemplate[] {
  const filePath = path.join(process.cwd(), "data/csv/player_character.csv");
  const file = fs.readFileSync(filePath, "utf8");

  const parsed = Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    delimiter: ",",
  });

  return (parsed.data as PlayerRow[])
    .filter((row) => normalize(row.key))
    .map((row) => ({
      key: normalize(row.key),
      name: normalize(row.name),
      job: normalize(row.job),
      element: normalize(row.element),
      yinyang: normalize(row.yinyang),
      hp: toNumber(row.hp, 1),
      atk: toNumber(row.atk),
      def: toNumber(row.def),
      speed: toNumber(row.speed, 1),
      imageKey: normalize(row.image_key) || undefined,
      innerMax: toNumber(row.inner_max, 100),
      innerStart: toNumber(row.inner_start, 30),
      innerRegen: toNumber(row.inner_regen, 8),
    }));
}
