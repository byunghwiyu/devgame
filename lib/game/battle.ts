import { calcElementMult, calcYinYangMult, getAttackAffinity } from "@/lib/game/affinity";
import { validateAttackCombo, validateDefenseCombo } from "@/lib/game/comboValidator";
import type { Token } from "@/lib/data/loadTokens";
import { calcSynergy, type AppliedRule, type SynergyResult } from "@/lib/game/synergy";

export type Fighter = {
  name: string;
  hp: number;
  atk: number;
  def: number;
  speed: number;
  element?: string;
  yinyang?: string;
};

export type BattleState = {
  player: Fighter;
  enemy: Fighter;
  log: string[];
  isOver: boolean;
  winner?: "player" | "enemy";
};

type PlayerAction = "ATTACK" | "SKILL";
type ComboTokens = {
  playerAttackInput?: string;
  enemyDefenseInput?: string;
  enemyAttackInput?: string;
  playerDefenseInput?: string;
  playerAttackTokens?: string[];
  enemyDefenseTokens?: string[];
  enemyAttackTokens?: string[];
  playerDefenseTokens?: string[];
};

type DefenseChoice = {
  id: "solid_guard" | "evade_guard" | "counter_guard" | "prepared_guard";
  tokens: string[];
  reason: string;
};

type ResolvedCombo = {
  rawInput?: string;
  keys: string[];
  tokens: Token[];
  valid: boolean;
  reason?: string;
};

const FALLBACK_TOKENS: Token[] = [
  { key: "JUMP", name: "점프", slot: "MOVE", category: "이동", basePower: 12, defensePower: 0, element: "WIND", yinyang: "YANG", cooldownRound: 0 },
  { key: "MOVE", name: "경공", slot: "MOVE", category: "이동", basePower: 14, defensePower: 0, element: "WIND", yinyang: "YANG", cooldownRound: 0 },
  { key: "ATTACK", name: "선인지로", slot: "ATTACK", category: "공격", basePower: 26, defensePower: 0, element: "METAL", yinyang: "YANG", cooldownRound: 0 },
  { key: "DEFENSE", name: "보법", slot: "DEFENSE", category: "방어", basePower: 18, defensePower: 18, element: "EARTH", yinyang: "YIN", cooldownRound: 0 },
  { key: "BUFF", name: "기공", slot: "BUFF", category: "버프", basePower: 16, defensePower: 16, element: "FIRE", yinyang: "YANG", cooldownRound: 1 },
  { key: "BLOCK", name: "막기", slot: "DEFENSE", category: "방어", basePower: 16, defensePower: 16, element: "WATER", yinyang: "YIN", cooldownRound: 0 },
];

let tokenIndexCache: Map<string, Token> | null = null;

function clampHp(hp: number): number {
  return Math.max(0, hp);
}

function rollInitiative(speed: number): number {
  return speed + Math.floor(Math.random() * 21);
}

function normalize(raw?: string): string {
  return (raw ?? "").replace(/\r/g, "").trim();
}

function parseInputToTokenKeys(inputText: string): string[] {
  const normalized = normalize(inputText);
  if (!normalized) return [];

  const keys: string[] = [];
  const matches = normalized.matchAll(/\[(.*?)\]/g);

  for (const match of matches) {
    const tokenName = normalize(match[1]);
    if (!tokenName) continue;
    keys.push(tokenName);
  }

  return keys;
}

function loadTokenIndexSafe(): Map<string, Token> {
  if (tokenIndexCache) return tokenIndexCache;

  const fallback = new Map<string, Token>();
  for (const token of FALLBACK_TOKENS) {
    fallback.set(token.key, token);
    fallback.set(token.name, token);
  }

  if (typeof window !== "undefined") {
    tokenIndexCache = fallback;
    return tokenIndexCache;
  }

  try {
    const req = eval("require") as (id: string) => {
      loadTokens: () => Token[];
      buildTokenIndex: (tokens: Token[]) => Map<string, Token>;
    };
    const mod = req("../data/loadTokens");
    const tokens = mod.loadTokens();
    const byKey = mod.buildTokenIndex(tokens);
    const merged = new Map<string, Token>(fallback);
    for (const token of byKey.values()) {
      merged.set(token.key, token);
      merged.set(token.name, token);
    }
    tokenIndexCache = merged;
    return tokenIndexCache;
  } catch {
    tokenIndexCache = fallback;
    return tokenIndexCache;
  }
}

function resolveTokenKeys(rawInput: string | undefined, keys: string[] | undefined): string[] {
  if (rawInput && normalize(rawInput)) {
    return parseInputToTokenKeys(rawInput);
  }
  return (keys ?? []).map((k) => normalize(k)).filter(Boolean);
}

function toTokenObjects(keys: string[], index: Map<string, Token>): Token[] {
  return keys
    .map((key) => index.get(key) ?? index.get(normalize(key).toUpperCase()))
    .filter((token): token is Token => Boolean(token));
}

function resolveAttackCombo(rawInput: string | undefined, keys: string[] | undefined): ResolvedCombo {
  const index = loadTokenIndexSafe();
  const resolvedKeys = resolveTokenKeys(rawInput, keys);
  const tokens = toTokenObjects(resolvedKeys, index);
  const validation = validateAttackCombo(tokens);

  return {
    rawInput,
    keys: tokens.map((t) => t.key),
    tokens,
    valid: validation.valid,
    reason: validation.reason,
  };
}

function resolveDefenseCombo(rawInput: string | undefined, keys: string[] | undefined): ResolvedCombo {
  const index = loadTokenIndexSafe();
  const resolvedKeys = resolveTokenKeys(rawInput, keys);
  const tokens = toTokenObjects(resolvedKeys, index);
  const validation = validateDefenseCombo(tokens);

  return {
    rawInput,
    keys: tokens.map((t) => t.key),
    tokens,
    valid: validation.valid,
    reason: validation.reason,
  };
}

function formatTopRules(applied: AppliedRule[]): string {
  const top = applied.slice(0, 3);
  if (top.length === 0) return "none";
  return top.map((rule) => `${rule.ruleKey}[${rule.tags.join(",") || "-"}]`).join(" | ");
}

function formatAppliedRules(applied: AppliedRule[]): string {
  if (applied.length === 0) return "none";
  return applied
    .slice(0, 3)
    .map((rule) => `${rule.ruleKey}(${rule.tags.join(",") || "-"})`)
    .join(" | ");
}

function calcAttackBase(tokens: Token[], atkStat: number): number {
  const directAttack = tokens
    .filter((token) => token.slot === "ATTACK")
    .reduce((sum, token) => sum + token.basePower, 0);

  const fallbackAttack =
    directAttack > 0
      ? 0
      : tokens
          .filter((token) => token.slot !== "DEFENSE")
          .reduce((sum, token) => sum + Math.round(token.basePower * 0.6), 0);

  const stanceBonus = tokens
    .filter((token) => token.slot === "BUFF")
    .reduce((sum, token) => sum + Math.round(token.basePower * 0.2), 0);

  return Math.round(directAttack + fallbackAttack + stanceBonus + atkStat);
}

function calcDefenseBase(tokens: Token[], defStat: number): number {
  const defenseSum = tokens
    .filter((token) => token.slot === "DEFENSE")
    .reduce((sum, token) => sum + token.defensePower, 0);
  const stanceBonus = tokens
    .filter((token) => token.slot === "BUFF")
    .reduce((sum, token) => sum + Math.round(token.defensePower * 0.15), 0);

  return Math.round(defenseSum + stanceBonus + defStat);
}

function countPrefixTags(result: SynergyResult, prefix: string): number {
  let count = 0;
  for (const rule of result.applied) {
    for (const tag of rule.tags) {
      if (tag.startsWith(prefix)) count += 1;
    }
  }
  return count;
}

function weightedPick<T>(items: Array<{ value: T; weight: number }>): T {
  const total = items.reduce((sum, item) => sum + Math.max(0, item.weight), 0);
  if (total <= 0) return items[0].value;

  let roll = Math.random() * total;
  for (const item of items) {
    roll -= Math.max(0, item.weight);
    if (roll <= 0) return item.value;
  }

  return items[items.length - 1].value;
}

function chooseMonsterDefenseCombo(playerAttackKeys: string[]): DefenseChoice {
  const analysis = calcSynergy(playerAttackKeys);
  const tagFreq = new Map<string, number>();
  for (const applied of analysis.applied) {
    for (const tag of applied.tags) {
      tagFreq.set(tag, (tagFreq.get(tag) ?? 0) + 1);
    }
  }

  const airCount = countPrefixTags(analysis, "air_");
  const approachCount = countPrefixTags(analysis, "approach_");
  const burstCount = countPrefixTags(analysis, "burst_");
  const highPressure = analysis.rawScore > 300;
  const pressureBonus = highPressure ? 3 : 0;
  const topTag = [...tagFreq.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "none";

  const solidGuard: DefenseChoice = {
    id: "solid_guard",
    tokens: ["DEFENSE", "BUFF"],
    reason: highPressure
      ? `고압 방어(air 대응, topTag=${topTag})`
      : airCount > 0
        ? "air_combo 대응"
        : "기본 방어",
  };
  const evadeGuard: DefenseChoice = {
    id: "evade_guard",
    tokens: ["MOVE", "DEFENSE"],
    reason: approachCount > 0 ? `approach_combo 대응(topTag=${topTag})` : "진입 대응",
  };
  const counterGuard: DefenseChoice = {
    id: "counter_guard",
    tokens: ["DEFENSE", "ATTACK"],
    reason: highPressure ? "고압 카운터 태세" : "카운터 태세",
  };
  const preparedGuard: DefenseChoice = {
    id: "prepared_guard",
    tokens: ["BUFF", "DEFENSE"],
    reason: highPressure
      ? `고압 방어 준비(burst 대응, topTag=${topTag})`
      : burstCount > 0
        ? "burst_combo 대응"
        : "준비 방어",
  };

  return weightedPick([
    { value: solidGuard, weight: 1 + airCount * 2 + pressureBonus },
    { value: evadeGuard, weight: 1 + approachCount * 2 },
    { value: counterGuard, weight: 1 + Math.floor((airCount + approachCount + burstCount) / 2) },
    { value: preparedGuard, weight: 1 + burstCount * 2 + pressureBonus },
  ]);
}

function calcTurnDamage(
  attacker: Fighter,
  defender: Fighter,
  attackCombo: ResolvedCombo,
  defenseCombo: ResolvedCombo,
): {
  attackBase: number;
  defenseBase: number;
  atkSynergy: SynergyResult;
  defSynergy: SynergyResult;
  attackerAffinity: { element: string; yinyang: string };
  defenderAffinity: { element: string; yinyang: string };
  elementMult: number;
  yinYangMult: number;
  affinityMult: number;
  elementReason?: string;
  yinYangReason?: string;
  attackScore: number;
  defenseScore: number;
  finalDamage: number;
} {
  const attackBase = calcAttackBase(attackCombo.tokens, attacker.atk);
  const defenseBase = calcDefenseBase(defenseCombo.tokens, defender.def);
  const atkSynergy = calcSynergy(attackCombo.keys);
  const defSynergy = calcSynergy(defenseCombo.keys);

  const attackerAffinity = getAttackAffinity(attackCombo.tokens, {
    element: attacker.element ?? "NEUTRAL",
    yinyang: attacker.yinyang ?? "NEUTRAL",
  });
  const defenderAffinity = {
    element: defender.element ?? "NEUTRAL",
    yinyang: defender.yinyang ?? "NEUTRAL",
  };

  const elementResult = calcElementMult(attackerAffinity.element, defenderAffinity.element);
  const yinYangResult = calcYinYangMult(attackerAffinity.yinyang, defenderAffinity.yinyang);
  const affinityMult = elementResult.mult * yinYangResult.mult;

  const attackScore = Math.round(attackBase * atkSynergy.multiplier * affinityMult);
  const defenseScore = Math.round(defenseBase * defSynergy.multiplier);
  const rawDamage = Math.round(attackScore - defenseScore);
  const finalDamage = attackScore <= 0 ? 0 : Math.max(1, rawDamage);

  return {
    attackBase,
    defenseBase,
    atkSynergy,
    defSynergy,
    attackerAffinity,
    defenderAffinity,
    elementMult: elementResult.mult,
    yinYangMult: yinYangResult.mult,
    affinityMult,
    elementReason: elementResult.reason,
    yinYangReason: yinYangResult.reason,
    attackScore,
    defenseScore,
    finalDamage,
  };
}

function pushComboLogs(
  log: string[],
  kind: "공격" | "방어",
  combo: ResolvedCombo,
  synergy: SynergyResult,
  scoreValue?: number,
) {
  log.push(`${kind} 토큰: ${combo.keys.join(">") || "none"}`);
  if (!combo.valid) {
    log.push(`${kind} 콤보 검증 실패: ${combo.reason ?? "invalid"}`);
  }
  log.push(`${kind} 적용 룰: ${formatAppliedRules(synergy.applied)}`);
  log.push(`${kind} 시너지: raw=${synergy.rawScore}, final=${synergy.finalScore}, x${synergy.multiplier.toFixed(2)}`);
  if (typeof scoreValue === "number") {
    log.push(`${kind} 점수: ${scoreValue}`);
  }
}

function pushAffinityLogs(
  log: string[],
  attackerAffinity: { element: string; yinyang: string },
  defenderAffinity: { element: string; yinyang: string },
  elementMult: number,
  yinYangMult: number,
  affinityMult: number,
  elementReason?: string,
  yinYangReason?: string,
) {
  log.push(
    `공격 속성: ${attackerAffinity.element}/${attackerAffinity.yinyang}, 방어자 속성: ${defenderAffinity.element}/${defenderAffinity.yinyang}`,
  );
  if (elementReason) log.push(elementReason);
  if (yinYangReason) log.push(yinYangReason);
  log.push(`상성 배율: 오행 x${elementMult.toFixed(2)}, 음양 x${yinYangMult.toFixed(2)}, 합성 x${affinityMult.toFixed(2)}`);
}

export function createBattle(player: Fighter, enemy: Fighter): BattleState {
  return {
    player: { ...player },
    enemy: { ...enemy },
    log: [`Battle start: ${player.name} vs ${enemy.name}`],
    isOver: false,
  };
}

export function applyPlayerAction(
  state: BattleState,
  action: PlayerAction,
  comboTokens?: ComboTokens,
): BattleState {
  if (state.isOver) return state;

  const player = { ...state.player };
  const enemy = { ...state.enemy };
  const log = [...state.log];
  const playerInit = rollInitiative(player.speed);
  const monsterInit = rollInitiative(enemy.speed);
  const playerFirst = playerInit >= monsterInit;

  log.push("라운드 시작");
  log.push(`플레이어 Initiative: ${playerInit}`);
  log.push(`몬스터 Initiative: ${monsterInit}`);
  log.push(`공격권: ${playerFirst ? "플레이어" : "몬스터"}`);

  const playerAttackCombo = resolveAttackCombo(comboTokens?.playerAttackInput, comboTokens?.playerAttackTokens);

  const defenseChoice: DefenseChoice =
    comboTokens?.enemyDefenseInput || (comboTokens?.enemyDefenseTokens?.length ?? 0) > 0
      ? {
          id: "solid_guard",
          tokens: resolveTokenKeys(comboTokens?.enemyDefenseInput, comboTokens?.enemyDefenseTokens),
          reason: "수동 지정",
        }
      : chooseMonsterDefenseCombo(playerAttackCombo.keys);

  const enemyDefenseCombo = resolveDefenseCombo(undefined, defenseChoice.tokens);
  const enemyAttackCombo = resolveAttackCombo(comboTokens?.enemyAttackInput, comboTokens?.enemyAttackTokens);
  const playerDefenseCombo = resolveDefenseCombo(comboTokens?.playerDefenseInput, comboTokens?.playerDefenseTokens);
  log.push(`몬스터 방어 선택: ${defenseChoice.tokens.join(">")} (이유: ${defenseChoice.reason})`);

  const doPlayerAttack = () => {
    const playerDamageCalc = calcTurnDamage(player, enemy, playerAttackCombo, enemyDefenseCombo);
    enemy.hp = clampHp(enemy.hp - playerDamageCalc.finalDamage);

    pushComboLogs(log, "공격", playerAttackCombo, playerDamageCalc.atkSynergy, playerDamageCalc.attackScore);
    pushComboLogs(log, "방어", enemyDefenseCombo, playerDamageCalc.defSynergy, playerDamageCalc.defenseScore);
    pushAffinityLogs(
      log,
      playerDamageCalc.attackerAffinity,
      playerDamageCalc.defenderAffinity,
      playerDamageCalc.elementMult,
      playerDamageCalc.yinYangMult,
      playerDamageCalc.affinityMult,
      playerDamageCalc.elementReason,
      playerDamageCalc.yinYangReason,
    );
    log.push(`최종 피해: ${playerDamageCalc.finalDamage}`);
    log.push(`${player.name} used ${action} and dealt ${playerDamageCalc.finalDamage} damage to ${enemy.name}.`);
  };

  const doEnemyAttack = () => {
    const enemyDamageCalc = calcTurnDamage(enemy, player, enemyAttackCombo, playerDefenseCombo);
    player.hp = clampHp(player.hp - enemyDamageCalc.finalDamage);

    pushComboLogs(log, "공격", enemyAttackCombo, enemyDamageCalc.atkSynergy, enemyDamageCalc.attackScore);
    pushComboLogs(log, "방어", playerDefenseCombo, enemyDamageCalc.defSynergy, enemyDamageCalc.defenseScore);
    pushAffinityLogs(
      log,
      enemyDamageCalc.attackerAffinity,
      enemyDamageCalc.defenderAffinity,
      enemyDamageCalc.elementMult,
      enemyDamageCalc.yinYangMult,
      enemyDamageCalc.affinityMult,
      enemyDamageCalc.elementReason,
      enemyDamageCalc.yinYangReason,
    );
    log.push(`최종 피해: ${enemyDamageCalc.finalDamage}`);
    log.push(`${enemy.name} attacked and dealt ${enemyDamageCalc.finalDamage} damage to ${player.name}.`);
    log.push(`상위 공격 룰: ${formatTopRules(enemyDamageCalc.atkSynergy.applied)}`);
    log.push(`상위 방어 룰: ${formatTopRules(enemyDamageCalc.defSynergy.applied)}`);
  };

  if (playerFirst) {
    doPlayerAttack();
    if (enemy.hp <= 0) {
      log.push(`${enemy.name} was defeated.`);
      return {
        player,
        enemy,
        log,
        isOver: true,
        winner: "player",
      };
    }
    doEnemyAttack();
    if (player.hp <= 0) {
      log.push(`${player.name} was defeated.`);
      return {
        player,
        enemy,
        log,
        isOver: true,
        winner: "enemy",
      };
    }
  } else {
    doEnemyAttack();
    if (player.hp <= 0) {
      log.push(`${player.name} was defeated.`);
      return {
        player,
        enemy,
        log,
        isOver: true,
        winner: "enemy",
      };
    }
    doPlayerAttack();
    if (enemy.hp <= 0) {
      log.push(`${enemy.name} was defeated.`);
      return {
        player,
        enemy,
        log,
        isOver: true,
        winner: "player",
      };
    }
  }

  return {
    player,
    enemy,
    log,
    isOver: false,
  };
}







