import { BattleHooks } from "./BattleHooks";
import { loadCoinTable, loadItems, loadLevelTable } from "./csvLoader";
import { getRpgDb, initRpgSchema } from "./db";
import { EquipmentService } from "./EquipmentService";
import { InventoryService } from "./InventoryService";
import { LootService } from "./LootService";
import { ProgressService } from "./ProgressService";
import { RewardService } from "./RewardService";
import { StatsResolver } from "./StatsResolver";

export function getRpgRuntime() {
  initRpgSchema();
  const db = getRpgDb();
  const items = loadItems();
  const coins = loadCoinTable();
  const levelTable = loadLevelTable();
  const itemsById = new Map(items.map((i) => [i.itemId, i]));

  const inventoryService = new InventoryService(db, itemsById);
  const equipmentService = new EquipmentService(db, itemsById);
  const statsResolver = new StatsResolver(db, itemsById);
  const progressService = new ProgressService(db);
  const lootService = new LootService(itemsById);
  const rewardService = new RewardService(db, inventoryService, itemsById);
  const battleHooks = new BattleHooks(lootService, rewardService, statsResolver, progressService);

  return {
    db,
    itemsById,
    coins,
    levelTable,
    inventoryService,
    equipmentService,
    statsResolver,
    progressService,
    lootService,
    rewardService,
    battleHooks,
  };
}
