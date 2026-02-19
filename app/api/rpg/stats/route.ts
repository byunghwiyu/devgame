import { NextResponse } from "next/server";
import { getUserIdFromSearch } from "@/lib/rpg/http";
import { expToNextLevel, getUnlockedSkillKeysByLevel } from "@/lib/rpg/ProgressService";
import { getRpgRuntime } from "@/lib/rpg/runtime";

export async function GET(req: Request) {
  try {
    const userId = getUserIdFromSearch(req.url);
    const { statsResolver, progressService } = getRpgRuntime();
    const progress = progressService.getProgress(userId);
    const stats = statsResolver.resolveFinalStats(userId);
    return NextResponse.json({
      ok: true,
      userId,
      progress: {
        ...progress,
        nextExp: expToNextLevel(progress.level),
        unlockedSkills: getUnlockedSkillKeysByLevel(progress.level),
      },
      stats,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
