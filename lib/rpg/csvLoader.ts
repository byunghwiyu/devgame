import fs from "node:fs";
import path from "node:path";
import {
  CurrencyDef,
  ItemDef,
  LevelTableRow,
  LootGroupRow,
  LootTableRow,
  MonsterRewardRow,
  StatBlock,
} from "./types";

function parseCsv(filePath: string): Record<string, string>[] {
  const raw = fs.readFileSync(filePath, "utf8").replace(/\r/g, "").trim();
  if (!raw) return [];

  const lines = raw.split("\n").map((s) => s.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((s) => s.trim());
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i += 1) {
    const cols = lines[i].split(",").map((s) => s.trim());
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j += 1) {
      row[headers[j]] = cols[j] ?? "";
    }
    rows.push(row);
  }
  return rows;
}

function toInt(v: string, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function toChance(v: string, fallback = 1): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function toBool01(v: string): boolean {
  return String(v).trim() === "1";
}

function parseStat(raw: string): StatBlock {
  if (!raw) return {};
  try {
    const obj = JSON.parse(raw) as StatBlock;
    return obj && typeof obj === "object" ? obj : {};
  } catch {
    return {};
  }
}

let itemsCache: ItemDef[] | null = null;
let coinTableCache: CurrencyDef[] | null = null;
let levelTableCache: LevelTableRow[] | null = null;
let lootGroupsCache: LootGroupRow[] | null = null;
let lootTablesCache: LootTableRow[] | null = null;
let monsterRewardsCache: MonsterRewardRow[] | null = null;

export function loadItems(): ItemDef[] {
  if (itemsCache) return itemsCache;
  const filePath = path.join(process.cwd(), "data", "csv", "items.csv");
  const rows = parseCsv(filePath);
  itemsCache = rows.map((r) => ({
    itemId: r.item_id,
    name: r.name,
    type: (r.type || "CONSUMABLE") as ItemDef["type"],
    rarity: r.rarity,
    stackMax: toInt(r.stack_max, 1),
    levelReq: toInt(r.level_req, 1),
    slot: r.slot || null,
    baseStat: parseStat(r.base_stat_json),
    sellPrice: toInt(r.sell_price, 0),
  }));
  return itemsCache;
}

export function loadCoinTable(): CurrencyDef[] {
  if (coinTableCache) return coinTableCache;
  const filePath = path.join(process.cwd(), "data", "csv", "coin_table.csv");
  if (!fs.existsSync(filePath)) {
    coinTableCache = [{ currencyId: "GOLD", name: "골드", rarity: "COMMON", iconKey: "coin_gold_01" }];
    return coinTableCache;
  }
  const rows = parseCsv(filePath);
  coinTableCache = rows.map((r) => ({
    currencyId: r.currency_id,
    name: r.name,
    rarity: r.rarity || "COMMON",
    iconKey: r.icon_key || null,
  }));
  return coinTableCache;
}

export function loadLevelTable(): LevelTableRow[] {
  if (levelTableCache) return levelTableCache;
  const filePath = path.join(process.cwd(), "data", "csv", "level_table.csv");
  if (!fs.existsSync(filePath)) {
    levelTableCache = [{
      level: 1,
      expToNext: 20,
      atkBonus: 0,
      defBonus: 0,
      hpBonus: 0,
      spdBonus: 0,
      unlockSkills: [],
    }];
    return levelTableCache;
  }
  const rows = parseCsv(filePath);
  levelTableCache = rows
    .map((r) => ({
      level: Math.max(1, toInt(r.level, 1)),
      expToNext: Math.max(0, toInt(r.exp_to_next, 0)),
      atkBonus: toInt(r.atk_bonus, 0),
      defBonus: toInt(r.def_bonus, 0),
      hpBonus: toInt(r.hp_bonus, 0),
      spdBonus: toInt(r.spd_bonus, 0),
      unlockSkills: (r.unlock_skill_keys || "")
        .replace(/\r/g, "")
        .split("|")
        .map((s) => s.trim())
        .filter(Boolean),
    }))
    .sort((a, b) => a.level - b.level);
  return levelTableCache;
}

export function loadLootGroups(): LootGroupRow[] {
  if (lootGroupsCache) return lootGroupsCache;
  const filePath = path.join(process.cwd(), "data", "csv", "loot_groups.csv");
  const rows = parseCsv(filePath);
  lootGroupsCache = rows.map((r) => ({
    dropGroupId: r.drop_group_id,
    itemId: r.item_id,
    dropChance: toChance(r.drop_chance, 1),
    weight: toInt(r.weight, 1),
    minQty: toInt(r.min_qty, 1),
    maxQty: toInt(r.max_qty, 1),
  }));
  return lootGroupsCache;
}

export function loadLootTables(): LootTableRow[] {
  if (lootTablesCache) return lootTablesCache;
  const filePath = path.join(process.cwd(), "data", "csv", "loot_tables.csv");
  const rows = parseCsv(filePath);
  lootTablesCache = rows.map((r) => ({
    monsterId: r.monster_id,
    dropGroupId: r.drop_group_id,
    dropChance: toChance(r.drop_chance, 1),
    weight: toInt(r.weight, 1),
    minQty: toInt(r.min_qty, 1),
    maxQty: toInt(r.max_qty, 1),
    guaranteed: toBool01(r.guaranteed),
    goldMin: Math.max(0, toInt(r.gold_min, 0)),
    goldMax: Math.max(0, toInt(r.gold_max, 0)),
    expMin: Math.max(0, toInt(r.exp_min, 0)),
    expMax: Math.max(0, toInt(r.exp_max, 0)),
  }));
  return lootTablesCache;
}

export function loadMonsterRewards(): MonsterRewardRow[] {
  if (monsterRewardsCache) return monsterRewardsCache;
  const filePath = path.join(process.cwd(), "data", "csv", "monster_rewards.csv");
  if (!fs.existsSync(filePath)) {
    monsterRewardsCache = [];
    return monsterRewardsCache;
  }
  const rows = parseCsv(filePath);
  monsterRewardsCache = rows.map((r) => ({
    monsterId: r.monster_id,
    expReward: toInt(r.exp_reward, 0),
  }));
  return monsterRewardsCache;
}
