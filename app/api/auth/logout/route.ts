import { NextResponse } from "next/server";
import { getRpgRuntime } from "@/lib/rpg/runtime";
import { getSessionIdFromRequest } from "@/lib/rpg/http";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const sessionId = getSessionIdFromRequest(req);
    if (sessionId) {
      const { db } = getRpgRuntime();
      db.prepare("DELETE FROM sessions WHERE session_id = ?").run(sessionId);
    }

    const res = NextResponse.json({ ok: true });
    res.cookies.set("session_id", "", {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      expires: new Date(0),
    });
    return res;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
