import { NextResponse } from "next/server";
import { getRpgRuntime } from "@/lib/rpg/runtime";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { userId?: string; equipUid?: string };
    const userId = (body.userId ?? "u1").trim() || "u1";
    const equipUid = (body.equipUid ?? "").trim();
    if (!equipUid) {
      return NextResponse.json({ ok: false, error: "equipUid가 필요합니다." }, { status: 400 });
    }

    const { equipmentService, progressService } = getRpgRuntime();
    const progress = progressService.getProgress(userId);
    equipmentService.equip(userId, equipUid, progress.level);

    return NextResponse.json({ ok: true, message: "장착 완료" });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
