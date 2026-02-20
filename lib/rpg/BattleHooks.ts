import { LootService } from "./LootService";
import { getUnlockedSkillKeysByLevel, ProgressService, expToNextLevel } from "./ProgressService";
import { RewardService } from "./RewardService";
import { StatsResolver } from "./StatsResolver";

export class BattleHooks {
  constructor(
    private readonly lootService: LootService,
    private readonly rewardService: RewardService,
    private readonly statsResolver: StatsResolver,
    private readonly progressService: ProgressService,
  ) {}

  onBattleEnd(characterId: string, monsterId: string, playerWin: boolean) {
    if (!this.lootService.hasMonster(monsterId)) {
      throw new Error(`존재하지 않는 몬스터: ${monsterId}`);
    }
    if (!playerWin) {
      return { win: false, logs: [`[전투] 패배: ${monsterId}`] };
    }

    const beforeStats = this.statsResolver.resolveFinalStats(characterId);
    const loot = this.lootService.rollLoot(monsterId);
    this.rewardService.applyRewards(characterId, loot);

    const expResult = this.progressService.grantExp(characterId, loot.exp);
    const afterStats = this.statsResolver.resolveFinalStats(characterId);

    const logs: string[] = [];
    logs.push(`[전투] 승리: ${monsterId}`);

    if (loot.items.length === 0 && loot.currencies.length === 0 && loot.exp <= 0) {
      logs.push("[획득] 없음");
    } else {
      logs.push("[획득]");
      for (const c of loot.currencies) logs.push(`- ${c.currencyId} +${c.amount}`);
      for (const d of loot.items) logs.push(`- ${d.itemId} x${d.qty}`);
      if (loot.exp > 0) logs.push(`- EXP +${loot.exp}`);
    }

    const unlocked = getUnlockedSkillKeysByLevel(expResult.afterLevel);
    logs.push(
      `[성장] Lv ${expResult.beforeLevel} -> ${expResult.afterLevel}, EXP ${expResult.remainedExp}/${expToNextLevel(expResult.afterLevel)}`,
    );
    if (unlocked.length > 0) logs.push(`[해금 스킬] ${unlocked.join(", ")}`);

    logs.push(
      `[스탯] atk=${beforeStats.atk}->${afterStats.atk}, def=${beforeStats.def}->${afterStats.def}, hp=${beforeStats.hp}->${afterStats.hp}, spd=${beforeStats.spd}->${afterStats.spd}`,
    );

    return {
      win: true,
      loot,
      exp: expResult,
      beforeStats,
      afterStats,
      unlockedSkills: unlocked,
      logs,
    };
  }
}
