import { type Database as BetterDb } from "better-sqlite3";
import { ItemDef, RolledLoot } from "./types";
import { InventoryService } from "./InventoryService";

export class RewardService {
  private readonly applyTx: (characterId: string, loot: RolledLoot) => void;

  constructor(
    private readonly db: BetterDb,
    private readonly inventoryService: InventoryService,
    private readonly itemsById: Map<string, ItemDef>,
  ) {
    this.applyTx = this.db.transaction((characterId: string, loot: RolledLoot) => {
      this.db.prepare("INSERT OR IGNORE INTO character_progress(character_id,level,exp) VALUES(?,?,?)").run(characterId, 1, 0);

      for (const c of loot.currencies) {
        if (c.amount <= 0) continue;
        this.db
          .prepare(
            `INSERT INTO character_currency_balance(character_id,currency_id,amount) VALUES(?,?,?)
             ON CONFLICT(character_id,currency_id) DO UPDATE SET amount = amount + excluded.amount`,
          )
          .run(characterId, c.currencyId, c.amount);
      }

      for (const drop of loot.items) {
        const item = this.itemsById.get(drop.itemId);
        if (!item) throw new Error(`보상 실패: 아이템 정의 없음 ${drop.itemId}`);

        if (item.type === "EQUIP") {
          for (let i = 0; i < drop.qty; i += 1) {
            this.inventoryService.addEquipInstance(characterId, drop.itemId, "{}");
          }
          continue;
        }
        this.inventoryService.addStackItem(characterId, drop.itemId, drop.qty);
      }
    });
  }

  applyRewards(characterId: string, loot: RolledLoot): void {
    this.applyTx(characterId, loot);
  }
}
