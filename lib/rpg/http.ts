import { getRpgDb, initRpgSchema } from "./db";

export class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function parseCookieHeader(cookieHeader: string | null): Record<string, string> {
  if (!cookieHeader) return {};
  const out: Record<string, string> = {};
  for (const pair of cookieHeader.split(";")) {
    const idx = pair.indexOf("=");
    if (idx <= 0) continue;
    const key = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    if (!key) continue;
    out[key] = decodeURIComponent(value);
  }
  return out;
}

export function getSessionIdFromRequest(req: Request): string | null {
  const cookies = parseCookieHeader(req.headers.get("cookie"));
  return cookies.session_id ?? null;
}

export function requireSession(req: Request): { sessionId: string; accountId: string } {
  initRpgSchema();
  const db = getRpgDb();
  const sessionId = getSessionIdFromRequest(req);
  if (!sessionId) throw new HttpError(401, "로그인이 필요합니다.");

  const row = db
    .prepare("SELECT session_id, account_id, expires_at FROM sessions WHERE session_id = ?")
    .get(sessionId) as { session_id: string; account_id: string; expires_at: string } | undefined;
  if (!row) throw new HttpError(401, "유효한 세션이 아닙니다.");

  if (new Date(row.expires_at).getTime() <= Date.now()) {
    db.prepare("DELETE FROM sessions WHERE session_id = ?").run(sessionId);
    throw new HttpError(401, "세션이 만료되었습니다.");
  }

  return { sessionId: row.session_id, accountId: row.account_id };
}

export function getSelectedCharacterId(accountId: string): string | null {
  initRpgSchema();
  const db = getRpgDb();
  const row = db
    .prepare("SELECT character_id FROM account_selected_character WHERE account_id = ?")
    .get(accountId) as { character_id: string } | undefined;
  return row?.character_id ?? null;
}

export function requireSelectedCharacter(req: Request): { accountId: string; characterId: string; sessionId: string } {
  const { accountId, sessionId } = requireSession(req);
  const characterId = getSelectedCharacterId(accountId);
  if (!characterId) throw new HttpError(400, "캐릭터 선택 필요");
  return { accountId, characterId, sessionId };
}

export function jsonErrorFromUnknown(error: unknown): { status: number; message: string } {
  if (error instanceof HttpError) return { status: error.status, message: error.message };
  if (error instanceof Error) return { status: 500, message: error.message };
  return { status: 500, message: String(error) };
}
