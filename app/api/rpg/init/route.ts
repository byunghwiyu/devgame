import { NextResponse } from "next/server";
import { getUserIdFromSearch } from "@/lib/rpg/http";
import { getRpgRuntime } from "@/lib/rpg/runtime";

const DEFAULT_SLOTS = ["WEAPON", "BODY", "RING"] as const;

export async function POST(req: Request) {
  try {
    const userId = getUserIdFromSearch(req.url);
    const { db, progressService, coins } = getRpgRuntime();

    const tx = db.transaction(() => {
      db.prepare("INSERT OR IGNORE INTO users(user_id) VALUES(?)").run(userId);
      db.prepare("INSERT OR IGNORE INTO user_wallet(user_id,gold) VALUES(?,0)").run(userId);
      db.prepare("INSERT OR IGNORE INTO user_progress(user_id,level,exp) VALUES(?,?,?)").run(userId, 1, 0);

      const legacyWallet = db.prepare("SELECT gold FROM user_wallet WHERE user_id = ?").get(userId) as { gold: number } | undefined;
      for (const c of coins) {
        db.prepare(
          "INSERT OR IGNORE INTO user_currency_balance(user_id,currency_id,amount) VALUES(?,?,?)",
        ).run(userId, c.currencyId, c.currencyId === "GOLD" ? Number(legacyWallet?.gold ?? 0) : 0);
      }

      for (const slot of DEFAULT_SLOTS) {
        db.prepare("INSERT OR IGNORE INTO user_equipment_slots(user_id,slot,equip_uid) VALUES(?,?,NULL)").run(userId, slot);
      }
    });
    tx();

    return NextResponse.json({
      ok: true,
      userId,
      progress: progressService.getProgress(userId),
      message: "초기화 완료",
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
