import { NextResponse } from "next/server";
import { getSelectedCharacterId, jsonErrorFromUnknown, requireSession } from "@/lib/rpg/http";
import { getRpgRuntime } from "@/lib/rpg/runtime";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const { accountId } = requireSession(req);
    const characterId = getSelectedCharacterId(accountId);
    if (!characterId) return NextResponse.json({ ok: true, selected: null });

    const { db } = getRpgRuntime();
    const row = db
      .prepare("SELECT character_id, name, class FROM characters WHERE character_id = ? AND account_id = ?")
      .get(characterId, accountId) as { character_id: string; name: string; class: string } | undefined;
    if (!row) return NextResponse.json({ ok: true, selected: null });

    return NextResponse.json({
      ok: true,
      selected: {
        characterId: row.character_id,
        name: row.name,
        class: row.class,
      },
    });
  } catch (e) {
    const { status, message } = jsonErrorFromUnknown(e);
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
