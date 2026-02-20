import { NextResponse } from "next/server";
import { expToNextLevel, getUnlockedSkillKeysByLevel } from "@/lib/rpg/ProgressService";
import { jsonErrorFromUnknown, requireSelectedCharacter } from "@/lib/rpg/http";
import { getRpgRuntime } from "@/lib/rpg/runtime";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const { characterId } = requireSelectedCharacter(req);
    const { db, equipmentService, progressService, itemsById } = getRpgRuntime();

    const currencies = db
      .prepare("SELECT currency_id, amount FROM character_currency_balance WHERE character_id = ? ORDER BY currency_id")
      .all(characterId) as Array<{ currency_id: string; amount: number }>;

    const gold = Number(currencies.find((c) => c.currency_id === "GOLD")?.amount ?? 0);

    const stack = db
      .prepare("SELECT item_id, qty FROM character_inventory_stack WHERE character_id = ? ORDER BY item_id")
      .all(characterId) as Array<{ item_id: string; qty: number }>;

    const rawEquipInventory = db
      .prepare(
        "SELECT equip_uid, item_id, level, enhance, rolled_affix_json, is_locked FROM character_inventory_equip WHERE character_id = ? ORDER BY equip_uid",
      )
      .all(characterId) as Array<{
      equip_uid: string;
      item_id: string;
      level: number;
      enhance: number;
      rolled_affix_json: string;
      is_locked: number;
    }>;

    const equipInventory = rawEquipInventory.map((e) => {
      const item = itemsById.get(e.item_id);
      return {
        ...e,
        item_name: item?.name ?? null,
        item_slot: item?.slot ?? null,
        item_base_stat: item?.baseStat ?? {},
      };
    });

    const equipped = equipmentService.getEquipped(characterId);
    const progress = progressService.getProgress(characterId);

    return NextResponse.json({
      ok: true,
      characterId,
      wallet: gold,
      currencies,
      stack,
      equipInventory,
      equipped,
      progress: {
        ...progress,
        nextExp: expToNextLevel(progress.level),
        unlockedSkills: getUnlockedSkillKeysByLevel(progress.level),
      },
    });
  } catch (e) {
    const { status, message } = jsonErrorFromUnknown(e);
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
