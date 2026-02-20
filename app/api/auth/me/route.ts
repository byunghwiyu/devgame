import { NextResponse } from "next/server";
import { jsonErrorFromUnknown, requireSession } from "@/lib/rpg/http";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const { accountId } = requireSession(req);
    return NextResponse.json({ ok: true, loggedIn: true, accountId, account_id: accountId });
  } catch (e) {
    const { status, message } = jsonErrorFromUnknown(e);
    if (status === 401) {
      return NextResponse.json({ ok: true, loggedIn: false }, { status: 200 });
    }
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
