import fs from "node:fs";
import path from "node:path";
import Papa from "papaparse";

type TokenRow = {
  key: string;
  name: string;
  slot: "MOVE" | "ATTACK" | "DEFENSE" | "BUFF";
  category?: string;
  base_power: string;
  defense_power?: string;
  element: string;
  yinyang: "YIN" | "YANG" | "NEUTRAL";
  cooldown_round: string;
};

export type Token = {
  key: string;
  name: string;
  slot: "MOVE" | "ATTACK" | "DEFENSE" | "BUFF";
  category: string;
  basePower: number;
  defensePower: number;
  element: string;
  yinyang: "YIN" | "YANG" | "NEUTRAL";
  cooldownRound: number;
};

type ParseResult = {
  data: TokenRow[];
  errors?: unknown[];
};

function normalize(raw?: string): string {
  return (raw ?? "").replace(/\r/g, "").trim();
}

function toNumber(raw?: string): number {
  return Number(normalize(raw));
}

export function loadTokens(): Token[] {
  const filePath = path.join(process.cwd(), "data/csv/tokens.csv");
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
    .map((row) => {
      const slot = normalize(row.slot) as Token["slot"];
      const category = normalize(row.category) || slot;
      const basePower = toNumber(row.base_power);
      const parsedDefense = toNumber(row.defense_power);
      const defensePower = Number.isFinite(parsedDefense) ? parsedDefense : basePower;

      return {
        key: normalize(row.key),
        name: normalize(row.name),
        slot,
        category,
        basePower,
        defensePower,
        element: normalize(row.element),
        yinyang: normalize(row.yinyang) as Token["yinyang"],
        cooldownRound: toNumber(row.cooldown_round),
      };
    });
}

export function buildTokenIndex(tokens: Token[]): Map<string, Token> {
  const index = new Map<string, Token>();

  for (const token of tokens) {
    if (!token.key) continue;
    index.set(token.key, token);
  }

  return index;
}
