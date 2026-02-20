import { NextResponse } from "next/server";
import { expToNextLevel, getUnlockedSkillKeysByLevel } from "@/lib/rpg/ProgressService";
import { jsonErrorFromUnknown, requireSelectedCharacter } from "@/lib/rpg/http";
import { getRpgRuntime } from "@/lib/rpg/runtime";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const { characterId } = requireSelectedCharacter(req);
    const { statsResolver, progressService } = getRpgRuntime();
    const progress = progressService.getProgress(characterId);
    const stats = statsResolver.resolveFinalStats(characterId);
    return NextResponse.json({
      ok: true,
      characterId,
      progress: {
        ...progress,
        nextExp: expToNextLevel(progress.level),
        unlockedSkills: getUnlockedSkillKeysByLevel(progress.level),
      },
      stats,
    });
  } catch (e) {
    const { status, message } = jsonErrorFromUnknown(e);
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
