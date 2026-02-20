import { randomUUID } from "node:crypto";
import { type Database as BetterDb } from "better-sqlite3";
import { ItemDef } from "./types";

export class InventoryService {
  constructor(
    private readonly db: BetterDb,
    private readonly itemsById: Map<string, ItemDef>,
  ) {}

  addStackItem(characterId: string, itemId: string, qty: number): void {
    if (qty <= 0) return;
    const item = this.itemsById.get(itemId);
    if (!item) throw new Error(`알 수 없는 아이템: ${itemId}`);

    const row = this.db
      .prepare("SELECT qty FROM character_inventory_stack WHERE character_id = ? AND item_id = ?")
      .get(characterId, itemId) as { qty: number } | undefined;
    if (!row) {
      this.db.prepare("INSERT INTO character_inventory_stack(character_id,item_id,qty) VALUES(?,?,?)").run(characterId, itemId, qty);
      return;
    }
    this.db.prepare("UPDATE character_inventory_stack SET qty = ? WHERE character_id = ? AND item_id = ?").run(row.qty + qty, characterId, itemId);
  }

  consumeStackItem(characterId: string, itemId: string, qty: number): void {
    if (qty <= 0) return;
    const row = this.db
      .prepare("SELECT qty FROM character_inventory_stack WHERE character_id = ? AND item_id = ?")
      .get(characterId, itemId) as { qty: number } | undefined;
    if (!row || row.qty < qty) throw new Error(`수량 부족: ${itemId}`);

    const remain = row.qty - qty;
    if (remain <= 0) {
      this.db.prepare("DELETE FROM character_inventory_stack WHERE character_id = ? AND item_id = ?").run(characterId, itemId);
    } else {
      this.db.prepare("UPDATE character_inventory_stack SET qty = ? WHERE character_id = ? AND item_id = ?").run(remain, characterId, itemId);
    }
  }

  addEquipInstance(characterId: string, itemId: string, rolledAffixJson = "{}"): string {
    const item = this.itemsById.get(itemId);
    if (!item) throw new Error(`알 수 없는 아이템: ${itemId}`);
    if (item.type !== "EQUIP") throw new Error(`장비 타입 아님: ${itemId}`);

    const equipUid = randomUUID();
    this.db
      .prepare(
        "INSERT INTO character_inventory_equip(equip_uid,character_id,item_id,level,enhance,rolled_affix_json,is_locked) VALUES(?,?,?,?,?,?,?)",
      )
      .run(equipUid, characterId, itemId, item.levelReq, 0, rolledAffixJson, 0);
    return equipUid;
  }
}
