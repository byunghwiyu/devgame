import { type Database as BetterDb } from "better-sqlite3";
import { loadLevelTable } from "./csvLoader";
import { FinalStats, ItemDef, StatBlock } from "./types";

function toStat(json: string): StatBlock {
  try {
    const parsed = JSON.parse(json) as StatBlock;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function addStats(target: FinalStats, source: StatBlock): void {
  target.atk += source.atk ?? 0;
  target.def += source.def ?? 0;
  target.hp += source.hp ?? 0;
  target.spd += source.spd ?? 0;
}

function addLevelBonuses(level: number, stats: FinalStats): void {
  const rows = loadLevelTable();
  for (const row of rows) {
    if (row.level > level) break;
    stats.atk += row.atkBonus;
    stats.def += row.defBonus;
    stats.hp += row.hpBonus;
    stats.spd += row.spdBonus;
  }
}

export class StatsResolver {
  constructor(
    private readonly db: BetterDb,
    private readonly itemsById: Map<string, ItemDef>,
  ) {}

  resolveFinalStats(userId: string): FinalStats {
    const p = this.db.prepare("SELECT level FROM user_progress WHERE user_id = ?").get(userId) as { level: number } | undefined;
    const level = Math.max(1, Number(p?.level ?? 1));
    const stats: FinalStats = {
      atk: 10,
      def: 5,
      hp: 100,
      spd: 10,
    };

    addLevelBonuses(level, stats);

    const rows = this.db
      .prepare(
        `SELECT e.item_id, e.rolled_affix_json
         FROM user_equipment_slots s
         JOIN user_inventory_equip e ON s.equip_uid = e.equip_uid
         WHERE s.user_id = ? AND s.equip_uid IS NOT NULL`,
      )
      .all(userId) as Array<{ item_id: string; rolled_affix_json: string }>;

    for (const r of rows) {
      const item = this.itemsById.get(r.item_id);
      if (!item) continue;
      addStats(stats, item.baseStat);
      addStats(stats, toStat(r.rolled_affix_json));
    }
    return stats;
  }
}
