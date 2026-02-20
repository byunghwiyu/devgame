import fs from "node:fs";
import path from "node:path";
import { loadMonsters } from "@/lib/data/loadMonsters";
import { loadPlayerTemplates } from "@/lib/data/loadPlayerTemplates";
import { getBalanceNumber, loadBalanceConfig } from "@/lib/data/loadBalanceConfig";

type Args = {
  difficulty: number;
  levels: number[];
  out: string;
  graphOut: string;
};

type StatRow = {
  level: number;
  difficulty: number;
  playerHp: number;
  playerAtk: number;
  playerDef: number;
  playerSpd: number;
  monsterTier: string;
  monsterHp: number;
  monsterAtk: number;
  monsterDef: number;
  monsterSpd: number;
};

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function round(v: number): number {
  return Math.max(1, Math.round(v));
}

function parseArgs(argv: string[]): Args {
  const defaults: Args = {
    difficulty: 50,
    levels: [1, 5, 10, 20, 30],
    out: "data/csv/balance_sheet_generated.csv",
    graphOut: "data/csv/balance_sheet_graph.html",
  };

  const map = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const value = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : "";
    map.set(key, value);
  }

  const difficultyRaw = Number(map.get("difficulty") ?? defaults.difficulty);
  const difficulty = clamp(Number.isFinite(difficultyRaw) ? difficultyRaw : defaults.difficulty, 1, 100);

  const levelsRaw = (map.get("levels") ?? "").trim();
  const levels = levelsRaw
    ? levelsRaw
        .split(",")
        .map((v) => Number(v.trim()))
        .filter((n) => Number.isFinite(n) && n > 0)
        .map((n) => Math.floor(n))
    : defaults.levels;

  const out = (map.get("out") ?? defaults.out).trim() || defaults.out;
  const graphOut = (map.get("graphOut") ?? defaults.graphOut).trim() || defaults.graphOut;
  return { difficulty, levels: levels.length > 0 ? levels : defaults.levels, out, graphOut };
}

function getBaseAverages(): { hp: number; atk: number; def: number; spd: number } {
  const players = loadPlayerTemplates();
  const monsters = loadMonsters();
  if (players.length === 0 || monsters.length === 0) {
    throw new Error("player_character.csv 또는 monsters.csv 데이터가 비어 있습니다.");
  }

  const pAvg = players.reduce(
    (acc, p) => {
      acc.hp += p.hp;
      acc.atk += p.atk;
      acc.def += p.def;
      acc.spd += p.speed;
      return acc;
    },
    { hp: 0, atk: 0, def: 0, spd: 0 },
  );

  return {
    hp: pAvg.hp / players.length,
    atk: pAvg.atk / players.length,
    def: pAvg.def / players.length,
    spd: pAvg.spd / players.length,
  };
}

function buildRows(difficulty: number, levels: number[]): StatRow[] {
  const base = getBaseAverages();
  const config = loadBalanceConfig();
  const diffNorm = difficulty / 50;
  const levelGrowth = getBalanceNumber(config, "balance_level_growth", 0.075);
  const diffPlayerDefScale = getBalanceNumber(config, "balance_diff_player_scale", 0.05);
  const diffMonsterScale = getBalanceNumber(config, "balance_diff_monster_scale", 0.2);
  const diffPlayerAtkScale = getBalanceNumber(config, "balance_player_atk_diff_scale", 0.04);
  const playerSpdGrowth = getBalanceNumber(config, "balance_player_spd_growth", 0.02);

  const tiers = [
    {
      name: "TRASH",
      hpMul: getBalanceNumber(config, "balance_tier_trash_hp_mul", 0.82),
      atkMul: getBalanceNumber(config, "balance_tier_trash_atk_mul", 0.82),
      defMul: getBalanceNumber(config, "balance_tier_trash_def_mul", 0.8),
      spdMul: getBalanceNumber(config, "balance_tier_trash_spd_mul", 0.95),
    },
    {
      name: "NORMAL",
      hpMul: getBalanceNumber(config, "balance_tier_normal_hp_mul", 1.0),
      atkMul: getBalanceNumber(config, "balance_tier_normal_atk_mul", 1.0),
      defMul: getBalanceNumber(config, "balance_tier_normal_def_mul", 1.0),
      spdMul: getBalanceNumber(config, "balance_tier_normal_spd_mul", 1.0),
    },
    {
      name: "ELITE",
      hpMul: getBalanceNumber(config, "balance_tier_elite_hp_mul", 1.35),
      atkMul: getBalanceNumber(config, "balance_tier_elite_atk_mul", 1.2),
      defMul: getBalanceNumber(config, "balance_tier_elite_def_mul", 1.18),
      spdMul: getBalanceNumber(config, "balance_tier_elite_spd_mul", 1.08),
    },
    {
      name: "BOSS",
      hpMul: getBalanceNumber(config, "balance_tier_boss_hp_mul", 1.9),
      atkMul: getBalanceNumber(config, "balance_tier_boss_atk_mul", 1.45),
      defMul: getBalanceNumber(config, "balance_tier_boss_def_mul", 1.35),
      spdMul: getBalanceNumber(config, "balance_tier_boss_spd_mul", 1.1),
    },
  ] as const;

  const rows: StatRow[] = [];
  for (const level of levels) {
    const levelMul = 1 + (level - 1) * levelGrowth;
    const diffPlayerDef = 1 + (diffNorm - 1) * diffPlayerDefScale;
    const diffMonsterMul = 1 + (diffNorm - 1) * diffMonsterScale;

    const playerHp = round(base.hp * levelMul * diffPlayerDef);
    const playerAtk = round(base.atk * levelMul * (1 + (diffNorm - 1) * diffPlayerAtkScale));
    const playerDef = round(base.def * levelMul * diffPlayerDef);
    const playerSpd = round(base.spd * (1 + (level - 1) * playerSpdGrowth));

    for (const tier of tiers) {
      rows.push({
        level,
        difficulty,
        playerHp,
        playerAtk,
        playerDef,
        playerSpd,
        monsterTier: tier.name,
        monsterHp: round(playerHp * tier.hpMul * diffMonsterMul),
        monsterAtk: round(playerAtk * tier.atkMul * diffMonsterMul),
        monsterDef: round(playerDef * tier.defMul * diffMonsterMul),
        monsterSpd: round(playerSpd * tier.spdMul),
      });
    }
  }
  return rows;
}

function toCsv(rows: StatRow[]): string {
  const header =
    "level,difficulty,player_hp,player_atk,player_def,player_spd,monster_tier,monster_hp,monster_atk,monster_def,monster_spd";
  const body = rows
    .map((r) =>
      [
        r.level,
        r.difficulty,
        r.playerHp,
        r.playerAtk,
        r.playerDef,
        r.playerSpd,
        r.monsterTier,
        r.monsterHp,
        r.monsterAtk,
        r.monsterDef,
        r.monsterSpd,
      ].join(","),
    )
    .join("\n");
  return `${header}\n${body}\n`;
}

function renderLineChart(
  title: string,
  levels: number[],
  series: Array<{ name: string; color: string; values: number[] }>,
): string {
  const width = 620;
  const height = 260;
  const pad = 38;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  const all = series.flatMap((s) => s.values);
  const minV = Math.min(...all);
  const maxV = Math.max(...all);
  const range = Math.max(1, maxV - minV);
  const xStep = levels.length > 1 ? innerW / (levels.length - 1) : 0;

  const toX = (idx: number) => pad + idx * xStep;
  const toY = (v: number) => pad + innerH - ((v - minV) / range) * innerH;

  const lines = series
    .map((s) => {
      const points = s.values.map((v, i) => `${toX(i)},${toY(v)}`).join(" ");
      return `<polyline points="${points}" fill="none" stroke="${s.color}" stroke-width="2.5" />`;
    })
    .join("\n");

  const xLabels = levels
    .map((lv, i) => `<text x="${toX(i)}" y="${height - 10}" text-anchor="middle" font-size="11" fill="#94a3b8">${lv}</text>`)
    .join("\n");

  const legend = series
    .map(
      (s) =>
        `<span style="display:inline-flex;align-items:center;gap:6px;margin-right:12px"><i style="display:inline-block;width:10px;height:10px;border-radius:999px;background:${s.color}"></i>${s.name}</span>`,
    )
    .join("");

  return `
  <section class="card">
    <h3>${title}</h3>
    <div class="legend">${legend}</div>
    <svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}">
      <rect x="${pad}" y="${pad}" width="${innerW}" height="${innerH}" fill="#0f172a" stroke="#334155" />
      ${lines}
      ${xLabels}
    </svg>
  </section>`;
}

function buildGraphHtml(rows: StatRow[], args: Args): string {
  const levels = Array.from(new Set(rows.map((r) => r.level))).sort((a, b) => a - b);
  const byLevel = new Map<number, StatRow[]>();
  rows.forEach((r) => {
    const arr = byLevel.get(r.level) ?? [];
    arr.push(r);
    byLevel.set(r.level, arr);
  });

  const playerRow = (level: number) => (byLevel.get(level) ?? [])[0];
  const tierRow = (level: number, tier: string) => (byLevel.get(level) ?? []).find((r) => r.monsterTier === tier);

  const playerHp = levels.map((lv) => playerRow(lv)?.playerHp ?? 0);
  const playerAtk = levels.map((lv) => playerRow(lv)?.playerAtk ?? 0);
  const playerDef = levels.map((lv) => playerRow(lv)?.playerDef ?? 0);
  const playerSpd = levels.map((lv) => playerRow(lv)?.playerSpd ?? 0);

  const normalHp = levels.map((lv) => tierRow(lv, "NORMAL")?.monsterHp ?? 0);
  const eliteHp = levels.map((lv) => tierRow(lv, "ELITE")?.monsterHp ?? 0);
  const bossHp = levels.map((lv) => tierRow(lv, "BOSS")?.monsterHp ?? 0);
  const normalAtk = levels.map((lv) => tierRow(lv, "NORMAL")?.monsterAtk ?? 0);
  const eliteAtk = levels.map((lv) => tierRow(lv, "ELITE")?.monsterAtk ?? 0);
  const bossAtk = levels.map((lv) => tierRow(lv, "BOSS")?.monsterAtk ?? 0);
  const normalDef = levels.map((lv) => tierRow(lv, "NORMAL")?.monsterDef ?? 0);
  const eliteDef = levels.map((lv) => tierRow(lv, "ELITE")?.monsterDef ?? 0);
  const bossDef = levels.map((lv) => tierRow(lv, "BOSS")?.monsterDef ?? 0);
  const normalSpd = levels.map((lv) => tierRow(lv, "NORMAL")?.monsterSpd ?? 0);
  const eliteSpd = levels.map((lv) => tierRow(lv, "ELITE")?.monsterSpd ?? 0);
  const bossSpd = levels.map((lv) => tierRow(lv, "BOSS")?.monsterSpd ?? 0);

  const cards = [
    renderLineChart("Player Core Stats", levels, [
      { name: "HP", color: "#22d3ee", values: playerHp },
      { name: "ATK", color: "#f59e0b", values: playerAtk },
      { name: "DEF", color: "#a3e635", values: playerDef },
      { name: "SPD", color: "#c084fc", values: playerSpd },
    ]),
    renderLineChart("Monster HP by Tier", levels, [
      { name: "NORMAL", color: "#60a5fa", values: normalHp },
      { name: "ELITE", color: "#f97316", values: eliteHp },
      { name: "BOSS", color: "#ef4444", values: bossHp },
    ]),
    renderLineChart("Monster ATK by Tier", levels, [
      { name: "NORMAL", color: "#22c55e", values: normalAtk },
      { name: "ELITE", color: "#f59e0b", values: eliteAtk },
      { name: "BOSS", color: "#ef4444", values: bossAtk },
    ]),
    renderLineChart("Monster DEF by Tier", levels, [
      { name: "NORMAL", color: "#06b6d4", values: normalDef },
      { name: "ELITE", color: "#8b5cf6", values: eliteDef },
      { name: "BOSS", color: "#ec4899", values: bossDef },
    ]),
    renderLineChart("Monster SPD by Tier", levels, [
      { name: "NORMAL", color: "#0ea5e9", values: normalSpd },
      { name: "ELITE", color: "#f97316", values: eliteSpd },
      { name: "BOSS", color: "#ef4444", values: bossSpd },
    ]),
  ].join("\n");

  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Balance Sheet Graph</title>
  <style>
    body{margin:0;padding:20px;background:#020617;color:#e2e8f0;font-family:ui-sans-serif,system-ui}
    .head{margin-bottom:14px}
    .sub{color:#94a3b8;font-size:13px}
    .grid{display:grid;gap:14px}
    .card{border:1px solid #334155;border-radius:12px;background:#0b1220;padding:12px}
    h2,h3{margin:0 0 10px}
    .legend{font-size:12px;color:#cbd5e1;margin-bottom:8px}
  </style>
</head>
<body>
  <div class="head">
    <h2>Balance Graph</h2>
    <div class="sub">difficulty=${args.difficulty} · levels=${args.levels.join(",")}</div>
  </div>
  <div class="grid">${cards}</div>
</body>
</html>`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const rows = buildRows(args.difficulty, args.levels);
  const csv = toCsv(rows);

  const outPath = path.isAbsolute(args.out) ? args.out : path.join(process.cwd(), args.out);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, csv, "utf8");

  const graphOutPath = path.isAbsolute(args.graphOut) ? args.graphOut : path.join(process.cwd(), args.graphOut);
  fs.mkdirSync(path.dirname(graphOutPath), { recursive: true });
  fs.writeFileSync(graphOutPath, buildGraphHtml(rows, args), "utf8");

  console.log(`[balance-sheet] generated: ${outPath}`);
  console.log(`[balance-sheet] graph: ${graphOutPath}`);
  console.log(`[balance-sheet] difficulty=${args.difficulty}, levels=${args.levels.join(",")}, rows=${rows.length}`);
}

main();

