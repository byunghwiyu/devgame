import { NextResponse } from "next/server";
import { getUserIdFromSearch } from "@/lib/rpg/http";
import { expToNextLevel, getUnlockedSkillKeysByLevel } from "@/lib/rpg/ProgressService";
import { getRpgRuntime } from "@/lib/rpg/runtime";

export async function GET(req: Request) {
  try {
    const userId = getUserIdFromSearch(req.url);
    const { db, equipmentService, progressService } = getRpgRuntime();

    let currencies = db
      .prepare("SELECT currency_id, amount FROM user_currency_balance WHERE user_id = ? ORDER BY currency_id")
      .all(userId) as Array<{ currency_id: string; amount: number }>;

    if (currencies.length === 0) {
      const legacyWallet = db.prepare("SELECT gold FROM user_wallet WHERE user_id = ?").get(userId) as { gold: number } | undefined;
      if (legacyWallet) {
        db.prepare("INSERT OR IGNORE INTO user_currency_balance(user_id,currency_id,amount) VALUES(?,?,?)").run(
          userId,
          "GOLD",
          Number(legacyWallet.gold ?? 0),
        );
        currencies = [{ currency_id: "GOLD", amount: Number(legacyWallet.gold ?? 0) }];
      }
    }

    const gold = Number(currencies.find((c) => c.currency_id === "GOLD")?.amount ?? 0);

    const stack = db
      .prepare("SELECT item_id, qty FROM user_inventory_stack WHERE user_id = ? ORDER BY item_id")
      .all(userId) as Array<{ item_id: string; qty: number }>;
    const equipInventory = db
      .prepare(
        "SELECT equip_uid, item_id, level, enhance, rolled_affix_json, is_locked FROM user_inventory_equip WHERE user_id = ? ORDER BY equip_uid",
      )
      .all(userId);
    const equipped = equipmentService.getEquipped(userId);
    const progress = progressService.getProgress(userId);

    return NextResponse.json({
      ok: true,
      userId,
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
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
