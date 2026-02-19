import BetterSqlite3, { type Database as BetterDb } from "better-sqlite3";
import path from "node:path";

declare global {
  // eslint-disable-next-line no-var
  var __rpgDb: BetterDb | undefined;
}

export function getRpgDb(): BetterDb {
  if (!global.__rpgDb) {
    const dbPath = path.join(process.cwd(), "data", "rpg.sqlite");
    global.__rpgDb = new BetterSqlite3(dbPath);
    global.__rpgDb.pragma("journal_mode = WAL");
  }
  return global.__rpgDb;
}

export function initRpgSchema(): void {
  const db = getRpgDb();
  db.exec(`
CREATE TABLE IF NOT EXISTS users(user_id TEXT PRIMARY KEY);

-- legacy: kept for backward compatibility
CREATE TABLE IF NOT EXISTS user_wallet(user_id TEXT PRIMARY KEY, gold INTEGER NOT NULL DEFAULT 0);

CREATE TABLE IF NOT EXISTS user_currency_balance(
  user_id TEXT NOT NULL,
  currency_id TEXT NOT NULL,
  amount INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(user_id, currency_id)
);

CREATE TABLE IF NOT EXISTS user_inventory_stack(
  user_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  qty INTEGER NOT NULL,
  PRIMARY KEY(user_id,item_id)
);
CREATE TABLE IF NOT EXISTS user_inventory_equip(
  equip_uid TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  level INTEGER NOT NULL,
  enhance INTEGER NOT NULL,
  rolled_affix_json TEXT NOT NULL,
  is_locked INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS user_equipment_slots(
  user_id TEXT NOT NULL,
  slot TEXT NOT NULL,
  equip_uid TEXT NULL,
  PRIMARY KEY(user_id,slot)
);
CREATE TABLE IF NOT EXISTS user_progress(
  user_id TEXT PRIMARY KEY,
  level INTEGER NOT NULL DEFAULT 1,
  exp INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS rpg_fight_claims(
  request_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  monster_id TEXT NOT NULL,
  status TEXT NOT NULL,
  result_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
`);
}
