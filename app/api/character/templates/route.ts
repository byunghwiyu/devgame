import { NextResponse } from "next/server";
import { loadPlayerTemplates } from "@/lib/data/loadPlayerTemplates";
import { charUrl } from "@/lib/ui/assets";

export const runtime = "nodejs";

export async function GET() {
  try {
    const templates = loadPlayerTemplates().map((t) => ({
      key: t.key,
      name: t.name,
      job: t.job,
      imageKey: t.imageKey ?? null,
      imageUrl: charUrl(t.imageKey),
      hp: t.hp,
      atk: t.atk,
      def: t.def,
      speed: t.speed,
    }));
    return NextResponse.json({ ok: true, templates });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
