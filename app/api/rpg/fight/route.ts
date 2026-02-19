import { NextResponse } from "next/server";
import { getRpgRuntime } from "@/lib/rpg/runtime";

export async function POST(req: Request) {
  let requestId = "";
  try {
    const body = (await req.json()) as { userId?: string; monsterId?: string; requestId?: string };
    const userId = (body.userId ?? "u1").trim() || "u1";
    const monsterId = (body.monsterId ?? "").trim();
    requestId = (body.requestId ?? "").trim();
    if (!monsterId) return NextResponse.json({ ok: false, error: "monsterId가 필요합니다." }, { status: 400 });
    if (!requestId) return NextResponse.json({ ok: false, error: "requestId가 필요합니다." }, { status: 400 });

    const { battleHooks, db } = getRpgRuntime();

    const existing = db
      .prepare("SELECT status, result_json FROM rpg_fight_claims WHERE request_id = ?")
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
        return NextResponse.json(
          { ok: false, error: "같은 요청이 이미 처리 중입니다. 잠시 후 다시 조회하세요." },
          { status: 409 },
        );
      }
      return NextResponse.json(
        { ok: false, error: "이 requestId는 실패 처리되었습니다. 새 requestId로 다시 시도하세요." },
        { status: 409 },
      );
    }

    db.prepare(
      "INSERT INTO rpg_fight_claims(request_id,user_id,monster_id,status,result_json,created_at) VALUES(?,?,?,?,?,?)",
    ).run(requestId, userId, monsterId, "PROCESSING", "{}", Date.now());

    const result = battleHooks.onBattleEnd(userId, monsterId, true);
    db.prepare("UPDATE rpg_fight_claims SET status = ?, result_json = ? WHERE request_id = ?").run(
      "DONE",
      JSON.stringify(result),
      requestId,
    );

    return NextResponse.json({ ok: true, idempotent: false, result });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (requestId) {
      const { db } = getRpgRuntime();
      db.prepare("UPDATE rpg_fight_claims SET status = ?, result_json = ? WHERE request_id = ?").run(
        "FAILED",
        JSON.stringify({ error: message }),
        requestId,
      );
    }
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
