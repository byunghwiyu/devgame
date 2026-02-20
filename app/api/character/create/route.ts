import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { jsonErrorFromUnknown, requireSession } from "@/lib/rpg/http";
import { getRpgRuntime } from "@/lib/rpg/runtime";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { accountId } = requireSession(req);
    const body = (await req.json()) as { name?: string; class?: string };
    const name = (body.name ?? "").trim();
    const charClass = (body.class ?? "SWORDSMAN").trim().toUpperCase();
    if (!name) return NextResponse.json({ ok: false, error: "name 필요" }, { status: 400 });

    const { db } = getRpgRuntime();
    const countRow = db
      .prepare("SELECT COUNT(*) AS cnt FROM characters WHERE account_id = ?")
      .get(accountId) as { cnt: number };
    if (Number(countRow?.cnt ?? 0) >= 3) {
      return NextResponse.json({ ok: false, error: "캐릭터는 계정당 최대 3개" }, { status: 400 });
    }

    const characterId = randomUUID();
    const now = new Date().toISOString();
    db.prepare("INSERT INTO characters(character_id,account_id,name,class,created_at) VALUES(?,?,?,?,?)").run(
      characterId,
      accountId,
      name,
      charClass,
      now,
    );

    return NextResponse.json({ ok: true, character: { characterId, name, class: charClass } });
  } catch (e) {
    const { status, message } = jsonErrorFromUnknown(e);
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
