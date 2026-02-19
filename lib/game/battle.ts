export type SkillKind = "BASIC" | "PASSIVE" | "ACTIVE" | "PROC" | "SIGNATURE";

export type SkillTrigger = "ON_INNER_SPENT" | "ON_LOW_HP_DEF" | "ON_BASIC_ATTACK_INNER_REGEN";

export type Skill = {
  key: string;
  name: string;
  kind: SkillKind;
  cooldownTurns: number;
  power: number;
  innerCost?: number;
  procChance?: number;
  trigger?: SkillTrigger;
  atkBonusPct?: number;
  defBonusPct?: number;
  speedBonusPct?: number;
  innerRegenBonus?: number;
};

export type Fighter = {
  name: string;
  hpMax: number;
  hp: number;
  atk: number;
  def: number;
  speed: number;
  innerMax: number;
  inner: number;
  innerRegen: number;
  skills: Skill[];
};

type ActorState = Fighter & {
  cooldownRemain: Record<string, number>;
};

export type BattleState = {
  player: ActorState;
  enemy: ActorState;
  timeSec: number;
  turn: number;
  log: string[];
  isOver: boolean;
  winner?: "player" | "enemy";
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function isSkillReady(actor: ActorState, skill: Skill): boolean {
  const remain = actor.cooldownRemain[skill.key] ?? 0;
  return remain <= 0;
}

function setCooldown(actor: ActorState, skill: Skill): ActorState {
  const next = { ...actor.cooldownRemain };
  next[skill.key] = Math.max(0, Math.floor(skill.cooldownTurns));
  return {
    ...actor,
    cooldownRemain: next,
  };
}

function tickCooldown(actor: ActorState): ActorState {
  const next = { ...actor.cooldownRemain };
  for (const key of Object.keys(next)) {
    next[key] = Math.max(0, (next[key] ?? 0) - 1);
  }
  return {
    ...actor,
    cooldownRemain: next,
  };
}

function applyPassiveBonuses(base: Fighter): Fighter {
  const passiveSkills = base.skills.filter((s) => s.kind === "PASSIVE");

  const staticPassives = passiveSkills.filter((s) => s.trigger !== "ON_LOW_HP_DEF");
  const atkPct = staticPassives.reduce((sum, s) => sum + (s.atkBonusPct ?? 0), 0);
  const defPct = staticPassives.reduce((sum, s) => sum + (s.defBonusPct ?? 0), 0);
  const speedPct = staticPassives.reduce((sum, s) => sum + (s.speedBonusPct ?? 0), 0);
  const innerRegenBonus = staticPassives.reduce((sum, s) => sum + (s.innerRegenBonus ?? 0), 0);

  return {
    ...base,
    atk: Math.max(1, Math.round(base.atk * (1 + atkPct / 100))),
    def: Math.max(0, Math.round(base.def * (1 + defPct / 100))),
    speed: Math.max(1, Math.round(base.speed * (1 + speedPct / 100))),
    innerRegen: Math.max(0, base.innerRegen + innerRegenBonus),
    hp: clamp(base.hp, 0, base.hpMax),
    inner: clamp(base.inner, 0, base.innerMax),
  };
}

function toActorState(base: Fighter): ActorState {
  const withPassive = applyPassiveBonuses(base);
  return {
    ...withPassive,
    cooldownRemain: {},
  };
}

function advanceResourcePerTurn(actor: ActorState): ActorState {
  return {
    ...actor,
    inner: clamp(actor.inner + actor.innerRegen, 0, actor.innerMax),
  };
}

function pickBasic(actor: ActorState): Skill | undefined {
  return actor.skills.find((s) => s.kind === "BASIC");
}

function pickActive(actor: ActorState): Skill | undefined {
  const actives = actor.skills
    .filter((s) => s.kind === "ACTIVE")
    .filter((s) => isSkillReady(actor, s))
    .filter((s) => actor.inner >= (s.innerCost ?? 0))
    .sort((a, b) => b.power - a.power);

  return actives[0];
}

function pickSignaturePriority(actor: ActorState): Skill | undefined {
  return actor.skills
    .filter((s) => s.kind === "SIGNATURE")
    .filter((s) => isSkillReady(actor, s))
    .filter((s) => !s.trigger)
    .sort((a, b) => b.power - a.power)[0];
}

function pickProcPriority(actor: ActorState): Skill | undefined {
  const procSkills = actor.skills
    .filter((s) => s.kind === "PROC")
    .filter((s) => isSkillReady(actor, s));

  for (const skill of procSkills) {
    const chance = clamp(skill.procChance ?? 0, 0, 1);
    if (Math.random() <= chance) {
      return skill;
    }
  }
  return undefined;
}

function calcLowHpDefScale(actor: ActorState): number {
  const hpRatio = actor.hpMax > 0 ? actor.hp / actor.hpMax : 0;
  if (hpRatio <= 0.3) return 1;
  if (hpRatio >= 1) return 0;
  return (1 - hpRatio) / 0.7;
}

function calcLowHpDefBonusPct(actor: ActorState): number {
  const maxPct = actor.skills
    .filter((s) => s.kind === "PASSIVE" && s.trigger === "ON_LOW_HP_DEF")
    .reduce((sum, s) => sum + (s.defBonusPct ?? 0), 0);

  if (maxPct <= 0) return 0;
  const scale = calcLowHpDefScale(actor);
  return maxPct * scale;
}

function calcDamage(attacker: ActorState, defender: ActorState, power: number): number {
  const attackScore = attacker.atk + power;
  const lowHpDefBonusPct = calcLowHpDefBonusPct(defender);
  const effectiveDef = Math.round(defender.def * (1 + lowHpDefBonusPct / 100));

  return Math.max(1, Math.round(attackScore - effectiveDef));
}

function applyDamage(target: ActorState, damage: number): ActorState {
  return {
    ...target,
    hp: Math.max(0, target.hp - Math.max(0, damage)),
  };
}

function runSignature(
  attacker: ActorState,
  defender: ActorState,
  spentInner: number,
  log: string[],
): { attacker: ActorState; defender: ActorState; dealt: number } {
  if (spentInner <= 0) return { attacker, defender, dealt: 0 };

  const signature = attacker.skills.find((s) => s.kind === "SIGNATURE" && s.trigger === "ON_INNER_SPENT");
  const basic = pickBasic(attacker);
  if (!signature || !basic) return { attacker, defender, dealt: 0 };
  if (!isSkillReady(attacker, signature)) return { attacker, defender, dealt: 0 };

  const damage = calcDamage(attacker, defender, basic.power);
  const nextDef = applyDamage(defender, damage);
  const nextAtk = setCooldown(attacker, signature);

  log.push(`${nextAtk.name} 시그니처 ${signature.name} 발동! 즉시 기본 공격 추가(${damage})`);
  return { attacker: nextAtk, defender: nextDef, dealt: damage };
}

function applyBasicAttackInnerRegenTrigger(
  actor: ActorState,
  log: string[],
): { actor: ActorState; gained: number } {
  const gained = actor.skills
    .filter((s) => s.trigger === "ON_BASIC_ATTACK_INNER_REGEN")
    .reduce((sum, s) => sum + (s.innerRegenBonus ?? 0), 0);

  if (gained <= 0) return { actor, gained: 0 };

  const next = {
    ...actor,
    inner: clamp(actor.inner + gained, 0, actor.innerMax),
  };
  log.push(`${next.name} 트리거 발동: 기본 공격 내공 회복 +${gained}`);
  return { actor: next, gained };
}

function selectAction(actor: ActorState): Skill | undefined {
  const signature = pickSignaturePriority(actor);
  if (signature) return signature;

  const proc = pickProcPriority(actor);
  if (proc) return proc;

  const active = pickActive(actor);
  if (active) return active;

  const basic = pickBasic(actor);
  if (basic && isSkillReady(actor, basic)) return basic;

  return undefined;
}

type ResolveTurnResult = {
  attacker: ActorState;
  defender: ActorState;
  dealt: number;
};

function resolveTurn(
  attacker: ActorState,
  defender: ActorState,
  log: string[],
): ResolveTurnResult {
  let atk = attacker;
  let def = defender;
  let dealt = 0;

  const action = selectAction(atk);
  if (!action) {
    log.push(`${atk.name} 행동 대기 (스킬 쿨타임)`);
    return { attacker: atk, defender: def, dealt };
  }

  let spentInner = 0;
  if (action.kind === "ACTIVE") {
    spentInner = Math.min(atk.inner, action.innerCost ?? 0);
    atk = {
      ...atk,
      inner: Math.max(0, atk.inner - spentInner),
    };
  }

  const damage = calcDamage(atk, def, action.power);
  dealt += damage;
  def = applyDamage(def, damage);
  atk = setCooldown(atk, action);

  if (action.kind === "SIGNATURE") {
    log.push(`${atk.name} 시그니처 ${action.name} 사용 -> ${def.name} ${damage} 피해`);
  } else if (action.kind === "PROC") {
    log.push(`${atk.name} 발동형 ${action.name} 발동 -> ${def.name} ${damage} 피해`);
  } else if (action.kind === "ACTIVE") {
    log.push(`${atk.name} 액티브 ${action.name} 사용 (내공 -${spentInner}) -> ${def.name} ${damage} 피해`);
  } else if (action.kind === "BASIC") {
    log.push(`${atk.name} 기본 공격 ${action.name} -> ${def.name} ${damage} 피해`);
    const basicTrigger = applyBasicAttackInnerRegenTrigger(atk, log);
    atk = basicTrigger.actor;
  }

  if (action.kind === "ACTIVE" && def.hp > 0) {
    const signatureResult = runSignature(atk, def, spentInner, log);
    dealt += signatureResult.dealt;
    atk = signatureResult.attacker;
    def = signatureResult.defender;
  }

  return { attacker: atk, defender: def, dealt };
}

function applyTurnCooldownTick(state: BattleState): BattleState {
  return {
    ...state,
    player: tickCooldown(state.player),
    enemy: tickCooldown(state.enemy),
  };
}

export function createBattle(player: Fighter, enemy: Fighter): BattleState {
  const p = toActorState(player);
  const e = toActorState(enemy);

  return {
    player: p,
    enemy: e,
    timeSec: 0,
    turn: 0,
    log: [`Battle start: ${p.name} vs ${e.name}`, `속도 우선권: ${p.speed >= e.speed ? p.name : e.name}`],
    isOver: false,
  };
}

export function advanceBattle(state: BattleState, deltaSec: number): BattleState {
  if (state.isOver) return state;

  let next: BattleState = {
    ...state,
    player: { ...state.player, cooldownRemain: { ...state.player.cooldownRemain } },
    enemy: { ...state.enemy, cooldownRemain: { ...state.enemy.cooldownRemain } },
    log: [...state.log],
  };

  next = applyTurnCooldownTick(next);
  next.turn += 1;

  const roundStartPlayerHp = next.player.hp;
  const roundStartEnemyHp = next.enemy.hp;
  const roundStartPlayerInner = next.player.inner;
  const roundStartEnemyInner = next.enemy.inner;

  next.player = advanceResourcePerTurn(next.player);
  next.enemy = advanceResourcePerTurn(next.enemy);
  next.timeSec = next.timeSec + Math.max(0, deltaSec);

  const actorOrder: Array<"player" | "enemy"> =
    next.player.speed >= next.enemy.speed ? ["player", "enemy"] : ["enemy", "player"];
  let playerDealt = 0;
  let enemyDealt = 0;

  for (const actorKey of actorOrder) {
    if (next.isOver) break;

    const targetKey: "player" | "enemy" = actorKey === "player" ? "enemy" : "player";
    const resolved = resolveTurn(next[actorKey], next[targetKey], next.log);
    next[actorKey] = resolved.attacker;
    next[targetKey] = resolved.defender;

    if (actorKey === "player") playerDealt += resolved.dealt;
    else enemyDealt += resolved.dealt;

    if (next[targetKey].hp <= 0) {
      next.isOver = true;
      next.winner = actorKey === "player" ? "player" : "enemy";
      next.log.push(next.winner === "player" ? "플레이어 승리" : "몬스터 승리");
      break;
    }
  }

  const playerHpLoss = Math.max(0, roundStartPlayerHp - next.player.hp);
  const enemyHpLoss = Math.max(0, roundStartEnemyHp - next.enemy.hp);
  const playerInnerDelta = Math.round(next.player.inner - roundStartPlayerInner);
  const enemyInnerDelta = Math.round(next.enemy.inner - roundStartEnemyInner);

  next.log.push(
    `턴 요약\n턴수: ${next.turn}\n플레이어: HP-${playerHpLoss}, 가한피해 ${playerDealt}, 내공 ${playerInnerDelta >= 0 ? "+" : ""}${playerInnerDelta}\n적: HP-${enemyHpLoss}, 가한피해 ${enemyDealt}, 내공 ${enemyInnerDelta >= 0 ? "+" : ""}${enemyInnerDelta}`,
  );

  return next;
}
