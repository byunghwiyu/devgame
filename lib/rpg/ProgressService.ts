import { type Database as BetterDb } from "better-sqlite3";
import { loadLevelTable } from "./csvLoader";
import { ExpGrantResult, LevelTableRow, UserProgress } from "./types";

function getLevelRows(): LevelTableRow[] {
  const rows = loadLevelTable();
  return rows.length > 0 ? rows : [{ level: 1, expToNext: 20, atkBonus: 0, defBonus: 0, hpBonus: 0, spdBonus: 0, unlockSkills: [] }];
}

function rowForLevel(level: number): LevelTableRow {
  const rows = getLevelRows();
  const exact = rows.find((r) => r.level === level);
  return exact ?? rows[rows.length - 1];
}

export function expToNextLevel(level: number): number {
  return Math.max(0, rowForLevel(Math.max(1, Math.floor(level))).expToNext);
}

export function getUnlockedSkillKeysByLevel(level: number): string[] {
  const targetLevel = Math.max(1, Math.floor(level));
  const set = new Set<string>();
  for (const row of getLevelRows()) {
    if (row.level > targetLevel) break;
    for (const skillKey of row.unlockSkills) set.add(skillKey);
  }
  return Array.from(set);
}

export class ProgressService {
  constructor(private readonly db: BetterDb) {}

  ensureUser(userId: string): void {
    this.db.prepare("INSERT OR IGNORE INTO users(user_id) VALUES(?)").run(userId);
    this.db.prepare("INSERT OR IGNORE INTO user_progress(user_id,level,exp) VALUES(?,?,?)").run(userId, 1, 0);
  }

  getProgress(userId: string): UserProgress {
    this.ensureUser(userId);
    const row = this.db.prepare("SELECT user_id, level, exp FROM user_progress WHERE user_id = ?").get(userId) as
      | { user_id: string; level: number; exp: number }
      | undefined;
    return {
      userId: row?.user_id ?? userId,
      level: Math.max(1, Number(row?.level ?? 1)),
      exp: Math.max(0, Number(row?.exp ?? 0)),
    };
  }

  grantExp(userId: string, gain: number): ExpGrantResult {
    const current = this.getProgress(userId);
    const gainedExp = Math.max(0, Math.trunc(gain));
    let level = current.level;
    let exp = current.exp + gainedExp;

    while (true) {
      const need = expToNextLevel(level);
      if (need <= 0 || exp < need) break;
      exp -= need;
      level += 1;
    }

    this.db.prepare("UPDATE user_progress SET level = ?, exp = ? WHERE user_id = ?").run(level, exp, userId);
    return {
      beforeLevel: current.level,
      afterLevel: level,
      gainedExp,
      remainedExp: exp,
      leveledUp: level > current.level,
    };
  }
}
