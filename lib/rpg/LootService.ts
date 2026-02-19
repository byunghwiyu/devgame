import { loadLootGroups, loadLootTables } from "./csvLoader";
import { DropResult, ItemDef, LootTableRow, RolledLoot } from "./types";

function createRng(seed?: string): () => number {
  if (!seed) return Math.random;
  let a = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    a ^= seed.charCodeAt(i);
    a = Math.imul(a, 16777619);
  }
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randInt(rng: () => number, min: number, max: number): number {
  if (max <= min) return min;
  return Math.floor(rng() * (max - min + 1)) + min;
}

function weightedPick<T extends { weight: number }>(rows: T[], rng: () => number): T | null {
  const total = rows.reduce((s, r) => s + Math.max(0, r.weight), 0);
  if (total <= 0 || rows.length === 0) return null;
  let roll = rng() * total;
  for (const row of rows) {
    roll -= Math.max(0, row.weight);
    if (roll <= 0) return row;
  }
  return rows[rows.length - 1] ?? null;
}

export class LootService {
  private readonly groups = loadLootGroups();
  private readonly tables = loadLootTables();

  constructor(private readonly itemsById: Map<string, ItemDef>) {}

  hasMonster(monsterId: string): boolean {
    return this.tables.some((r) => r.monsterId === monsterId);
  }

  private rollOne(dropGroupId: string, rng: () => number, monsterId: string): DropResult | null {
    const candidates = this.groups
      .filter((g) => g.dropGroupId === dropGroupId)
      .filter((g) => rng() < g.dropChance);
    const picked = weightedPick(candidates, rng);
    if (!picked) return null;
    const item = this.itemsById.get(picked.itemId);
    if (!item) return null;
    return {
      itemId: picked.itemId,
      qty: randInt(rng, picked.minQty, picked.maxQty),
      type: item.type,
      sourceMonsterId: monsterId,
    };
  }

  private applyRowRewards(row: LootTableRow, rng: () => number, monsterId: string, items: DropResult[]): { gold: number; exp: number } {
    const n = randInt(rng, row.minQty, row.maxQty);
    for (let i = 0; i < n; i += 1) {
      const d = this.rollOne(row.dropGroupId, rng, monsterId);
      if (d) items.push(d);
    }
    return {
      gold: randInt(rng, row.goldMin, row.goldMax),
      exp: randInt(rng, row.expMin, row.expMax),
    };
  }

  rollLoot(monsterId: string, rngSeed?: string): RolledLoot {
    const rng = createRng(rngSeed);
    const rows = this.tables.filter((r) => r.monsterId === monsterId);
    if (rows.length === 0) {
      return {
        items: [],
        currencies: [],
        exp: 0,
        sourceMonsterId: monsterId,
      };
    }

    const items: DropResult[] = [];
    let totalGold = 0;
    let totalExp = 0;

    for (const row of rows.filter((r) => r.guaranteed)) {
      const reward = this.applyRowRewards(row, rng, monsterId, items);
      totalGold += reward.gold;
      totalExp += reward.exp;
    }

    const optional = rows
      .filter((r) => !r.guaranteed)
      .filter((r) => rng() < r.dropChance);
    const picked = weightedPick(optional, rng);
    if (picked) {
      const reward = this.applyRowRewards(picked, rng, monsterId, items);
      totalGold += reward.gold;
      totalExp += reward.exp;
    }

    const currencies = totalGold > 0 ? [{ currencyId: "GOLD", amount: totalGold, sourceMonsterId: monsterId }] : [];

    return {
      items,
      currencies,
      exp: totalExp,
      sourceMonsterId: monsterId,
    };
  }
}
