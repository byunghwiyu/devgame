import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getRpgRuntime } from "@/lib/rpg/runtime";
import { hashPassword } from "@/lib/rpg/password";

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
    const existing = db.prepare("SELECT account_id FROM accounts WHERE email = ?").get(loginId) as { account_id: string } | undefined;
    if (existing) return NextResponse.json({ ok: false, code: "ID_CONFLICT", error: "이미 사용 중인 아이디입니다." }, { status: 409 });

    const accountId = randomUUID();
    const passwordHash = hashPassword(password);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
    const sessionId = randomUUID();

    const tx = db.transaction(() => {
      db.prepare("INSERT INTO accounts(account_id,email,password_hash,created_at) VALUES(?,?,?,?)").run(accountId, loginId, passwordHash, now.toISOString());
      db.prepare("INSERT INTO sessions(session_id,account_id,expires_at,created_at) VALUES(?,?,?,?)").run(sessionId, accountId, expiresAt.toISOString(), now.toISOString());
    });
    tx();

    const res = NextResponse.json({ ok: true, accountId, id: loginId });
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
