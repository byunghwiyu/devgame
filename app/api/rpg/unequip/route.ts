import { NextResponse } from "next/server";
import { jsonErrorFromUnknown, requireSelectedCharacter } from "@/lib/rpg/http";
import { getRpgRuntime } from "@/lib/rpg/runtime";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { characterId } = requireSelectedCharacter(req);
    const body = (await req.json()) as { slot?: string };
    const slot = (body.slot ?? "").trim();
    if (!slot) return NextResponse.json({ ok: false, error: "slot 필요" }, { status: 400 });

    const { equipmentService } = getRpgRuntime();
    equipmentService.unequip(characterId, slot);
    return NextResponse.json({ ok: true, message: "해제 완료" });
  } catch (e) {
    const { status, message } = jsonErrorFromUnknown(e);
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
