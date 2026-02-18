import type { Token } from "@/lib/data/loadTokens";

type Affinity = { element: string; yinyang: string };
type MultResult = { mult: number; reason?: string };

let elementTableCache: Map<string, number> | null = null;
let yinYangTableCache: Map<string, number> | null = null;

function pickBestBySlot(tokens: Token[], slot: Token["slot"]): Token | null {
  const filtered = tokens.filter((token) => token.slot === slot);
  if (filtered.length === 0) return null;

  filtered.sort((a, b) => b.basePower - a.basePower);
  return filtered[0] ?? null;
}

export function getAttackAffinity(tokens: Token[], fallback: Affinity): Affinity {
  const best = pickBestBySlot(tokens, "ATTACK");
  if (!best) return fallback;

  return {
    element: best.element,
    yinyang: best.yinyang,
  };
}

export function getDefenseAffinity(tokens: Token[], fallback: Affinity): Affinity {
  const best = pickBestBySlot(tokens, "DEFENSE");
  if (!best) return fallback;

  return {
    element: best.element,
    yinyang: best.yinyang,
  };
}

function normalize(raw?: string): string {
  return (raw ?? "").replace(/\r/g, "").trim();
}

function loadElementTableSafe(): Map<string, number> {
  if (elementTableCache) return elementTableCache;
  if (typeof window !== "undefined") {
    elementTableCache = new Map<string, number>();
    return elementTableCache;
  }

  try {
    const req = eval("require") as (id: string) => {
      loadElementAdvantage: () => Map<string, number>;
    };
    const mod = req("../data/loadElementAdvantage");
    elementTableCache = mod.loadElementAdvantage();
  } catch {
    elementTableCache = new Map<string, number>();
  }

  return elementTableCache;
}

function loadYinYangTableSafe(): Map<string, number> {
  if (yinYangTableCache) return yinYangTableCache;
  if (typeof window !== "undefined") {
    yinYangTableCache = new Map<string, number>();
    return yinYangTableCache;
  }

  try {
    const req = eval("require") as (id: string) => {
      loadYinYangAdvantage: () => Map<string, number>;
    };
    const mod = req("../data/loadYinYangAdvantage");
    yinYangTableCache = mod.loadYinYangAdvantage();
  } catch {
    yinYangTableCache = new Map<string, number>();
  }

  return yinYangTableCache;
}

export function calcElementMult(attackerElement: string, defenderElement: string): MultResult {
  const atk = normalize(attackerElement);
  const def = normalize(defenderElement);
  if (!atk || !def) return { mult: 1.0 };

  const key = `${atk}>${def}`;
  const mult = loadElementTableSafe().get(key);
  if (typeof mult !== "number") return { mult: 1.0 };

  return {
    mult,
    reason: `오행상성: ${key} (x${mult})`,
  };
}

export function calcYinYangMult(attackerYY: string, defenderYY: string): MultResult {
  const atk = normalize(attackerYY);
  const def = normalize(defenderYY);
  if (!atk || !def) return { mult: 1.0 };

  const key = `${atk}>${def}`;
  const mult = loadYinYangTableSafe().get(key);
  if (typeof mult !== "number") return { mult: 1.0 };

  return {
    mult,
    reason: `음양상성: ${key} (x${mult})`,
  };
}
