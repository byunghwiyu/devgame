import fs from "node:fs";
import path from "node:path";
import Papa from "papaparse";
import type { Skill } from "@/lib/game/battle";

type SkillRow = {
  key: string;
  name: string;
  effect_text?: string;
  kind: Skill["kind"];
  cooldown_turns: string;
  power: string;
  inner_cost?: string;
  proc_chance?: string;
  trigger?: Skill["trigger"];
  value?: string;
  atk_bonus_pct?: string;
  def_bonus_pct?: string;
  speed_bonus_pct?: string;
  inner_regen_bonus?: string;
};

type ActorSkillRow = {
  actor_type: "PLAYER" | "MONSTER";
  actor_key: string;
  skill_key: string;
};

function normalize(raw?: string): string {
  return (raw ?? "").replace(/\r/g, "").trim();
}

function toNumber(raw?: string): number {
  const n = Number(normalize(raw));
  return Number.isFinite(n) ? n : 0;
}

function toOptionalNumber(raw?: string): number | undefined {
  const s = normalize(raw);
  if (!s) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

export function loadRuntimeSkills(): Map<string, Skill> {
  const filePath = path.join(process.cwd(), "data/csv/skills_runtime.csv");
  const file = fs.readFileSync(filePath, "utf8");

  const parsed = Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    delimiter: ",",
  });

  const map = new Map<string, Skill>();
  for (const row of parsed.data as SkillRow[]) {
    const key = normalize(row.key);
    if (!key) continue;

    map.set(key, {
      key,
      name: normalize(row.name),
      effectText: normalize(row.effect_text) || undefined,
      kind: normalize(row.kind) as Skill["kind"],
      cooldownTurns: Math.max(0, Math.floor(toNumber(row.cooldown_turns))),
      power: toNumber(row.power),
      innerCost: toOptionalNumber(row.inner_cost),
      procChance: toOptionalNumber(row.proc_chance),
      trigger: normalize(row.trigger) as Skill["trigger"],
      triggerValue: toOptionalNumber(row.value),
      atkBonusPct: toOptionalNumber(row.atk_bonus_pct),
      defBonusPct: toOptionalNumber(row.def_bonus_pct),
      speedBonusPct: toOptionalNumber(row.speed_bonus_pct),
      innerRegenBonus: toOptionalNumber(row.inner_regen_bonus),
    });
  }

  return map;
}

export function loadActorSkillMap(): Map<string, Skill[]> {
  const skillMap = loadRuntimeSkills();

  const filePath = path.join(process.cwd(), "data/csv/actor_skills.csv");
  const file = fs.readFileSync(filePath, "utf8");
  const parsed = Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    delimiter: ",",
  });

  const map = new Map<string, Skill[]>();

  for (const row of parsed.data as ActorSkillRow[]) {
    const actorType = normalize(row.actor_type);
    const actorKey = normalize(row.actor_key);
    const skillKey = normalize(row.skill_key);
    if (!actorType || !actorKey || !skillKey) continue;

    const skill = skillMap.get(skillKey);
    if (!skill) continue;

    const id = `${actorType}:${actorKey}`;
    const list = map.get(id) ?? [];
    list.push(skill);
    map.set(id, list);
  }

  return map;
}
