import { NextResponse } from "next/server";
import { jsonErrorFromUnknown, requireSelectedCharacter } from "@/lib/rpg/http";
import { getRpgRuntime } from "@/lib/rpg/runtime";

export const runtime = "nodejs";

const DEFAULT_SLOTS = ["WEAPON", "BODY", "RING"] as const;

export async function POST(req: Request) {
  try {
    const { characterId } = requireSelectedCharacter(req);
    const { db, progressService, coins } = getRpgRuntime();

    const tx = db.transaction(() => {
      db.prepare("INSERT OR IGNORE INTO character_progress(character_id,level,exp) VALUES(?,?,?)").run(characterId, 1, 0);
      for (const c of coins) {
        db.prepare(
          "INSERT OR IGNORE INTO character_currency_balance(character_id,currency_id,amount) VALUES(?,?,0)",
        ).run(characterId, c.currencyId);
      }
      for (const slot of DEFAULT_SLOTS) {
        db.prepare("INSERT OR IGNORE INTO character_equipment_slots(character_id,slot,equip_uid) VALUES(?,?,NULL)").run(characterId, slot);
      }
    });
    tx();

    return NextResponse.json({
      ok: true,
      characterId,
      progress: progressService.getProgress(characterId),
      message: "초기화 완료",
    });
  } catch (e) {
    const { status, message } = jsonErrorFromUnknown(e);
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
