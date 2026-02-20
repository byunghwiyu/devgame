import { NextResponse } from "next/server";
import { jsonErrorFromUnknown, requireSession } from "@/lib/rpg/http";
import { getRpgRuntime } from "@/lib/rpg/runtime";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { accountId } = requireSession(req);
    const body = (await req.json()) as { characterId?: string };
    const characterId = (body.characterId ?? "").trim();
    if (!characterId) return NextResponse.json({ ok: false, error: "characterId 필요" }, { status: 400 });

    const { db } = getRpgRuntime();
    const owned = db
      .prepare("SELECT character_id FROM characters WHERE character_id = ? AND account_id = ?")
      .get(characterId, accountId) as { character_id: string } | undefined;
    if (!owned) return NextResponse.json({ ok: false, error: "선택 가능한 캐릭터가 아님" }, { status: 403 });

    db.prepare(
      `INSERT INTO account_selected_character(account_id,character_id,updated_at) VALUES(?,?,?)
       ON CONFLICT(account_id) DO UPDATE SET character_id = excluded.character_id, updated_at = excluded.updated_at`,
    ).run(accountId, characterId, new Date().toISOString());

    return NextResponse.json({ ok: true, characterId });
  } catch (e) {
    const { status, message } = jsonErrorFromUnknown(e);
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
