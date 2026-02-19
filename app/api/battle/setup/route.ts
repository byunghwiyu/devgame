import { NextResponse } from "next/server";
import { getMonsterKeyForNode } from "@/lib/data/loadEncounters";
import { getDefineNumber, loadDefineTable } from "@/lib/data/loadDefineTable";
import { loadActorSkillMap } from "@/lib/data/loadBattleSkills";
import { buildMonsterIndex, loadMonsters } from "@/lib/data/loadMonsters";
import { loadPlayerTemplates } from "@/lib/data/loadPlayerTemplates";
import { loadTokens } from "@/lib/data/loadTokens";
import type { Fighter } from "@/lib/game/battle";

type CombatantDto = Fighter & {
  imageKey?: string;
};

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const nodeKey = (searchParams.get("at") ?? "").replace(/\r/g, "").trim();

    if (!nodeKey) {
      return NextResponse.json({ error: "nodeKey(at) is required." }, { status: 400 });
    }

    const monsterKey = getMonsterKeyForNode(nodeKey);
    if (!monsterKey) {
      return NextResponse.json({ error: `No monster mapped for node: ${nodeKey}` }, { status: 404 });
    }

    const monsters = loadMonsters();
    const monsterIndex = buildMonsterIndex(monsters);
    const monster = monsterIndex.get(monsterKey);

    if (!monster) {
      return NextResponse.json({ error: `Monster not found: ${monsterKey}` }, { status: 404 });
    }

    const players = loadPlayerTemplates();
    const player = players[0];
    if (!player) {
      return NextResponse.json({ error: "player_character.csv is empty." }, { status: 500 });
    }

    const defineTable = loadDefineTable();
    const attackTimeoutMs = getDefineNumber(defineTable, "attack_timeout_ms", 6000);
    const defenseTimeoutMs = getDefineNumber(defineTable, "defense_timeout_ms", 4000);
    const battleRoundIntervalMs = getDefineNumber(defineTable, "battle_round_interval_ms", 3000);

    const actorSkills = loadActorSkillMap();
    const playerSkills = actorSkills.get(`PLAYER:${player.key}`) ?? [];
    const monsterSkills = actorSkills.get(`MONSTER:${monster.key}`) ?? [];

    const playerCombatant: CombatantDto = {
      name: player.name,
      hpMax: player.hp,
      hp: player.hp,
      atk: player.atk,
      def: player.def,
      speed: player.speed,
      innerMax: player.innerMax,
      inner: player.innerStart,
      innerRegen: player.innerRegen,
      skills: playerSkills,
      imageKey: player.imageKey,
    };

    const monsterInnerMax = monster.innerMax ?? getDefineNumber(defineTable, "monster_inner_max", 100);
    const monsterInnerStart = monster.innerStart ?? getDefineNumber(defineTable, "monster_inner_start", 20);
    const monsterInnerRegen = monster.innerRegen ?? getDefineNumber(defineTable, "monster_inner_regen", 6);

    const monsterCombatant: CombatantDto = {
      name: monster.name,
      hpMax: monster.hp,
      hp: monster.hp,
      atk: monster.atk,
      def: monster.def,
      speed: monster.speed ?? 10,
      innerMax: monsterInnerMax,
      inner: monsterInnerStart,
      innerRegen: monsterInnerRegen,
      skills: monsterSkills,
      imageKey: monster.imageKey,
    };

    const tokenDefs = loadTokens().map((token) => ({
      key: token.key,
      name: token.name,
      slot: token.slot,
      category: token.category,
    }));

    return NextResponse.json({
      nodeKey,
      monsterKey,
      player: playerCombatant,
      monster: monsterCombatant,
      tokenDefs,
      config: {
        attackTimeoutMs,
        defenseTimeoutMs,
        battleRoundIntervalMs,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
