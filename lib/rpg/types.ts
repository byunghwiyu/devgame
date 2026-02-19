export type ItemType = "EQUIP" | "CONSUMABLE" | "MATERIAL";

export type StatBlock = {
  atk?: number;
  def?: number;
  hp?: number;
  spd?: number;
};

export type ItemDef = {
  itemId: string;
  name: string;
  type: ItemType;
  rarity: string;
  stackMax: number;
  levelReq: number;
  slot: string | null;
  baseStat: StatBlock;
  sellPrice: number;
};

export type CurrencyDef = {
  currencyId: string;
  name: string;
  rarity: string;
  iconKey: string | null;
};

export type LootTableRow = {
  monsterId: string;
  dropGroupId: string;
  dropChance: number;
  weight: number;
  minQty: number;
  maxQty: number;
  guaranteed: boolean;
  goldMin: number;
  goldMax: number;
  expMin: number;
  expMax: number;
};

export type LootGroupRow = {
  dropGroupId: string;
  itemId: string;
  dropChance: number;
  weight: number;
  minQty: number;
  maxQty: number;
};

export type MonsterRewardRow = {
  monsterId: string;
  expReward: number;
};

export type DropResult = {
  itemId: string;
  qty: number;
  type: ItemType;
  sourceMonsterId: string;
};

export type CurrencyDrop = {
  currencyId: string;
  amount: number;
  sourceMonsterId: string;
};

export type RolledLoot = {
  items: DropResult[];
  currencies: CurrencyDrop[];
  exp: number;
  sourceMonsterId: string;
};

export type FinalStats = {
  atk: number;
  def: number;
  hp: number;
  spd: number;
};

export type UserProgress = {
  userId: string;
  level: number;
  exp: number;
};

export type ExpGrantResult = {
  beforeLevel: number;
  afterLevel: number;
  gainedExp: number;
  remainedExp: number;
  leveledUp: boolean;
};

export type LevelTableRow = {
  level: number;
  expToNext: number;
  atkBonus: number;
  defBonus: number;
  hpBonus: number;
  spdBonus: number;
  unlockSkills: string[];
};
