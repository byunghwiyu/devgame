import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getRpgRuntime } from "@/lib/rpg/runtime";
import { verifyPassword } from "@/lib/rpg/password";

export const runtime = "nodejs";

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { id?: string; email?: string; password?: string };
    const loginId = (body.id ?? body.email ?? "").trim().toLowerCase();
    const password = body.password ?? "";

    if (!loginId || !password) {
      return NextResponse.json({ ok: false, code: "INVALID_INPUT", error: "아이디와 비밀번호를 입력해 주세요." }, { status: 400 });
    }

    const { db } = getRpgRuntime();
    const row = db
      .prepare("SELECT account_id, password_hash FROM accounts WHERE email = ?")
      .get(loginId) as { account_id: string; password_hash: string } | undefined;
    if (!row) return NextResponse.json({ ok: false, code: "ID_NOT_FOUND", error: "존재하지 않는 아이디입니다." }, { status: 401 });

    const ok = verifyPassword(password, row.password_hash);
    if (!ok) return NextResponse.json({ ok: false, code: "PASSWORD_MISMATCH", error: "비밀번호가 일치하지 않습니다." }, { status: 401 });

    const now = new Date();
    const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
    const sessionId = randomUUID();

    db.prepare("INSERT INTO sessions(session_id,account_id,expires_at,created_at) VALUES(?,?,?,?)").run(
      sessionId,
      row.account_id,
      expiresAt.toISOString(),
      now.toISOString(),
    );

    const res = NextResponse.json({ ok: true, accountId: row.account_id, id: loginId });
    res.cookies.set("session_id", sessionId, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      expires: expiresAt,
    });
    return res;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
