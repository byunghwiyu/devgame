import { NextResponse } from "next/server";
import { jsonErrorFromUnknown, requireSelectedCharacter } from "@/lib/rpg/http";
import { getRpgRuntime } from "@/lib/rpg/runtime";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { characterId } = requireSelectedCharacter(req);
    const body = (await req.json()) as { equipUid?: string };
    const equipUid = (body.equipUid ?? "").trim();
    if (!equipUid) {
      return NextResponse.json({ ok: false, error: "equipUid 필요" }, { status: 400 });
    }

    const { equipmentService, progressService } = getRpgRuntime();
    const progress = progressService.getProgress(characterId);
    equipmentService.equip(characterId, equipUid, progress.level);

    return NextResponse.json({ ok: true, message: "장착 완료" });
  } catch (e) {
    const { status, message } = jsonErrorFromUnknown(e);
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
