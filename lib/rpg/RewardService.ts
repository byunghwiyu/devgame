import { type Database as BetterDb } from "better-sqlite3";
import { ItemDef, RolledLoot } from "./types";
import { InventoryService } from "./InventoryService";

export class RewardService {
  private readonly applyTx: (userId: string, loot: RolledLoot) => void;

  constructor(
    private readonly db: BetterDb,
    private readonly inventoryService: InventoryService,
    private readonly itemsById: Map<string, ItemDef>,
  ) {
    this.applyTx = this.db.transaction((userId: string, loot: RolledLoot) => {
      this.db.prepare("INSERT OR IGNORE INTO users(user_id) VALUES(?)").run(userId);
      this.db.prepare("INSERT OR IGNORE INTO user_progress(user_id,level,exp) VALUES(?,?,?)").run(userId, 1, 0);

      for (const c of loot.currencies) {
        if (c.amount <= 0) continue;
        this.db
          .prepare(
            `INSERT INTO user_currency_balance(user_id,currency_id,amount) VALUES(?,?,?)
             ON CONFLICT(user_id,currency_id) DO UPDATE SET amount = amount + excluded.amount`,
          )
          .run(userId, c.currencyId, c.amount);

        if (c.currencyId === "GOLD") {
          this.db.prepare("INSERT OR IGNORE INTO user_wallet(user_id,gold) VALUES(?,0)").run(userId);
          this.db.prepare("UPDATE user_wallet SET gold = gold + ? WHERE user_id = ?").run(c.amount, userId);
        }
      }

      for (const drop of loot.items) {
        const item = this.itemsById.get(drop.itemId);
        if (!item) throw new Error(`보상 실패: 아이템 정의 없음 ${drop.itemId}`);

        if (item.type === "EQUIP") {
          for (let i = 0; i < drop.qty; i += 1) {
            this.inventoryService.addEquipInstance(userId, drop.itemId, "{}");
          }
          continue;
        }
        this.inventoryService.addStackItem(userId, drop.itemId, drop.qty);
      }
    });
  }

  applyRewards(userId: string, loot: RolledLoot): void {
    this.applyTx(userId, loot);
  }
}
