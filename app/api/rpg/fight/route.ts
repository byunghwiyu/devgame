import { NextResponse } from "next/server";
import { jsonErrorFromUnknown, requireSelectedCharacter } from "@/lib/rpg/http";
import { getRpgRuntime } from "@/lib/rpg/runtime";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let requestId = "";
  try {
    const { characterId } = requireSelectedCharacter(req);
    const body = (await req.json()) as { monsterId?: string; requestId?: string };
    const monsterId = (body.monsterId ?? "").trim();
    requestId = (body.requestId ?? "").trim();
    if (!monsterId) return NextResponse.json({ ok: false, error: "monsterId 필요" }, { status: 400 });
    if (!requestId) return NextResponse.json({ ok: false, error: "requestId 필요" }, { status: 400 });

    const { battleHooks, db } = getRpgRuntime();

    const existing = db
      .prepare("SELECT status, result_json FROM character_fight_claims WHERE request_id = ?")
      .get(requestId) as { status: string; result_json: string } | undefined;

    if (existing) {
      if (existing.status === "DONE") {
        return NextResponse.json({
          ok: true,
          idempotent: true,
          result: JSON.parse(existing.result_json),
        });
      }
      if (existing.status === "PROCESSING") {
        return NextResponse.json({ ok: false, error: "같은 요청이 처리 중입니다. 잠시 후 재시도하세요." }, { status: 409 });
      }
      return NextResponse.json({ ok: false, error: "이 requestId는 실패 처리되었습니다. 새 requestId로 시도하세요." }, { status: 409 });
    }

    db.prepare(
      "INSERT INTO character_fight_claims(request_id,character_id,monster_id,status,result_json,created_at) VALUES(?,?,?,?,?,?)",
    ).run(requestId, characterId, monsterId, "PROCESSING", "{}", Date.now());

    const result = battleHooks.onBattleEnd(characterId, monsterId, true);
    db.prepare("UPDATE character_fight_claims SET status = ?, result_json = ? WHERE request_id = ?").run(
      "DONE",
      JSON.stringify(result),
      requestId,
    );

    return NextResponse.json({ ok: true, idempotent: false, result });
  } catch (e) {
    const { status, message } = jsonErrorFromUnknown(e);
    if (requestId) {
      const { db } = getRpgRuntime();
      db.prepare("UPDATE character_fight_claims SET status = ?, result_json = ? WHERE request_id = ?").run(
        "FAILED",
        JSON.stringify({ error: message }),
        requestId,
      );
    }
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
