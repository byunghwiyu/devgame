import { type Database as BetterDb } from "better-sqlite3";
import { ItemDef } from "./types";

const ALLOWED_SLOTS = new Set(["WEAPON", "BODY", "RING"]);

export class EquipmentService {
  constructor(
    private readonly db: BetterDb,
    private readonly itemsById: Map<string, ItemDef>,
  ) {}

  equip(characterId: string, equipUid: string, characterLevel: number): void {
    const equip = this.db
      .prepare("SELECT equip_uid,character_id,item_id FROM character_inventory_equip WHERE equip_uid = ?")
      .get(equipUid) as { equip_uid: string; character_id: string; item_id: string } | undefined;
    if (!equip) throw new Error(`존재하지 않는 equip_uid: ${equipUid}`);
    if (equip.character_id !== characterId) throw new Error("해당 장비의 소유자가 아닙니다.");

    const item = this.itemsById.get(equip.item_id);
    if (!item) throw new Error(`아이템 정의 없음: ${equip.item_id}`);
    if (!item.slot || !ALLOWED_SLOTS.has(item.slot)) throw new Error(`장착 불가 슬롯: ${item.slot ?? "(없음)"}`);
    if (characterLevel < item.levelReq) throw new Error(`레벨 부족: 요구 ${item.levelReq}, 현재 ${characterLevel}`);

    const tx = this.db.transaction(() => {
      const row = this.db
        .prepare("SELECT equip_uid FROM character_equipment_slots WHERE character_id = ? AND slot = ?")
        .get(characterId, item.slot) as { equip_uid: string | null } | undefined;
      if (!row) {
        this.db.prepare("INSERT INTO character_equipment_slots(character_id,slot,equip_uid) VALUES(?,?,?)").run(characterId, item.slot, equipUid);
      } else {
        this.db.prepare("UPDATE character_equipment_slots SET equip_uid = ? WHERE character_id = ? AND slot = ?").run(equipUid, characterId, item.slot);
      }
    });
    tx();
  }

  unequip(characterId: string, slot: string): void {
    const normalized = slot.toUpperCase();
    if (!ALLOWED_SLOTS.has(normalized)) throw new Error(`존재하지 않는 슬롯: ${slot}`);
    const row = this.db
      .prepare("SELECT equip_uid FROM character_equipment_slots WHERE character_id = ? AND slot = ?")
      .get(characterId, normalized) as { equip_uid: string | null } | undefined;
    if (!row) throw new Error(`슬롯 정보가 없습니다: ${slot}`);
    this.db.prepare("UPDATE character_equipment_slots SET equip_uid = NULL WHERE character_id = ? AND slot = ?").run(characterId, normalized);
  }

  getEquipped(characterId: string): Array<{ slot: string; equipUid: string | null; itemId: string | null; itemName: string | null }> {
    const rows = this.db
      .prepare(
        `SELECT s.slot, s.equip_uid, e.item_id
         FROM character_equipment_slots s
         LEFT JOIN character_inventory_equip e ON s.equip_uid = e.equip_uid
         WHERE s.character_id = ?
         ORDER BY s.slot`,
      )
      .all(characterId) as Array<{ slot: string; equip_uid: string | null; item_id: string | null }>;

    return rows.map((r) => ({
      slot: r.slot,
      equipUid: r.equip_uid,
      itemId: r.item_id,
      itemName: r.item_id ? this.itemsById.get(r.item_id)?.name ?? null : null,
    }));
  }
}
