import { randomUUID } from "node:crypto";
import { type Database as BetterDb } from "better-sqlite3";
import { ItemDef } from "./types";

export class InventoryService {
  constructor(
    private readonly db: BetterDb,
    private readonly itemsById: Map<string, ItemDef>,
  ) {}

  addStackItem(userId: string, itemId: string, qty: number): void {
    if (qty <= 0) return;
    const item = this.itemsById.get(itemId);
    if (!item) throw new Error(`알 수 없는 아이템: ${itemId}`);

    const row = this.db
      .prepare("SELECT qty FROM user_inventory_stack WHERE user_id = ? AND item_id = ?")
      .get(userId, itemId) as { qty: number } | undefined;
    if (!row) {
      this.db.prepare("INSERT INTO user_inventory_stack(user_id,item_id,qty) VALUES(?,?,?)").run(userId, itemId, qty);
      return;
    }
    this.db.prepare("UPDATE user_inventory_stack SET qty = ? WHERE user_id = ? AND item_id = ?").run(row.qty + qty, userId, itemId);
  }

  consumeStackItem(userId: string, itemId: string, qty: number): void {
    if (qty <= 0) return;
    const row = this.db
      .prepare("SELECT qty FROM user_inventory_stack WHERE user_id = ? AND item_id = ?")
      .get(userId, itemId) as { qty: number } | undefined;
    if (!row || row.qty < qty) throw new Error(`수량 부족: ${itemId}`);

    const remain = row.qty - qty;
    if (remain <= 0) {
      this.db.prepare("DELETE FROM user_inventory_stack WHERE user_id = ? AND item_id = ?").run(userId, itemId);
    } else {
      this.db.prepare("UPDATE user_inventory_stack SET qty = ? WHERE user_id = ? AND item_id = ?").run(remain, userId, itemId);
    }
  }

  addEquipInstance(userId: string, itemId: string, rolledAffixJson = "{}"): string {
    const item = this.itemsById.get(itemId);
    if (!item) throw new Error(`알 수 없는 아이템: ${itemId}`);
    if (item.type !== "EQUIP") throw new Error(`장비 타입 아님: ${itemId}`);

    const equipUid = randomUUID();
    this.db
      .prepare(
        "INSERT INTO user_inventory_equip(equip_uid,user_id,item_id,level,enhance,rolled_affix_json,is_locked) VALUES(?,?,?,?,?,?,?)",
      )
      .run(equipUid, userId, itemId, item.levelReq, 0, rolledAffixJson, 0);
    return equipUid;
  }
}
