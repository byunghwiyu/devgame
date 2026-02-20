import { NextResponse } from "next/server";
import { loadPlayerTemplates } from "@/lib/data/loadPlayerTemplates";
import { jsonErrorFromUnknown, requireSession } from "@/lib/rpg/http";
import { expToNextLevel } from "@/lib/rpg/ProgressService";
import { getRpgRuntime } from "@/lib/rpg/runtime";
import { charUrl } from "@/lib/ui/assets";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const { accountId } = requireSession(req);
    const { db, statsResolver, progressService } = getRpgRuntime();
    const rows = db
      .prepare("SELECT character_id, name, class, created_at FROM characters WHERE account_id = ? ORDER BY created_at")
      .all(accountId) as Array<{ character_id: string; name: string; class: string; created_at: string }>;

    const templates = loadPlayerTemplates();
    const templateByJob = new Map(templates.map((t) => [t.job.trim().toUpperCase(), t]));
    const aliasToTemplateJob: Record<string, string> = {
      BLADEMASTER: "BLADEMAN",
      BRAWLER: "FIST",
    };

    return NextResponse.json({
      ok: true,
      characters: rows.map((r) => {
        const normalizedClass = (r.class ?? "").trim().toUpperCase();
        const wantedJob = aliasToTemplateJob[normalizedClass] ?? normalizedClass;
        const template = templateByJob.get(wantedJob);
        const progress = progressService.getProgress(r.character_id);
        const stats = statsResolver.resolveFinalStats(r.character_id);

        return {
          characterId: r.character_id,
          name: r.name,
          class: r.class,
          createdAt: r.created_at,
          level: progress.level,
          exp: progress.exp,
          expToNext: expToNextLevel(progress.level),
          stats,
          imageKey: template?.imageKey ?? null,
          imageUrl: charUrl(template?.imageKey),
        };
      }),
    });
  } catch (e) {
    const { status, message } = jsonErrorFromUnknown(e);
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
