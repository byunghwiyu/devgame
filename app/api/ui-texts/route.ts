import { NextResponse } from "next/server";
import { loadUiTexts } from "@/lib/data/loadUiTexts";

export async function GET() {
  try {
    return NextResponse.json({ ok: true, texts: loadUiTexts() });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
