export type AppliedRule = {
  ruleKey: string;
  tags: string[];
  matchedLen: number;
  seqLen: number;
  score: number;
  note: "exact" | "partial(len2)" | "partial(len3)" | "ignored";
};

export type SynergyResult = {
  rawScore: number;
  finalScore: number;
  multiplier: number;
  applied: AppliedRule[];
};

type SynergyRule = {
  key: string;
  sequence: string[];
  baseScore: number;
  minMatchLen: number;
  partialWeightLen2: number;
  partialWeightLen3: number;
  exactWeight: number;
  tags: string[];
};

const DEFAULT_RULES: SynergyRule[] = [
  {
    key: "RULE_AIR_FLOW",
    sequence: ["JUMP", "MOVE", "ATTACK"],
    baseScore: 120,
    minMatchLen: 2,
    partialWeightLen2: 0.5,
    partialWeightLen3: 0.8,
    exactWeight: 1,
    tags: ["air_combo", "air_press"],
  },
  {
    key: "RULE_APPROACH_PRESS",
    sequence: ["MOVE", "ATTACK"],
    baseScore: 90,
    minMatchLen: 2,
    partialWeightLen2: 0.7,
    partialWeightLen3: 0.9,
    exactWeight: 1,
    tags: ["approach_entry", "approach_pressure"],
  },
  {
    key: "RULE_BURST_STRIKE",
    sequence: ["ATTACK", "ATTACK", "BUFF"],
    baseScore: 150,
    minMatchLen: 2,
    partialWeightLen2: 0.6,
    partialWeightLen3: 0.85,
    exactWeight: 1,
    tags: ["burst_combo", "burst_damage"],
  },
];

let cachedRules: SynergyRule[] | null = null;

function getRuntimeRules(): SynergyRule[] {
  if (cachedRules) return cachedRules;

  if (typeof window === "undefined") {
    try {
      const req = eval("require") as (id: string) => {
        loadSynergyRules: () => SynergyRule[];
      };
      const mod = req("../data/loadSynergyRules");
      const rules = mod.loadSynergyRules();
      if (rules.length > 0) {
        cachedRules = rules;
        return cachedRules;
      }
    } catch {
      // fall through to defaults
    }
  }

  cachedRules = DEFAULT_RULES;
  return cachedRules;
}

export function longestContiguousMatch(input: string[], ruleSeq: string[]): number {
  if (input.length === 0 || ruleSeq.length === 0) return 0;

  const dp: number[][] = Array.from({ length: input.length + 1 }, () =>
    Array(ruleSeq.length + 1).fill(0),
  );

  let best = 0;

  for (let i = 1; i <= input.length; i += 1) {
    for (let j = 1; j <= ruleSeq.length; j += 1) {
      if (input[i - 1] === ruleSeq[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
        if (dp[i][j] > best) best = dp[i][j];
      } else {
        dp[i][j] = 0;
      }
    }
  }

  return best;
}

function applySoftCap(score: number): number {
  if (score <= 500) return score;
  if (score <= 800) return 500 + (score - 500) * 0.5;
  return 500 + 300 * 0.5 + (score - 800) * 0.2;
}

export function calcSynergy(inputTokens: string[]): SynergyResult {
  const rules = getRuntimeRules();
  const applied: AppliedRule[] = [];

  for (const rule of rules) {
    const matchedLen = longestContiguousMatch(inputTokens, rule.sequence);
    const seqLen = rule.sequence.length;

    let score = 0;
    let note: AppliedRule["note"] = "ignored";

    if (matchedLen >= rule.minMatchLen) {
      if (matchedLen === seqLen) {
        score = rule.baseScore * rule.exactWeight;
        note = "exact";
      } else if (matchedLen === 3) {
        score = rule.baseScore * rule.partialWeightLen3;
        note = "partial(len3)";
      } else if (matchedLen === 2) {
        score = rule.baseScore * rule.partialWeightLen2;
        note = "partial(len2)";
      }
    }

    if (score > 0) {
      applied.push({
        ruleKey: rule.key,
        tags: rule.tags,
        matchedLen,
        seqLen,
        score,
        note,
      });
    }
  }

  applied.sort((a, b) => b.score - a.score);
  const rawScore = applied.reduce((sum, item) => sum + item.score, 0);
  const finalScore = applySoftCap(rawScore);
  const multiplier = 1 + finalScore / 100;

  return {
    rawScore,
    finalScore,
    multiplier,
    applied,
  };
}

