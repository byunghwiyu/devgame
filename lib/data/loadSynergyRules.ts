import fs from "node:fs";
import path from "node:path";
import Papa from "papaparse";

type SynergyRuleRow = {
  key: string;
  sequence: string;
  base_score: string;
  min_match_len: string;
  partial_weight_len2: string;
  partial_weight_len3: string;
  exact_weight: string;
  tags: string;
};

export type SynergyRule = {
  key: string;
  sequence: string[];
  baseScore: number;
  minMatchLen: number;
  partialWeightLen2: number;
  partialWeightLen3: number;
  exactWeight: number;
  tags: string[];
};

type ParseResult = {
  data: SynergyRuleRow[];
  errors?: unknown[];
};

function normalize(raw?: string): string {
  return (raw ?? "").replace(/\r/g, "").trim();
}

function toNumber(raw?: string): number {
  return Number(normalize(raw));
}

function splitByDelimiter(raw: string, delimiter: string): string[] {
  const normalized = normalize(raw);
  if (!normalized) return [];

  return normalized
    .split(delimiter)
    .map((part) => normalize(part))
    .filter(Boolean);
}

function parseTags(raw: string): string[] {
  const normalized = normalize(raw);
  if (!normalized) return [];

  const delimiter = normalized.includes("|") ? "|" : ",";
  return splitByDelimiter(normalized, delimiter);
}

export function loadSynergyRules(): SynergyRule[] {
  const filePath = path.join(process.cwd(), "data/csv/synergy_rules.csv");
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
      sequence: splitByDelimiter(row.sequence, ">"),
      baseScore: toNumber(row.base_score),
      minMatchLen: toNumber(row.min_match_len),
      partialWeightLen2: toNumber(row.partial_weight_len2),
      partialWeightLen3: toNumber(row.partial_weight_len3),
      exactWeight: toNumber(row.exact_weight),
      tags: parseTags(row.tags),
    }));
}
