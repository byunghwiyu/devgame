import { NextResponse } from "next/server";
import { getRpgRuntime } from "@/lib/rpg/runtime";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { userId?: string; slot?: string };
    const userId = (body.userId ?? "u1").trim() || "u1";
    const slot = (body.slot ?? "").trim();
    if (!slot) return NextResponse.json({ ok: false, error: "slot이 필요합니다." }, { status: 400 });

    const { equipmentService } = getRpgRuntime();
    equipmentService.unequip(userId, slot);
    return NextResponse.json({ ok: true, message: "해제 완료" });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
